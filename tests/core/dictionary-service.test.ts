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

  it('protects referenced values from semantic changes but allows deactivation', () => {
    const brand = service.create({ type: 'brand', code: '02', name: 'SAMKYO' });
    const size = service.create({ type: 'product_size', code: '0404', name: 'ZC200卧式冰柜2.0' });
    db.prepare(`insert into products
      (brand_id, product_size_id, model, product_category, status, created_at)
      values (?, ?, 'ZC200', '冰柜', 'active', '2026-08-24T00:00:00Z')`).run(brand.id, size.id);

    expect(() => service.updateName(brand.id, '新名称'))
      .toThrowError(expect.objectContaining({ code: 'DICTIONARY_ITEM_REFERENCED' }));
    expect(service.deactivate(brand.id).status).toBe('inactive');
  });

  it('protects an appearance referenced directly by a drawing', () => {
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

    expect(() => service.updateName(drawingAppearance.id, '新外观名称'))
      .toThrowError(expect.objectContaining({ code: 'DICTIONARY_ITEM_REFERENCED' }));
  });

  it('filters inactive items unless explicitly requested', () => {
    const item = service.create({ type: 'color', code: '0', name: '白色' });
    service.deactivate(item.id);
    expect(service.list({ type: 'color' })).toEqual([]);
    expect(service.list({ type: 'color', includeInactive: true })).toHaveLength(1);
  });
});
