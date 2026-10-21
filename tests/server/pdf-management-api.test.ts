// @vitest-environment node
import Fastify from 'fastify';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { registerFileRoutes } from '../../src/server/routes/files';
it('requires exact preview fingerprint and phrase; ignored history stays queryable until explicitly restored',async()=>{
 const db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
 const dir=mkdtempSync(join(tmpdir(),'pdf-api-'));const app=Fastify();
 try {
  const service=new FileService(new FileRepository(db),new WorkspaceSettingsStore(join(dir,'settings.json')));service.updateSettings({workspaceRoot:dir});writeFileSync(join(dir,'plain.pdf'),'%PDF');await service.scan();registerFileRoutes(app,service);
  const id=service.search().items[0].id;const previewResponse=await app.inject({method:'POST',url:'/api/files/management/preview',payload:{ids:[id],action:'ignore'}});expect(previewResponse.statusCode).toBe(200);const p=previewResponse.json();
  const input={ids:p.ids,action:p.action,fingerprint:p.fingerprint,confirmation:p.confirmation};
  expect((await app.inject({method:'POST',url:'/api/files/management/apply',payload:{...input,confirmation:'wrong'}})).statusCode).toBe(422);
  expect((await app.inject({method:'POST',url:'/api/files/management/apply',payload:input})).json()).toMatchObject({changed:1});
  expect((await app.inject({url:'/api/files'})).json().total).toBe(0);expect((await app.inject({url:'/api/files?managementState=ignored'})).json().items[0].id).toBe(id);
  expect((await app.inject({method:'POST',url:'/api/files/management/apply',payload:input})).json().error.code).toBe('PDF_PREVIEW_STALE');
  const restore=service.previewManagement({ids:[id],action:'restore'});service.applyManagement(restore);expect(service.search().total).toBe(1);
 } finally {await app.close();db.close();rmSync(dir,{recursive:true,force:true});}
});
