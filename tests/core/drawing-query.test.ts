import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { DrawingQueryService } from '../../src/core/drawings/drawing-query-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let drawings: DrawingQueryService;
let ids: Record<string, number>;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const dictionary = new DictionaryService(db);
  const brand = dictionary.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionary.create({ type: 'product_size', code: '0209', name: 'ZC220冰柜' });
  const appearance = dictionary.create({ type: 'appearance', code: '01', name: '1号外观' });
  const white = dictionary.create({ type: 'color', code: '0', name: '白色' });
  const black = dictionary.create({ type: 'color', code: '1', name: '黑色' });
  const main = dictionary.create({ type: 'main_category', code: '04', name: '印刷件类' });
  const logo = dictionary.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const manual = dictionary.create({ type: 'project_item', code: '02', name: '说明书', parentId: main.id });
  const product = new ProductService(db).create({
    sku: 'TEST-DRAWING-QUERY',
    brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC220', productCategory: '冰柜',
  });
  const insert = db.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, notes, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const first = insert.run('02.0209.010.0401001', 'SAMKYO-ZC220白色-LOGO', product.id, appearance.id, white.id, main.id, logo.id,
    '02', '0209', '01', '0', '04', '01', 1, 'active', '首版', '2026-08-24T01:00:00Z');
  const second = insert.run('02.0209.011.0402002', 'SAMKYO-ZC220黑色-说明书', product.id, appearance.id, black.id, main.id, manual.id,
    '02', '0209', '01', '1', '04', '02', 2, 'reserved', null, '2026-08-24T02:00:00Z');
  ids = { brand: brand.id, main: main.id, logo: logo.id, manual: manual.id, white: white.id,
    first: Number(first.lastInsertRowid), second: Number(second.lastInsertRowid) };
  drawings = new DrawingQueryService(db);
});
afterEach(() => db.close());

describe('DrawingQueryService', () => {
  it('supports partial and exact drawing-number searches', () => {
    expect(drawings.search({ drawingNumber: '0401' }).items.map((item) => item.id)).toEqual([ids.first]);
    expect(drawings.search({ drawingNumber: '02.0209.010.0401001', exactDrawingNumber: true }).items)
      .toEqual([expect.objectContaining({ id: ids.first })]);
  });

  it('combines model, brand, category, project, color and status filters', () => {
    const result = drawings.search({
      model: 'ZC220', brandId: ids.brand, mainCategoryId: ids.main,
      projectItemId: ids.logo, colorId: ids.white, status: 'active',
    });
    expect(result.items).toEqual([expect.objectContaining({
      id: ids.first, model: 'ZC220', colorName: '白色', mainCategoryName: '印刷件类', projectItemName: 'LOGO',
    })]);
  });

  it('searches keywords and returns stable pagination', () => {
    expect(drawings.search({ keyword: '说明书' }).items.map((item) => item.id)).toEqual([ids.second]);
    expect(drawings.search({ page: 2, pageSize: 1 })).toEqual(expect.objectContaining({
      total: 2, page: 2, pageSize: 1,
      items: [expect.objectContaining({ id: ids.first })],
    }));
  });

  it('returns a joined detail record', () => {
    expect(drawings.get(ids.first)).toEqual(expect.objectContaining({
      fullCode: '02.0209.010.0401001', brandName: 'SAMKYO', productCategory: '冰柜', status: 'active',
      appearanceName: '1号外观', brandCode: '02', productSizeCode: '0209', appearanceCode: '01',
      colorCode: '0', mainCategoryCode: '04', projectItemCode: '01', notes: '首版',
    }));
  });

  it('lists historical codes with planned records and prefers planned on duplicate full codes', () => {
    const now = '2026-08-26T00:00:00.000Z';
    const insert = db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, detected_sku, detected_model, detected_product_category, first_seen_at, last_seen_at)
      values (?, '02', '0209', '01', '0', '04', '01', ?, 'TEST-DRAWING-QUERY', 'ZC220', '冰柜', ?, ?)`);
    insert.run('02.0209.010.0401007', 7, now, now);
    insert.run('02.0209.010.0401001', 1, now, now);

    const result = drawings.search({ pageSize: 20 });

    expect(result.total).toBe(3);
    expect(result.items.filter((item) => item.fullCode === '02.0209.010.0401001'))
      .toEqual([expect.objectContaining({ origin: 'planned' })]);
    expect(result.items).toContainEqual(expect.objectContaining({ fullCode: '02.0209.010.0401007',
      origin: 'historical', sku: 'TEST-DRAWING-QUERY', status: 'historical', dictionaryMappingStatus: 'mapped' }));
  });

  it('computes source and outlined completeness independently and combines new filters', () => {
    const now = '2026-08-26T00:00:00.000Z';
    const historyId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, detected_sku, detected_model, detected_product_category, first_seen_at, last_seen_at)
      values ('02.0209.010.0401007', '02', '0209', '01', '0', '04', '01', 7,
       'TEST-DRAWING-QUERY', 'ZC220', '冰柜', ?, ?)`).run(now, now).lastInsertRowid);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('source.pdf', 'source.pdf', ?, 'matched', '[]', 'source', 1, ?, ?, 1)`).run(ids.first, now, now);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, historical_drawing_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('outlined.pdf', 'outlined.pdf', ?, 'matched', '[]', 'outlined', 1, ?, ?, 1)`).run(historyId, now, now);

    expect(drawings.search({ sku: 'TEST-DRAWING', productCategory: '冰柜', sourcePresence: 'present',
      outlinedPresence: 'missing' }).items).toEqual([expect.objectContaining({
      fullCode: '02.0209.010.0401001', hasSourceFile: true, hasOutlinedFile: false,
    })]);
    expect(drawings.search({ sourcePresence: 'missing', outlinedPresence: 'present' }).items)
      .toEqual([expect.objectContaining({ fullCode: '02.0209.010.0401007', hasSourceFile: false, hasOutlinedFile: true })]);
  });
});
