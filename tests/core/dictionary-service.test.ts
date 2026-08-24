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

  it('filters inactive items unless explicitly requested', () => {
    const item = service.create({ type: 'color', code: '0', name: '白色' });
    service.deactivate(item.id);
    expect(service.list({ type: 'color' })).toEqual([]);
    expect(service.list({ type: 'color', includeInactive: true })).toHaveLength(1);
  });
});
