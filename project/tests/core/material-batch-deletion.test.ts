// @vitest-environment node
import {beforeEach,afterEach,expect,it} from 'vitest';
import {openDatabase,type PlannerDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {AppearanceService} from '../../src/core/products/appearance-service';
import {ProductService} from '../../src/core/products/product-service';
import {PlanningService} from '../../src/core/planning/planning-service';
import {MaterialBatchService} from '../../src/core/files/material-batch-service';
let db:PlannerDatabase,service:MaterialBatchService;
let batch:number,other:number,product:number,project:number,drawing:number,historical:number,pdf:number,bom:number,outbound:number;
const path='目录\\产品\\03.量产后的变更文件（已量产的产品看最新日期）\\01.20260101';
beforeEach(()=>{
 db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});service=new MaterialBatchService(db);
 const dict=new DictionaryService(db);const brand=dict.create({type:'brand',code:'02',name:'brand'}),size=dict.create({type:'product_size',code:'0305',name:'size'}),appearance=dict.create({type:'appearance',code:'01',name:'appearance'}),color=dict.create({type:'color',code:'0',name:'white'}),main=dict.create({type:'main_category',code:'02',name:'main'});
 project=dict.create({type:'project_item',code:'01',name:'logo',parentId:main.id}).id;
 product=new ProductService(db).create({brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,model:'M',sku:'S',productCategory:'test'}).id;
 const planning=new PlanningService(db);const input={productId:product,rows:[{clientId:'one',colorId:color.id,mainCategoryId:main.id,projectItemId:project}]};const preview=planning.preview(input);drawing=planning.reserve({...input,rows:[{...input.rows[0],expectedFullCode:preview.rows[0].fullCode}]})[0].id;
 historical=Number(db.prepare("insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,first_seen_at,last_seen_at) values('02.0305.010.0201002','02','0305','01','0','02','01',2,'now','now')").run().lastInsertRowid);
 const insert=db.prepare("insert into material_batches(relative_path,product_directory,product_id,name,recognition_status,first_seen_at,last_seen_at) values(?,'目录\\产品',?,'01.20260101','recognized','now','now')");batch=Number(insert.run(path,product).lastInsertRowid);other=Number(insert.run('other',product).lastInsertRowid);
 pdf=Number(db.prepare("insert into pdf_files(relative_path,path_key,file_name,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at) values('outside.pdf','outside.pdf','outside.pdf','unmatched','[]','source',1,'now','now')").run().lastInsertRowid);
 bom=Number(db.prepare("insert into bom_versions(product_id,version_number,created_at) values(?,1,'now')").run(product).lastInsertRowid);
 outbound=Number(db.prepare("insert into outbound_packages(product_id,material_type,package_mode,selected_material_batch_id,package_name,zip_relative_path,status,created_at) values(?,'initial','current_complete',?,'test','test.zip','completed','now')").run(product,other).lastInsertRowid);
});
afterEach(()=>db.close());
function blocked(source:string){
 const preview=service.previewDeletion(batch)!;expect(preview.allowed).toBe(false);expect(preview.references).toContainEqual(expect.objectContaining({source,count:1}));
 const before=db.prepare('select * from material_batches where id=?').get(batch);
 expect(()=>service.delete(batch,{fingerprint:preview.fingerprint,confirmation:'删除批次'})).toThrow(/仍被引用/);
 expect(db.prepare('select * from material_batches where id=?').get(batch)).toEqual(before);expect(db.pragma('foreign_key_check')).toEqual([]);
}
it('deletes an empty unreferenced internal batch after confirmation and preserves every other row',()=>{
 const before=['pdf_files','drawing_numbers','historical_drawing_numbers','bom_versions','outbound_packages'].map(table=>({table,rows:db.prepare(`select * from ${table}`).all()}));
 const preview=service.previewDeletion(batch)!;expect(preview).toMatchObject({allowed:true,reason:null,references:[]});
 expect(()=>service.delete(batch,{fingerprint:preview.fingerprint,confirmation:''})).toThrow('请确认');
 expect(service.delete(batch,{fingerprint:preview.fingerprint,confirmation:'删除批次'})).toEqual({deleted:batch});expect(service.previewDeletion(batch)).toBeNull();
 for(const {table,rows} of before)expect(db.prepare(`select * from ${table}`).all()).toEqual(rows);
 expect(service.list().map(value=>value.id)).toEqual([other]);expect(db.pragma('foreign_key_check')).toEqual([]);
});
it.each(['included','ignored','needs_review'])('blocks every PDF index including missing or %s records',state=>{
 db.prepare('update pdf_files set material_batch_id=?,is_present=0,management_state=? where id=?').run(batch,state,pdf);blocked('pdf_files.material_batch_id');
});
it.each(['drawing_id','historical_drawing_id'])('protects drawing occurrence references through PDF %s',column=>{
 db.prepare(`update pdf_files set material_batch_id=?,${column}=?,match_status='matched' where id=?`).run(batch,column==='drawing_id'?drawing:historical,pdf);blocked('pdf_files.material_batch_id');
});
it('protects independent current manual assignments without detaching them',()=>{
 db.prepare("insert into pdf_product_assignments(pdf_file_id,product_id,material_batch_id,updated_at) values(?,?,?,'now')").run(pdf,product,batch);blocked('pdf_product_assignments.material_batch_id');
});
it('protects earlier manual assignments recorded only in audit JSON',()=>{
 db.prepare("insert into pdf_product_assignment_audit(pdf_file_id,previous_json,target_json,reason,created_at) values(?,?,?,'verified','now')").run(pdf,JSON.stringify({assignment:{material_batch_id:batch}}),JSON.stringify({materialBatchId:other}));blocked('pdf_product_assignment_audit.json');
});
it.each(['id','path'])('protects BOM effective batch %s, including legacy detached context',kind=>{
 db.prepare('insert into bom_items(bom_version_id,project_item_id,drawing_id,effective_material_batch_id,effective_batch_relative_path) values(?,?,?,?,?)').run(bom,project,drawing,kind==='id'?batch:null,path.replaceAll('\\','/'));
 blocked(kind==='id'?'bom_items.effective_material_batch_id':'bom_items.effective_batch_relative_path');
});
it('protects BOM correction snapshots after the live item context changed',()=>{
 db.prepare("insert into bom_revision_snapshots(bom_version_id,edit_revision,before_snapshot_json,after_snapshot_json,created_at) values(?,0,?,'{}','now')").run(bom,JSON.stringify({items:[{effectiveMaterialBatchId:batch}]}));blocked('bom_revision_snapshots.json');
});
it('protects outbound selected batch even where its FK would detach on delete',()=>{
 db.prepare('update outbound_packages set selected_material_batch_id=? where id=?').run(batch,outbound);blocked('outbound_packages.selected_material_batch_id');
});
it('protects outbound source batches in legacy snapshots',()=>{
 db.prepare("insert into outbound_package_items(package_id,project_item_id,drawing_id,source_material_batch_id,project_item_name_snapshot,drawing_code_snapshot,file_name_snapshot,relative_path_snapshot,source_batch_name_snapshot) values(?,?,?,?,'logo','code','one.pdf','one.pdf','batch')").run(outbound,project,drawing,batch);blocked('outbound_package_items.source_material_batch_id');
});
it.each(['batch','baseline'])('protects outbound scope %s',kind=>{
 db.prepare("insert into outbound_batch_scopes(batch_id,baseline_batch_id,updated_at,reason) values(?,?,'now','verified')").run(kind==='batch'?batch:other,kind==='baseline'?batch:null);blocked(`outbound_batch_scopes.${kind==='batch'?'batch_id':'baseline_batch_id'}`);
});
it('protects baseline scope audit JSON after the current baseline changes',()=>{
 db.prepare("insert into outbound_batch_scope_audit(batch_id,before_json,after_json,reason,created_at) values(?,?,?,'verified','now')").run(other,JSON.stringify({baseline_batch_id:batch}),JSON.stringify({baseline_batch_id:null}));blocked('outbound_batch_scope_audit.json');
});
it.each(['request','baseline','files'])('protects frozen V2 %s context without a live batch FK',kind=>{
 db.prepare('insert into outbound_v2_snapshots(package_id,context_json,files_json,parts_json) values(?,?,?,?)').run(outbound,JSON.stringify(kind==='request'?{request:{selectedMaterialBatchId:batch}}:kind==='baseline'?{baseline:{id:batch}}:{}),JSON.stringify(kind==='files'?[{sourceBatchId:batch}]:[]),'[]');blocked('outbound_v2_snapshots.json');
});
it('rechecks references and display revisions inside deletion transaction',()=>{
 const preview=service.previewDeletion(batch)!;service.rename(batch,'renamed',0);
 expect(()=>service.delete(batch,{fingerprint:preview.fingerprint,confirmation:'删除批次'})).toThrow('重新预检');
 const fresh=service.previewDeletion(batch)!;db.prepare('update pdf_files set material_batch_id=? where id=?').run(batch,pdf);
 expect(()=>service.delete(batch,{fingerprint:fresh.fingerprint,confirmation:'删除批次'})).toThrow('重新预检');expect(db.prepare('select id from material_batches where id=?').get(batch)).toBeTruthy();
});

function newMergeProduct(model:string):number {
 const base=db.prepare('select brand_id,product_size_id,default_appearance_id from products where id=?').get(product) as {brand_id:number;product_size_id:number;default_appearance_id:number};
 return new ProductService(db).create({brandId:base.brand_id,productSizeId:base.product_size_id,defaultAppearanceId:base.default_appearance_id,model,sku:model,productCategory:'test'}).id;
}
it('protects an otherwise empty alias batch referenced by the real immutable product merge history',()=>{
 const alias=newMergeProduct('alias');db.prepare('update material_batches set product_id=? where id=?').run(alias,batch);
 expect(service.previewDeletion(batch)?.allowed).toBe(true);
 const appearances=new AppearanceService(db);const preview=appearances.mergePreview({primaryProductId:product,aliasProductIds:[alias]});
 expect(preview.references.find(reference=>reference.table==='material_batches')?.ids).toContain(batch);
 appearances.mergeConfirm({...preview,confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision});
 const events=db.prepare('select * from product_merge_events').all();
 blocked('product_merge_events.json');
 expect(service.previewDeletion(batch)?.reason).toContain('产品归并历史');
 expect(db.prepare('select * from product_merge_events').all()).toEqual(events);
});
it('does not confuse same-number drawing/product IDs in real merge history with an unrelated empty batch',()=>{
 const alias=newMergeProduct('alias'),unrelated=newMergeProduct('unrelated');
 db.prepare('update material_batches set product_id=? where id=?').run(unrelated,batch);
 const appearances=new AppearanceService(db);const preview=appearances.mergePreview({primaryProductId:product,aliasProductIds:[alias]});
 expect(preview.references.find(reference=>reference.table==='drawing_numbers')?.ids).toContain(batch);
 expect(preview.references.find(reference=>reference.table==='material_batches')?.ids).not.toContain(batch);
 appearances.mergeConfirm({...preview,confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision});
 const deletion=service.previewDeletion(batch)!;expect(deletion.allowed).toBe(true);
 expect(service.delete(batch,{fingerprint:deletion.fingerprint,confirmation:'删除批次'})).toEqual({deleted:batch});
});
it('also protects table-tagged batch IDs when present in a merge after snapshot',()=>{
 db.prepare("insert into product_merge_events(canonical_product_id,fingerprint,before_json,after_json,created_at) values(?,'proof','{}',?,'now')").run(product,JSON.stringify({references:[{table:'drawing_numbers',ids:[other]},{table:'material_batches',ids:[batch]}]}));
 blocked('product_merge_events.json');
});

it('cleans stale unprotected indices only after successful empty directory observation',async()=>{
 const {mkdtempSync,mkdirSync,rmSync,existsSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'v5-empty-batch-'));const directory=join(root,...path.split('\\'));mkdirSync(directory,{recursive:true});
 try {
  const observed=new MaterialBatchService(db,()=>root);
  db.prepare('update pdf_files set material_batch_id=?,is_present=0 where id=?').run(batch,pdf);
  expect(observed.list().find(item=>item.id===batch)?.fileCount).toBe(0);
  const preview=observed.previewDeletion(batch)!;expect(preview.allowed).toBe(true);
  expect(observed.delete(batch,{fingerprint:preview.fingerprint,confirmation:'删除批次'})).toEqual({deleted:batch});
  expect(existsSync(directory)).toBe(true); // Internal node cleanup never removes the real folder.
  expect(db.prepare('select id from pdf_files where id=?').get(pdf)).toBeUndefined();
  expect(db.prepare('select id from material_batches where id=?').get(other)).toBeTruthy();
  expect(db.pragma('foreign_key_check')).toEqual([]);
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('does not infer empty from unavailable directory even with zero indexed PDFs',()=>{
 const observed=new MaterialBatchService(db,()=>'/does/not/exist');
 const preview=observed.previewDeletion(batch)!;expect(preview.allowed).toBe(false);
 expect(preview.reason).toContain('无法访问');
});
it('rechecks physical PDFs appearing after the empty preview',async()=>{
 const {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'v5-race-batch-'));const directory=join(root,...path.split('\\'));mkdirSync(directory,{recursive:true});
 try{
  const observed=new MaterialBatchService(db,()=>root);const preview=observed.previewDeletion(batch)!;expect(preview.allowed).toBe(true);
  const physical=join(directory,'real.pdf');writeFileSync(physical,'%PDF immutable');
  expect(()=>observed.delete(batch,{fingerprint:preview.fingerprint,confirmation:'删除批次'})).toThrow('重新预检');
  expect(readFileSync(physical,'utf8')).toBe('%PDF immutable');
 }finally{rmSync(root,{recursive:true,force:true});}
});

it('preserves a protected drawing-linked index even when the physical batch is successfully observed empty',async()=>{
 const {mkdtempSync,mkdirSync,rmSync}=await import('node:fs');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const root=mkdtempSync(join(tmpdir(),'v5-protected-batch-'));mkdirSync(join(root,...path.split('\\')),{recursive:true});
 try{
  db.prepare("update pdf_files set material_batch_id=?,drawing_id=?,match_status='matched',is_present=0 where id=?").run(batch,drawing,pdf);
  const observed=new MaterialBatchService(db,()=>root);expect(observed.previewDeletion(batch)?.allowed).toBe(false);
  expect(db.prepare('select drawing_id from pdf_files where id=?').get(pdf)).toEqual({drawing_id:drawing});
 }finally{rmSync(root,{recursive:true,force:true});}
});
