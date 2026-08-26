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
  const label = dictionaries.create({ type: 'project_item', code: '02', name: '铭牌', parentId: main.id });
  const product = products.create({ sku: 'TEST-PLANNING-SERVICE', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC200', productCategory: '冰柜' });
  return { brand, size, appearance, white, gray, main, logo, label, product };
}

function input(refs: ReturnType<typeof fixture>) {
  return { productId: refs.product.id, rows: [{ clientId: 'row-1', colorId: refs.white.id,
    mainCategoryId: refs.main.id, projectItemId: refs.logo.id }] };
}

function insertExisting(refs: ReturnType<typeof fixture>, sequence: number, status: 'reserved' | 'active' | 'voided') {
  db.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, created_at) values (?, 'existing', ?, ?, ?, ?, ?, '02', '0404', '01', '0', '04', '01', ?, ?, ?)`)
    .run(`02.0404.010.0401${String(sequence).padStart(3, '0')}`, refs.product.id, refs.appearance.id,
      refs.white.id, refs.main.id, refs.logo.id, sequence, status, '2026-08-24T00:00:00Z');
}

function insertHistorical(sequence: number, appearanceCode = '01') {
  const prefix = `02.0404.${appearanceCode}0.0401`;
  db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values (?, '02', '0404', ?, '0', '04', '01', ?, '2026-08-26', '2026-08-26')`)
    .run(`${prefix}${String(sequence).padStart(3, '0')}`, appearanceCode, sequence);
}

describe('PlanningService preview', () => {
  it('recommends 001 for an unused prefix without writing the database', () => {
    const refs = fixture();
    expect(service.preview(input(refs)).rows).toEqual([expect.objectContaining({
      clientId: 'row-1', fullCode: '02.0404.010.0401001', sequence: 1,
      displayName: 'SAMKYO-ZC200白色-LOGO', available: true,
    })]);
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({ count: 0 });
  });

  it.each(['reserved', 'active', 'voided'] as const)('treats %s numbers as permanently occupied', (status) => {
    const refs = fixture(); insertExisting(refs, 1, status);
    expect(service.preview(input(refs)).rows[0].fullCode).toBe('02.0404.010.0401002');
  });

  it('continues after a reliably scanned historical number', () => {
    const refs = fixture(); insertHistorical(7);
    expect(service.preview(input(refs)).rows[0].fullCode).toBe('02.0404.010.0401008');
  });

  it('keeps different appearance codes in separate sequence groups', () => {
    const refs = fixture(); insertHistorical(7, '02');
    expect(service.preview(input(refs)).rows[0].fullCode).toBe('02.0404.010.0401001');
  });

  it('allocates consecutive numbers per prefix in request order', () => {
    const refs = fixture(); insertExisting(refs, 1, 'active');
    const preview = service.preview({ productId: refs.product.id, rows: [
      { ...input(refs).rows[0], clientId: 'first' },
      { ...input(refs).rows[0], clientId: 'second' },
      { clientId: 'gray-label', colorId: refs.gray.id, mainCategoryId: refs.main.id, projectItemId: refs.label.id },
    ] });
    expect(preview.rows.map((entry) => entry.fullCode)).toEqual([
      '02.0404.010.0401002', '02.0404.010.0401003', '02.0404.011.0402001',
    ]);
  });

  it('rejects exhausted prefixes and malformed batches', () => {
    const refs = fixture(); insertExisting(refs, 999, 'voided');
    expect(() => service.preview(input(refs))).toThrowError(expect.objectContaining({ code: 'SEQUENCE_EXHAUSTED' }));
    expect(() => service.preview({ productId: refs.product.id, rows: [] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
    expect(() => service.preview({ productId: refs.product.id, rows: [input(refs).rows[0], input(refs).rows[0]] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
    expect(() => service.preview({ productId: refs.product.id, rows: Array.from({ length: 101 }, (_, index) => ({
      ...input(refs).rows[0], clientId: `row-${index}`,
    })) })).toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
  });
});
