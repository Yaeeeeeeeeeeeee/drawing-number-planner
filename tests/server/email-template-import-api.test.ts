import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import writeXlsxFile from 'write-excel-file/node';
import { expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerEmailTemplateImportRoutes } from '../../src/server/routes/email-template-import';

function upload(buffer: Buffer, filename = '邮件.xlsx') {
  const boundary = 'email-import-boundary';
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    buffer, Buffer.from(`\r\n--${boundary}--\r\n`),
  ]) };
}
it('serves read-only preview, requires review confirmations and transactionally imports into the actual mail tables with backup', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-api-')); const db = openDatabase(join(dir, 'planner.db'));
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); const app = Fastify();
  try {
    await registerEmailTemplateImportRoutes(app, db);
    const buffer = await writeXlsxFile([{ sheet: '首批包材资料', data: [
      ['厂家', '实际甲厂'], ['场景', '完整交付'], ['主题', '资料'], ['正文', '请查收。'],
    ].map(row => row.map(value => ({ value, type: String }))) }]).toBuffer();
    const response = await app.inject({ method: 'POST', url: '/api/import/email-templates/preview', ...upload(buffer) });
    expect(response.statusCode).toBe(200); const preview = response.json();
    expect(db.prepare('select count(*) n from outbound_email_templates where manufacturer is not null').get()).toEqual({ n: 0 });
    const row = { ...preview.report.candidates[0], action: 'create', confirmed: true, contactsConfirmed: true, historyReviewed: false };
    const rejected = await app.inject({ method: 'POST', url: '/api/import/email-templates/confirm', payload: { previewId: preview.previewId, rows: [row] } });
    expect(rejected.statusCode).toBe(409);
    const confirmed = await app.inject({ method: 'POST', url: '/api/import/email-templates/confirm', payload: { previewId: preview.previewId, rows: [{ ...row, historyReviewed: true, rawReference: 'forged case', source: 'forged cell', sheet: 'forged sheet', importSources: [] }] } });
    expect(confirmed.statusCode).toBe(200); expect(confirmed.json()).toMatchObject({ created: 1 });
    const sources = JSON.parse((db.prepare('select import_sources_json from outbound_email_templates where manufacturer=?').get('实际甲厂') as { import_sources_json: string }).import_sources_json);
    expect(sources).toEqual([expect.objectContaining({ sheet: '首批包材资料', source: preview.report.candidates[0].source, rawReference: preview.report.candidates[0].rawReference })]);
    expect(readdirSync(join(dir, 'backups'))).toHaveLength(1);
    const replay = await app.inject({ method: 'POST', url: '/api/import/email-templates/confirm', payload: { previewId: preview.previewId, rows: [row] } });
    expect(replay.statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: '/api/import/email-templates/preview', ...upload(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), '旧.xls') })).statusCode).toBe(415);
  } finally { await app.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

import { matrixWorkbook } from '../fixtures/email-template-matrix';
it('carries reviewed shared-contact reuse and independent signature choices without stripping fingerprint fields',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'mail-matrix-api-'));const db=openDatabase(join(dir,'planner.db'));migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});const app=Fastify();
  try {
    await registerEmailTemplateImportRoutes(app,db);
    const preview=(await app.inject({method:'POST',url:'/api/import/email-templates/preview',...upload(await matrixWorkbook())})).json();
    const source=preview.report.signatures[0];
    const response=await app.inject({method:'POST',url:'/api/import/email-templates/confirm',payload:{previewId:preview.previewId,rows:preview.report.candidates.map((row:any)=>({...row,action:'create',confirmed:true,contactsConfirmed:true,historyReviewed:true})),signatures:[{id:source.id,action:'create',confirmed:true,name:'Source signature',content:source.content}]}});
    expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({created:25,contactsCreated:14,signaturesCreated:1});
    expect(db.prepare('select count(*) n from outbound_template_contact_links').get()).toEqual({n:135});
    const next=(await app.inject({method:'POST',url:'/api/import/email-templates/preview',...upload(await matrixWorkbook())})).json();
    const row={...next.report.candidates[0],action:'update',contacts:[],confirmed:true,contactsConfirmed:true,historyReviewed:true};
    const match=next.report.signatures[0].matches.find((item:any)=>item.name==='Source signature');
    const reused=await app.inject({method:'POST',url:'/api/import/email-templates/confirm',payload:{previewId:next.previewId,rows:[row],signatures:[{id:source.id,action:'reuse',confirmed:true,existingId:match.id,expectedFingerprint:match.expectedFingerprint}]}});
    expect(reused.statusCode).toBe(200);expect(reused.json()).toMatchObject({updated:1,signaturesReused:1});
  } finally {await app.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
