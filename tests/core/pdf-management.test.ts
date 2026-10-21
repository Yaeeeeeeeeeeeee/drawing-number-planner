import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, statSync, utimesSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { MaterialBatchService } from '../../src/core/files/material-batch-service';
let db: PlannerDatabase; let dir: string; let service: FileService;
beforeEach(() => {
 db = openDatabase(':memory:'); migrateDatabase(db, {databaseExists:false,createBackup:()=>undefined});
 dir=mkdtempSync(join(tmpdir(),'pdf-management-'));
 service=new FileService(new FileRepository(db),new WorkspaceSettingsStore(join(dir,'settings.json')));
 service.updateSettings({workspaceRoot:dir});
});
afterEach(()=>{ db.close(); rmSync(dir,{recursive:true,force:true}); });
function apply(ids:number[], action:'clear'|'ignore'|'restore') {const p=service.previewManagement({ids,action});return service.applyManagement(p);}
it('keeps same-name and same-content copies independent, survives clear/rescan, and marks changed ignored content for review',async()=>{
 mkdirSync(join(dir,'a'));mkdirSync(join(dir,'b'));writeFileSync(join(dir,'a','same.pdf'),'%PDF copy');writeFileSync(join(dir,'b','same.pdf'),'%PDF copy');
 await service.scan();const files=service.search().items;const a=files.find(f=>f.relativePath.startsWith('a'))!;
 expect(apply([a.id],'ignore').changed).toBe(1);expect(service.search().total).toBe(1);
 expect(service.search({managementState:'ignored'}).items.map(f=>f.id)).toEqual([a.id]);
 apply([a.id],'clear');await service.scan();expect(service.search({managementState:'ignored'}).total).toBe(1);
 writeFileSync(join(dir,'a','same.pdf'),'%PDF changed content');await service.scan();
 const changed=service.search({managementState:'needs_review'}).items[0];expect(changed).toBeDefined();expect(service.search().total).toBe(1);
 apply([changed.id],'restore');expect(service.search().total).toBe(2);expect(readFileSync(join(dir,'a','same.pdf'),'utf8')).toBe('%PDF changed content');
});
it('blocks referenced historical identities including SET NULL references and refuses stale previews',async()=>{
 writeFileSync(join(dir,'plain.pdf'),'%PDF original');await service.scan();const id=service.search().items[0].id;
 const preview=service.previewManagement({ids:[id],action:'clear'});
 db.exec('create table test_old_bom(id integer primary key, pdf_id integer references pdf_files(id) on delete set null, snapshot text)');
 db.prepare('insert into test_old_bom(pdf_id,snapshot) values (?,?)').run(id,'old frozen BOM');
 expect(()=>service.applyManagement(preview)).toThrow('重新预览');
 const protectedPreview=service.previewManagement({ids:[id],action:'clear'});expect(protectedPreview.blocked).toBe(1);
 expect(service.applyManagement(protectedPreview)).toMatchObject({changed:0});
 expect(db.prepare('select * from test_old_bom').get()).toEqual({id:1,pdf_id:id,snapshot:'old frozen BOM'});
 expect(()=>service.clearIndex('清空资料库索引')).toThrow('业务引用');
 expect(readFileSync(join(dir,'plain.pdf'),'utf8')).toBe('%PDF original');
});
it('keeps historical drawing identity and QR indices unchanged by PDF clear or scan',async()=>{
 writeFileSync(join(dir,'02.0404.010.0401001-history.pdf'),'%PDF old drawing');await service.scan();
 const before=db.prepare('select * from historical_drawing_numbers').all();const id=service.search().items[0].id;
 expect(service.previewManagement({ids:[id],action:'clear'}).blocked).toBe(1);
 apply([id],'ignore');
 expect(db.prepare('select * from historical_drawing_numbers').all()).toEqual(before);
 await service.scan();
 expect(db.prepare('select id,full_code from historical_drawing_numbers').all()).toEqual([{id:1,full_code:'02.0404.010.0401001'}]);
 expect(service.search({managementState:'ignored'}).total).toBe(1);
});
it('renames only batch display metadata, scanner preserves it and duplicate display names remain separate IDs',async()=>{
 const base=join(dir,'01.洗碗机','SKU-T40','03.量产后的变更文件');
 for(const name of ['00.首批大货','01.20241210']){mkdirSync(join(base,name),{recursive:true});writeFileSync(join(base,name,'plain.pdf'),'%PDF');}
 await service.scan();const batches=new MaterialBatchService(db);const old=batches.list();expect(old).toHaveLength(2);
 for(const b of old)batches.rename(b.id,'统一显示名称',0);
 await service.scan();expect(batches.list().map(b=>b.name)).toEqual(['统一显示名称','统一显示名称']);
 expect(batches.list().map(b=>b.relativePath).sort()).toEqual(old.map(b=>b.relativePath).sort());
 expect(batches.diagnostics().batches.every(b=>b.sameDisplayNameIds.length===1)).toBe(true);
});
it('PDF scan and clearing a disposable index leave every historical QR row and trace unchanged',async()=>{
 db.prepare(`insert into qr_code_files(relative_path,path_key,file_name,mime_type,size_bytes,modified_at,match_status,is_present,first_seen_at,last_seen_at)
 values('legacy.png','legacy.png','legacy.png','image/png',12,'old','pending',1,'old','old')`).run();
 const qr=db.prepare('select * from qr_code_files').all();
 writeFileSync(join(dir,'plain.pdf'),'%PDF');await service.scan();
 apply([service.search().items[0].id],'clear');
 expect(db.prepare('select * from qr_code_files').all()).toEqual(qr);
 expect(db.prepare('select count(*) as n from file_scan_runs').get()).toEqual({n:1});
});
it('preserves ignore decisions independently for distinct workspace roots',async()=>{
 const a=join(dir,'rootA'), b=join(dir,'rootB');mkdirSync(a);mkdirSync(b);
 writeFileSync(join(a,'same.pdf'),'%PDF same');writeFileSync(join(b,'same.pdf'),'%PDF same');
 service.updateSettings({workspaceRoot:a});await service.scan();apply([service.search().items[0].id],'ignore');
 service.updateSettings({workspaceRoot:b});await service.scan();expect(service.search().total).toBe(1);
 service.updateSettings({workspaceRoot:a});await service.scan();expect(service.search({managementState:'ignored'}).total).toBe(1);
});

it('rechecks decided content even when size and modification time are unchanged, and rejects physical changes after preview',async()=>{
 const path=join(dir,'plain.pdf');writeFileSync(path,'%PDF AAAA');await service.scan();const id=service.search().items[0].id;
 const preview=service.previewManagement({ids:[id],action:'ignore'});const stat=statSync(path);
 writeFileSync(path,'%PDF BBBB');utimesSync(path,stat.atime,stat.mtime);
 expect(()=>service.applyManagement(preview)).toThrow('重新预览');
 await service.scan();apply([id],'ignore');const ignoredStat=statSync(path);
 writeFileSync(path,'%PDF CCCC');utimesSync(path,ignoredStat.atime,ignoredStat.mtime);await service.scan();
 expect(service.search({managementState:'needs_review'}).items[0].id).toBe(id);
});
it('restoring a PDF never changes its drawing, historical BOM, or outbound references',async()=>{
 writeFileSync(join(dir,'02.0404.010.0401001.pdf'),'%PDF retained');await service.scan();
 const file=service.search().items[0];db.exec('create table frozen_history(id integer primary key,pdf_id integer references pdf_files(id) on delete set null,payload text)');
 db.prepare('insert into frozen_history(pdf_id,payload) values(?,?)').run(file.id,'{"frozen":"old snapshot"}');
 const before=db.prepare('select * from frozen_history').all();const drawingId=file.historicalDrawingId;
 apply([file.id],'ignore');apply([file.id],'restore');
 expect(db.prepare('select * from frozen_history').all()).toEqual(before);
 expect(service.search().items[0]).toMatchObject({id:file.id,historicalDrawingId:drawingId,fullCode:file.fullCode});
});

it('blocks clearing an unrecognized PDF referenced only by the immutable V2 outbound manifest',async()=>{
 writeFileSync(join(dir,'unrecognized.pdf'),'%PDF exact historical bytes');await service.scan();const file=service.search().items[0];
 const dict=new DictionaryService(db);const brand=dict.create({type:'brand',code:'02',name:'Brand'});const size=dict.create({type:'product_size',code:'0404',name:'Size'});const appearance=dict.create({type:'appearance',code:'01',name:'Appearance'});
 const product=new ProductService(db).create({sku:'V2-PDF',model:'MODEL',productCategory:'分类',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});
 const packageId=Number(db.prepare(`insert into outbound_packages(product_id,material_type,package_mode,package_name,zip_relative_path,status,created_at)
 values(?,'initial','current_complete','old','old.zip','completed','old')`).run(product.id).lastInsertRowid);
 db.prepare('insert into outbound_v2_snapshots(package_id,context_json,files_json,parts_json) values(?,?,?,?)').run(packageId,'{}',JSON.stringify([{pdfFileId:file.id,sha256:'frozen-old-hash',relativePath:'unrecognized.pdf'}]),'[]');
 const before=db.prepare('select * from outbound_v2_snapshots').all();const preview=service.previewManagement({ids:[file.id],action:'clear'});
 expect(preview.entries[0].reason).toContain('outbound_v2_snapshots');expect(service.applyManagement(preview).changed).toBe(0);
 expect(db.prepare('select * from outbound_v2_snapshots').all()).toEqual(before);expect(service.search().items[0].id).toBe(file.id);
});

it('inherits ignore only for a reliable unique rename; ambiguous same-content destinations require persistent review',async()=>{
 const original=join(dir,'original.pdf');writeFileSync(original,'%PDF unique');await service.scan();apply([service.search().items[0].id],'ignore');
 renameSync(original,join(dir,'renamed.pdf'));await service.scan();expect(service.search({managementState:'ignored'}).items.filter(file=>file.isPresent).map(file=>file.fileName)).toEqual(['renamed.pdf']);
 unlinkSync(join(dir,'renamed.pdf'));writeFileSync(join(dir,'copy-a.pdf'),'%PDF unique');writeFileSync(join(dir,'copy-b.pdf'),'%PDF unique');
 await service.scan();expect(service.search({managementState:'needs_review'}).items.map(file=>file.fileName)).toEqual(['copy-a.pdf','copy-b.pdf']);
 await service.scan();expect(service.search({managementState:'needs_review'}).total).toBe(2);expect(service.search().total).toBe(0);
});

it('uses explicit confirmed drawing attribution for PDF product/version filters without rewriting scan identity',async()=>{
 writeFileSync(join(dir,'02.0404.010.0401001.pdf'),'%PDF attributed');await service.scan();const file=service.search().items[0];
 const dict=new DictionaryService(db);const brand=dict.create({type:'brand',code:'02',name:'Brand'});const size=dict.create({type:'product_size',code:'0404',name:'Size'});const appearance=dict.create({type:'appearance',code:'01',name:'Appearance'});
 const product=new ProductService(db).create({sku:'MANUAL-PDF',model:'Manual',productCategory:'分类',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});
 const version=db.prepare('select id from product_appearance_versions where product_id=?').get(product.id) as {id:number};
 const {DrawingAssociationService}=await import('../../src/core/drawings/drawing-association-service');
 new DrawingAssociationService(db).correct({signedId:-file.historicalDrawingId!,productId:product.id,appearanceVersionId:version.id},'人工核验');
 expect(service.search({productId:product.id,appearanceVersionId:version.id}).items).toEqual([expect.objectContaining({id:file.id,productId:product.id,model:'Manual'})]);
 expect(db.prepare('select product_id from historical_drawing_numbers where id=?').get(file.historicalDrawingId)).toEqual({product_id:null});
 expect(service.navigation().products).toContainEqual({productId:product.id,count:1});
 const target=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'沿用目标','draft','now')").run(product.id,appearance.id).lastInsertRowid);
 const {DrawingReuseService}=await import('../../src/core/drawings/drawing-reuse-service');const reuse=new DrawingReuseService(db);
 const input={signedId:-file.historicalDrawingId!,productId:product.id,appearanceVersionId:target,reason:'同产品新外观明确沿用'};
 const reusePreview=reuse.preview(input);reuse.confirm({...input,fingerprint:reusePreview.fingerprint,confirmed:true});
 expect(service.search({productId:product.id,appearanceVersionId:target}).items.map(row=>row.id)).toEqual([file.id]);
 expect(service.navigation().appearances).toContainEqual({appearanceVersionId:target,count:1});

});

it('keeps a real directory-matched scan unconfirmed in the drawing library until manual attribution',async()=>{
 const dict=new DictionaryService(db);const brand=dict.create({type:'brand',code:'02',name:'Brand'});const size=dict.create({type:'product_size',code:'0404',name:'Size'});const appearance=dict.create({type:'appearance',code:'01',name:'Appearance'});dict.create({type:'color',code:'0',name:'White'});
 const product=new ProductService(db).create({sku:'SCAN',model:'MODEL',productCategory:'分类',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id});
 const path=join(dir,'01.分类','SCAN-MODEL','03.量产后的变更文件','00.首批大货');mkdirSync(path,{recursive:true});writeFileSync(join(path,'02.0404.010.0401001.pdf'),'%PDF scanned evidence');await service.scan();
 const raw=db.prepare('select id,product_id,detected_sku,detected_model from historical_drawing_numbers').get() as {id:number;product_id:number;detected_sku:string;detected_model:string};
 expect(raw).toMatchObject({product_id:product.id,detected_sku:'SCAN',detected_model:'MODEL'});
 const {DrawingQueryService}=await import('../../src/core/drawings/drawing-query-service');const library=new DrawingQueryService(db);
 expect(library.search({associationState:'unassociated'}).items).toContainEqual(expect.objectContaining({id:-raw.id,productId:null}));
 expect(library.search({productId:product.id}).items).toEqual([]);expect(library.navigationCounts({}).products).toEqual([]);expect(library.navigationCounts({}).unassociated).toBe(1);
 const preview=library.associations.preview(undefined,[-raw.id]);expect(preview.records[0]).toMatchObject({state:'ready',automaticEligible:false});
 library.associations.confirm({targets:preview.records[0].targets,fingerprint:preview.fingerprint,reason:'人工核验目录与产品外观',confirmed:true});
 const version=db.prepare('select id from product_appearance_versions where product_id=?').get(product.id) as {id:number};
 expect(library.search({productId:product.id,appearanceVersionId:version.id}).items.map(row=>row.id)).toEqual([-raw.id]);expect(library.navigationCounts({}).products).toEqual([{productId:product.id,count:1}]);expect(library.navigationCounts({}).unassociated).toBe(0);
 expect(db.prepare('select id,product_id,detected_sku,detected_model from historical_drawing_numbers').get()).toEqual(raw);
});
