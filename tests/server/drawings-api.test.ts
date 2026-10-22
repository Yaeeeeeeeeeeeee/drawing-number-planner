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
  it('requires batch confirmation and returns per-item failures without undoing a valid deletion', async () => {
    const planned = seedPlannedDrawing(db); const historical = seedHistoricalDrawing(db);
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));
    try {
      const items = [{ signedId: planned.id, confirmedCode: 'wrong-code', mode: 'release' },
        { signedId: -historical, confirmedCode: '02.0209.010.0401007', mode: 'retain_occupied' }];
      const denied = await app.inject({ method: 'POST', url: '/api/drawings/batch-delete', payload: { confirmed: false, items } });
      expect(denied.statusCode).toBe(400);
      expect(db.prepare('select deleted_at from historical_drawing_numbers where id = ?').get(historical)).toEqual({ deleted_at: null });
      const result = await app.inject({ method: 'POST', url: '/api/drawings/batch-delete', payload: { confirmed: true, items } });
      expect(result.statusCode).toBe(200);
      expect(result.json().items).toEqual([
        expect.objectContaining({ signedId: planned.id, status: 'skipped', code: 'DRAWING_CONFIRMATION_MISMATCH' }),
        expect.objectContaining({ signedId: -historical, status: 'deleted' }),
      ]);
      expect(db.prepare('select deleted_at from drawing_numbers where id = ?').get(planned.id)).toEqual({ deleted_at: null });
      expect(db.prepare('select deletion_mode from historical_drawing_numbers where id = ?').get(historical)).toEqual({ deletion_mode: 'retain_occupied' });
    } finally { await app.close(); }
  });
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

  it('toggles historical business status and directs legacy deletion to the unified workflow', async () => {
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
    expect(deletion.statusCode).toBe(405);
    expect(deletion.json()).toEqual({ error: { code: 'USE_DRAWING_DELETE_WORKFLOW',
      message: '请使用统一图号删除流程，并明确选择保留占号或释放图号' } });
    await app.close();
  });

  it('rejects non-positive historical delete IDs without reaching a planned reservation', async () => {
    const reserved = seedPlannedDrawing(db);
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    for (const id of [-reserved.id, 0]) {
      const response = await app.inject({ method: 'DELETE', url: `/api/historical-drawings/${id}`, payload: { confirmed: true } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: '历史图号编号无效' } });
    }
    expect((await app.inject({ method: 'GET', url: `/api/drawings/${reserved.id}` })).statusCode).toBe(200);
    await app.close();
  });

  it('returns a read-only deletion preview before confirming a reservation deletion', async () => {
    const reserved = seedPlannedDrawing(db);
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    const preview = await app.inject({ method: 'GET', url: `/api/drawings/${reserved.id}/deletion-preview` });

    expect(preview.statusCode).toBe(200);
    expect(preview.json()).toEqual(expect.objectContaining({ signedId: reserved.id, origin: 'planned',
      fullCode: reserved.fullCode, deletable: true, blockers: [], references: expect.objectContaining({
        presentPdf: 0, currentBom: 0, currentMaterial: 0,
      }) }));
    expect((await app.inject({ method: 'GET', url: `/api/drawings/${reserved.id}` })).statusCode).toBe(200);
    await app.close();
  });

  it('deletes planned and historical drawings using either explicit lifecycle mode', async () => {
    const reserved = seedPlannedDrawing(db); const historicalId = seedHistoricalDrawing(db);
    const historicalCode = (db.prepare('select full_code as fullCode from historical_drawing_numbers where id = ?')
      .get(historicalId) as { fullCode: string }).fullCode;
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    const retained = await app.inject({ method: 'POST', url: `/api/drawings/${reserved.id}/delete`,
      payload: { mode: 'retain_occupied', confirmedCode: reserved.fullCode, reason: '验收' } });
    expect(retained.statusCode).toBe(200);
    expect(retained.json()).toEqual({ outcome: 'deleted_retained', fullCode: reserved.fullCode, occupied: true });
    const released = await app.inject({ method: 'POST', url: `/api/drawings/${-historicalId}/delete`,
      payload: { mode: 'release', confirmedCode: historicalCode } });
    expect(released.statusCode).toBe(409);
    expect(released.json().error.message).toContain('历史扫描');
    expect((await app.inject({ method: 'GET', url: '/api/drawings?deletionState=deleted-retained' })).json())
      .toEqual(expect.objectContaining({ total: 1, items: [expect.objectContaining({ fullCode: reserved.fullCode })] }));
    expect((await app.inject({ method: 'POST', url: `/api/drawings/${reserved.id}/restore`, payload: { confirmed: true } })).statusCode)
      .toBe(200);
    await app.close();
  });

  it('rejects legacy delete endpoints so they cannot bypass deletion mode and audit checks', async () => {
    const reserved = seedPlannedDrawing(db);
    const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));

    const historicalId = seedHistoricalDrawing(db);
    for (const url of [`/api/drawings/${reserved.id}`, `/api/historical-drawings/${historicalId}`]) {
      const response = await app.inject({ method: 'DELETE', url, payload: { confirmed: true } });
      expect(response.statusCode).toBe(405);
      expect(response.json()).toEqual({ error: { code: 'USE_DRAWING_DELETE_WORKFLOW',
        message: '请使用统一图号删除流程，并明确选择保留占号或释放图号' } });
    }
    expect((await app.inject({ method: 'GET', url: `/api/drawings/${reserved.id}` })).statusCode).toBe(200);
    await app.close();
  });
});

it('serves navigation before signed detail IDs and validates actual usage filters without writing', async () => {
  const planned = seedPlannedDrawing(db);
  const productId = (db.prepare('select product_id as id from drawing_numbers where id = ?').get(planned.id) as { id: number }).id;
  const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));
  const before = db.serialize(); db.pragma('query_only = ON');
  try {
    const navigation = await app.inject({ method: 'GET', url: '/api/drawings/navigation' });
    expect(navigation.statusCode).toBe(200); expect(navigation.json()).toEqual({ batches: [] });
    const filtered = await app.inject({ method: 'GET', url: `/api/drawings?productId=${productId}&associationState=pending` });
    expect(filtered.statusCode).toBe(200); expect(filtered.json().items.map((item: { id: number }) => item.id)).toEqual([planned.id]);
    expect((await app.inject({ method: 'GET', url: '/api/drawings?usageBatchId=1' })).json().total).toBe(0);
    for (const query of ['productId=0', 'usageBatchId=-1', 'associationState=current']) {
      expect((await app.inject({ method: 'GET', url: `/api/drawings?${query}` })).statusCode).toBe(400);
    }
    expect((await app.inject({ method: 'GET', url: `/api/drawings/${planned.id}` })).json().businessUsage).toEqual([]);
    expect(db.serialize().equals(before)).toBe(true);
  } finally { db.pragma('query_only = OFF'); await app.close(); }
});

it('serves actual catalog counts and product-only unassociated filters without modifying data', async () => {
  seedPlannedDrawing(db);
  seedHistoricalDrawing(db);
  const app = Fastify(); registerDrawingRoutes(app, new DrawingQueryService(db));
  const before = db.serialize(); db.pragma('query_only = ON');
  try {
    const response = await app.inject({ method: 'GET', url: '/api/drawings/navigation-counts?page=9&pageSize=1' });
    expect(response.statusCode).toBe(200);
    const counts = response.json();
    const all = await app.inject({ method: 'GET', url: '/api/drawings' });
    const pending = await app.inject({ method: 'GET', url: '/api/drawings?associationState=unassociated' });
    expect(counts.total).toBe(all.json().total);
    expect(counts.unassociated).toBe(pending.json().total);
    expect(counts.products).toEqual([expect.objectContaining({ count: 1 })]);
    const recycle = await app.inject({ method: 'GET', url: '/api/drawings?deletionState=deleted' });
    expect(recycle.statusCode).toBe(200); expect(recycle.json().total).toBe(counts.recycle);
    const category = await app.inject({ method: 'GET', url: '/api/drawings?navigationProductCategory=C' });
    expect(category.statusCode).toBe(200); expect(category.json().total).toBe(1);
    expect((await app.inject({ method: 'GET', url: '/api/drawings/navigation-counts?unknown=1' })).statusCode).toBe(400);
    expect(db.serialize().equals(before)).toBe(true);
  } finally { db.pragma('query_only = OFF'); await app.close(); }
});

it('previews and explicitly confirms reuse through real routes, preserving original ownership and an empty BOM',async()=>{
 const seeded=seedPlannedDrawing(db);const raw=db.prepare('select product_id,appearance_id from drawing_numbers where id=?').get(seeded.id) as {product_id:number;appearance_id:number};
 const {ensureProductAppearance}=await import('../../src/core/products/appearance-identity');ensureProductAppearance(db,raw.product_id);
 const first=db.prepare('select id from product_appearance_versions where product_id=?').get(raw.product_id) as {id:number};
 db.prepare("insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,revision,updated_at) values('planned',?,?,?,'planning',1,'now')").run(seeded.id,raw.product_id,first.id);
 const target=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'Second','draft','now')").run(raw.product_id,raw.appearance_id).lastInsertRowid);
 const app=Fastify();registerDrawingRoutes(app,new DrawingQueryService(db));
 try{
 const input={signedId:seeded.id,productId:raw.product_id,appearanceVersionId:target,reason:'核验旧物料继续使用'};
 const preview=await app.inject({method:'POST',url:'/api/drawings/reuse-preview',payload:input});expect(preview.statusCode).toBe(200);
 const unconfirmed=await app.inject({method:'POST',url:'/api/drawings/reuse-confirm',payload:{...input,fingerprint:preview.json().fingerprint}});expect(unconfirmed.statusCode).toBe(400);
 const confirm=await app.inject({method:'POST',url:'/api/drawings/reuse-confirm',payload:{...input,fingerprint:preview.json().fingerprint,confirmed:true}});expect(confirm.statusCode).toBe(200);expect(confirm.json()).toEqual({updated:1});
 const list=await app.inject({method:'GET',url:`/api/drawings?productId=${raw.product_id}&appearanceVersionId=${target}`});expect(list.json().items.map((row:{id:number})=>row.id)).toEqual([seeded.id]);
 expect(db.prepare('select appearance_version_id from drawing_appearance_bindings').get()).toEqual({appearance_version_id:first.id});expect(db.prepare('select * from bom_versions').all()).toEqual([]);
 }finally{await app.close();}
});

it('persists one-click classification through the real HTTP route and exposes it in library counts',async()=>{
  const id=seedPlannedDrawing(db);
  const historicalId=seedHistoricalDrawing(db);
  const productId=(db.prepare('select product_id from drawing_numbers where id=?').get(id.id) as {product_id:number}).product_id;
  db.prepare('update historical_drawing_numbers set product_id=? where id=?').run(productId,historicalId);
  const app=Fastify();registerDrawingRoutes(app,new DrawingQueryService(db));
  try {
    const response=await app.inject({method:'POST',url:'/api/drawings/association-classify',payload:{}});
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({updated:2,after:{historicalAssociated:1}});
    const library=await app.inject({method:'GET',url:`/api/drawings?productId=${productId}`});
    expect(library.json().total).toBe(2);
    const invalid=await app.inject({method:'POST',url:'/api/drawings/association-classify',payload:{signedIds:[0]}});
    expect(invalid.statusCode).toBe(400);
    expect(id).toBeDefined();
  }finally{await app.close();}
});
