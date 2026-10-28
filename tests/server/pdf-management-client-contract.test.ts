// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { FileService } from '../../src/core/files/file-service';
import { FileRepository } from '../../src/core/files/file-repository';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { MaterialBatchService } from '../../src/core/files/material-batch-service';
import { registerFileRoutes } from '../../src/server/routes/files';
import { registerMaterialBatchRoutes } from '../../src/server/routes/material-batches';
import { apiClient, resetApiSession } from '../../src/renderer/data/client';

afterEach(()=>{vi.unstubAllGlobals();resetApiSession();});

it('executes all three PDF actions for 23 selected records through the real client and HTTP parser without touching PDFs',async()=>{
 const db=openDatabase(':memory:');const app=Fastify();const root=mkdtempSync(join(tmpdir(),'pdf-client-http-'));const nativeFetch=globalThis.fetch;
 try{
  migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
  const service=new FileService(new FileRepository(db),new WorkspaceSettingsStore(join(root,'settings.json')));service.updateSettings({workspaceRoot:root});
  const names=Array.from({length:23},(_,i)=>`plain-${i+1}.pdf`);for(const name of names)writeFileSync(fixturePdfPath(root,name),'%PDF-1.4\n'+name);
  await service.scan();const ids=service.search().items.map(item=>item.id);expect(ids).toHaveLength(23);
  app.post('/api/session',async()=>({token:'isolated-pdf-test'}));registerFileRoutes(app,service);
  const origin=await app.listen({host:'127.0.0.1',port:0});vi.stubGlobal('fetch',(path:string,init?:RequestInit)=>nativeFetch(new URL(path,origin),init));resetApiSession();
  for(const action of ['ignore','restore','clear'] as const){
   const preview=await apiClient.previewPdfManagement!({ids,action});expect(preview.allowed).toBe(23);
   expect(await apiClient.applyPdfManagement!({ids:preview.ids,action,fingerprint:preview.fingerprint,confirmation:preview.confirmation})).toMatchObject({changed:23,blocked:[]});
   expect(service.search().total).toBe(action==='restore'?23:0);
   if(action==='ignore'){await service.scan();expect(service.search().total).toBe(0);expect(service.search({managementState:'ignored'}).total).toBe(23);}
  }
  for(const name of names)expect(readFileSync(fixturePdfPath(root,name),'utf8')).toBe('%PDF-1.4\n'+name);
  await service.scan();expect(service.search().total).toBe(23);
 }finally{vi.unstubAllGlobals();await app.close();db.close();rmSync(root,{recursive:true,force:true});}
});

it('sends batch display-name edits as JSON over real HTTP without changing batch identity or path',async()=>{
 const db=openDatabase(':memory:');const app=Fastify();const nativeFetch=globalThis.fetch;
 try{
  migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
  db.prepare("insert into material_batches(id,relative_path,product_directory,name,recognition_status,first_seen_at,last_seen_at) values(31,'old/batch','old','首批大货','recognized','2026-01-01','2026-01-01')").run();
  app.post('/api/session',async()=>({token:'isolated-batch-test'}));registerMaterialBatchRoutes(app,new MaterialBatchService(db));const origin=await app.listen({host:'127.0.0.1',port:0});vi.stubGlobal('fetch',(path:string,init?:RequestInit)=>nativeFetch(new URL(path,origin),init));resetApiSession();
  await expect(apiClient.renameMaterialBatch!(31,{displayName:'首批生产'})).resolves.toMatchObject({id:31,displayName:'首批生产',relativePath:'old/batch'});
  expect(db.prepare('select id,relative_path,name from material_batches where id=31').get()).toEqual({id:31,relative_path:'old/batch',name:'首批大货'});
 }finally{vi.unstubAllGlobals();await app.close();db.close();}
});


it('preflights and confirms empty batch deletion over real HTTP, keeps physical PDFs and rediscovers the batch on rescan',async()=>{
 const db=openDatabase(':memory:');const app=Fastify();const root=mkdtempSync(join(tmpdir(),'batch-delete-http-'));const nativeFetch=globalThis.fetch;
 try{
  migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
  const directory=join(root,'01.洗碗机','SKU-T40','03.量产后的变更文件（已量产的产品看最新日期）','01.20260101');mkdirSync(directory,{recursive:true});const original=join(directory,'plain.pdf');writeFileSync(original,'%PDF-1.4 retained');
  const service=new FileService(new FileRepository(db),new WorkspaceSettingsStore(join(root,'settings.json')));service.updateSettings({workspaceRoot:root});await service.scan();
  const batches=new MaterialBatchService(db);const batch=batches.list()[0];expect(batch).toBeTruthy();
  app.post('/api/session',async()=>({token:'isolated-batch-delete-test'}));registerFileRoutes(app,service);registerMaterialBatchRoutes(app,batches);
  const origin=await app.listen({host:'127.0.0.1',port:0});vi.stubGlobal('fetch',(path:string,init?:RequestInit)=>nativeFetch(new URL(path,origin),init));resetApiSession();
  const blocked=await apiClient.previewMaterialBatchDeletion!(batch.id);expect(blocked.allowed).toBe(false);expect(blocked.reason).toContain('PDF 索引');
  await expect(apiClient.deleteMaterialBatch!(batch.id,{fingerprint:blocked.fingerprint,confirmation:'删除批次'})).rejects.toThrow('仍被引用');
  const ids=service.search().items.map(file=>file.id);const pdfPreview=await apiClient.previewPdfManagement!({ids,action:'clear'});
  await apiClient.applyPdfManagement!({ids:pdfPreview.ids,action:'clear',fingerprint:pdfPreview.fingerprint,confirmation:pdfPreview.confirmation});
  const preview=await apiClient.previewMaterialBatchDeletion!(batch.id);expect(preview.allowed).toBe(true);
  const history=db.prepare('select * from file_scan_runs').all();
  await expect(apiClient.deleteMaterialBatch!(batch.id,{fingerprint:preview.fingerprint,confirmation:'删除批次'})).resolves.toEqual({deleted:batch.id});
  expect(batches.list()).toEqual([]);expect(db.prepare('select * from file_scan_runs').all()).toEqual(history);expect(readFileSync(original,'utf8')).toBe('%PDF-1.4 retained');
  await service.scan();expect(batches.list()).toHaveLength(1);expect(service.search().total).toBe(1);expect(readFileSync(original,'utf8')).toBe('%PDF-1.4 retained');
 }finally{vi.unstubAllGlobals();await app.close();db.close();rmSync(root,{recursive:true,force:true});}
});

function fixturePdfPath(root:string,...segments:string[]):string {
 const parts=segments.flatMap(part=>part.split(/[\\/]+/));
 const scoped=parts.length>=3 && ['02.未转曲源文件','03.量产后的变更文件（已量产的产品看最新日期）'].includes(parts[2]);
 const target=join(root,...(scoped?parts:['未分类','UNKNOWN-M','02.未转曲源文件',...parts]));
 mkdirSync(dirname(target),{recursive:true});return target;
}
