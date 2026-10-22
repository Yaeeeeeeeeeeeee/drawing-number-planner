import {ensureProductAppearance} from '../../src/core/products/appearance-identity';
import {afterEach,beforeEach,expect,it} from 'vitest';
import {openDatabase,type PlannerDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
import {DrawingAssociationService} from '../../src/core/drawings/drawing-association-service';
import {ProductService} from '../../src/core/products/product-service';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
let db:PlannerDatabase;
beforeEach(()=>{db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});});afterEach(()=>db.close());
function fixture(){const dict=new DictionaryService(db);const brand=dict.create({type:'brand',code:'02',name:'Brand'});const size=dict.create({type:'product_size',code:'0404',name:'Size'});dict.create({type:'color',code:'0',name:'White'});const appearance=dict.create({type:'appearance',code:'01',name:'First'});const product=new ProductService(db).create({sku:'EXACT',model:'ZC100',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'Test'});ensureProductAppearance(db,product.id);return {product,appearance,service:new DrawingAssociationService(db)};}
function historical(sku:string|null='EXACT'){return Number(db.prepare(`insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,detected_sku,detected_model,first_seen_at,last_seen_at) values('02.0404.010.0401001','02','0404','01','0','04','01',1,?,'ZC100','2026-10-20','2026-10-20')`).run(sku).lastInsertRowid);}
it('requires exact original product and unique version facts, retains code and raw identity',()=>{const {product,service}=fixture();const id=historical();const before=db.prepare('select * from historical_drawing_numbers').get();const preview=service.preview(undefined,[-id]);expect(preview.records[0].state).toBe('ready');service.confirm({targets:preview.records[0].targets,fingerprint:preview.fingerprint,reason:'核验',confirmed:true});expect(db.prepare('select * from historical_drawing_numbers').get()).toEqual(before);expect(db.prepare('select product_id from drawing_appearance_bindings').get()).toEqual({product_id:product.id});expect(service.history(-id)).toHaveLength(1);});
it('leaves missing original identity pending and never uses model alone',()=>{const {service}=fixture();historical(null);expect(service.preview().records[0].state).toBe('missing-product');expect(service.diagnoseProduct(1,{autoApply:true}).records).toHaveLength(0);expect(db.prepare('select count(*) as n from drawing_appearance_bindings').get()).toEqual({n:0});});
it('rejects stale facts transactionally but does not require managed versions for product attribution',()=>{const {product,appearance,service}=fixture();const id=historical();const preview=service.preview(undefined,[-id]);db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'Second','draft','2026')`).run(product.id,appearance.id);expect(()=>service.confirm({targets:preview.records[0].targets,fingerprint:preview.fingerprint,reason:'核验',confirmed:true})).toThrow('重新预览');expect(service.preview().records[0].state).toBe('ready');expect(db.prepare('select count(*) as n from drawing_association_audit').get()).toEqual({n:0});});
it('manual correction preserves codes, occupancy and references while recording reasons',()=>{const {service,product}=fixture();const id=historical(null);const version=db.prepare('select id from product_appearance_versions where product_id=?').get(product.id) as {id:number};service.correct({signedId:-id,productId:product.id,appearanceVersionId:version.id},'人工核对目录');expect(service.history(-id)).toHaveLength(1);expect(db.prepare('select full_code,product_id from historical_drawing_numbers').get()).toEqual({full_code:'02.0404.010.0401001',product_id:null});});

it('keeps scan-derived unique SKU/model candidates unbound after real product creation until manual preview confirmation',()=>{
  const id=historical();const {product,service}=fixture();
  expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);
  expect(service.history(-id)).toHaveLength(0);
  const preview=service.preview(undefined,[-id]);
  expect(preview.records[0]).toMatchObject({state:'ready',automaticEligible:false});
  service.confirm({targets:preview.records[0].targets,fingerprint:preview.fingerprint,reason:'人工核验扫描目录与产品版本',confirmed:true});
  expect(db.prepare('select product_id from drawing_appearance_bindings').get()).toEqual({product_id:product.id});
  expect(db.prepare('select product_id from historical_drawing_numbers where id=?').get(id)).toEqual({product_id:null});
});
it('does not treat a scan-populated historical product_id as independent automatic evidence',()=>{
  const {product,service}=fixture();const id=historical();db.prepare('update historical_drawing_numbers set product_id=? where id=?').run(product.id,id);
  const preview=service.diagnoseProduct(product.id,{autoApply:true});
  expect(preview.records[0]).toMatchObject({state:'ready',automaticEligible:false});
  expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);
});

it('requires an independent explicit BOM identity and version before automatic attribution',()=>{
  const {product,service}=fixture();const id=historical();const dict=new DictionaryService(db);
  const main=dict.create({type:'main_category',code:'04',name:'Materials'});const item=dict.create({type:'project_item',code:'01',name:'Label',parentId:main.id});
  const appearanceVersion=db.prepare('select id from product_appearance_versions where product_id=?').get(product.id) as {id:number};
  const bom=Number(db.prepare(`insert into bom_versions(product_id,appearance_version_id,version_number,business_change_date,created_at) values(?,?,1,'2026-10-20','now')`).run(product.id,appearanceVersion.id).lastInsertRowid);
  db.prepare('insert into bom_items(bom_version_id,project_item_id,historical_drawing_id,quantity) values(?,?,?,1)').run(bom,item.id,id);
  const preview=service.preview(undefined,[-id]);expect(preview.records[0]).toMatchObject({state:'ready',automaticEligible:true});
  service.diagnoseProduct(product.id,{autoApply:true});expect(db.prepare('select product_id from drawing_appearance_bindings').get()).toEqual({product_id:product.id});
  expect(db.prepare('select product_id from historical_drawing_numbers where id=?').get(id)).toEqual({product_id:null});
});
it('canonicalizes existing confirmed bindings after a real alias merge without rewriting their raw attribution',async()=>{
  const {product,service}=fixture();const base=db.prepare('select * from products where id=?').get(product.id) as {brand_id:number;product_size_id:number;default_appearance_id:number};
  const alias=new ProductService(db).create({sku:'ALIAS',model:'ZC100B',brandId:base.brand_id,productSizeId:base.product_size_id,defaultAppearanceId:base.default_appearance_id,productCategory:'Test'});
  ensureProductAppearance(db,alias.id);const id=historical(null);db.prepare('update historical_drawing_numbers set product_id=? where id=?').run(alias.id,id);
  const version=db.prepare('select id from product_appearance_versions where product_id=?').get(alias.id) as {id:number};
  service.correct({signedId:-id,productId:alias.id,appearanceVersionId:version.id},'人工确认别名原版本');
  const {AppearanceService}=await import('../../src/core/products/appearance-service');const appearances=new AppearanceService(db);
  const preview=appearances.mergePreview({primaryProductId:product.id,aliasProductIds:[alias.id]});
  appearances.mergeConfirm({primaryProductId:product.id,aliasProductIds:[alias.id],confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision});
  expect(service.preview(product.id).records).toContainEqual(expect.objectContaining({signedId:-id,state:'associated',targets:[{signedId:-id,productId:product.id,appearanceVersionId:version.id}]}));
  expect(db.prepare('select product_id from historical_drawing_numbers where id=?').get(id)).toEqual({product_id:alias.id});
  expect(service.history(-id)).toContainEqual(expect.objectContaining({product_id:alias.id,reason:'人工确认别名原版本'}));
});

it('retains legacy BOM version evidence without inventing competing product identities',()=>{
  const {product,service}=fixture();const id=historical();const dict=new DictionaryService(db);
  const main=dict.create({type:'main_category',code:'04',name:'Materials'});const item=dict.create({type:'project_item',code:'01',name:'Label',parentId:main.id});
  const first=db.prepare('select id from product_appearance_versions where product_id=?').get(product.id) as {id:number};
  const secondAppearance=dict.create({type:'appearance',code:'02',name:'Other'});
  const second=Number(db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'Other','draft','now')`).run(product.id,secondAppearance.id).lastInsertRowid);
  for(const [index,version] of [first.id,second].entries()){
    const bom=Number(db.prepare(`insert into bom_versions(product_id,appearance_version_id,version_number,business_change_date,created_at) values(?,?,?,'2026-10-20','now')`).run(product.id,version,index+1).lastInsertRowid);
    db.prepare('insert into bom_items(bom_version_id,project_item_id,historical_drawing_id,quantity) values(?,?,?,1)').run(bom,item.id,id);
  }
  expect(service.preview(undefined,[-id]).records[0]).toMatchObject({state:'ready',automaticEligible:true});
  expect(db.prepare('select * from drawing_appearance_bindings').all()).toEqual([]);
  service.correct({signedId:-id,productId:product.id,appearanceVersionId:first.id},'人工审查冲突后确认原始归属');
  expect(service.history(-id)).toHaveLength(1);
});
