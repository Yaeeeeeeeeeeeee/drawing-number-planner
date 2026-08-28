// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerProductRoutes } from '../../src/server/routes/products';

let db: PlannerDatabase;
let refs: { brandId: number; productSizeId: number; defaultAppearanceId: number };

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const dictionaries = new DictionaryService(db);
  refs = {
    brandId: dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' }).id,
    productSizeId: dictionaries.create({ type: 'product_size', code: '0209', name: '冰柜' }).id,
    defaultAppearanceId: dictionaries.create({ type: 'appearance', code: '01', name: '1号外观' }).id,
  };
});
afterEach(() => db.close());

describe('product API', () => {
  it('requires sku when creating a product', async () => {
    const app = Fastify(); registerProductRoutes(app, new ProductService(db));
    const response = await app.inject({ method: 'POST', url: '/api/products',
      payload: { ...refs, model: 'ZC220', productCategory: '03.冰柜' } });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it('creates, retrieves and searches persisted product records', async () => {
    const app = Fastify();
    registerProductRoutes(app, new ProductService(db));
    const created = await app.inject({
      method: 'POST', url: '/api/products',
      payload: { ...refs, sku: 'SKDZC220JP', model: 'ZC220', productCategory: '冰柜' },
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as number;

    const detail = await app.inject({ method: 'GET', url: `/api/products/${id}` });
    expect(detail.json()).toEqual(expect.objectContaining({ sku: 'SKDZC220JP', model: 'ZC220', brandName: 'SAMKYO' }));
    const listed = await app.inject({ method: 'GET', url: '/api/products?search=SKDZC220JP&brandId=' + refs.brandId });
    expect(listed.json()).toEqual({ items: [expect.objectContaining({ id })] });
    await app.close();
  });

  it('filters products by their existing product category', async () => {
    const products = new ProductService(db);
    products.create({ ...refs, sku: 'FREEZER-1', model: 'ZC220', productCategory: '冰柜' });
    products.create({ ...refs, sku: 'DISHWASHER-1', model: 'T40', productCategory: '洗碗机' });
    const app = Fastify(); registerProductRoutes(app, products);

    const response = await app.inject({ method: 'GET', url: '/api/products?status=all&productCategory=' + encodeURIComponent('洗碗机') });

    expect(response.json()).toEqual({ items: [expect.objectContaining({ sku: 'DISHWASHER-1', productCategory: '洗碗机' })] });
    await app.close();
  });

  it('updates and deactivates through explicit routes', async () => {
    const app = Fastify();
    registerProductRoutes(app, new ProductService(db));
    const created = await app.inject({ method: 'POST', url: '/api/products', payload: { ...refs, sku: 'SKDZC220JP', model: 'ZC220', productCategory: '冰柜' } });
    const id = created.json().id as number;

    const updated = await app.inject({
      method: 'PUT', url: `/api/products/${id}`,
      payload: { ...refs, sku: 'SKDZC220JP', model: 'ZC220A', productCategory: '卧式冰柜' },
    });
    expect(updated.json()).toEqual(expect.objectContaining({ model: 'ZC220A' }));
    const deactivated = await app.inject({ method: 'POST', url: `/api/products/${id}/deactivate` });
    expect(deactivated.json()).toEqual(expect.objectContaining({ status: 'inactive' }));
    await app.close();
  });

  it('returns a stable error for invalid dictionary references', async () => {
    const app = Fastify();
    registerProductRoutes(app, new ProductService(db));
    const response = await app.inject({
      method: 'POST', url: '/api/products',
      payload: { ...refs, brandId: refs.productSizeId, sku: 'SKDZC220JP', model: 'ZC220', productCategory: '冰柜' },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: { code: 'INVALID_DICTIONARY_REFERENCE', message: '产品引用了无效或已停用的编码字典' },
    });
    await app.close();
  });

  it('lists and explicitly confirms historical product candidates', async () => {
    db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, detected_sku, detected_model, detected_product_category, first_seen_at, last_seen_at)
      values ('02.0209.010.0401001', '02', '0209', '01', '0', '04', '01', 1,
        'SKDZC220JP', 'ZC220', '03.冰柜', '2026-08-26', '2026-08-26')`).run();
    const app = Fastify(); registerProductRoutes(app, new ProductService(db));

    expect((await app.inject({ method: 'GET', url: '/api/products/historical-candidates' })).json()).toEqual({ items: [
      { productCategory: '03.冰柜', sku: 'SKDZC220JP', model: 'ZC220', historicalDrawingCount: 1, ambiguous: false },
    ] });
    const invalid = await app.inject({ method: 'POST', url: '/api/products/historical-candidates/confirm', payload: {
      productCategory: '03.冰柜', sku: 'SKDZC220JP', model: 'ZC220', ...refs, defaultAppearanceId: null,
    } });
    expect(invalid.statusCode).toBe(400);
    const confirmed = await app.inject({ method: 'POST', url: '/api/products/historical-candidates/confirm', payload: {
      productCategory: '03.冰柜', sku: 'SKDZC220JP', model: 'ZC220', ...refs,
    } });
    expect(confirmed.statusCode).toBe(201);
    expect(confirmed.json()).toEqual({ product: expect.objectContaining({ sku: 'SKDZC220JP' }), linkedHistoricalCount: 1 });
    await app.close();
  });
});
