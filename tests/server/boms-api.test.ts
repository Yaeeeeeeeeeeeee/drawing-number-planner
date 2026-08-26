// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BomService } from '../../src/core/bom/bom-service';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerBomRoutes } from '../../src/server/routes/boms';

let db: PlannerDatabase;
let app: ReturnType<typeof Fastify>;
let refs: ReturnType<typeof fixture>;

function fixture() {
  const dictionaries = new DictionaryService(db); const products = new ProductService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '一号外观' });
  const white = dictionaries.create({ type: 'color', code: '0', name: '白色' });
  const gray = dictionaries.create({ type: 'color', code: '1', name: '灰色' });
  const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
  const logo = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const product = products.create({ sku: 'TEST-BOMS-API', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC100', productCategory: '冰柜' });
  const planning = new PlanningService(db);
  const input = { productId: product.id, rows: [{ clientId: 'white-logo', colorId: white.id,
    mainCategoryId: main.id, projectItemId: logo.id }] };
  const preview = planning.preview(input);
  const drawing = planning.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
  return { white, gray, logo, product, drawing };
}

beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  refs = fixture(); app = Fastify(); registerBomRoutes(app, new BomService(db));
});
afterEach(async () => { await app.close(); db.close(); });

describe('BOM API', () => {
  it('returns empty current data, eligible candidates, saved detail, and version history', async () => {
    const current = await app.inject({ method: 'GET', url: `/api/boms/current?productId=${refs.product.id}&colorId=${refs.gray.id}` });
    expect(current.statusCode).toBe(200); expect(current.json()).toEqual({ version: null });

    const candidates = await app.inject({ method: 'GET',
      url: `/api/boms/candidates?productId=${refs.product.id}&bomColorId=${refs.gray.id}&projectItemId=${refs.logo.id}&usesWhiteMaterial=true` });
    expect(candidates.statusCode).toBe(200);
    expect(candidates.json().items).toEqual([expect.objectContaining({ id: refs.drawing.id, status: 'reserved' })]);

    const saved = await app.inject({ method: 'POST', url: '/api/boms/versions', payload: {
      productId: refs.product.id, colorId: refs.gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId: refs.logo.id, drawingId: refs.drawing.id, quantity: 1, usesWhiteMaterial: true }],
    } });
    expect(saved.statusCode).toBe(201);
    expect(saved.json().version).toEqual(expect.objectContaining({ versionNumber: 1,
      items: [expect.objectContaining({ drawingId: refs.drawing.id, usesWhiteMaterial: true })] }));

    const versionId = saved.json().version.id as number;
    expect((await app.inject({ method: 'GET', url: `/api/boms/versions/${versionId}` })).json())
      .toEqual(expect.objectContaining({ id: versionId, versionNumber: 1 }));
    expect((await app.inject({ method: 'GET',
      url: `/api/boms/versions?productId=${refs.product.id}&colorId=${refs.gray.id}` })).json().items)
      .toEqual([expect.objectContaining({ id: versionId, versionNumber: 1 })]);
  });

  it('maps a stale draft to conflict without creating another version', async () => {
    const payload = { productId: refs.product.id, colorId: refs.gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId: refs.logo.id, drawingId: refs.drawing.id, quantity: 1, usesWhiteMaterial: true }] };
    expect((await app.inject({ method: 'POST', url: '/api/boms/versions', payload })).statusCode).toBe(201);
    const stale = await app.inject({ method: 'POST', url: '/api/boms/versions', payload });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: { code: 'BOM_STALE', message: '当前 BOM 已变化，请刷新后重新保存' } });
    expect(db.prepare('select count(*) as count from bom_versions').get()).toEqual({ count: 1 });
  });

  it('rejects malformed input and maps business eligibility failures', async () => {
    const malformed = await app.inject({ method: 'POST', url: '/api/boms/versions', payload: {
      productId: refs.product.id, colorId: refs.gray.id, expectedCurrentVersionId: null, unknown: true,
      items: [{ projectItemId: refs.logo.id, drawingId: refs.drawing.id, quantity: 0, usesWhiteMaterial: true }],
    } });
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: 'BOM 数据不完整或格式无效' } });

    db.prepare("update drawing_numbers set status = 'voided' where id = ?").run(refs.drawing.id);
    const invalid = await app.inject({ method: 'POST', url: '/api/boms/versions', payload: {
      productId: refs.product.id, colorId: refs.gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId: refs.logo.id, drawingId: refs.drawing.id, quantity: 1, usesWhiteMaterial: true }],
    } });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe('DRAWING_NOT_ELIGIBLE');

    const missing = await app.inject({ method: 'POST', url: '/api/boms/versions', payload: {
      productId: refs.product.id, colorId: refs.gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId: refs.logo.id, drawingId: 999999, quantity: 1, usesWhiteMaterial: true }],
    } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('DRAWING_NOT_FOUND');
  });
});
