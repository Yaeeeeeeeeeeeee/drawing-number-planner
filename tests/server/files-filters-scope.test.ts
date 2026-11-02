// @vitest-environment node
import Fastify from 'fastify';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { parseMaterialBatch } from '../../src/core/files/material-batch-parser';
import { registerFileRoutes } from '../../src/server/routes/files';
import { registerPackagingTaskRoutes } from '../../src/server/routes/packaging-tasks';
import type { FileScanRecord } from '../../src/core/files/file-types';

const production='03.量产后的变更文件（已量产的产品看最新日期）';
const productDirectory='类别/UNKNOWN-M';
const cleanup:Array<()=>Promise<unknown>|void>=[];
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn();});
function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'pdf-filter-scope-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}));
  const root=join(dir,'library');mkdirSync(root);const db=openDatabase(':memory:');cleanup.push(()=>{db.close();});
  migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
  const repository=new FileRepository(db);const settings=new WorkspaceSettingsStore(join(dir,'settings.json'));settings.setWorkspaceRoot(root);
  const service=new FileService(repository,settings);const app=Fastify();cleanup.push(()=>app.close());registerFileRoutes(app,service);
  return {root,db,repository,service,app};
}
function record(name:string,modifiedAt:string,batch?:string):FileScanRecord{
  const relativePath=`${productDirectory}/${batch?`${production}/${batch}`:'02.未转曲源文件'}/${name}.pdf`;
  return {relativePath,fileName:`${name}.pdf`,drawingId:null,matchStatus:'unmatched',detectedCodes:[],conversionType:batch?'outlined':'source',sizeBytes:1,modifiedAt,materialBatch:parseMaterialBatch(relativePath)};
}
describe('PDF list date filters and independent scanning',()=>{
  it('filters indexed modification instants inclusively with timezone offsets and shares the count predicate',async()=>{
    const {app,repository,db}=fixture();const batch='01.20261030';
    repository.replaceScan([record('before','2026-10-31T15:59:59.999Z'),record('start','2026-11-01T00:00:00+08:00',batch),record('end','2026-11-01T23:59:59.999+08:00',batch),record('after','2026-11-01T16:00:00.000Z',batch)],[],'2026-11-02T00:00:00.000Z');
    const snapshot=db.serialize();const params=new URLSearchParams({presence:'all',modifiedFrom:'2026-10-31T16:00:00.000Z',modifiedTo:'2026-11-01T15:59:59.999Z'});
    const response=await app.inject(`/api/files?${params}`);expect(response.statusCode).toBe(200);
    expect(response.json().items.map((item:{fileName:string})=>item.fileName)).toEqual(['end.pdf','start.pdf']);
    const batchId=response.json().items[0].materialBatchId;params.set('materialBatchId',String(batchId));
    const counts=await app.inject(`/api/files/navigation?${params}`);expect(counts.statusCode).toBe(200);expect(counts.json().total).toBe(2);
    expect(counts.json().batchProducts).toEqual([{materialBatchId:batchId,productId:null}]);
    params.set('modifiedFrom','2028-01-01T00:00:00.000Z');params.set('modifiedTo','2028-01-02T00:00:00.000Z');
    const empty=await app.inject(`/api/files/navigation?${params}`);expect(empty.json().total).toBe(0);expect(empty.json().batchProducts).toEqual(counts.json().batchProducts);
    expect(db.serialize().equals(snapshot)).toBe(true);
  });
  it('rejects malformed timestamps and backwards date ranges on both list and count routes',async()=>{
    const {app}=fixture();
    for(const endpoint of ['/api/files','/api/files/navigation'])for(const values of [{modifiedFrom:'2026-02-30T00:00:00Z'},{modifiedTo:'2026-11-01'},{modifiedFrom:'bad'},{modifiedFrom:'2026-11-03T00:00:00Z',modifiedTo:'2026-11-01T23:59:59Z'}]){
      expect((await app.inject(`${endpoint}?${new URLSearchParams(values as Record<string,string>)}`)).statusCode).toBe(400);
    }
  });
  it('intersects a detailed batch filter with a separately selected navigation batch',async()=>{
    const {app,repository}=fixture();repository.replaceScan([record('first','2026-11-01T00:00:00Z','01.20260101'),record('second','2026-11-01T00:00:00Z','02.20260202')],[],'2026-11-02T00:00:00Z');
    const items=repository.search({presence:'all'}).items;const first=items[0].materialBatchId!,second=items[1].materialBatchId!;
    expect((await app.inject(`/api/files?materialBatchId=${first}&navigationMaterialBatchId=${first}`)).json().total).toBe(1);
    expect((await app.inject(`/api/files?materialBatchId=${first}&navigationMaterialBatchId=${second}`)).json().total).toBe(0);
    expect((await app.inject(`/api/files/navigation?materialBatchId=${first}`)).json().total).toBe(1);
    expect((await app.inject(`/api/files/navigation?navigationMaterialBatchId=${second}`)).statusCode).toBe(400);
  });
  it('scans both formal trees and every production batch despite a narrower list batch, date and type',async()=>{
    const {app,root,repository,service,db}=fixture();
    const records=[record('source','old'),record('old-batch','old','01.20240101'),record('new-batch（转曲）','old','02.20261030')];
    for(const item of records){const path=join(root,...item.relativePath.split('/'));mkdirSync(dirname(path),{recursive:true});writeFileSync(path,`%PDF preserve ${item.fileName}`);}
    const temporary=join(root,...productDirectory.split('/'),'00.临时文件','temporary.pdf');mkdirSync(dirname(temporary),{recursive:true});writeFileSync(temporary,'%PDF temporary');
    await service.scanProducts([productDirectory]);
    registerPackagingTaskRoutes(app,{options:{files:service},workspace:{productDirectories:()=>[{relativePath:productDirectory}],resolveProductDirectory:()=>({relativePath:productDirectory})}} as never,{} as never);
    const latestBatch=repository.search({presence:'all'}).items.find(item=>item.fileName==='new-batch（转曲）.pdf')!.materialBatchId!;
    expect((await app.inject(`/api/files?materialBatchId=${latestBatch}&conversionType=outlined&modifiedFrom=2020-01-01T00%3A00%3A00Z`)).json().total).toBe(1);
    const removed=join(root,...records[1].relativePath.split('/'));unlinkSync(removed);
    const fresh=record('fresh','old','03.20261102');const newPath=join(root,...fresh.relativePath.split('/'));mkdirSync(dirname(newPath),{recursive:true});writeFileSync(newPath,'%PDF new');
    const response=await app.inject({method:'POST',url:'/api/packaging/scan-product',payload:{productId:7}});
    expect(response.statusCode).toBe(200);expect(response.json()).toMatchObject({total:3,comparison:{added:1,missing:1,unchanged:2,scope:{kind:'products',productDirectories:[productDirectory]}}});
    expect(repository.search({presence:'present'}).items.map(item=>item.fileName)).toEqual(['fresh.pdf','new-batch（转曲）.pdf','source.pdf']);
    expect(db.prepare("select is_present from pdf_files where file_name='old-batch.pdf'").get()).toEqual({is_present:0});
    expect(readFileSync(join(root,...records[0].relativePath.split('/')),'utf8')).toBe('%PDF preserve source.pdf');
    expect(readFileSync(temporary,'utf8')).toBe('%PDF temporary');
  });
});
