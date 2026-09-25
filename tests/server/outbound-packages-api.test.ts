// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OutboundPackageService } from '../../src/core/outbound/outbound-package-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerOutboundPackageRoutes } from '../../src/server/routes/outbound-packages';
import { registerTaskRoutes } from '../../src/server/routes/tasks';
import { TaskRegistry } from '../../src/core/tasks/task-registry';

let db: PlannerDatabase; let app: FastifyInstance; let root: string;
let productId: number; let batchId: number; let pdfId: number;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'outbound-api-')); const workspace = join(root, 'workspace'); const output = join(root, 'exports');
  mkdirSync(workspace); mkdirSync(output);
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const insert = (type: string, code: string, name: string, parent: number | null = null) => Number(db.prepare(`insert into dictionary_items
    (type, code, name, parent_id, status, created_at) values (?, ?, ?, ?, 'active', '2026-09-10T00:00:00Z')`)
    .run(type, code, name, parent).lastInsertRowid);
  const brand = insert('brand', '02', 'SAMKYO'); const size = insert('product_size', '0209', '洗碗机');
  const appearance = insert('appearance', '01', '标准'); const main = insert('main_category', '04', '印刷件类');
  insert('project_item', '01', '说明书', main);
  productId = Number(db.prepare(`insert into products (brand_id, product_size_id, default_appearance_id, sku, model,
    product_category, status, created_at) values (?, ?, ?, 'SKU', 'T40', '洗碗机', 'active', '2026-09-10T00:00:00Z')`)
    .run(brand, size, appearance).lastInsertRowid);
  batchId = Number(db.prepare(`insert into material_batches (relative_path, product_directory, product_id, name,
    sequence_number, recognition_status, is_present, first_seen_at, last_seen_at)
    values ('洗碗机\\SKU-T40\\03\\00.首批大货', '洗碗机\\SKU-T40', ?, '00.首批大货', 0, 'recognized', 1,
      '2026-09-10T00:00:00Z', '2026-09-10T00:00:00Z')`).run(productId).lastInsertRowid);
  const drawing = Number(db.prepare(`insert into drawing_numbers (full_code, display_name, product_id, appearance_id,
    color_id, main_category_id, project_item_id, brand_code, product_size_code, appearance_code, color_code,
    main_category_code, project_item_code, sequence, status, created_at)
    values ('02.0209.010.0401001', '说明书', ?, ?, ?, ?, ?, '02', '0209', '01', '0', '04', '01', 1,
      'active', '2026-09-10T00:00:00Z')`).run(productId, appearance, insert('color', '0', '白色'), main,
      (db.prepare("select id from dictionary_items where type='project_item'").get() as { id: number }).id).lastInsertRowid);
  const rel = '洗碗机\\SKU-T40\\03\\00.首批大货\\manual（转曲）.pdf';
  mkdirSync(join(workspace, '洗碗机', 'SKU-T40', '03', '00.首批大货'), { recursive: true }); writeFileSync(join(workspace, rel), 'pdf');
  pdfId = Number(db.prepare(`insert into pdf_files (relative_path, path_key, material_batch_id, file_name, drawing_id,
    match_status, detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present, content_sha256)
    values (?, lower(?), ?, 'manual（转曲）.pdf', ?, 'matched', '[]', 'outlined', 3, '2026-09-10T00:00:00Z',
      '2026-09-10T00:00:00Z', 1, 'hash')`).run(rel, rel, batchId, drawing).lastInsertRowid);
  app = Fastify(); registerOutboundPackageRoutes(app, new OutboundPackageService(db, { workspaceRoot: () => workspace,
    outputRoot: () => output, now: () => new Date(2026, 8, 10) }));
});

afterEach(async () => { await app.close(); db.close(); rmSync(root, { recursive: true, force: true }); });

describe('outbound package API', () => {
  it('reads all persisted package parts after file indexes are cleared', async () => {
    const payload = { productId, selectedMaterialBatchId: batchId, materialType: 'initial', packageMode: 'current_complete' };
    const preview = await app.inject({ method: 'POST', url: '/api/outbound-packages/preview', payload });
    const created = await app.inject({ method: 'POST', url: '/api/outbound-packages', payload: {
      ...payload, previewToken: preview.json().previewToken, selectedPdfFileIds: [pdfId],
    } });
    expect(created.statusCode).toBe(201);
    db.prepare('insert into outbound_package_parts(package_id, part_number, zip_relative_path, size_bytes) values (?, 2, ?, 123)')
      .run(created.json().id, 'second.zip');
    db.exec('delete from pdf_files');
    const history = await app.inject({ method: 'GET', url: `/api/outbound-packages?productId=${productId}` });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toHaveLength(1);
    expect(history.json()[0]).toMatchObject({ id: created.json().id, fileCount: 1,
      parts: [{ partNumber: 1, zipRelativePath: created.json().zipRelativePath },
        { partNumber: 2, zipRelativePath: 'second.zip', sizeBytes: 123 }] });
    expect((await app.inject({ method: 'GET', url: '/api/outbound-packages?productId=-1' })).statusCode).toBe(400);
  });
  it('registers ZIP generation as a progress-reporting task', async () => {
    await app.close();
    const tasks = new TaskRegistry(); const workspace = join(root, 'workspace'); const output = join(root, 'exports');
    const service = new OutboundPackageService(db, { workspaceRoot: () => workspace,
      outputRoot: () => output, now: () => new Date(2026, 8, 10) });
    app = Fastify(); registerOutboundPackageRoutes(app, service, tasks); registerTaskRoutes(app, tasks);
    const payload = { productId, selectedMaterialBatchId: batchId, materialType: 'initial' as const,
      packageMode: 'current_complete' as const };
    const preview = service.previewPackage(payload);
    const started = await app.inject({ method: 'POST', url: '/api/tasks/outbound_package', payload: {
      ...payload, previewToken: preview.previewToken, selectedPdfFileIds: [pdfId],
    } });
    expect(started.statusCode).toBe(202); await tasks.wait(started.json().id);
    expect(tasks.get(started.json().id)).toMatchObject({ status: 'completed',
      progress: { processed: 1, total: 1, phase: 'completed' }, result: { fileCount: 1 } });
  });
  it('previews then creates a verified package', async () => {
    const payload = { productId, selectedMaterialBatchId: batchId, materialType: 'initial', packageMode: 'current_complete' };
    const preview = await app.inject({ method: 'POST', url: '/api/outbound-packages/preview', payload });
    expect(preview.statusCode).toBe(200);
    const body = preview.json();
    const created = await app.inject({ method: 'POST', url: '/api/outbound-packages', payload: {
      ...payload, previewToken: body.previewToken, selectedPdfFileIds: [pdfId],
    } });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toEqual(expect.objectContaining({ fileCount: 1, packageName: body.packageName }));
  });

  it('returns stable JSON errors for malformed and stale requests', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/outbound-packages/preview', payload: {} })).json())
      .toEqual({ error: { code: 'INVALID_REQUEST', message: '外发打包条件不完整' } });
    const stale = await app.inject({ method: 'POST', url: '/api/outbound-packages', payload: {
      productId, selectedMaterialBatchId: batchId, materialType: 'initial', packageMode: 'current_complete',
      previewToken: 'unknown-token', selectedPdfFileIds: [pdfId],
    } });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ error: { code: 'PREVIEW_STALE', message: '打包预览已经过期，请重新预览' } });
  });

  it('returns a stable JSON configuration error instead of an internal server response', async () => {
    const unconfigured = Fastify();
    registerOutboundPackageRoutes(unconfigured, new OutboundPackageService(db, {
      workspaceRoot: () => null, outputRoot: () => null,
    }));
    const response = await unconfigured.inject({ method: 'POST', url: '/api/outbound-packages/preview', payload: {
      productId, selectedMaterialBatchId: batchId, materialType: 'initial', packageMode: 'current_complete',
    } });
    await unconfigured.close();
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'WORKSPACE_NOT_CONFIGURED', message: '请先设置资料根目录' } });
  });
});
