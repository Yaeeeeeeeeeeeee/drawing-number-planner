import {afterEach,beforeEach,expect,it} from 'vitest';
import {DictionaryService} from '../../src/core/dictionaries/dictionary-service';
import {ProductService} from '../../src/core/products/product-service';
import {PlanningService} from '../../src/core/planning/planning-service';
import {openDatabase,type PlannerDatabase} from '../../src/db/database';
import {migrateDatabase} from '../../src/db/migrations';
let db:PlannerDatabase,service:PlanningService,dictionaries:DictionaryService;
let refs:ReturnType<typeof fixture>;
function fixture(){
 const brand=dictionaries.create({type:'brand',code:'02',name:'Brand'});
 const size=dictionaries.create({type:'product_size',code:'0404',name:'Size'});
 const appearance=dictionaries.create({type:'appearance',code:'01',name:'Appearance'});
 // White deliberately does not use color code 0.
 const white=dictionaries.create({type:'color',code:'4',name:'White'});
 const gray=dictionaries.create({type:'color',code:'0',name:'Gray'});
 const main=dictionaries.create({type:'main_category',code:'04',name:'Main'});
 const item=dictionaries.create({type:'project_item',code:'01',name:'Logo',parentId:main.id});
 const other=dictionaries.create({type:'project_item',code:'02',name:'Label',parentId:main.id});
 const products=new ProductService(db);
 const make=(sku:string)=>products.create({sku,model:sku,brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id,productCategory:'冷柜'});
 return {brand,size,appearance,white,gray,main,item,other,product:make('A'),second:make('B')};
}
beforeEach(()=>{db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});dictionaries=new DictionaryService(db);service=new PlanningService(db);refs=fixture();});
afterEach(()=>db.close());
const row=(clientId='r')=>({clientId,colorId:refs.gray.id,mainCategoryId:refs.main.id,projectItemId:refs.item.id,shareWhite:false});
function approve(input:any){const preview=service.previewBatch(input);return {...input,confirmed:true as const,groups:input.groups.map((group:any,i:number)=>({...group,rows:group.rows.map((r:any,j:number)=>({...r,expectedFullCode:preview.groups[i].rows[j].fullCode,fingerprint:preview.groups[i].rows[j].fingerprint}))}))};}
function whiteBase(){const input={productId:refs.product.id,rows:[{...row(),colorId:refs.white.id}]};const preview=service.preview(input);return service.reserve({...input,rows:[{...input.rows[0],expectedFullCode:preview.rows[0].fullCode}]})[0];}
it('returns independent row errors and preserves legacy consecutive allocations without writes',()=>{
 const preview=service.previewBatch({groups:[{productId:refs.product.id,rows:[row('first'),{...row('bad'),projectItemId:99999},row('second')]},{productId:99999,rows:[row()]}]});
 expect(preview.groups[0].rows.map(r=>r.fullCode)).toEqual(['02.0404.010.0401001',undefined,'02.0404.010.0401002']);
 expect(preview.groups[0].rows[1]).toMatchObject({available:false,error:{code:'DICTIONARY_NOT_ACTIVE'}});
 expect(preview.groups[1].rows[0]).toMatchObject({available:false,error:{code:'PRODUCT_NOT_ACTIVE'}});
 expect(db.prepare('select count(*) n from drawing_numbers').get()).toEqual({n:0});
});
it('blocks complete-code conflicts across products without allocating a new global sequence',()=>{
 const preview=service.previewBatch({groups:[{productId:refs.product.id,rows:[row()]},{productId:refs.second.id,rows:[row()]}]});
 expect(preview.groups.flatMap(g=>g.rows)).toEqual([expect.objectContaining({available:false,fullCode:'02.0404.010.0401001',error:{code:'DRAWING_CODE_CONFLICT',message:expect.any(String)}}),expect.objectContaining({available:false,fullCode:'02.0404.010.0401001',error:{code:'DRAWING_CODE_CONFLICT',message:expect.any(String)}})]);
});
it('namespaces client IDs by product and rejects repeated rows and canonical aliases',()=>{
 const preview=service.previewBatch({groups:[{productId:refs.product.id,rows:[row(),{...row(),projectItemId:refs.other.id}]},{productId:refs.second.id,rows:[{...row(),colorId:refs.white.id}]}]});
 expect(preview.groups[0].rows.every(r=>r.error?.code==='INVALID_PLAN')).toBe(true);
 expect(preview.groups[1].rows[0].available).toBe(true);
 db.prepare('insert into product_identity_members(raw_product_id,canonical_product_id) values(?,?) on conflict(raw_product_id) do update set canonical_product_id=excluded.canonical_product_id').run(refs.second.id,refs.product.id);
 const aliases=service.previewBatch({groups:[{productId:refs.product.id,rows:[row()]},{productId:refs.second.id,rows:[row()]}]});
 expect(aliases.groups.flatMap(g=>g.rows).every(r=>r.error?.code==='INVALID_PLAN')).toBe(true);
});
it('requires a real eligible white identity and never treats a color dictionary as a drawing',()=>{
 const input={groups:[{productId:refs.product.id,rows:[{...row(),shareWhite:true}]}]};
 expect(service.previewBatch(input).groups[0].rows[0]).toMatchObject({available:false,error:{code:'WHITE_BASE_REQUIRED'}});
 const base=whiteBase();const before=db.prepare('select * from drawing_numbers').all();
 const checked=service.previewBatch(input).groups[0].rows[0];
 expect(checked).toMatchObject({available:true,fullCode:'02.0404.014.0401001',shared:{origin:'planned',id:base.id},parts:{colorCode:'4'}});
 expect(service.reserveBatch(approve(input)).results[0]).toMatchObject({outcome:'shared',drawing:{id:base.id,origin:'planned',fullCode:base.fullCode}});
 expect(db.prepare('select * from drawing_numbers').all()).toEqual(before);
 expect(db.prepare('select * from bom_versions').all()).toEqual([]);
});
it('reserves ordinary white rows and rejects absent, ambiguous, other-product and voided bases',()=>{
 const base=whiteBase();const ordinary={groups:[{productId:refs.product.id,rows:[{...row(),colorId:refs.white.id,shareWhite:true}]}]};
 expect(service.previewBatch(ordinary).groups[0].rows[0]).toMatchObject({available:true,sequence:2});
 const second=whiteBase();const input={groups:[{productId:refs.product.id,rows:[{...row(),shareWhite:true}]}]};
 expect(service.previewBatch(input).groups[0].rows[0].error?.code).toBe('WHITE_BASE_AMBIGUOUS');
 input.groups[0].rows[0]={...input.groups[0].rows[0],whiteBase:{origin:'planned',id:second.id}} as any;
 expect(service.previewBatch(input).groups[0].rows[0].shared?.id).toBe(second.id);
 db.prepare("update drawing_numbers set status='voided' where id=?").run(second.id);
 expect(service.previewBatch(input).groups[0].rows[0].available).toBe(false);
 input.groups[0].productId=refs.second.id;
 expect(service.previewBatch(input).groups[0].rows[0].available).toBe(false);
 expect(base.id).not.toBe(second.id);
});
it('accepts confirmed historical evidence but never a scanned raw product candidate',()=>{
 const id=Number(db.prepare(`insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,product_id,first_seen_at,last_seen_at) values('02.0404.014.0401007','02','0404','01','4','04','01',7,?,'now','now')`).run(refs.product.id).lastInsertRowid);
 const input={groups:[{productId:refs.product.id,rows:[{...row(),shareWhite:true}]}]};
 expect(service.previewBatch(input).groups[0].rows[0].available).toBe(false);
 db.prepare(`insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,revision,updated_at) values('historical',?,?,null,'confirmed',1,'now')`).run(id,refs.product.id);
 expect(service.previewBatch(input).groups[0].rows[0]).toMatchObject({available:true,shared:{origin:'historical',id},fullCode:'02.0404.014.0401007'});
});
it.each(['model','name','parent','version'])('invalidates unchanged-code approvals when %s facts change',kind=>{
 const version=Number(db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'Draft','draft','now')`).run(refs.product.id,refs.appearance.id).lastInsertRowid);
 const input={groups:[{productId:refs.product.id,appearanceVersionId:version,rows:[row()]}]};const approved=approve(input);
 if(kind==='model')db.prepare("update products set model='Changed' where id=?").run(refs.product.id);
 if(kind==='name')db.prepare("update dictionary_items set name='Changed' where id=?").run(refs.size.id);
 if(kind==='parent'){const otherMain=dictionaries.create({type:'main_category',code:'05',name:'Other'});db.prepare('update dictionary_items set parent_id=? where id=?').run(otherMain.id,refs.item.id);}
 if(kind==='version')db.prepare("update product_appearance_versions set label='Changed' where id=?").run(version);
 expect(service.reserveBatch(approved).results[0].outcome).toBe('failed');
 expect(db.prepare('select count(*) n from drawing_numbers').get()).toEqual({n:0});
});
it('keeps unrelated successes, rejects unconfirmed and stale approvals, and never duplicates a retry',()=>{
 const input={groups:[{productId:refs.product.id,rows:[row('ok'),{...row('other'),projectItemId:refs.other.id}]}]};const approved=approve(input);
 expect(()=>service.reserveBatch({...approved,confirmed:false} as any)).toThrow();
 approved.groups[0].rows[1].fingerprint='wrong';
 const result=service.reserveBatch(approved);
 expect(result.results.map(r=>r.outcome)).toEqual(['reserved','failed']);
 expect(result.results[0].drawing).toMatchObject({id:expect.any(Number),origin:'planned',fullCode:'02.0404.010.0401001'});
 expect(service.reserveBatch(approved).results.every(r=>r.outcome==='failed')).toBe(true);
 expect(db.prepare('select count(*) n from drawing_numbers').get()).toEqual({n:1});
 expect(db.prepare('select count(*) n from drawing_appearance_bindings').get()).toEqual({n:1});
});
it('rolls back number and binding only for the failed row and preserves unrelated successes',()=>{
 const input={groups:[{productId:refs.product.id,rows:[row('bad'),{...row('good'),projectItemId:refs.other.id}]}]};const approved=approve(input);
 db.exec(`create trigger reject_one_binding before insert on drawing_appearance_bindings when (select project_item_id from drawing_numbers where id=new.record_id)=${refs.item.id} begin select raise(abort,'binding rejected'); end`);
 expect(service.reserveBatch(approved).results.map(r=>r.outcome)).toEqual(['failed','reserved']);
 expect(db.prepare('select full_code from drawing_numbers').all()).toEqual([{full_code:'02.0404.010.0402001'}]);
});
it('rejects deleted dictionary records even when their old business status remains active',()=>{
 db.prepare("update dictionary_items set deleted_at='2026-11-05' where id=?").run(refs.gray.id);
 const preview=service.previewBatch({groups:[{productId:refs.product.id,rows:[row(),{...row('white'),colorId:refs.white.id}]}]});
 expect(preview.groups[0].rows[0]).toMatchObject({available:false,error:{code:'DICTIONARY_NOT_ACTIVE'}});
 expect(preview.groups[0].rows[1].available).toBe(true);
});
it('rejects stale real white identities and retains independent planned successes',()=>{
 const base=whiteBase();const input={groups:[{productId:refs.product.id,rows:[{...row('shared'),shareWhite:true}, {...row('independent'),projectItemId:refs.other.id}]}]};
 const approved=approve(input);db.prepare("update drawing_numbers set status='voided' where id=?").run(base.id);
 expect(service.reserveBatch(approved).results.map(r=>r.outcome)).toEqual(['failed','reserved']);
});
it('blocks conflicting approvals at reserve and allows real sharing for multiple colors in one project',()=>{
 const input={groups:[{productId:refs.product.id,rows:[row()]},{productId:refs.second.id,rows:[row()]}]};
 const result=service.reserveBatch({...input,confirmed:true,groups:input.groups.map(group=>({...group,rows:group.rows.map(row=>({...row,expectedFullCode:'02.0404.010.0401001',fingerprint:'forged'}))}))});
 expect(result.results.map(r=>r.outcome)).toEqual(['failed','failed']);
 const base=whiteBase(),red=dictionaries.create({type:'color',code:'2',name:'Red'});
 const shared={groups:[{productId:refs.product.id,rows:[{...row('gray'),shareWhite:true},{...row('red'),colorId:red.id,shareWhite:true}]}]};
 expect(service.reserveBatch(approve(shared)).results).toEqual([expect.objectContaining({outcome:'shared',drawing:expect.objectContaining({id:base.id})}),expect.objectContaining({outcome:'shared',drawing:expect.objectContaining({id:base.id})})]);
});
it('rejects a white base with another appearance or project and invalidates edited input',()=>{
 const base=whiteBase();
 const appearance=dictionaries.create({type:'appearance',code:'02',name:'Other'});
 const input={groups:[{productId:refs.product.id,appearanceId:appearance.id,rows:[{...row(),shareWhite:true,whiteBase:{origin:'planned' as const,id:base.id}}]}]};
 expect(service.previewBatch(input).groups[0].rows[0].available).toBe(false);
 input.groups[0].appearanceId=refs.appearance.id;input.groups[0].rows[0].projectItemId=refs.other.id;
 expect(service.previewBatch(input).groups[0].rows[0].available).toBe(false);
 const independent={groups:[{productId:refs.product.id,rows:[row()]}]};const approved=approve(independent);
 approved.groups[0].rows[0].notes='Changed since check';
 expect(service.reserveBatch(approved).results[0]).toMatchObject({outcome:'failed',error:{code:'PLAN_STALE'}});
});
