import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryError, DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let service: DictionaryService;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  service = new DictionaryService(db);
});
afterEach(() => db.close());

describe('DictionaryService', () => {
  it('rejects duplicate codes within one dictionary type', () => {
    service.create({ type: 'brand', code: '02', name: 'SAMKYO' });
    expect(() => service.create({ type: 'brand', code: '02', name: '另一个品牌' }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }));
  });

  it('requires project items to belong to a main category', () => {
    const parent = service.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = service.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: parent.id });
    expect(item.parentId).toBe(parent.id);
    expect(() => service.create({ type: 'project_item', code: '02', name: '说明书' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PARENT' }));
  });

  it('scopes project-item code uniqueness to its main category', () => {
    const printing = service.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const packaging = service.create({ type: 'main_category', code: '05', name: '包装件类' });

    service.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: printing.id });
    expect(() => service.create({ type: 'project_item', code: '01', name: '说明书', parentId: printing.id }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }));

    expect(service.create({
      type: 'project_item', code: '01', name: '包装箱', parentId: packaging.id,
    }).parentId).toBe(packaging.id);
  });

  it('allows referenced names to change without mutating codes or stored drawing strings', () => {
    const brand = service.create({ type: 'brand', code: '02', name: 'SAMKYO' });
    const size = service.create({ type: 'product_size', code: '0404', name: 'ZC200卧式冰柜2.0' });
    const appearance = service.create({ type: 'appearance', code: '01', name: '1号外观' });
    const color = service.create({ type: 'color', code: '0', name: '白色' });
    const main = service.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = service.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    const productId = Number(db.prepare(`insert into products
      (brand_id, product_size_id, model, product_category, status, created_at)
      values (?, ?, 'ZC200', '冰柜', 'active', '2026-08-24T00:00:00Z')`).run(brand.id, size.id).lastInsertRowid);
    const fullCode = '02.0404.010.0401001';
    const historicalFullCode = '02.0404.010.0401002';
    const drawingId = Number(db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values (?, 'LOGO', ?, ?, ?, ?, ?, '02', '0404', '01', '0', '04', '01', 1, 'active', '2026-08-24')`)
      .run(fullCode, productId, appearance.id, color.id, main.id, item.id).lastInsertRowid);
    const bomVersionId = Number(db.prepare(`insert into bom_versions
      (product_id, color_id, version_number, created_at) values (?, ?, 1, '2026-08-24')`).run(productId, color.id).lastInsertRowid);
    db.prepare(`insert into bom_items (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material)
      values (?, ?, ?, 1, 0)`).run(bomVersionId, item.id, drawingId);
    db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, first_seen_at, last_seen_at) values (?, '02', '0404', '01', '0', '04', '01', 2, '2026-08-24', '2026-08-24')`)
      .run(historicalFullCode);

    expect(service.updateName(brand.id, '新名称')).toEqual(expect.objectContaining({ id: brand.id, code: '02', name: '新名称' }));
    expect(service.updateName(item.id, '新 LOGO')).toEqual(expect.objectContaining({ id: item.id, code: '01', name: '新 LOGO' }));
    expect(db.prepare('select full_code from drawing_numbers where id = ?').get(drawingId)).toEqual({ full_code: fullCode });
    expect(db.prepare('select full_code from historical_drawing_numbers where full_code = ?').get(historicalFullCode))
      .toEqual({ full_code: historicalFullCode });
  });

  it('allows an appearance referenced directly by a drawing to be renamed without changing its code', () => {
    const brand = service.create({ type: 'brand', code: '02', name: 'SAMKYO' });
    const size = service.create({ type: 'product_size', code: '0209', name: '冰柜' });
    const defaultAppearance = service.create({ type: 'appearance', code: '1', name: '1号外观' });
    const drawingAppearance = service.create({ type: 'appearance', code: '2', name: '2号外观' });
    const color = service.create({ type: 'color', code: '0', name: '白色' });
    const main = service.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = service.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    const product = Number(db.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
      values (?, ?, ?, 'ZC220', '冰柜', '2026-08-24T00:00:00Z')`).run(brand.id, size.id, defaultAppearance.id).lastInsertRowid);
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?)`)
      .run('02.0209.20.0401001', '图号', product, drawingAppearance.id, color.id, main.id, item.id,
        '02', '0209', '2', '0', '04', '01', '2026-08-24T00:00:00Z');

    expect(service.updateName(drawingAppearance.id, '新外观名称'))
      .toEqual(expect.objectContaining({ id: drawingAppearance.id, code: '2', name: '新外观名称' }));
  });

  it('filters inactive items unless explicitly requested', () => {
    const item = service.create({ type: 'color', code: '0', name: '白色' });
    service.deactivate(item.id);
    expect(service.list({ type: 'color' })).toEqual([]);
    expect(service.list({ type: 'color', includeInactive: true })).toHaveLength(1);
  });

  it('reactivates an inactive value for new business without changing its historical identity', () => {
    const color = service.create({ type: 'color', code: '0', name: '白色' });
    service.deactivate(color.id);

    expect(service.activate(color.id)).toEqual(expect.objectContaining({ id: color.id, code: '0', name: '白色', status: 'active' }));
    expect(db.prepare('select deactivated_at from dictionary_items where id = ?').get(color.id)).toEqual({ deactivated_at: null });
    expect(service.list({ type: 'color' })).toEqual([expect.objectContaining({ id: color.id, code: '0', name: '白色' })]);
  });

  it('deletes an unused code but protects main-category children', () => {
    const unused = service.create({ type: 'layer_count', code: '9', name: '未使用层数' });
    service.deleteUnused(unused.id);
    expect(service.list({ type: 'layer_count', includeInactive: true })).toEqual([]);

    const main = service.create({ type: 'main_category', code: '04', name: '印刷件类' });
    service.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    expect(() => service.deleteUnused(main.id)).toThrowError(expect.objectContaining({
      code: 'DICTIONARY_ITEM_REFERENCED',
      message: '该编码已被产品、正式图号、历史图号、BOM 或字典层级引用，无法删除。可以选择停用。',
    }));
  });

  it('protects historical code snapshots, formal records and BOM references from deletion', () => {
    const brand = service.create({ type: 'brand', code: '02', name: 'SAMKYO' });
    const size = service.create({ type: 'product_size', code: '0209', name: '冰柜' });
    const appearance = service.create({ type: 'appearance', code: '01', name: '1号外观' });
    const color = service.create({ type: 'color', code: '0', name: '白色' });
    const main = service.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = service.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    const productId = Number(db.prepare(`insert into products
      (sku, brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
      values ('SKU-1', ?, ?, ?, 'T40', '洗碗机', '2026-08-28')`).run(brand.id, size.id, appearance.id).lastInsertRowid);
    const drawingId = Number(db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values ('02.0209.010.0401001', 'LOGO', ?, ?, ?, ?, ?, '02', '0209', '01', '0', '04', '01', 1, 'active', '2026-08-28')`)
      .run(productId, appearance.id, color.id, main.id, item.id).lastInsertRowid);
    const versionId = Number(db.prepare(`insert into bom_versions
      (product_id, color_id, version_number, created_at) values (?, ?, 1, '2026-08-28')`).run(productId, color.id).lastInsertRowid);
    db.prepare(`insert into bom_items (bom_version_id, project_item_id, drawing_id, quantity, uses_white_material)
      values (?, ?, ?, 1, 0)`).run(versionId, item.id, drawingId);
    db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, first_seen_at, last_seen_at) values ('02.0209.010.0401002', '02', '0209', '01', '0', '04', '01', 2, '2026-08-28', '2026-08-28')`).run();

    for (const dictionary of [brand, size, appearance, color, main, item]) {
      expect(() => service.deleteUnused(dictionary.id)).toThrowError(expect.objectContaining({ code: 'DICTIONARY_ITEM_REFERENCED' }));
    }
  });
});
