// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerPlanningRoutes } from '../../src/server/routes/planning';

let db: PlannerDatabase;
let app: ReturnType<typeof Fastify>;
let payload: { productId: number; rows: Array<Record<string, unknown>> };

beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const dictionaries = new DictionaryService(db); const products = new ProductService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '一号外观' });
  const color = dictionaries.create({ type: 'color', code: '0', name: '白色' });
  const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
  const item = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const product = products.create({ sku: 'TEST-PLANNING-API', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC200', productCategory: '冰柜' });
  payload = { productId: product.id, rows: [{ clientId: 'row-1', colorId: color.id,
    mainCategoryId: main.id, projectItemId: item.id }] };
  app = Fastify(); registerPlanningRoutes(app, new PlanningService(db));
});
afterEach(async () => { await app.close(); db.close(); });

describe('planning API', () => {
  it('previews and then reserves the exact approved code', async () => {
    const preview = await app.inject({ method: 'POST', url: '/api/planning/preview', payload });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().rows[0]).toEqual(expect.objectContaining({ fullCode: '02.0404.010.0401001', available: true }));

    const reserve = await app.inject({ method: 'POST', url: '/api/planning/reserve', payload: {
      ...payload, rows: [{ ...payload.rows[0], expectedFullCode: preview.json().rows[0].fullCode }],
    } });
    expect(reserve.statusCode).toBe(201);
    expect(reserve.json().items).toEqual([expect.objectContaining({ fullCode: '02.0404.010.0401001', status: 'reserved' })]);
  });

  it('rejects malformed rows before calling the domain service', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/planning/preview', payload: { productId: 0, rows: [] } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: '图号规划数据不完整' } });
  });

  it('maps stale approval to a stable conflict response', async () => {
    const preview = await app.inject({ method: 'POST', url: '/api/planning/preview', payload });
    const code = preview.json().rows[0].fullCode as string;
    await app.inject({ method: 'POST', url: '/api/planning/reserve', payload: {
      ...payload, rows: [{ ...payload.rows[0], expectedFullCode: code }],
    } });
    const stale = await app.inject({ method: 'POST', url: '/api/planning/reserve', payload: {
      ...payload, rows: [{ ...payload.rows[0], expectedFullCode: code }],
    } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: { code: 'PLAN_STALE', message: '推荐图号已变化，请重新查重后再占号' } });
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({ count: 1 });
  });
});
