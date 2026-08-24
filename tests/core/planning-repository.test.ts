import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningRepository } from '../../src/core/planning/planning-repository';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let dictionaries: DictionaryService;
let products: ProductService;
let repository: PlanningRepository;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  dictionaries = new DictionaryService(db);
  products = new ProductService(db);
  repository = new PlanningRepository(db);
});
afterEach(() => db.close());

function fixture(defaultAppearance = true, prefix = '') {
  const brand = dictionaries.create({ type: 'brand', code: `${prefix}02`, name: `${prefix}SAMKYO` });
  const size = dictionaries.create({ type: 'product_size', code: `${prefix}0404`, name: `${prefix}冰柜` });
  const appearance = dictionaries.create({ type: 'appearance', code: `${prefix}01`, name: `${prefix}一号外观` });
  const color = dictionaries.create({ type: 'color', code: `${prefix}0`, name: `${prefix}白色` });
  const main = dictionaries.create({ type: 'main_category', code: `${prefix}04`, name: `${prefix}印刷件类` });
  const item = dictionaries.create({ type: 'project_item', code: `${prefix}01`, name: `${prefix}LOGO`, parentId: main.id });
  const product = products.create({ brandId: brand.id, productSizeId: size.id,
    ...(defaultAppearance ? { defaultAppearanceId: appearance.id } : {}), model: `${prefix}ZC200`, productCategory: '冰柜' });
  return { brand, size, appearance, color, main, item, product };
}

const row = (refs: ReturnType<typeof fixture>) => ({
  clientId: 'row-1', colorId: refs.color.id, mainCategoryId: refs.main.id, projectItemId: refs.item.id,
});

describe('PlanningRepository context validation', () => {
  it('resolves immutable codes and names from active product dictionaries', () => {
    const refs = fixture();
    expect(repository.resolveContext({ productId: refs.product.id, rows: [row(refs)] })).toEqual(expect.objectContaining({
      productId: refs.product.id, brandCode: '02', productSizeCode: '0404', appearanceCode: '01', model: 'ZC200',
      rows: [expect.objectContaining({ colorCode: '0', mainCategoryCode: '04', projectItemCode: '01' })],
    }));
  });

  it('requires an active product and an appearance', () => {
    const inactive = fixture(); products.deactivate(inactive.product.id);
    expect(() => repository.resolveContext({ productId: inactive.product.id, rows: [row(inactive)] }))
      .toThrowError(expect.objectContaining({ code: 'PRODUCT_NOT_ACTIVE' }));

    const missing = fixture(false, 'B');
    expect(() => repository.resolveContext({ productId: missing.product.id, rows: [row(missing)] }))
      .toThrowError(expect.objectContaining({ code: 'APPEARANCE_REQUIRED' }));
  });

  it('accepts an explicit active appearance when the product has no default', () => {
    const refs = fixture(false);
    expect(repository.resolveContext({ productId: refs.product.id, appearanceId: refs.appearance.id, rows: [row(refs)] }).appearanceCode)
      .toBe('01');
  });

  it('rejects inactive row dictionaries and project items owned by another main category', () => {
    const refs = fixture(); dictionaries.deactivate(refs.color.id);
    expect(() => repository.resolveContext({ productId: refs.product.id, rows: [row(refs)] }))
      .toThrowError(expect.objectContaining({ code: 'DICTIONARY_NOT_ACTIVE' }));

    const parentRefs = fixture(true, 'B');
    const secondMain = dictionaries.create({ type: 'main_category', code: '05', name: '包装类' });
    expect(() => repository.resolveContext({ productId: parentRefs.product.id, rows: [{ ...row(parentRefs), mainCategoryId: secondMain.id }] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PROJECT_PARENT' }));
  });

  it('rejects legacy products whose brand or size points to the wrong dictionary type', () => {
    const brandRefs = fixture();
    db.prepare('update products set brand_id = ? where id = ?').run(brandRefs.appearance.id, brandRefs.product.id);
    expect(() => repository.resolveContext({ productId: brandRefs.product.id, rows: [row(brandRefs)] }))
      .toThrowError(expect.objectContaining({ code: 'DICTIONARY_NOT_ACTIVE' }));

    const sizeRefs = fixture(true, 'B');
    db.prepare('update products set product_size_id = ? where id = ?').run(sizeRefs.color.id, sizeRefs.product.id);
    expect(() => repository.resolveContext({ productId: sizeRefs.product.id, rows: [row(sizeRefs)] }))
      .toThrowError(expect.objectContaining({ code: 'DICTIONARY_NOT_ACTIVE' }));
  });
});
