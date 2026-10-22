import {mkdtempSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {openDatabase,type PlannerDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {DrawingAssociationService} from '../../src/core/drawings/drawing-association-service';
import {ProductService} from '../../src/core/products/product-service';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
let db:PlannerDatabase;
beforeEach(()=>{db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});});afterEach(()=>db.close());
function fixture(){const dictionary=new DictionaryService(db);const brand=dictionary.create({type:'brand',code:'02',name:'Brand'});const size=dictionary.create({type:'product_size',code:'0404',name:'Size'});dictionary.create({type:'color',code:'0',name:'White'});const appearance=dictionary.create({type:'appearance',code:'01',name:'First'});const main=dictionary.create({type:'main_category',code:'04',name:'Materials'});const item=dictionary.create({type:'project_item',code:'01',name:'Label',parentId:main.id});const product=new ProductService(db).create({sku:'EXACT',model:'ZC100',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'Test'});return {product,item,appearance};}
function historical(){return Number(db.prepare(`insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,detected_sku,detected_model,first_seen_at,last_seen_at) values('02.0404.010.0401001','02','0404','01','0','04','01',1,'EXACT','ZC100','2026-10-20','2026-10-20')`).run().lastInsertRowid);}
it('creates product identity without inventing an initial appearance object',()=>{const {product}=fixture();expect(db.prepare('select * from product_appearance_versions where product_id=?').all(product.id)).toEqual([]);expect(db.prepare('select canonical_product_id from product_identity_members where raw_product_id=?').get(product.id)).toEqual({canonical_product_id:product.id});});
it('repairs unique exact BOM evidence without a managed version, audits and preserves historical rows',()=>{const {product,item}=fixture();const id=historical();const before=db.prepare('select * from historical_drawing_numbers').all();const version=Number(db.prepare("insert into bom_versions(product_id,version_number,business_change_date,created_at) values(?,1,'2026-10-22','now')").run(product.id).lastInsertRowid);db.prepare('insert into bom_items(bom_version_id,project_item_id,historical_drawing_id,quantity) values(?,?,?,1)').run(version,item.id,id);const service=new DrawingAssociationService(db);const preview=service.preview();expect(preview.records[0]).toMatchObject({state:'ready',automaticEligible:true,targets:[{signedId:-id,productId:product.id,appearanceVersionId:null}]});const result=service.confirm({targets:preview.records[0].targets,fingerprint:preview.fingerprint,reason:'核实真实 BOM 图号 ID',confirmed:true});expect(result).toMatchObject({updated:1,before:{historicalAssociated:1,historicalTotal:1,historicalConfirmedBindings:0},after:{historicalAssociated:1,historicalTotal:1,historicalConfirmedBindings:1}});expect(db.prepare('select * from historical_drawing_numbers').all()).toEqual(before);expect(service.history(-id)).toHaveLength(1);});
it('supports explicit product-only correction and does not certify directory candidates automatically',()=>{const {product}=fixture();const id=historical();const service=new DrawingAssociationService(db);expect(service.preview().records[0]).toMatchObject({state:'ready',automaticEligible:false});service.correct({signedId:-id,productId:product.id,appearanceVersionId:null},'人工核对产品档案');expect(service.preview().records[0].state).toBe('associated');expect(db.prepare('select appearance_version_id from drawing_appearance_bindings').get()).toEqual({appearance_version_id:null});});
it('does not resolve competing trustworthy products by preferring the scan directory candidate',()=>{const {product,item}=fixture();const id=historical();const base=db.prepare('select brand_id,product_size_id,default_appearance_id from products where id=?').get(product.id) as {brand_id:number;product_size_id:number;default_appearance_id:number};const other=new ProductService(db).create({sku:'SAME-PREFIX-OTHER',model:'OTHER',brandId:base.brand_id,productSizeId:base.product_size_id,defaultAppearanceId:base.default_appearance_id,productCategory:'Test'});for(const current of [product,other]){const version=Number(db.prepare("insert into bom_versions(product_id,version_number,business_change_date,created_at) values(?,1,'2026-10-22','now')").run(current.id).lastInsertRowid);db.prepare('insert into bom_items(bom_version_id,project_item_id,historical_drawing_id,quantity) values(?,?,?,1)').run(version,item.id,id);}const service=new DrawingAssociationService(db);expect(service.preview().records[0]).toMatchObject({state:'conflict',automaticEligible:false});service.diagnoseProduct(product.id,{autoApply:true});expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);});
it('returns matching unassociated counts and product-only library results after explicit confirmation',async()=>{const {product}=fixture();const id=historical();const {DrawingQueryService}=await import('../../src/core/drawings/drawing-query-service');const library=new DrawingQueryService(db);expect(library.search({associationState:'unassociated'}).total).toBe(1);library.associations.correct({signedId:-id,productId:product.id},'核实完整图号与产品');expect(library.search({productId:product.id}).items[0]).toMatchObject({id:-id,productId:product.id,model:'ZC100'});expect(library.search({associationState:'unassociated'}).total).toBe(0);expect(library.navigationCounts().products).toEqual([{productId:product.id,count:1}]);expect(library.navigationCounts().unassociated).toBe(0);});
it('fingerprints all PDF and batch evidence so a stale preview never writes partial attribution',()=>{fixture();const id=historical();const service=new DrawingAssociationService(db),preview=service.preview();db.prepare("insert into material_batches(name,relative_path,product_directory,recognition_status,first_seen_at,last_seen_at) values('other','different','different','recognized','now','now')").run();expect(()=>service.confirm({targets:preview.records[0].targets,fingerprint:preview.fingerprint,reason:'核验',confirmed:true})).toThrow('重新预览');expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);expect(service.history(-id)).toEqual([]);});
it('reads confirmed PDF batch evidence by exact drawing ID without mutating scan rows or requiring repair',async()=>{
 const {product,appearance}=fixture();const id=historical();
 const version=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,1,?,'Legacy','current','now')").run(product.id,appearance.id).lastInsertRowid);
 const batch=Number(db.prepare("insert into material_batches(name,relative_path,product_directory,product_id,recognition_status,first_seen_at,last_seen_at) values('batch','batch','EXACT-ZC100',?,'recognized','now','now')").run(product.id).lastInsertRowid);
 db.prepare("insert into outbound_batch_scopes(batch_id,appearance_version_id,updated_at,reason) values(?,?,'now','用户确认批次归属')").run(batch,version);
 db.prepare("insert into pdf_files(relative_path,file_name,historical_drawing_id,material_batch_id,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present) values('batch/a.pdf','a.pdf',?,?,'matched','[]','outlined',1,'now','now',1)").run(id,batch);
 const {DrawingQueryService}=await import('../../src/core/drawings/drawing-query-service');const library=new DrawingQueryService(db);const before=db.serialize();
 db.pragma('query_only=ON');
 expect(library.search({productId:product.id}).items).toContainEqual(expect.objectContaining({id:-id,model:'ZC100',productId:product.id}));
 expect(library.navigationCounts().unassociated).toBe(0);
 expect(library.associations.preview().records[0]).toMatchObject({automaticEligible:true,state:'ready'});
 db.pragma('query_only=OFF');expect(db.serialize().equals(before)).toBe(true);
});
it('reserves product-only drawings atomically and never creates an appearance version',async()=>{
 const {product,item,appearance}=fixture();const {PlanningService}=await import('../../src/core/planning/planning-service');const service=new PlanningService(db);
 const color=(db.prepare("select id from dictionary_items where type='color'").get() as {id:number}).id;
 const main=(db.prepare('select parent_id from dictionary_items where id=?').get(item.id) as {parent_id:number}).parent_id;
 const request={productId:product.id,appearanceId:appearance.id,rows:[{clientId:'new',colorId:color,mainCategoryId:main,projectItemId:item.id}]};const preview=service.preview(request);
 const reservation={...request,rows:[{...request.rows[0],expectedFullCode:preview.rows[0].fullCode}]};
 db.exec("create trigger reject_product_only_binding before insert on drawing_appearance_bindings begin select raise(abort,'reject binding'); end");
 expect(()=>service.reserve(reservation)).toThrow('reject binding');expect(db.prepare('select * from drawing_numbers').all()).toEqual([]);
 db.exec('drop trigger reject_product_only_binding');const saved=service.reserve(reservation);
 expect(db.prepare('select product_id,appearance_version_id from drawing_appearance_bindings where record_id=?').get(saved[0].id)).toEqual({product_id:product.id,appearance_version_id:null});
 expect(db.prepare('select * from product_appearance_versions').all()).toEqual([]);
});

it('backs up disk repair before writing confirmed bindings and audit',()=>{
 const directory=mkdtempSync(join(tmpdir(),'v3-association-'));
 db.close();db=openDatabase(join(directory,'planner.db'));migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
 try{
  const {product}=fixture();const id=historical();const service=new DrawingAssociationService(db);const preview=service.preview();
  const result=service.confirm({targets:preview.records[0].targets,fingerprint:preview.fingerprint,reason:'人工核验',confirmed:true});
  expect(result.backupPath).toBeTruthy();const backup=openDatabase(result.backupPath!);
  try{expect(backup.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);expect(backup.prepare('select * from drawing_association_audit').all()).toEqual([]);expect(backup.prepare('select id from historical_drawing_numbers').all()).toEqual([{id}]);expect(backup.pragma('integrity_check',{simple:true})).toBe('ok');}finally{backup.close();}
  expect(db.prepare('select product_id from drawing_appearance_bindings').get()).toEqual({product_id:product.id});
 }finally{db.close();db=openDatabase(':memory:');rmSync(directory,{recursive:true,force:true});}
});

it('backs up explicit historical candidate repair before its outer transaction',()=>{
 const directory=mkdtempSync(join(tmpdir(),'v3-candidate-'));db.close();db=openDatabase(join(directory,'planner.db'));migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
 try{
  const {product,appearance}=fixture();const original=db.prepare('select brand_id,product_size_id from products where id=?').get(product.id) as {brand_id:number;product_size_id:number};const id=historical();
  db.prepare("update historical_drawing_numbers set detected_sku='HISTORY',detected_model='H100',detected_product_category='Test' where id=?").run(id);
  const result=new ProductService(db).confirmHistoricalCandidate({sku:'HISTORY',model:'H100',productCategory:'Test',brandId:original.brand_id,productSizeId:original.product_size_id,defaultAppearanceId:appearance.id});
  const backups=readdirSync(join(directory,'backups'));expect(backups).toHaveLength(1);const backup=openDatabase(join(directory,'backups',backups[0]));
  try{expect(backup.prepare('select product_id from historical_drawing_numbers where id=?').get(id)).toEqual({product_id:null});expect(backup.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);expect(backup.prepare('select * from drawing_association_audit').all()).toEqual([]);expect(backup.prepare("select * from products where sku='HISTORY'").all()).toEqual([]);expect(backup.pragma('integrity_check',{simple:true})).toBe('ok');}finally{backup.close();}
  expect(result.linkedHistoricalCount).toBe(1);expect(db.prepare('select product_id from drawing_appearance_bindings where record_id=?').get(id)).toEqual({product_id:result.product.id});expect(new DrawingAssociationService(db).history(-id)).toHaveLength(1);
 }finally{db.close();db=openDatabase(':memory:');rmSync(directory,{recursive:true,force:true});}
});
