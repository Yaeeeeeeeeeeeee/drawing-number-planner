// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MaterialBatchService } from '../../src/core/files/material-batch-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerMaterialBatchRoutes } from '../../src/server/routes/material-batches';

let db: PlannerDatabase;
const now = '2026-08-28T00:00:00.000Z';

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
});
afterEach(() => db.close());

function batch(name: string, sequence: number | null, status: 'recognized' | 'pending' = 'recognized'): number {
  return Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, detected_sku, detected_model, name, sequence_number,
     recognition_status, is_present, first_seen_at, last_seen_at)
    values (?, '01.洗碗机\\SKDWT040JP-T40', 'SKDWT040JP', 'T40', ?, ?, ?, 1, ?, ?)`)
    .run(`01.洗碗机\\SKDWT040JP-T40\\03.量产\\${name}`, name, sequence, status, now, now).lastInsertRowid);
}

describe('material batch API', () => {
  it('orders the current batch first, then history, and labels pending batches', async () => {
    batch('00.首批大货', 0);
    batch('05.20251216', 5);
    const current = batch('06.20260309', 6);
    batch('预案', null, 'pending');
    const app = Fastify();
    registerMaterialBatchRoutes(app, new MaterialBatchService(db));

    const response = await app.inject({ method: 'GET', url: '/api/material-batches?search=T40' });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().items).toEqual([
      expect.objectContaining({ id: current, name: '06.20260309', currentState: 'current' }),
      expect.objectContaining({ name: '05.20251216', currentState: 'historical' }),
      expect.objectContaining({ name: '00.首批大货', currentState: 'historical' }),
      expect.objectContaining({ name: '预案', recognitionStatus: 'pending', currentState: 'indeterminate' }),
    ]);
    await app.close();
  });

  it('returns every file instance in a batch without deduplicating by full code', async () => {
    const batchId = batch('06.20260309', 6);
    const historicalId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.010.0501001', '02', '0209', '01', '0', '05', '01', 1, ?, ?)`)
      .run(now, now).lastInsertRowid);
    const insert = db.prepare(`insert into pdf_files
      (relative_path, path_key, material_batch_id, file_name, historical_drawing_id, match_status,
       detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values (?, ?, ?, ?, ?, 'matched', '[]', ?, 1, ?, ?, 1)`);
    insert.run('batch\\source.pdf', 'batch\\source.pdf', batchId, 'same.pdf', historicalId, 'source', now, now);
    insert.run('batch\\outlined.pdf', 'batch\\outlined.pdf', batchId, 'same.pdf', historicalId, 'outlined', now, now);
    const app = Fastify();
    registerMaterialBatchRoutes(app, new MaterialBatchService(db));

    const response = await app.inject({ method: 'GET', url: `/api/material-batches/${batchId}/files` });

    expect(response.statusCode).toBe(200);
    expect(response.json().items).toEqual([
      expect.objectContaining({ relativePath: 'batch\\outlined.pdf', fullCode: '02.0209.010.0501001' }),
      expect.objectContaining({ relativePath: 'batch\\source.pdf', fullCode: '02.0209.010.0501001' }),
    ]);
    await app.close();
  });

  it('returns logical batch materials separately from the raw file-instance endpoint', async () => {
    const batchId = batch('06.20260309', 6);
    const historicalId = Number(db.prepare(`insert into historical_drawing_numbers
      (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
       project_item_code, sequence, first_seen_at, last_seen_at)
      values ('02.0209.010.0501001', '02', '0209', '01', '0', '05', '01', 1, ?, ?)`)
      .run(now, now).lastInsertRowid);
    db.prepare(`insert into pdf_files
      (relative_path, path_key, material_batch_id, file_name, historical_drawing_id, match_status,
       detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values (?, ?, ?, ?, ?, 'matched', '[]', 'outlined', 1, ?, ?, 1)`)
      .run('batch\\outlined.pdf', 'batch\\outlined.pdf', batchId, 'outlined.pdf', historicalId, now, now);
    const app = Fastify();
    registerMaterialBatchRoutes(app, new MaterialBatchService(db));

    const response = await app.inject({ method: 'GET', url: `/api/material-batches/${batchId}/materials` });

    expect(response.statusCode).toBe(200);
    expect(response.json().items).toEqual([expect.objectContaining({
      fullCode: '02.0209.010.0501001',
      outlinedFiles: [expect.objectContaining({ fileName: 'outlined.pdf' })],
      sourceFiles: [],
    })]);
    await app.close();
  });

  it('rejects invalid filters and missing batches', async () => {
    const app = Fastify();
    registerMaterialBatchRoutes(app, new MaterialBatchService(db));
    expect((await app.inject({ method: 'GET', url: '/api/material-batches?productId=bad' })).statusCode).toBe(400);
    expect((await app.inject({ method: 'GET', url: '/api/material-batches/999/files' })).statusCode).toBe(404);
    await app.close();
  });
});

it('deletes a freshly observed empty batch with stale disposable indices through the API',async()=>{
 const {mkdtempSync,mkdirSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'v5-batch-api-'));const id=batch('20260211',null);
 const row=db.prepare('select relative_path as path from material_batches where id=?').get(id) as {path:string};
 mkdirSync(join(root,...row.path.split('\\')),{recursive:true});
 db.prepare(`insert into pdf_files(relative_path,path_key,material_batch_id,file_name,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present)
 values ('stale.pdf','stale.pdf',?,'stale.pdf','unmatched','[]','outlined',1,'now','now',0)`).run(id);
 const app=Fastify();registerMaterialBatchRoutes(app,new MaterialBatchService(db,()=>root));
 try{
  const preview=await app.inject({method:'GET',url:`/api/material-batches/${id}/deletion-preview`});expect(preview.json().allowed).toBe(true);
  const response=await app.inject({method:'DELETE',url:`/api/material-batches/${id}`,payload:{fingerprint:preview.json().fingerprint,confirmation:'删除批次'}});
  expect(response.statusCode,response.body).toBe(200);expect(response.json()).toEqual({deleted:id});
  expect(db.prepare('select count(*) as count from pdf_files').get()).toEqual({count:0});
  expect((await app.inject('/api/material-batches')).json().items).toEqual([]);
 }finally{await app.close();rmSync(root,{recursive:true,force:true});}
});
