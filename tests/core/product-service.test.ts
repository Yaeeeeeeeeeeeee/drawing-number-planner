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
  it('enforces model uniqueness within a brand', () => {
    const first = validReferences();
    products.create({ ...first, model: 'ZC220', productCategory: '冰柜' });

    expect(() => products.create({ ...first, model: 'ZC220', productCategory: '卧式冰柜' }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_MODEL' }));

    const second = validReferences('B');
    expect(products.create({ ...second, model: 'ZC220', productCategory: '冰柜' }).model).toBe('ZC220');
  });

  it('requires active dictionaries of the correct type', () => {
    const refs = validReferences();
    dictionaries.deactivate(refs.productSizeId);

    expect(() => products.create({ ...refs, model: 'ZC220', productCategory: '冰柜' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_DICTIONARY_REFERENCE' }));
    expect(() => products.create({
      ...refs, productSizeId: refs.brandId, model: 'ZC220', productCategory: '冰柜',
    })).toThrowError(expect.objectContaining({ code: 'INVALID_DICTIONARY_REFERENCE' }));
  });

  it('stores an optional reference product and supports deactivation', () => {
    const refs = validReferences();
    const source = products.create({ ...refs, model: 'ZC200', productCategory: '冰柜' });
    const target = products.create({
      ...refs, model: 'ZC220', productCategory: '冰柜', referenceProductId: source.id,
    });

    expect(target.referenceProductId).toBe(source.id);
    expect(products.deactivate(target.id).status).toBe('inactive');
    expect(products.list({ status: 'inactive' }).items.map((item) => item.id)).toEqual([target.id]);
  });

  it('updates editable archive fields while revalidating references', () => {
    const refs = validReferences();
    const product = products.create({ ...refs, model: 'ZC220', productCategory: '冰柜' });

    const updated = products.update(product.id, { ...refs, model: 'ZC220A', productCategory: '卧式冰柜' });
    expect(updated).toEqual(expect.objectContaining({ model: 'ZC220A', productCategory: '卧式冰柜' }));
  });
});
