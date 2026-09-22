import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { ProductRepository } from '../../src/core/products/product-repository';
import { OccupiedNumberRepository } from '../../src/core/planning/occupied-number-repository';
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

it('does not count deleted historical drawings or BOM records as current product blockers', () => {
  const product = products.create({ ...validReferences(), sku: 'SOFT-DELETE', model: 'T40', productCategory: '冰柜' });
  insertHistorical({ fullCode: '02.0209.010.0401001', productId: product.id });
  db.prepare("update historical_drawing_numbers set deleted_at = '2026-09-22', deletion_mode = 'retain_occupied'").run();
  db.prepare(`insert into bom_versions (product_id, version_number, business_change_date, created_at, deleted_at)
    values (?, 1, '2026-09-22', '2026-09-22', '2026-09-22')`).run(product.id);
  expect(new ProductRepository(db).getReferenceSummary(product.id)).toMatchObject({ historicalDrawingCount: 0, bomCount: 0 });
});

function validReferences(prefix = '') {
  return {
    brandId: dictionaries.create({ type: 'brand', code: `${prefix}02`, name: `${prefix}SAMKYO` }).id,
    productSizeId: dictionaries.create({ type: 'product_size', code: `${prefix}0209`, name: `${prefix}冰柜` }).id,
    defaultAppearanceId: dictionaries.create({ type: 'appearance', code: `${prefix}01`, name: `${prefix}1号外观` }).id,
  };
}

function insertHistorical(input: {
  fullCode: string; sku?: string | null; model?: string | null; productCategory?: string | null; productId?: number | null;
}) {
  db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, product_id, detected_sku, detected_model, detected_product_category,
     first_seen_at, last_seen_at)
    values (?, '02', '0209', '01', '0', '04', '01', ?, ?, ?, ?, ?, '2026-08-26', '2026-08-26')`)
    .run(input.fullCode, Number(input.fullCode.slice(-3)), input.productId ?? null,
      input.sku ?? null, input.model ?? null, input.productCategory ?? null);
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

  it('reactivates a deactivated product without changing its identity', () => {
    const refs = validReferences();
    const product = products.create({ ...refs, sku: 'SKU-REACTIVATE', model: 'ZC220', productCategory: '冰柜' });
    products.deactivate(product.id);

    expect(products.activate(product.id)).toEqual(expect.objectContaining({
      id: product.id, sku: 'SKU-REACTIVATE', status: 'active',
    }));
    expect(products.list({ status: 'active' }).items.map((item) => item.id)).toContain(product.id);
  });

  it('deletes an unreferenced product and its blank inactive default QR placeholders', () => {
    const refs = validReferences();
    const product = products.create({ ...refs, sku: 'SKU-DELETE', model: 'ZC220', productCategory: '冰柜' });
    expect(db.prepare('select count(*) as count from product_qr_codes where product_id = ?').get(product.id)).toEqual({ count: 2 });

    expect(products.delete(product.id)).toEqual({ deleted: true });
    expect(products.list({ status: 'all' }).items).toEqual([]);
    expect(db.prepare('select count(*) as count from product_qr_codes where product_id = ?').get(product.id)).toEqual({ count: 0 });
  });

  it('deletes v8-migrated English-name default QR placeholders for an unreferenced product', () => {
    const refs = validReferences();
    const product = products.create({ ...refs, sku: 'SKU-V8-QR', model: 'ZC221', productCategory: '冰柜' });
    db.prepare(`update product_qr_codes set name = (
      select purpose.english_name from qr_purposes purpose where purpose.id = product_qr_codes.purpose_id
    ) where product_id = ?`).run(product.id);

    expect(products.delete(product.id)).toEqual({ deleted: true });
    expect(db.prepare('select count(*) as count from product_qr_codes where product_id = ?').get(product.id)).toEqual({ count: 0 });
  });

  it('preserves a renamed inactive QR record instead of treating it as a blank default placeholder', () => {
    const refs = validReferences();
    const product = products.create({ ...refs, sku: 'SKU-RENAMED-QR', model: 'ZC220', productCategory: '冰柜' });
    db.prepare(`update product_qr_codes set name = '自定义说明书' where id = (
      select id from product_qr_codes where product_id = ? order by id limit 1
    )`).run(product.id);

    expect(() => products.delete(product.id)).toThrowError(expect.objectContaining({
      code: 'PRODUCT_REFERENCED', referenceSummary: expect.objectContaining({ configuredQrCount: 1 }),
    }));
    expect(products.get(product.id)).toEqual(expect.objectContaining({ id: product.id }));
  });

  it('reports each business module that protects a referenced product from deletion', () => {
    const refs = validReferences();
    const protectedProduct = products.create({ ...refs, sku: 'SKU-PROTECTED', model: 'ZC220', productCategory: '冰柜' });
    products.create({ ...refs, sku: 'SKU-REFERENCE', model: 'ZC221', productCategory: '冰柜', referenceProductId: protectedProduct.id });
    const color = dictionaries.create({ type: 'color', code: '0', name: '白色' });
    const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at) values ('02.0209.010.0401001', '图号', ?, ?, ?, ?, ?,
       '02', '0209', '01', '0', '04', '01', 1, 'active', '2026-08-24')`)
      .run(protectedProduct.id, refs.defaultAppearanceId, color.id, main.id, item.id);
    insertHistorical({ fullCode: '02.0209.010.0401002', productId: protectedProduct.id });
    db.prepare(`insert into material_batches
      (relative_path, product_directory, product_id, name, recognition_status, first_seen_at, last_seen_at)
      values ('SKU-PROTECTED/batch.pdf', 'SKU-PROTECTED', ?, 'batch.pdf', 'recognized', '2026-08-24', '2026-08-24')`)
      .run(protectedProduct.id);
    db.prepare(`insert into bom_versions (product_id, version_number, created_at)
      values (?, 1, '2026-08-24')`).run(protectedProduct.id);
    db.prepare(`update product_qr_codes set target_url = 'https://example.test/manual' where id = (
      select id from product_qr_codes where product_id = ? order by id limit 1
    )`).run(protectedProduct.id);

    expect(() => products.delete(protectedProduct.id)).toThrowError(expect.objectContaining({
      code: 'PRODUCT_REFERENCED',
      referenceSummary: {
        referenceProductCount: 1,
        plannedDrawingCount: 1,
        historicalDrawingCount: 1,
        materialBatchCount: 1,
        bomCount: 1,
        configuredQrCount: 1,
      },
    }));
    expect(products.get(protectedProduct.id)).toEqual(expect.objectContaining({ id: protectedProduct.id }));
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

  it('derives deterministic historical product candidates, groups exact tuples and excludes formal SKUs', () => {
    const refs = validReferences();
    products.create({ ...refs, sku: 'FORMAL-SKU', model: 'FORMAL', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401001', sku: 'HISTORY-SKU', model: 'ZC220', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401002', sku: 'HISTORY-SKU', model: 'ZC220', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401003', sku: 'formal-sku', model: 'OTHER', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401004', sku: null, model: 'NO-SKU', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401005', sku: 'HISTORY-SKU', model: 'ZC221', productCategory: '03.冰柜' });

    const before = db.prepare(`select full_code, product_id from historical_drawing_numbers order by full_code`).all();
    expect(products.listHistoricalCandidates()).toEqual({ items: [
      { productCategory: '03.冰柜', sku: 'HISTORY-SKU', model: 'ZC220', historicalDrawingCount: 2, ambiguous: true },
      { productCategory: '03.冰柜', sku: 'HISTORY-SKU', model: 'ZC221', historicalDrawingCount: 1, ambiguous: true },
    ] });
    expect(db.prepare(`select full_code, product_id from historical_drawing_numbers order by full_code`).all()).toEqual(before);
  });

  it('atomically creates a confirmed historical product and links only its exact tuple', () => {
    const refs = validReferences();
    insertHistorical({ fullCode: '02.0209.010.0401001', sku: 'SKDZC220JP', model: 'ZC220', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401002', sku: 'SKDZC220JP', model: 'ZC220', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401003', sku: 'CATEGORY-OTHER', model: 'ZC220', productCategory: '冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401004', sku: 'OTHER-SKU', model: 'ZC220', productCategory: '03.冰柜' });

    const result = products.confirmHistoricalCandidate({
      productCategory: '03.冰柜', sku: 'SKDZC220JP', model: 'ZC220', ...refs,
    });

    expect(result).toEqual({ product: expect.objectContaining({ sku: 'SKDZC220JP', model: 'ZC220' }), linkedHistoricalCount: 2 });
    expect(db.prepare(`select full_code, product_id from historical_drawing_numbers order by full_code`).all()).toEqual([
      { full_code: '02.0209.010.0401001', product_id: result.product.id },
      { full_code: '02.0209.010.0401002', product_id: result.product.id },
      { full_code: '02.0209.010.0401003', product_id: null },
      { full_code: '02.0209.010.0401004', product_id: null },
    ]);
  });

  it('rejects ambiguous and stale candidates without partially creating a product', () => {
    const refs = validReferences();
    insertHistorical({ fullCode: '02.0209.010.0401001', sku: 'AMBIGUOUS-SKU', model: 'ZC220', productCategory: '03.冰柜' });
    insertHistorical({ fullCode: '02.0209.010.0401002', sku: 'AMBIGUOUS-SKU', model: 'ZC221', productCategory: '03.冰柜' });
    expect(() => products.confirmHistoricalCandidate({
      productCategory: '03.冰柜', sku: 'AMBIGUOUS-SKU', model: 'ZC220', ...refs,
    })).toThrowError(expect.objectContaining({ code: 'AMBIGUOUS_HISTORICAL_CANDIDATE' }));

    expect(() => products.confirmHistoricalCandidate({
      productCategory: '03.冰柜', sku: 'MISSING-SKU', model: 'MISSING', ...refs,
    })).toThrowError(expect.objectContaining({ code: 'STALE_HISTORICAL_CANDIDATE' }));
    expect(db.prepare(`select count(*) as count from products`).get()).toEqual({ count: 0 });
  });

  it('rolls back duplicate-SKU and inactive-dictionary confirmation while preserving permanent occupancy', () => {
    const refs = validReferences();
    insertHistorical({ fullCode: '02.0209.010.0401001', sku: 'HISTORY-SKU', model: 'ZC220', productCategory: '03.冰柜' });
    products.create({ ...refs, sku: 'HISTORY-SKU', model: 'OTHER', productCategory: '03.冰柜' });
    expect(() => products.confirmHistoricalCandidate({
      productCategory: '03.冰柜', sku: 'HISTORY-SKU', model: 'ZC220', ...refs,
    })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_SKU' }));

    insertHistorical({ fullCode: '02.0209.010.0401002', sku: 'INACTIVE-SKU', model: 'ZC221', productCategory: '03.冰柜' });
    dictionaries.deactivate(refs.defaultAppearanceId);
    expect(() => products.confirmHistoricalCandidate({
      productCategory: '03.冰柜', sku: 'INACTIVE-SKU', model: 'ZC221', ...refs,
    })).toThrowError(expect.objectContaining({ code: 'INVALID_DICTIONARY_REFERENCE' }));

    expect(db.prepare(`select count(*) as count from products where sku = 'INACTIVE-SKU'`).get()).toEqual({ count: 0 });
    expect(db.prepare(`select product_id from historical_drawing_numbers where full_code = '02.0209.010.0401002'`).get())
      .toEqual({ product_id: null });
    expect(new OccupiedNumberRepository(db).hasFullCode('02.0209.010.0401002')).toBe(true);
  });
});
