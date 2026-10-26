// @vitest-environment node
import {describe,it,expect} from 'vitest';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import Fastify from 'fastify';
import {PdfClassificationRepository} from '../../src/core/files/pdf-classification';
import {FileRepository} from '../../src/core/files/file-repository';
import {FileService} from '../../src/core/files/file-service';
import {WorkspaceSettingsStore} from '../../src/core/files/workspace-settings';
import {registerFileRoutes} from '../../src/server/routes/files';
import {openDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {PlanningService} from '../../src/core/planning/planning-service';
import {getDrawingProductEvidence,effectiveDrawingProductSql} from '../../src/core/drawings/drawing-product-evidence';
import {createPdfManagementApi} from '../../src/renderer/data/pdf-management-client';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import type {FileScanRecord} from '../../src/core/files/file-types';
function fixture(){
 const dir=mkdtempSync(join(tmpdir(),'pdf-classify-'));const path=join(dir,'test.db');const db=openDatabase(path);migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
 const dictionary=new DictionaryService(db);const brand=dictionary.create({type:'brand',code:'02',name:'brand'});const size=dictionary.create({type:'product_size',code:'0305',name:'size'});
 const products=new ProductService(db);const input={brandId:brand.id,productSizeId:size.id,model:'same',sku:'SAME',productCategory:'test'};const a=products.create(input),b=products.create(input);
 const batch=(name:string,product:number)=>Number(db.prepare(`insert into material_batches(relative_path,product_directory,product_id,name,recognition_status,first_seen_at,last_seen_at) values(?,?,?,?,'pending','now','now')`).run(name,'test',product,'same name').lastInsertRowid);
 const batchA=batch('a',a.id),batchB=batch('b',a.id);
 const files:FileScanRecord[]=Array.from({length:12},(_,i)=>({relativePath:`test/SAME-same/03.量产后的变更文件/待归纳/file${i}.pdf`,fileName:`file${i}.pdf`,drawingId:null,matchStatus:'unmatched',detectedCodes:[],conversionType:'source',sizeBytes:5,modifiedAt:'now',contentSha256:'a'.repeat(64)}));
 const repository=new FileRepository(db);repository.replaceScan(files,[],'now');const ids=repository.search().items.map(f=>f.id);
 return {db,dir,path,a,b,batchA,batchB,files,repository,ids,classification:new PdfClassificationRepository(db)};
}
describe('PDF classification',()=>{
 it('projects a previously confirmed raw identity through an explicit legacy merge without rewriting its audit',()=>{
  const f=fixture();try{
   const input={ids:f.ids,productId:f.b.id,materialBatchId:f.batchB};const preview=f.classification.preview(input);
   f.classification.apply({...input,fingerprint:preview.fingerprint,confirmed:true,reason:'explicit instance confirmation'});
   const audit=f.db.prepare('select * from pdf_product_assignment_audit').all();
   f.db.prepare('update product_identity_members set canonical_product_id=? where raw_product_id=?').run(f.a.id,f.b.id);
   expect(f.repository.search({productId:f.a.id}).total).toBe(12);
   expect(f.repository.search().items.every(file=>file.productId===f.a.id)).toBe(true);
   expect(f.db.prepare('select * from pdf_product_assignment_audit').all()).toEqual(audit);
   expect(()=>f.classification.preview(input)).toThrow('归并');
  }finally{f.db.close();}
 });
 it('classifies twelve actual instances, retains paths and history, survives restart and rescan',()=>{
  const f=fixture();const input={ids:f.ids,productId:f.b.id,materialBatchId:f.batchB};
  const bytes=join(f.dir,'original.pdf');writeFileSync(bytes,'%PDF-original');
  const before=f.db.prepare('select id,relative_path,path_key from pdf_files order by id').all();
  const protectedBefore=['drawing_numbers','bom_items','outbound_package_items','drawing_occupations'].filter(t=>f.db.prepare("select 1 from sqlite_master where name=?").get(t)).map(t=>[t,f.db.prepare(`select * from ${t}`).all()] as const);
  try {
   expect(f.repository.search({unassociatedProduct:true}).total).toBe(12);
   const preview=f.classification.preview(input);expect(preview.entries).toHaveLength(12);expect(preview.entries.every(e=>e.previousProductId===null)).toBe(true);
   const result=f.classification.apply({...input,fingerprint:preview.fingerprint,confirmed:true,reason:'verified twelve files'});expect(result.updated).toBe(12);expect(result.backupPath).toBeTruthy();
   expect(f.repository.search({productId:f.b.id,materialBatchId:f.batchB}).total).toBe(12);expect(f.repository.navigation().products).toContainEqual({productId:f.b.id,count:12});
   expect(f.db.prepare('select product_id from material_batches where id=?').get(f.batchB)).toEqual({product_id:f.a.id});
   expect(f.db.prepare('select count(*) n from pdf_product_assignment_audit').get()).toEqual({n:12});
   expect(f.db.prepare('select id,relative_path,path_key from pdf_files order by id').all()).toEqual(before);
   for(const [t,rows] of protectedBefore)expect(f.db.prepare(`select * from ${t}`).all()).toEqual(rows);
   expect(readFileSync(bytes,'utf8')).toBe('%PDF-original');
  }finally{f.db.close();}
  const restarted=openDatabase(f.path);try {const repo=new FileRepository(restarted);repo.replaceScan(f.files,[],'later');expect(repo.search({productId:f.b.id,materialBatchId:f.batchB}).total).toBe(12);expect(repo.search({productId:f.a.id}).total).toBe(0);}finally{restarted.close();}
 });
 it('rejects invalid, duplicate or stale selections without writing; supports one file',()=>{
  const f=fixture();try{
   for(const ids of [[],[f.ids[0],f.ids[0]],[99999]])expect(()=>f.classification.preview({ids,productId:f.a.id,materialBatchId:f.batchA})).toThrow();
   expect(()=>f.classification.preview({ids:f.ids,productId:99999,materialBatchId:f.batchA})).toThrow();
   const input={ids:[f.ids[0]],productId:f.b.id,materialBatchId:f.batchB};const preview=f.classification.preview(input);
   f.db.prepare('update pdf_files set file_name=? where id=?').run('changed.pdf',f.ids[0]);
   expect(()=>f.classification.apply({...input,fingerprint:preview.fingerprint,confirmed:true,reason:'verified'})).toThrow(/重新预览/);
   expect(f.db.prepare('select count(*) n from pdf_product_assignments').get()).toEqual({n:0});
   const fresh=f.classification.preview(input);expect(f.classification.apply({...input,fingerprint:fresh.fingerprint,confirmed:true,reason:'verified'}).updated).toBe(1);
  }finally{f.db.close();}
 });
 it('warns about authoritative drawing ownership and preserves bindings and reservations',()=>{
  const f=fixture();try{
   const dictionary=new DictionaryService(f.db);const appearance=dictionary.create({type:'appearance',code:'01',name:'appearance'});const color=dictionary.create({type:'color',code:'0',name:'white'});const main=dictionary.create({type:'main_category',code:'02',name:'main'});const project=dictionary.create({type:'project_item',code:'01',name:'logo',parentId:main.id});
   f.db.prepare('update products set default_appearance_id=? where id=?').run(appearance.id,f.a.id);
   const planning=new PlanningService(f.db);const input={productId:f.a.id,rows:[{clientId:'x',colorId:color.id,mainCategoryId:main.id,projectItemId:project.id}]};const planned=planning.preview(input);const drawing=planning.reserve({...input,rows:[{...input.rows[0],expectedFullCode:planned.rows[0].fullCode}]})[0];
   f.db.prepare("update pdf_files set drawing_id=?,match_status='matched' where id in (?,?)").run(drawing.id,f.ids[0],f.ids[1]);
   const bom=Number(f.db.prepare("insert into bom_versions(product_id,version_number,created_at) values(?,1,'frozen')").run(f.a.id).lastInsertRowid);
   f.db.prepare('insert into bom_items(bom_version_id,project_item_id,drawing_id,effective_material_batch_id,notes) values(?,?,?,?,?)').run(bom,project.id,drawing.id,f.batchA,'frozen BOM');
   const outbound=Number(f.db.prepare("insert into outbound_packages(product_id,material_type,package_mode,selected_material_batch_id,package_name,zip_relative_path,status,created_at) values(?,'initial','current_complete',?,'frozen','frozen.zip','completed','frozen')").run(f.a.id,f.batchA).lastInsertRowid);
   f.db.prepare(`insert into outbound_package_items(package_id,project_item_id,drawing_id,pdf_file_id,source_material_batch_id,project_item_name_snapshot,drawing_code_snapshot,file_name_snapshot,relative_path_snapshot,source_batch_name_snapshot) values(?,?,?,?,?,'frozen',?,'frozen.pdf','frozen.pdf','frozen')`).run(outbound,project.id,drawing.id,f.ids[0],f.batchA,drawing.fullCode);
   const frozen=['bom_versions','bom_items','outbound_packages','outbound_package_items'].map(table=>({table,rows:f.db.prepare(`select * from ${table}`).all()}));
   const before=f.db.prepare('select * from drawing_numbers').all();const bindings=f.db.prepare('select * from drawing_appearance_bindings').all();
   const target={ids:[f.ids[0]],productId:f.b.id,materialBatchId:f.batchB};const preview=f.classification.preview(target);expect(preview.conflicts).toHaveLength(1);expect(preview.entries[0].conflict).toContain('不覆盖');
   expect(f.classification.apply({...target,fingerprint:preview.fingerprint,confirmed:true,reason:'explicit correction'}).conflicts).toHaveLength(1);
   expect(f.db.prepare('select * from drawing_numbers').all()).toEqual(before);expect(f.db.prepare('select * from drawing_appearance_bindings').all()).toEqual(bindings);
   for(const snapshot of frozen)expect(f.db.prepare(`select * from ${snapshot.table}`).all()).toEqual(snapshot.rows);
   expect(getDrawingProductEvidence(f.db,'planned',drawing.id)).toContainEqual({productId:f.b.id,appearanceVersionId:null,source:'confirmed-pdf'});
   const second={ids:[f.ids[1]],productId:f.b.id,materialBatchId:f.batchA};const secondPreview=f.classification.preview(second);f.classification.apply({...second,fingerprint:secondPreview.fingerprint,confirmed:true,reason:'same drawing different physical batch'});
   expect(f.repository.search({productId:f.b.id,materialBatchId:f.batchA}).total).toBe(1);expect(f.repository.search({productId:f.b.id,materialBatchId:f.batchB}).total).toBe(1);
   const files=f.repository.search().items;expect(files.find(file=>file.id===f.ids[0])?.productId).toBe(f.b.id);expect(files.find(file=>file.id===f.ids[1])?.productId).toBe(f.b.id);
  }finally{f.db.close();}
 });
 it('prioritizes explicit historical PDF ownership over its target batch inference, retaining other-file evidence',()=>{
  const f=fixture();try{
   f.db.prepare(`insert into historical_drawing_numbers(id,full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,first_seen_at,last_seen_at) values(1,'02.0305.010.0201001','02','0305','01','0','02','01',1,'now','now')`).run();
   const version=Number(f.db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,1,'legacy','current','now')").run(f.a.id).lastInsertRowid);
   f.db.prepare("insert into outbound_batch_scopes(batch_id,appearance_version_id,updated_at,reason) values(?,?,'now','confirmed')").run(f.batchB,version);
   f.db.prepare("update pdf_files set historical_drawing_id=1,match_status='matched' where id=?").run(f.ids[0]);
   const input={ids:[f.ids[0]],productId:f.b.id,materialBatchId:f.batchB};const preview=f.classification.preview(input);expect(preview.conflicts).toEqual([]);
   expect(f.classification.apply({...input,fingerprint:preview.fingerprint,confirmed:true,reason:'manual correction'}).conflicts).toEqual([]);
   expect(getDrawingProductEvidence(f.db,'historical',1)).toEqual([{productId:f.b.id,appearanceVersionId:null,source:'confirmed-pdf'}]);
   expect(f.db.prepare(`select ${effectiveDrawingProductSql("'historical'",'1')} productId`).get()).toEqual({productId:f.b.id});
   // A separate, unassigned physical PDF remains independent evidence, even for the same diagram.
   f.db.prepare("update pdf_files set historical_drawing_id=1,match_status='matched',material_batch_id=? where id=?").run(f.batchB,f.ids[1]);
   const conflicting=f.classification.preview(input);expect(conflicting.conflicts).toHaveLength(1);
   const versionB=Number(f.db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,1,'other','current','now')").run(f.b.id).lastInsertRowid);
   f.db.prepare("update outbound_batch_scopes set appearance_version_id=?,updated_at='changed' where batch_id=?").run(versionB,f.batchB);
   expect(()=>f.classification.apply({...input,fingerprint:conflicting.fingerprint,confirmed:true,reason:'stale scope'})).toThrow(/重新预览/);
   expect(f.db.prepare('select count(*) n from pdf_product_assignment_audit').get()).toEqual({n:1});
  }finally{f.db.close();}
 });
 it('uses real HTTP JSON preview/apply transport',async()=>{
  const f=fixture();const app=Fastify();registerFileRoutes(app,new FileService(f.repository,new WorkspaceSettingsStore(join(f.dir,'settings.json'))));
  try {const url=await app.listen({host:'127.0.0.1',port:0});const input={ids:f.ids,productId:f.b.id,materialBatchId:f.batchB};const post=(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   const api=createPdfManagementApi(async <T>(path:string,init?:RequestInit):Promise<T>=>{const response=await fetch(url+path,init);if(!response.ok)throw new Error(await response.text());return response.json() as Promise<T>;});
   const preview=await api.previewPdfClassification(input);expect(preview.entries).toHaveLength(12);
   const result=await post('/api/files/classification/apply',{...input,fingerprint:preview.fingerprint,confirmed:true,reason:'HTTP verified'});expect(result.status).toBe(200);expect((await result.json()).updated).toBe(12);
  }finally{await app.close();f.db.close();}
 });
});
