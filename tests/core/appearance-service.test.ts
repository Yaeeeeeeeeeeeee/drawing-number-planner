import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase,type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { resolveCanonicalProductId } from '../../src/core/products/appearance-identity';
import { ProductCleanupService } from '../../src/core/products/product-cleanup-service';
let db:PlannerDatabase,service:AppearanceService,products:ProductService;
beforeEach(()=>{db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup(){}});service=new AppearanceService(db);products=new ProductService(db);});
afterEach(()=>db.close());
function product(model='M1'){const d=new DictionaryService(db);let brand=(db.prepare("select id from dictionary_items where type='brand'").get() as {id:number}|undefined)?.id;let size=(db.prepare("select id from dictionary_items where type='product_size'").get() as {id:number}|undefined)?.id;if(!brand)brand=d.create({type:'brand',code:'02',name:'品牌'}).id;if(!size)size=d.create({type:'product_size',code:'0209',name:'尺寸'}).id;return products.create({sku:model,model,brandId:brand,productSizeId:size,productCategory:'冰柜'});}
it('ordinary create initializes exactly one current version with no fake QR records; draft activation is optimistic',()=>{
 const p=product();const first=service.list(p.id);expect(first.items).toHaveLength(1);expect(first.items[0].status).toBe('current');expect(db.prepare('select * from product_qr_codes').all()).toEqual([]);
 const draft=service.createDraft(p.id,{label:'第二代',predecessorId:first.items[0].id});expect(service.list(p.id).items[0].status).toBe('current');
 expect(()=>service.activate(draft.id,{expectedRevision:0,expectedIdentityRevision:0})).toThrowError(expect.objectContaining({code:'STALE_REVISION'}));
 service.activate(draft.id,{expectedRevision:0,expectedIdentityRevision:1});expect(service.list(p.id).items.map(v=>v.status)).toEqual(['historical','current']);
 expect(()=>db.prepare("update product_appearance_versions set status='current' where id=?").run(first.items[0].id)).toThrow('UNIQUE');
});
it('confirmed merge preserves all raw rows and codes, hides only aliases, rejects stale fingerprints',()=>{
 const a=product(),b=product('M2');const raw=db.prepare('select * from products order by id').all();
 const preview=service.mergePreview({primaryProductId:a.id,aliasProductIds:[b.id]});
 service.createDraft(b.id,{label:'变更'});
 expect(()=>service.mergeConfirm({...preview,confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision})).toThrowError(expect.objectContaining({code:'STALE_REVISION'}));
 const fresh=service.mergePreview({primaryProductId:a.id,aliasProductIds:[b.id]});service.mergeConfirm({...fresh,confirmed:true,expectedFingerprint:fresh.fingerprint,expectedRevision:fresh.revision});
 expect(db.prepare('select * from products order by id').all()).toEqual(raw);expect(resolveCanonicalProductId(db,b.id)).toBe(a.id);expect(products.list().items.map(p=>p.id)).toEqual([a.id]);
 expect(service.list(b.id).items).toHaveLength(3);expect(service.list(a.id).items.filter(v=>v.status==='current')).toHaveLength(1);
});
it('merge failure after mapping and version changes rolls the complete transaction back',()=>{
 const a=product(),b=product('M2');const before={members:db.prepare('select * from product_identity_members order by raw_product_id').all(),versions:db.prepare('select * from product_appearance_versions order by id').all()};
 db.exec("create trigger merge_failure before insert on product_merge_events begin select raise(abort,'merge-failure'); end");
 const preview=service.mergePreview({primaryProductId:a.id,aliasProductIds:[b.id]});
 expect(()=>service.mergeConfirm({...preview,confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision})).toThrow('merge-failure');
 expect(db.prepare('select * from product_identity_members order by raw_product_id').all()).toEqual(before.members);expect(db.prepare('select * from product_appearance_versions order by id').all()).toEqual(before.versions);expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('QR purposes can be independently configured per version, preserve the shared unique scope, and reject another product version',()=>{
 const a=product(),b=product('M2'),first=service.list(a.id).items[0],draft=service.createDraft(a.id,{label:'第二代'}),other=service.list(b.id).items[0];
 const insert=db.prepare(`insert into product_qr_codes(product_id,purpose_id,appearance_version_id,name,status,created_at,updated_at) values(?,1,?,'QR','inactive','2026-01-01','2026-01-01')`);
 insert.run(a.id,null);insert.run(a.id,first.id);insert.run(a.id,draft.id);
 expect(()=>insert.run(a.id,null)).toThrow('UNIQUE');expect(()=>insert.run(a.id,first.id)).toThrow('UNIQUE');expect(()=>insert.run(a.id,other.id)).toThrow('二维码外观不属于同产品');expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('validates optional colors, revisions draft changes and preserves current/historical configurations',()=>{
 const p=product(),dictionaries=new DictionaryService(db);const red=dictionaries.create({type:'color',code:'1',name:'红色'}),white=dictionaries.create({type:'color',code:'0',name:'白色'});
 const draft=service.createDraft(p.id,{label:'颜色配置',colorIds:[red.id,white.id,red.id]});expect(draft.colorIds).toEqual([red.id,white.id].sort((a,b)=>a-b));expect(service.list(p.id).items[0].colorIds).toEqual([]);
 const updated=service.updateDraft(draft.id,{label:'修订颜色',colorIds:[white.id],expectedRevision:0});expect(updated.revision).toBe(1);expect(updated.colorIds).toEqual([white.id]);
 expect(()=>service.updateDraft(draft.id,{label:'过期颜色',colorIds:[red.id],expectedRevision:0})).toThrowError(expect.objectContaining({code:'STALE_REVISION'}));
 expect(()=>service.createDraft(p.id,{label:'错误类型',colorIds:[p.brandId]})).toThrowError(expect.objectContaining({code:'INVALID_INPUT'}));dictionaries.deactivate(red.id);expect(()=>service.createDraft(p.id,{label:'停用颜色',colorIds:[red.id]})).toThrowError(expect.objectContaining({code:'INVALID_INPUT'}));
 const identity=service.list(p.id);service.activate(draft.id,{expectedRevision:1,expectedIdentityRevision:identity.revision});const next=service.createDraft(p.id,{label:'后一代',colorIds:[]});service.activate(next.id,{expectedRevision:0,expectedIdentityRevision:service.list(p.id).revision});
 expect(service.get(draft.id)).toMatchObject({status:'historical',colorIds:[white.id]});expect(service.resources(draft.id).colorIds).toEqual([white.id]);expect(()=>service.updateDraft(draft.id,{label:'改写历史',colorIds:[],expectedRevision:3})).toThrowError(expect.objectContaining({code:'INVALID_INPUT'}));
});
it('merge canonicalizes version binding metadata while retaining raw drawing ownership and guards primary edits across aliases',()=>{
 const a=product(),b=product('M2');const appearance=new DictionaryService(db).create({type:'appearance',code:'01',name:'外观'});const aliasVersion=service.list(b.id).items[0];db.prepare('update product_appearance_versions set appearance_id=? where id=?').run(appearance.id,aliasVersion.id);
 db.prepare(`insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,product_id,first_seen_at,last_seen_at) values('02.0209.010.0401001','02','0209','01','0','04','01',1,?,'then','now')`).run(b.id);
 db.prepare("insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,updated_at) values('historical',1,?,?,'manual','then')").run(b.id,aliasVersion.id);
 const preview=service.mergePreview({primaryProductId:a.id,aliasProductIds:[b.id]});service.mergeConfirm({...preview,confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision});
 expect(db.prepare('select product_id from historical_drawing_numbers where id=1').get()).toEqual({product_id:b.id});expect(db.prepare('select product_id,appearance_version_id from drawing_appearance_bindings').get()).toEqual({product_id:a.id,appearance_version_id:aliasVersion.id});
 const dictionaries=new DictionaryService(db),otherBrand=dictionaries.create({type:'brand',code:'03',name:'其他品牌'}),otherSize=dictionaries.create({type:'product_size',code:'0301',name:'其他尺寸'});
 for(const change of [{model:'改写已引用含义'},{brandId:otherBrand.id},{productSizeId:otherSize.id}])expect(()=>products.update(a.id,{...a,...change})).toThrowError(expect.objectContaining({code:'PRODUCT_REFERENCED'}));
 expect(products.get(a.id)).toEqual(a);
});
it('a later merge includes every previously merged raw member in QR conflicts and business references',()=>{
 const a=product('A'),b=product('B'),c=product('C');
 const insert=db.prepare(`insert into product_qr_codes(product_id,purpose_id,name,target_url,status,created_at,updated_at) values(?,1,'真实QR',?,'active','then','now')`);
 const bQr=Number(insert.run(b.id,'https://example.com/1111111').lastInsertRowid),cQr=Number(insert.run(c.id,'https://example.com/2222222').lastInsertRowid);
 const batch=Number(db.prepare(`insert into material_batches(relative_path,product_directory,name,recognition_status,product_id,first_seen_at,last_seen_at) values('B/旧批次','B','旧批次','recognized',?,'then','now')`).run(b.id).lastInsertRowid);
 const pdf=Number(db.prepare(`insert into pdf_files(relative_path,path_key,file_name,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present,material_batch_id) values('B/旧批次/原始.pdf','b/旧批次/原始.pdf','原始.pdf','unmatched','[]','source',123,'then','now',1,?)`).run(batch).lastInsertRowid);
 const bom=Number(db.prepare(`insert into bom_versions(product_id,version_number,business_change_date,created_at) values(?,1,'2026-10-20','then')`).run(b.id).lastInsertRowid);
 const first=service.mergePreview({primaryProductId:a.id,aliasProductIds:[b.id]});service.mergeConfirm({...first,confirmed:true,expectedFingerprint:first.fingerprint,expectedRevision:first.revision});
 const next=service.mergePreview({primaryProductId:a.id,aliasProductIds:[c.id]});
 expect(next.qrConflicts).toEqual([{purposeId:1,qrCodeIds:[bQr,cQr]}]);
 expect(next.references.find(ref=>ref.table==='product_qr_codes')?.ids).toEqual([bQr,cQr]);
 expect(next.references.find(ref=>ref.table==='material_batches')?.ids).toEqual([batch]);expect(next.references.find(ref=>ref.table==='pdf_files')?.ids).toEqual([pdf]);expect(next.references.find(ref=>ref.table==='bom_versions')?.ids).toEqual([bom]);
 expect(next.versions).toHaveLength(3);
 const before=db.prepare('select * from product_qr_codes order by id').all();service.mergeConfirm({...next,confirmed:true,expectedFingerprint:next.fingerprint,expectedRevision:next.revision});
 expect(db.prepare('select * from product_qr_codes order by id').all()).toEqual(before);expect(service.resources(next.versions[0].id).qrCodes.map(q=>q.id)).toEqual([bQr,cQr]);
});
it('activation clears every alias legacy BOM pointer, sets only the selected raw owner and preserves old BOM facts',()=>{
 const a=product('A'),b=product('B'),c=product('C'),versions=[a,b,c].map(p=>service.list(p.id).items[0]);
 const insert=db.prepare(`insert into bom_versions(product_id,version_number,business_change_date,appearance_version_id,created_at) values(?,1,'2026-10-20',?,'then')`);
 const bomIds=[a,b,c].map((p,index)=>Number(insert.run(p.id,versions[index].id).lastInsertRowid));
 for(let index=0;index<versions.length;index++){
  db.prepare('insert into bom_current(product_id,version_id,updated_at) values(?,?,?)').run([a,b,c][index].id,bomIds[index],'then');
  db.prepare('insert into appearance_bom_current(appearance_version_id,bom_version_id,updated_at) values(?,?,?)').run(versions[index].id,bomIds[index],'then');
 }
 const before=db.prepare('select * from bom_versions order by id').all();
 const preview=service.mergePreview({primaryProductId:a.id,aliasProductIds:[b.id,c.id]});service.mergeConfirm({...preview,confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision});
 const activate=(id:number)=>service.activate(id,{expectedRevision:service.get(id).revision,expectedIdentityRevision:service.list(a.id).revision});
 activate(versions[1].id);expect(db.prepare('select product_id,version_id from bom_current').all()).toEqual([{product_id:b.id,version_id:bomIds[1]}]);
 const empty=service.createDraft(a.id,{label:'尚未配置BOM'});activate(empty.id);expect(db.prepare('select * from bom_current').all()).toEqual([]);
 expect(db.prepare('select * from bom_versions order by id').all()).toEqual(before);expect(db.prepare('select * from appearance_bom_current').all()).toHaveLength(3);expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('explicit reuse preserves primary attribution and occupancy, blocks cleanup and retains immutable audit across identity merge',()=>{
 const a=product('A'),b=product('B'),primary=service.list(b.id).items[0],target=service.createDraft(b.id,{label:'复用目标'});
 const record=Number(db.prepare(`insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,product_id,first_seen_at,last_seen_at) values('02.0209.010.0401001','02','0209','01','0','04','01',1,?,'then','now')`).run(b.id).lastInsertRowid);
 db.prepare("insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,updated_at) values('historical',?,?,?,'manual','then')").run(record,b.id,primary.id);
 const reuse=db.prepare("insert into drawing_appearance_usages(origin,record_id,product_id,appearance_version_id,reason,created_at) values('historical',?,?,?,'经确认复用','now')");reuse.run(record,b.id,target.id);
 db.prepare("insert into drawing_appearance_usage_audit(origin,record_id,product_id,appearance_version_id,reason,evidence_json,created_at) values('historical',?,?,?,'经确认复用','{\"confirmed\":true}','now')").run(record,b.id,target.id);
 expect(()=>reuse.run(record,b.id,target.id)).toThrow('UNIQUE');expect(()=>reuse.run(record,a.id,service.list(a.id).items[0].id)).toThrow('复用图号或目标外观归属无效');
 expect(service.resources(target.id).drawings).toEqual([{id:record,origin:'historical',fullCode:'02.0209.010.0401001',source:'explicit-reuse'}]);expect(db.prepare('select * from bom_items').all()).toEqual([]);
 expect(new ProductCleanupService(db).preview(b.id).blockers.join('；')).toContain('外观图号复用');
 for(const sql of ["update drawing_appearance_usages set reason='篡改'",'delete from drawing_appearance_usages',"update drawing_appearance_usage_audit set reason='篡改'",'delete from drawing_appearance_usage_audit',`delete from historical_drawing_numbers where id=${record}`,`update historical_drawing_numbers set deletion_mode='release' where id=${record}`,'delete from drawing_appearance_bindings',`update drawing_appearance_bindings set appearance_version_id=${target.id}`])expect(()=>db.exec(sql)).toThrow();
 const raw=db.prepare('select * from historical_drawing_numbers').all(),audit=db.prepare('select * from drawing_appearance_usage_audit').all();
 const preview=service.mergePreview({primaryProductId:a.id,aliasProductIds:[b.id]});service.mergeConfirm({...preview,confirmed:true,expectedFingerprint:preview.fingerprint,expectedRevision:preview.revision});
 expect(db.prepare('select * from historical_drawing_numbers').all()).toEqual(raw);expect(db.prepare('select * from drawing_appearance_usage_audit').all()).toEqual(audit);expect(db.prepare('select product_id,appearance_version_id from drawing_appearance_usages').get()).toEqual({product_id:a.id,appearance_version_id:target.id});expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('reuse accepts a confirmed scan binding with null raw ownership and protects the target identity',()=>{
 const p=product(),primary=service.list(p.id).items[0],target=service.createDraft(p.id,{label:'复用扫描资料'});
 const record=Number(db.prepare(`insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,first_seen_at,last_seen_at) values('02.0209.010.0401001','02','0209','01','0','04','01',1,'then','now')`).run().lastInsertRowid);
 db.prepare("insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,updated_at) values('historical',?,?,?,'manual','then')").run(record,p.id,primary.id);
 db.prepare("insert into drawing_appearance_usages(origin,record_id,product_id,appearance_version_id,reason,created_at) values('historical',?,?,?,'确认扫描资料复用','now')").run(record,p.id,target.id);
 expect(db.prepare('select product_id from historical_drawing_numbers where id=?').get(record)).toEqual({product_id:null});
 expect(()=>products.update(p.id,{...p,model:'改写复用身份'})).toThrowError(expect.objectContaining({code:'PRODUCT_REFERENCED'}));expect(()=>products.delete(p.id)).toThrowError(expect.objectContaining({code:'PRODUCT_REFERENCED'}));
 expect(new ProductCleanupService(db).preview(p.id).blockers.join('；')).toContain('外观图号复用');expect(service.resources(target.id).drawings).toHaveLength(1);
});
it('version resources use actual BOM membership and deduplicate primary, reuse and BOM evidence',()=>{
 const p=product(),version=service.list(p.id).items[0],dictionaries=new DictionaryService(db),main=dictionaries.create({type:'main_category',code:'04',name:'印刷件'});
 const bom=Number(db.prepare("insert into bom_versions(product_id,version_number,appearance_version_id,created_at) values(?,1,?,'then')").run(p.id,version.id).lastInsertRowid);
 const ids=[1,2].map(sequence=>{
  const project=dictionaries.create({type:'project_item',code:`0${sequence}`,name:`资料${sequence}`,parentId:main.id});
  const record=Number(db.prepare(`insert into historical_drawing_numbers(full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,product_id,first_seen_at,last_seen_at) values(?,'02','0209','01','0','04',?,1,?,'then','now')`).run(`02.0209.010.040${sequence}001`,`0${sequence}`,p.id).lastInsertRowid);
  db.prepare('insert into bom_items(bom_version_id,project_item_id,historical_drawing_id) values(?,?,?)').run(bom,project.id,record);
  db.prepare(`insert into pdf_files(relative_path,path_key,file_name,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present,historical_drawing_id) values(?,?,?,'matched','[]','source',123,'then','now',1,?)`).run(`${sequence}.pdf`,`${sequence}.pdf`,`${sequence}.pdf`,record);
  return record;
 });
 db.prepare("insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,updated_at) values('historical',?,?,?,'manual','then')").run(ids[1],p.id,version.id);
 db.prepare("insert into drawing_appearance_usages(origin,record_id,product_id,appearance_version_id,reason,created_at) values('historical',?,?,?,'显式确认','now')").run(ids[1],p.id,version.id);
 const resources=service.resources(version.id);expect(resources.drawings).toHaveLength(2);expect(resources.pdfs).toHaveLength(2);
 expect(resources.drawings.find(row=>row.id===ids[0])?.source).toBe('bom-usage');expect(resources.drawings.find(row=>row.id===ids[1])?.source).toBe('manual');expect(resources.unboundCounts).toMatchObject({drawings:0,pdfs:0});
 db.prepare('update bom_versions set deleted_at=? where id=?').run('deleted',bom);const remaining=service.resources(version.id);expect(remaining.drawings.map(row=>row.id)).toEqual([ids[1]]);expect(remaining.pdfs).toHaveLength(1);expect(remaining.unboundCounts).toMatchObject({drawings:1,pdfs:1});
});
it('version resources read frozen legacy and V2 appearance contexts while preserving unconfirmed packages',()=>{
 const p=product(),version=service.list(p.id).items[0],other=service.createDraft(p.id,{label:'另一外观'});
 const identities=[{appearanceContext:{appearanceVersionId:version.id}},{workflowVersion:2},{workflowVersion:2},{workflowVersion:2,appearance:{id:version.id}},{model:p.model},{appearanceContext:{appearanceVersionId:other.id}}];
 const packageIds=identities.map((identity,index)=>Number(db.prepare(`insert into outbound_packages(product_id,material_type,package_mode,package_name,zip_relative_path,status,created_at,product_identity_json) values(?,'initial','current_complete',?,?,'completed','then',?)`).run(p.id,`冻结包${index}`,`${index}.zip`,JSON.stringify(identity)).lastInsertRowid));
 const snapshot=db.prepare("insert into outbound_v2_snapshots(package_id,context_json,files_json,parts_json) values(?,?,'[]','[]')");
 snapshot.run(packageIds[1],JSON.stringify({request:{appearanceVersionId:version.id}}));snapshot.run(packageIds[2],JSON.stringify({appearance:{id:version.id}}));
 const packagesBefore=db.prepare('select * from outbound_packages order by id').all(),snapshotsBefore=db.prepare('select * from outbound_v2_snapshots order by package_id').all();
 const resources=service.resources(version.id);expect(resources.outboundPackages.map(row=>row.id)).toEqual(packageIds.slice(0,4));expect(resources.unboundCounts.outboundPackages).toBe(1);
 expect(service.resources(other.id).outboundPackages.map(row=>row.id)).toEqual([packageIds[5]]);expect(db.prepare('select * from outbound_packages order by id').all()).toEqual(packagesBefore);expect(db.prepare('select * from outbound_v2_snapshots order by package_id').all()).toEqual(snapshotsBefore);
});
