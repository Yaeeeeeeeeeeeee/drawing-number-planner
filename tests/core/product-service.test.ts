import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let dictionaries: DictionaryService;
let products: ProductService;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  dictionaries = new DictionaryService(db);
  products = new ProductService(db);
});
afterEach(() => db.close());

function validReferences(prefix = '') {
  return {
    brandId: dictionaries.create({ type: 'brand', code: `${prefix}02`, name: `${prefix}SAMKYO` }).id,
    productSizeId: dictionaries.create({ type: 'product_size', code: `${prefix}0209`, name: `${prefix}冰柜` }).id,
    defaultAppearanceId: dictionaries.create({ type: 'appearance', code: `${prefix}01`, name: `${prefix}1号外观` }).id,
  };
}

describe('ProductService', () => {
  it('requires a sku for every newly created product', () => {
    const refs = validReferences();
    expect(() => products.create({ ...refs, model: 'ZC220', productCategory: '03.冰柜' } as never))
      .toThrowError(expect.objectContaining({ code: 'INVALID_SKU' }));
  });

  it('enforces case-insensitive sku uniqueness', () => {
    const first = validReferences();
    products.create({ ...first, sku: 'SKDZU070JP', model: 'ZU70SD', productCategory: '03.冰柜' } as never);
    const second = validReferences('B');
    expect(() => products.create({ ...second, sku: 'skdzu070jp', model: 'ZU71', productCategory: '03.冰柜' } as never))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_SKU' }));
  });

  it('enforces model uniqueness within a brand', () => {
    const first = validReferences();
    products.create({ ...first, sku: 'SKU-1', model: 'ZC220', productCategory: '冰柜' });

    expect(() => products.create({ ...first, sku: 'SKU-2', model: 'ZC220', productCategory: '卧式冰柜' }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_MODEL' }));

    const second = validReferences('B');
    expect(products.create({ ...second, sku: 'SKU-3', model: 'ZC220', productCategory: '冰柜' }).model).toBe('ZC220');
  });

  it('requires active dictionaries of the correct type', () => {
    const refs = validReferences();
    dictionaries.deactivate(refs.productSizeId);

    expect(() => products.create({ ...refs, sku: 'SKU-1', model: 'ZC220', productCategory: '冰柜' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_DICTIONARY_REFERENCE' }));
    expect(() => products.create({
      ...refs, sku: 'SKU-1', productSizeId: refs.brandId, model: 'ZC220', productCategory: '冰柜',
    })).toThrowError(expect.objectContaining({ code: 'INVALID_DICTIONARY_REFERENCE' }));
  });

  it('stores an optional reference product and supports deactivation', () => {
    const refs = validReferences();
    const source = products.create({ ...refs, sku: 'SKU-1', model: 'ZC200', productCategory: '冰柜' });
    const target = products.create({
      ...refs, sku: 'SKU-2', model: 'ZC220', productCategory: '冰柜', referenceProductId: source.id,
    });

    expect(target.referenceProductId).toBe(source.id);
    expect(products.deactivate(target.id).status).toBe('inactive');
    expect(products.list({ status: 'inactive' }).items.map((item) => item.id)).toEqual([target.id]);
  });

  it('updates editable archive fields while revalidating references', () => {
    const refs = validReferences();
    const product = products.create({ ...refs, sku: 'SKU-1', model: 'ZC220', productCategory: '冰柜' });

    const updated = products.update(product.id, { ...refs, sku: 'SKU-1', model: 'ZC220A', productCategory: '卧式冰柜' });
    expect(updated).toEqual(expect.objectContaining({ model: 'ZC220A', productCategory: '卧式冰柜' }));
  });

  it('blocks semantic edits after a drawing number references the product', () => {
    const refs = validReferences();
    const product = products.create({ ...refs, sku: 'SKU-1', model: 'ZC220', productCategory: '冰柜' });
    const color = dictionaries.create({ type: 'color', code: '0', name: '白色' });
    const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('02.0209.10.0401001', 'SAMKYO-ZC220白色-LOGO', product.id, refs.defaultAppearanceId,
        color.id, main.id, item.id, '02', '0209', '1', '0', '04', '01', 1, 'active', '2026-08-24T01:00:00Z');

    expect(() => products.update(product.id, { ...refs, sku: 'SKU-1', model: 'ZC220A', productCategory: '冰柜' }))
      .toThrowError(expect.objectContaining({ code: 'PRODUCT_REFERENCED' }));
  });

  it('allows sku-only backfill after a drawing references a legacy product', () => {
    const refs = validReferences();
    db.prepare(`insert into products
      (brand_id, product_size_id, default_appearance_id, model, product_category, created_at)
      values (?, ?, ?, 'ZC220', '03.冰柜', '2026-08-24')`).run(refs.brandId, refs.productSizeId, refs.defaultAppearanceId);
    const product = products.list({ search: 'ZC220', status: 'all' }).items[0];
    const color = dictionaries.create({ type: 'color', code: '0', name: '白色' });
    const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values ('02.0209.010.0401001', '图号', ?, ?, ?, ?, ?,
       '02', '0209', '01', '0', '04', '01', 1, 'active', '2026-08-24')`)
      .run(product.id, refs.defaultAppearanceId, color.id, main.id, item.id);

    expect(products.update(product.id, { ...refs, sku: 'SKDZC220JP', model: 'ZC220', productCategory: '03.冰柜' } as never))
      .toEqual(expect.objectContaining({ sku: 'SKDZC220JP' }));
  });

  it('blocks edits when a product is preserved as a drawing reference source', () => {
    const refs = validReferences();
    const source = products.create({ ...refs, sku: 'SKU-1', model: 'ZC200', productCategory: '冰柜' });
    const target = products.create({ ...refs, sku: 'SKU-2', model: 'ZC220', productCategory: '冰柜' });
    const color = dictionaries.create({ type: 'color', code: '0', name: '白色' });
    const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, source_product_id, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('02.0209.10.0401001', '图号', target.id, refs.defaultAppearanceId, color.id, main.id, item.id,
        '02', '0209', '1', '0', '04', '01', 1, 'active', source.id, '2026-08-24T01:00:00Z');

    expect(() => products.update(source.id, { ...refs, sku: 'SKU-1', model: 'ZC200A', productCategory: '冰柜' }))
      .toThrowError(expect.objectContaining({ code: 'PRODUCT_REFERENCED' }));
  });
});
