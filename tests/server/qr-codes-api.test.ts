import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { QrService } from '../../src/core/qr/qr-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerQrCodeRoutes } from '../../src/server/routes/qr-codes';

let db: PlannerDatabase;
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); });
afterEach(() => db.close());

async function appWithProduct() {
  const dictionaries = new DictionaryService(db); const products = new ProductService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '外观' });
  const product = products.create({ sku: 'SKUAPI', model: 'API100', productCategory: '冰柜',
    brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });
  const app = Fastify(); registerQrCodeRoutes(app, new QrService(db));
  return { app, product };
}

describe('QR code API', () => {
  it('lists product QR records and preserves their URL while toggling status', async () => {
    const { app, product } = await appWithProduct();
    const listed = await app.inject({ method: 'GET', url: `/api/qr-codes?productId=${product.id}` });
    expect(listed.statusCode).toBe(200);
    const code = listed.json().items[0] as { id: number; status: string };
    const updated = await app.inject({ method: 'PUT', url: `/api/qr-codes/${code.id}`,
      payload: { name: '说明书链接', targetUrl: 'https://example.test/manual' } });
    expect(updated.json()).toMatchObject({ targetUrl: 'https://example.test/manual' });
    const inactive = await app.inject({ method: 'POST', url: `/api/qr-codes/${code.id}/deactivate` });
    expect(inactive.json()).toMatchObject({ status: 'inactive', targetUrl: 'https://example.test/manual' });
    await app.close();
  });

  it('rejects malformed updates with a specific error response', async () => {
    const { app, product } = await appWithProduct();
    const code = (await app.inject({ method: 'GET', url: `/api/qr-codes?productId=${product.id}` })).json().items[0] as { id: number };
    const response = await app.inject({ method: 'PUT', url: `/api/qr-codes/${code.id}`,
      payload: { name: '说明书', targetUrl: 'mailto:bad@example.test' } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: 'INVALID_TARGET_URL' } });
    await app.close();
  });
});
