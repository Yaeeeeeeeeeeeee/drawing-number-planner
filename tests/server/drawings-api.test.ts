// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DrawingQueryService } from '../../src/core/drawings/drawing-query-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerDrawingRoutes } from '../../src/server/routes/drawings';

let db: PlannerDatabase;

function seedPlannedDrawing(database: PlannerDatabase, status: 'reserved' | 'active' | 'voided' = 'reserved') {
  const now = '2026-08-26T03:00:00.000Z';
  const brand = Number(database.prepare(`insert into dictionary_items (type, code, name, status, created_at)
    values ('brand', '02', 'Brand', 'active', ?)`).run(now).lastInsertRowid);
  const roots = [
    ['product_size', '0209', 'Size'], ['appearance', '01', 'Appearance'], ['color', '0', 'White'],
    ['main_category', '04', 'Main'],
  ].map(([type, code, name]) => Number(database.prepare(`insert into dictionary_items (type, code, name, status, created_at)
    values (?, ?, ?, 'active', ?)`).run(type, code, name, now).lastInsertRowid));
  const project = Number(database.prepare(`insert into dictionary_items (type, code, name, parent_id, status, created_at)
    values ('project_item', '01', 'Logo', ?, 'active', ?)`).run(roots[3], now).lastInsertRowid);
  const product = Number(database.prepare(`insert into products
    (sku, brand_id, product_size_id, default_appearance_id, model, product_category, status, created_at)
    values ('SKU', ?, ?, ?, 'M', 'C', 'active', ?)`).run(brand, roots[0], roots[1], now).lastInsertRowid);
  const id = Number(database.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, created_at)
    values ('02.0209.010.0401001', 'Drawing', ?, ?, ?, ?, ?, '02', '0209', '01', '0', '04', '01', 1, ?, ?)`)
    .run(product, roots[1], roots[2], roots[3], project, status, now).lastInsertRowid);
  return { id, fullCode: '02.0209.010.0401001' };
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
});
afterEach(() => db.close());

describe('drawing library API', () => {
  it('returns an accurate empty paged result', async () => {
    const app = Fastify();
    registerDrawingRoutes(app, new DrawingQueryService(db));
    const response = await app.inject({ method: 'GET', url: '/api/drawings?keyword=不存在' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    await app.close();
  });

  it('rejects invalid paging and exposes no creation route', async () => {
    const app = Fastify();
    registerDrawingRoutes(app, new DrawingQueryService(db));
    const invalid = await app.inject({ method: 'GET', url: '/api/drawings?pageSize=101' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: '图号筛选条件无效' } });
    expect((await app.inject({ method: 'POST', url: '/api/drawings', payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/drawings?sourcePresence=yes' })).statusCode).toBe(400);
    await app.close();
  });

  it('returns a stable not-found error for missing detail', async () => {
    const app = Fastify();
    registerDrawingRoutes(app, new DrawingQueryService(db));
    const response = await app.inject({ method: 'GET', url: '/api/drawings/999' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: '图号记录不存在' } });
    await app.close();
  });

  it('validates lifecycle action bodies and returns structured transition errors', async () => {
    const planned = seedPlannedDrawing(db).id;
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    expect((await app.inject({ method: 'POST', url: `/api/drawings/${planned}/activate`, payload: { confirmed: true } })).json())
      .toEqual(expect.objectContaining({ id: planned, status: 'active' }));
    const invalid = await app.inject({ method: 'POST', url: `/api/drawings/${planned}/activate`, payload: { confirmed: true } });
    expect(invalid.statusCode).toBe(409);
    expect(invalid.json()).toEqual({ error: { code: 'INVALID_TRANSITION', message: '不支持从正式使用变更为正式使用' } });
    expect((await app.inject({ method: 'POST', url: `/api/drawings/${planned}/void`, payload: { confirmed: false } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/drawings/${planned}/void`, payload: { confirmed: true, extra: 1 } })).statusCode).toBe(400);
    await app.close();
  });

  it('associates only a present PDF through a strict action route', async () => {
    const now = '2026-08-26T03:00:00.000Z';
    const planned = seedPlannedDrawing(db);
    const pdfId = Number(db.prepare(`insert into pdf_files
      (relative_path, file_name, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('candidate.pdf', 'candidate.pdf', 'unmatched', '[]', 'source', 1, ?, ?, 1)`)
      .run(now, now).lastInsertRowid);
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    const associated = await app.inject({ method: 'POST', url: `/api/drawings/${planned.id}/associate-pdf`,
      payload: { pdfIndexId: pdfId, conversionType: 'outlined' } });
    expect(associated.statusCode).toBe(200);
    expect(associated.json()).toEqual(expect.objectContaining({ id: planned.id,
      outlinedFiles: [expect.objectContaining({ pdfIndexId: pdfId })] }));
    expect((await app.inject({ method: 'POST', url: `/api/drawings/${planned.id}/associate-pdf`,
      payload: { pdfIndexId: pdfId, conversionType: 'other' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: `/api/drawings/${planned.id}/associate-pdf`,
      payload: { pdfIndexId: 999999, conversionType: 'source' } })).json())
      .toEqual({ error: { code: 'PDF_NOT_AVAILABLE', message: 'PDF 索引不存在或文件当前缺失' } });
    await app.close();
  });
});
