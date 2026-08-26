import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let dictionaries: DictionaryService;
let products: ProductService;
let service: PlanningService;

beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  dictionaries = new DictionaryService(db); products = new ProductService(db); service = new PlanningService(db);
});
afterEach(() => db.close());

function fixture() {
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '一号外观' });
  const white = dictionaries.create({ type: 'color', code: '0', name: '白色' });
  const gray = dictionaries.create({ type: 'color', code: '1', name: '灰色' });
  const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
  const logo = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const product = products.create({ brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC200', productCategory: '冰柜' });
  return { brand, size, appearance, white, gray, main, logo, product };
}

function batch(refs: ReturnType<typeof fixture>) {
  return { productId: refs.product.id, rows: [
    { clientId: 'white', colorId: refs.white.id, mainCategoryId: refs.main.id, projectItemId: refs.logo.id, notes: '白色稿' },
    { clientId: 'gray', colorId: refs.gray.id, mainCategoryId: refs.main.id, projectItemId: refs.logo.id },
  ] };
}

describe('PlanningService reservation', () => {
  it('stores an entire valid batch as immutable reserved snapshots', () => {
    const refs = fixture(); const input = batch(refs); const preview = service.preview(input);
    const reserved = service.reserve({ ...input, rows: input.rows.map((row, index) => ({
      ...row, expectedFullCode: preview.rows[index].fullCode,
    })) });

    expect(reserved.map((entry) => entry.fullCode)).toEqual(['02.0404.010.0401001', '02.0404.011.0401001']);
    expect(reserved.every((entry) => entry.status === 'reserved' && entry.id > 0)).toBe(true);
    expect(db.prepare(`select full_code, brand_code, product_size_code, appearance_code, color_code,
      main_category_code, project_item_code, status, notes from drawing_numbers order by id`).all()).toEqual([
      { full_code: '02.0404.010.0401001', brand_code: '02', product_size_code: '0404', appearance_code: '01',
        color_code: '0', main_category_code: '04', project_item_code: '01', status: 'reserved', notes: '白色稿' },
      { full_code: '02.0404.011.0401001', brand_code: '02', product_size_code: '0404', appearance_code: '01',
        color_code: '1', main_category_code: '04', project_item_code: '01', status: 'reserved', notes: null },
    ]);
  });

  it('rolls back the whole batch when any row becomes invalid', () => {
    const refs = fixture(); const input = batch(refs); const preview = service.preview(input);
    dictionaries.deactivate(refs.gray.id);
    expect(() => service.reserve({ ...input, rows: input.rows.map((row, index) => ({
      ...row, expectedFullCode: preview.rows[index].fullCode,
    })) })).toThrowError(expect.objectContaining({ code: 'DICTIONARY_NOT_ACTIVE' }));
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({ count: 0 });
  });

  it('rejects a stale preview instead of silently changing its number', () => {
    const refs = fixture(); const input = { productId: refs.product.id, rows: [batch(refs).rows[0]] };
    const preview = service.preview(input);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values (?, 'other', ?, ?, ?, ?, ?, '02', '0404', '01', '0', '04', '01', 1, 'reserved', ?)`)
      .run(preview.rows[0].fullCode, refs.product.id, refs.appearance.id, refs.white.id, refs.main.id, refs.logo.id,
        '2026-08-24T00:00:00Z');

    expect(() => service.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] }))
      .toThrowError(expect.objectContaining({ code: 'PLAN_STALE' }));
    expect(db.prepare('select full_code from drawing_numbers order by id').all()).toEqual([{ full_code: preview.rows[0].fullCode }]);
  });

  it('rejects a preview made stale by a historical scan', () => {
    const refs = fixture(); const input = { productId: refs.product.id, rows: [batch(refs).rows[0]] };
    const preview = service.preview(input);
    db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values (?, '02', '0404', '01', '0', '04', '01', 1, '2026-08-26', '2026-08-26')`)
      .run(preview.rows[0].fullCode);

    expect(() => service.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] }))
      .toThrowError(expect.objectContaining({ code: 'PLAN_STALE' }));
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({ count: 0 });
  });
});
