// @vitest-environment node
import Fastify from 'fastify';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
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
  const service=new FileService(new FileRepository(db),new WorkspaceSettingsStore(join(dir,'settings.json')));service.updateSettings({workspaceRoot:dir});writeFileSync(fixturePdfPath(dir,'plain.pdf'),'%PDF');await service.scan();registerFileRoutes(app,service);
  const id=service.search().items[0].id;const previewResponse=await app.inject({method:'POST',url:'/api/files/management/preview',payload:{ids:[id],action:'ignore'}});expect(previewResponse.statusCode).toBe(200);const p=previewResponse.json();
  const input={ids:p.ids,action:p.action,fingerprint:p.fingerprint,confirmation:p.confirmation};
  expect((await app.inject({method:'POST',url:'/api/files/management/apply',payload:{...input,confirmation:'wrong'}})).statusCode).toBe(422);
  expect((await app.inject({method:'POST',url:'/api/files/management/apply',payload:input})).json()).toMatchObject({changed:1});
  expect((await app.inject({url:'/api/files'})).json().total).toBe(0);expect((await app.inject({url:'/api/files?managementState=ignored'})).json().items[0].id).toBe(id);
  expect((await app.inject({method:'POST',url:'/api/files/management/apply',payload:input})).json().error.code).toBe('PDF_PREVIEW_STALE');
  const restore=service.previewManagement({ids:[id],action:'restore'});service.applyManagement(restore);expect(service.search().total).toBe(1);
 } finally {await app.close();db.close();rmSync(dir,{recursive:true,force:true});}
});

function fixturePdfPath(root:string,...segments:string[]):string {
 const parts=segments.flatMap(part=>part.split(/[\\/]+/));
 const scoped=parts.length>=3 && ['02.未转曲源文件','03.量产后的变更文件'].includes(parts[2]);
 const target=join(root,...(scoped?parts:['未分类','UNKNOWN-M','02.未转曲源文件',...parts]));
 mkdirSync(dirname(target),{recursive:true});return target;
}
