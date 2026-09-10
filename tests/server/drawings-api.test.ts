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

function seedHistoricalDrawing(database: PlannerDatabase) {
  const now = '2026-08-31T00:00:00.000Z';
  return Number(database.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values ('02.0209.010.0401007', '02', '0209', '01', '0', '04', '01', 7, ?, ?)`)
    .run(now, now).lastInsertRowid);
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

  it('accepts appearance and material-batch drawing query parameters', async () => {
    const planned = seedPlannedDrawing(db);
    const batchId = Number(db.prepare(`insert into material_batches
      (relative_path, product_directory, name, recognition_status, is_present, first_seen_at, last_seen_at)
      values ('C\\SKU\\01.20260827', 'C\\SKU', '01.20260827', 'recognized', 1, '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z')`)
      .run().lastInsertRowid);
    db.prepare(`insert into pdf_files
      (relative_path, file_name, drawing_id, material_batch_id, match_status, detected_codes_json, conversion_type,
       size_bytes, modified_at, scanned_at, is_present)
      values ('C\\SKU\\01.20260827\\drawing.pdf', 'drawing.pdf', ?, ?, 'matched', '[]', 'outlined', 1,
       '2026-08-27T00:00:00.000Z', '2026-08-27T00:00:00.000Z', 1)`).run(planned.id, batchId);
    const appearanceId = (db.prepare('select appearance_id as id from drawing_numbers where id = ?').get(planned.id) as { id: number }).id;
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    const response = await app.inject({ method: 'GET', url: `/api/drawings?appearanceId=${appearanceId}&materialBatchId=${batchId}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({ total: 1,
      items: [expect.objectContaining({ id: planned.id })] }));
    await app.close();
  });

  it('toggles historical business status without exposing removal of its permanent occupancy', async () => {
    const historicalId = seedHistoricalDrawing(db);
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    const deactivated = await app.inject({ method: 'POST', url: `/api/historical-drawings/${historicalId}/deactivate`,
      payload: { confirmed: true } });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json()).toEqual(expect.objectContaining({
      id: -historicalId, origin: 'historical', status: 'inactive', hasSourceFile: false, hasOutlinedFile: false,
    }));
    expect((await app.inject({ method: 'POST', url: `/api/historical-drawings/${historicalId}/activate`,
      payload: { confirmed: true } })).json()).toEqual(expect.objectContaining({ status: 'active' }));
    const deletion = await app.inject({ method: 'DELETE', url: `/api/historical-drawings/${historicalId}` });
    expect(deletion.statusCode).toBe(409);
    expect(deletion.json()).toEqual({ error: { code: 'HISTORICAL_READ_ONLY', message: '永久占号，不支持普通删除' } });
    await app.close();
  });

  it('deletes only an explicitly confirmed, unused reservation and rejects permanent drawing numbers', async () => {
    const reserved = seedPlannedDrawing(db);
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    expect((await app.inject({ method: 'DELETE', url: `/api/drawings/${reserved.id}`, payload: { confirmed: false } })).statusCode).toBe(400);
    const deleted = await app.inject({ method: 'DELETE', url: `/api/drawings/${reserved.id}`, payload: { confirmed: true } });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ deleted: true });
    expect((await app.inject({ method: 'GET', url: `/api/drawings/${reserved.id}` })).statusCode).toBe(404);

    const activeId = Number(db.prepare(`insert into drawing_numbers
      (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
       brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
       sequence, status, created_at)
      select '02.0209.010.0401002', 'Active drawing', product.id, appearance.id, color.id, mainCategory.id, project.id,
        '02', '0209', '01', '0', '04', '01', 2, 'active', '2026-08-26T00:00:00.000Z'
      from products product
      join dictionary_items appearance on appearance.type = 'appearance' and appearance.code = '01'
      join dictionary_items color on color.type = 'color' and color.code = '0'
      join dictionary_items mainCategory on mainCategory.type = 'main_category' and mainCategory.code = '04'
      join dictionary_items project on project.type = 'project_item' and project.code = '01' and project.parent_id = mainCategory.id
      limit 1`).run().lastInsertRowid);
    const active = { id: activeId };
    expect((await app.inject({ method: 'DELETE', url: `/api/drawings/${active.id}`, payload: { confirmed: true } })).json())
      .toEqual(expect.objectContaining({ error: expect.objectContaining({
        code: 'DRAWING_NOT_DELETABLE', message: '仅允许删除从未使用的已占号图号',
      }) }));
    const historicalId = seedHistoricalDrawing(db);
    const historical = await app.inject({ method: 'DELETE', url: `/api/historical-drawings/${historicalId}`, payload: { confirmed: true } });
    expect(historical.statusCode).toBe(409);
    expect(historical.json()).toEqual({ error: { code: 'HISTORICAL_READ_ONLY', message: '永久占号，不支持普通删除' } });
    await app.close();
  });
});
