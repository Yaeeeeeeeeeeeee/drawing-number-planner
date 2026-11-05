import {createHash} from 'node:crypto';
const requireHash=(value:string)=>createHash('sha256').update(value).digest('hex');
import {FileRepository} from '../../src/core/files/file-repository';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DrawingForceReleaseService } from '../../src/core/drawings/drawing-force-release-service';
import { DrawingDeletionError, DrawingDeletionService } from '../../src/core/drawings/drawing-deletion-service';
import { DrawingQueryService } from '../../src/core/drawings/drawing-query-service';
import { OccupiedNumberRepository } from '../../src/core/planning/occupied-number-repository';
import { PlanningService } from '../../src/core/planning/planning-service';
import { BomRepository } from '../../src/core/bom/bom-repository';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let service: DrawingDeletionService;
let plannedId: number;
let historicalId: number;
const plannedCode = '02.0209.010.0401001';
const historicalCode = '02.0209.010.0401002';

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  db.exec(`
    insert into dictionary_items (type, code, name, status, created_at) values
      ('brand', '02', 'SAMKYO', 'active', '2026-09-22'),
      ('product_size', '0209', '冰柜', 'active', '2026-09-22'),
      ('appearance', '01', '标准', 'active', '2026-09-22'),
      ('color', '0', '白色', 'active', '2026-09-22'),
      ('main_category', '04', '印刷件类', 'active', '2026-09-22');
    insert into dictionary_items (type, code, name, parent_id, status, created_at)
      select 'project_item', '01', 'LOGO', id, 'active', '2026-09-22'
      from dictionary_items where type = 'main_category' and code = '04';
    insert into products (sku, model, product_category, brand_id, product_size_id, default_appearance_id, status, created_at)
      select 'SKU-DELETE', 'T40', '冰柜', brand.id, size.id, appearance.id, 'active', '2026-09-22'
      from dictionary_items brand, dictionary_items size, dictionary_items appearance
      where brand.type = 'brand' and size.type = 'product_size' and appearance.type = 'appearance';
  `);
  const refs = db.prepare(`select product.id as productId, appearance.id as appearanceId, color.id as colorId,
      main.id as mainId, project.id as projectId from products product, dictionary_items appearance,
      dictionary_items color, dictionary_items main, dictionary_items project
    where appearance.type = 'appearance' and color.type = 'color' and main.type = 'main_category'
      and project.type = 'project_item'`).get() as Record<string, number>;
  plannedId = Number(db.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, created_at) values (?, 'planned', ?, ?, ?, ?, ?, '02', '0209', '01', '0', '04', '01', 1, 'active', '2026-09-22')`)
    .run(plannedCode, refs.productId, refs.appearanceId, refs.colorId, refs.mainId, refs.projectId).lastInsertRowid);
  historicalId = Number(db.prepare(`insert into historical_drawing_numbers
    (full_code, product_id, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, status, first_seen_at, last_seen_at)
    values (?, ?, '02', '0209', '01', '0', '04', '01', 2, 'active', '2026-09-22', '2026-09-22')`)
    .run(historicalCode, refs.productId).lastInsertRowid);
  service = new DrawingDeletionService(db);
});

afterEach(() => db.close());

describe('V5 independent force release', () => {
  it('keeps old PDF isolated after force release, same-code reservation, index deletion and rescan',async()=>{
    const refs=db.prepare('select * from drawing_numbers where id=?').get(plannedId) as any;
    const repository=new FileRepository(db);
    const record={relativePath:'C/SKU-M/03.量产后的变更文件/首批大货/old.pdf',fileName:'old.pdf',drawingId:plannedId,matchStatus:'matched' as const,detectedCodes:[plannedCode],conversionType:'outlined' as const,sizeBytes:69_000_000,modifiedAt:'now'};
    repository.replaceScan([record],[],'now');
    const force=new DrawingForceReleaseService(db);
    expect(force.preview(plannedId).references.pdf).toBe(1);
    force.confirm({signedId:plannedId,fingerprint:force.preview(plannedId).fingerprint,confirmed:true});
    const reserved=new PlanningService(db).reserve({productId:refs.product_id,appearanceId:refs.appearance_id,rows:[{clientId:'new',colorId:refs.color_id,mainCategoryId:refs.main_category_id,projectItemId:refs.project_item_id,expectedFullCode:plannedCode}]});
    const newDrawing=db.prepare('select id from drawing_numbers where full_code=?').get(plannedCode) as {id:number};
    expect(newDrawing.id).not.toBe(plannedId);
    db.exec('delete from pdf_files');
    repository.replaceScan([{...record,drawingId:newDrawing.id}],[],'later');
    expect(db.prepare('select drawing_id,historical_drawing_id,match_status,classification_warning from pdf_files').get()).toEqual({drawing_id:null,historical_drawing_id:null,match_status:'pending',classification_warning:'drawing-force-released'});
    expect(new DrawingQueryService(db).get(newDrawing.id).outlinedFiles).toEqual([]);
    expect(()=>db.prepare("update pdf_files set drawing_id=?,match_status='matched'").run(newDrawing.id)).toThrow(/旧 PDF/);
    expect(()=>db.prepare('delete from drawing_numbers where id=?').run(plannedId)).toThrow(/原身份/);
    expect(force.preview(newDrawing.id).references).toMatchObject({bomSnapshots:0,outboundSnapshots:0});
    const dir=mkdtempSync(join(tmpdir(),'v5-force-reopen-'));
    try{await db.backup(join(dir,'test.db'));const reopened=openDatabase(join(dir,'test.db'));try{
      expect(reopened.pragma('foreign_key_check')).toEqual([]);
      expect(reopened.prepare('select count(*) n from drawing_force_releases').get()).toEqual({n:1});
      expect(()=>new DrawingDeletionService(reopened).restore(plannedId)).toThrow(/强制/);
    }finally{reopened.close();}}finally{rmSync(dir,{recursive:true,force:true});}
  });
  it.each(['item','snapshot'])('isolates old %s paths without an index, moved files and snapshot-only product owners',kind=>{
    const refs=db.prepare('select * from drawing_numbers where id=?').get(plannedId) as any;
    const other=Number(db.prepare("insert into products(sku,brand_id,product_size_id,default_appearance_id,model,product_category,created_at) select 'other-snapshot',brand_id,product_size_id,default_appearance_id,'OtherSnapshot','Other','now' from products where id=?").run(refs.product_id).lastInsertRowid);
    const pkg=Number(db.prepare("insert into outbound_packages(product_id,material_type,package_mode,package_name,zip_relative_path,status,created_at) values(?,'initial','current_complete','old-only','old-only.zip','completed','now')").run(other).lastInsertRowid);
    const oldPath='C/SKU-M/03.量产后的变更文件/首批大货/old-without-index.pdf';
    if(kind==='item')db.prepare("insert into outbound_package_items(package_id,project_item_id,drawing_id,project_item_name_snapshot,drawing_code_snapshot,file_name_snapshot,relative_path_snapshot,source_batch_name_snapshot) values(?,?,?,'project',?,'old.pdf',?,'old batch')").run(pkg,refs.project_item_id,plannedId,plannedCode,oldPath);
    else db.prepare("insert into outbound_v2_snapshots(package_id,context_json,files_json,parts_json) values(?,'{}',?,'[]')").run(pkg,JSON.stringify([{drawingId:plannedId,fullCode:plannedCode,relativePath:oldPath}]));
    const force=new DrawingForceReleaseService(db),preview=force.preview(plannedId);
    expect(preview.affectedProductIds).toContain(other);
    force.confirm({signedId:plannedId,fingerprint:preview.fingerprint,confirmed:true});
    expect(db.prepare('select relative_path from drawing_force_release_files where full_code=?').all(plannedCode)).toContainEqual({relative_path:oldPath});
    new PlanningService(db).reserve({productId:refs.product_id,appearanceId:refs.appearance_id,rows:[{clientId:'new',colorId:refs.color_id,mainCategoryId:refs.main_category_id,projectItemId:refs.project_item_id,expectedFullCode:plannedCode}]});
    const next=db.prepare('select id from drawing_numbers where full_code=?').get(plannedCode) as {id:number};
    const repository=new FileRepository(db);
    repository.replaceScan([{relativePath:oldPath.replace('old-without-index','moved-old-file'),fileName:'moved-old-file.pdf',drawingId:next.id,matchStatus:'matched',detectedCodes:[plannedCode],conversionType:'outlined',sizeBytes:10,modifiedAt:'now'}],[],'later');
    expect(db.prepare('select drawing_id,historical_drawing_id,match_status from pdf_files').get()).toEqual({drawing_id:null,historical_drawing_id:null,match_status:'pending'});
    expect(new DrawingQueryService(db).get(next.id).outlinedFiles).toEqual([]);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it('preserves an explicit new-generation PDF association across rescans only while content is unchanged',()=>{
    const refs=db.prepare('select * from drawing_numbers where id=?').get(plannedId) as any;
    const force=new DrawingForceReleaseService(db);force.confirm({signedId:plannedId,fingerprint:force.preview(plannedId).fingerprint,confirmed:true});
    new PlanningService(db).reserve({productId:refs.product_id,appearanceId:refs.appearance_id,rows:[{clientId:'new-manual',colorId:refs.color_id,mainCategoryId:refs.main_category_id,projectItemId:refs.project_item_id,expectedFullCode:plannedCode}]});
    const next=db.prepare('select id from drawing_numbers where full_code=?').get(plannedCode) as {id:number};
    const file={relativePath:'C/SKU-M/03.量产后的变更文件/首批大货/explicit-new.pdf',fileName:'explicit-new.pdf',drawingId:next.id,matchStatus:'matched' as const,detectedCodes:[plannedCode],conversionType:'outlined' as const,sizeBytes:10,modifiedAt:'now',contentSha256:'a'.repeat(64)};
    const repository=new FileRepository(db);repository.replaceScan([{...file}],[],'first');
    const pdf=db.prepare('select id from pdf_files').get() as {id:number};
    new DrawingQueryService(db).associatePdf(next.id,pdf.id,'outlined');
    repository.replaceScan([{...file}],[],'same-content');
    expect(db.prepare('select drawing_id,match_status from pdf_files').get()).toEqual({drawing_id:next.id,match_status:'matched'});
    repository.replaceScan([{...file,contentSha256:'b'.repeat(64)}],[],'changed-content');
    expect(db.prepare('select drawing_id,match_status from pdf_files').get()).toEqual({drawing_id:null,match_status:'pending'});
  });
  it('releases both occupying origins for an identical complete code in one confirmed transaction',()=>{
    db.prepare('update historical_drawing_numbers set full_code=? where id=?').run(plannedCode,historicalId);
    const force=new DrawingForceReleaseService(db),preview=force.preview(plannedId);
    expect(preview.references.drawingRecords).toBe(2);
    expect(preview.affectedIdentities).toEqual([{signedId:plannedId,origin:'planned'},{signedId:-historicalId,origin:'historical'}]);
    force.confirm({signedId:plannedId,fingerprint:preview.fingerprint,confirmed:true});
    expect(new OccupiedNumberRepository(db).hasFullCode(plannedCode)).toBe(false);
    expect(new DrawingQueryService(db).search({deletionState:'all'}).total).toBe(0);
    expect(db.prepare('select count(*) n from drawing_force_releases').get()).toEqual({n:2});
  });
  it('preserves cross-product outbound immutable snapshots, BOM facts and reuse history',()=>{
    const row=db.prepare('select * from drawing_numbers where id=?').get(plannedId) as any;
    const other=Number(db.prepare("insert into products(sku,model,product_category,brand_id,product_size_id,default_appearance_id,status,created_at) select 'other','T40',product_category,brand_id,product_size_id,default_appearance_id,'active','now' from products where id=?").run(row.product_id).lastInsertRowid);
    const version=Number(db.prepare("insert into bom_versions(product_id,version_number,created_at) values(?,1,'now')").run(other).lastInsertRowid);
    db.prepare('insert into bom_items(bom_version_id,project_item_id,drawing_id) values(?,?,?)').run(version,row.project_item_id,plannedId);
    db.prepare("insert into bom_current(product_id,version_id,updated_at) values(?,?,'now')").run(other,version);
    const pkg=Number(db.prepare("insert into outbound_packages(product_id,material_type,package_mode,package_name,zip_relative_path,status,created_at) values(?,'initial','current_complete','old','old.zip','completed','now')").run(other).lastInsertRowid);
    db.prepare("insert into outbound_package_items(package_id,project_item_id,drawing_id,project_item_name_snapshot,drawing_code_snapshot,file_name_snapshot,relative_path_snapshot,source_batch_name_snapshot) values(?,?,?,'project',?,'old.pdf','old.pdf','old')").run(pkg,row.project_item_id,plannedId,plannedCode);
    const json=JSON.stringify([{drawingId:plannedId,fullCode:plannedCode}]);
    db.prepare("insert into outbound_v2_snapshots(package_id,context_json,files_json,parts_json) values(?,'{}',?,'[]')").run(pkg,json);
    const appearance=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,1,'current','current','now')").run(row.product_id).lastInsertRowid);
    db.prepare('insert or ignore into product_identity_members(raw_product_id,canonical_product_id) values(?,?)').run(row.product_id,row.product_id);
    db.prepare("insert into drawing_appearance_usages(origin,record_id,product_id,appearance_version_id,reason,created_at) values('planned',?,?,?,'reuse','now')").run(plannedId,row.product_id,appearance);
    const before=db.prepare('select * from outbound_package_items').all();
    const force=new DrawingForceReleaseService(db),preview=force.preview(plannedId);
    expect(preview.references).toMatchObject({currentBom:1,outboundItems:1,outboundSnapshots:1,appearanceUsages:1,products:2});
    expect(preview.affectedProductIds).toEqual([row.product_id,other]);
    expect(service.preview(plannedId).releaseEligible).toBe(false);
    force.confirm({signedId:plannedId,fingerprint:preview.fingerprint,confirmed:true});
    expect(db.prepare('select * from outbound_package_items').all()).toEqual(before);
    expect(db.prepare('select files_json from outbound_v2_snapshots').get()).toEqual({files_json:json});
    expect(db.prepare('select count(*) n from drawing_appearance_usages').get()).toEqual({n:1});
    expect(()=>db.prepare('delete from outbound_v2_snapshots').run()).toThrow(/不可删除/);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it.each(['planned', 'historical'])('releases protected %s identity with exact impact confirmation', (origin) => {
    const id=origin==='planned'?plannedId:-historicalId;
    const code=origin==='planned'?plannedCode:historicalCode;
    const force=new DrawingForceReleaseService(db);
    expect(service.preview(id).releaseEligible).toBe(false);
    const preview=force.preview(id);
    expect(()=>force.confirm({signedId:id,fingerprint:preview.fingerprint,confirmed:false})).toThrow(/确认/);
    expect(force.confirm({signedId:id,fingerprint:preview.fingerprint,confirmed:true})).toMatchObject({fullCode:code,occupied:false});
    expect(new OccupiedNumberRepository(db).hasFullCode(code)).toBe(false);
    expect(new DrawingQueryService(db).search({deletionState:'all'}).items.some(row=>row.id===id)).toBe(false);
    expect(()=>service.restore(id)).toThrow(/强制/);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it('counts deleted BOM and immutable correction snapshots; refuses stale impact',()=>{
    const version=Number(db.prepare("insert into bom_versions(product_id,version_number,created_at,deleted_at) select product_id,1,'now','now' from drawing_numbers where id=?").run(plannedId).lastInsertRowid);
    db.prepare('insert into bom_items(bom_version_id,project_item_id,drawing_id) select ?,project_item_id,id from drawing_numbers where id=?').run(version,plannedId);
    const snapshot=JSON.stringify({items:[{origin:'planned',drawingId:plannedId,fullCode:plannedCode}]});
    db.prepare("insert into bom_revision_snapshots(bom_version_id,edit_revision,before_snapshot_json,after_snapshot_json,created_at) values(?,0,?,?,'now')").run(version,snapshot,snapshot);
    const force=new DrawingForceReleaseService(db);const preview=force.preview(plannedId);
    expect(preview.references).toMatchObject({deletedBom:1,bomSnapshots:1});
    db.prepare("update drawing_numbers set notes='changed' where id=?").run(plannedId);
    expect(()=>force.confirm({signedId:plannedId,fingerprint:preview.fingerprint,confirmed:true})).toThrow(/变化/);
    force.confirm({signedId:plannedId,fingerprint:force.preview(plannedId).fingerprint,confirmed:true});
    expect(db.prepare('select before_snapshot_json from bom_revision_snapshots').get()).toEqual({before_snapshot_json:snapshot});
    expect(db.prepare('select drawing_id from bom_items').get()).toEqual({drawing_id:plannedId});
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it('rolls back all release writes when PDF detachment fails',()=>{
    db.prepare("insert into pdf_files(relative_path,file_name,drawing_id,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present) values('old.pdf','old.pdf',?,'matched','[]','outlined',1,'now','now',1)").run(plannedId);
    db.exec("create trigger fail_detach before update on pdf_files begin select raise(abort,'injected'); end;");
    const force=new DrawingForceReleaseService(db);const preview=force.preview(plannedId);
    expect(()=>force.confirm({signedId:plannedId,fingerprint:preview.fingerprint,confirmed:true})).toThrow('injected');
    expect(new OccupiedNumberRepository(db).hasFullCode(plannedCode)).toBe(true);
    expect(db.prepare('select count(*) n from drawing_force_releases').get()).toEqual({n:0});
    expect(db.prepare('select count(*) n from drawing_force_release_files').get()).toEqual({n:0});
  });
});


it('never rediscovers released old bytes as a new drawing generation through read-only detail fallback',()=>{
 const root=mkdtempSync(join(tmpdir(),'v52-force-observation-'));
 try{
  const original=db.prepare('select * from drawing_numbers where id=?').get(plannedId) as any;
  const relativePath=`冰柜/SKU-DELETE-T40/02.未转曲源文件/${plannedCode}.pdf`;
  mkdirSync(join(root,relativePath,'..'),{recursive:true});writeFileSync(join(root,relativePath),'old bytes');
  new FileRepository(db).replaceScan([{relativePath,fileName:`${plannedCode}.pdf`,drawingId:plannedId,matchStatus:'matched',detectedCodes:[plannedCode],conversionType:'source',sizeBytes:9,modifiedAt:'now'}],[],'now');
  const force=new DrawingForceReleaseService(db);force.confirm({signedId:plannedId,fingerprint:force.preview(plannedId).fingerprint,confirmed:true});
  new PlanningService(db).reserve({productId:original.product_id,appearanceId:original.appearance_id,rows:[{clientId:'replacement',colorId:original.color_id,mainCategoryId:original.main_category_id,projectItemId:original.project_item_id,expectedFullCode:plannedCode}]});
  const current=db.prepare('select id from drawing_numbers where full_code=?').get(plannedCode) as {id:number};
  const query=new DrawingQueryService(db,()=>root);
  expect(query.get(current.id).fileObservation?.source.entries).toEqual([]);
  expect(()=>query.resolveObservedFile({kind:'drawing-file',origin:'planned',recordId:current.id,relativePath})).toThrow();
  const newPath=relativePath.replace('.pdf','-new.pdf');writeFileSync(join(root,newPath),'new bytes');
  // A code-only match at a moved/new path is still not a confirmed generation link.
  expect(query.get(current.id).fileObservation?.source.entries).toEqual([]);
  const crypto=requireHash('new bytes');
  const pdfId=Number(db.prepare(`insert into pdf_files(relative_path,file_name,match_status,detected_codes_json,conversion_type,size_bytes,modified_at,scanned_at,is_present,content_sha256)values(?,?,'pending','[]','source',9,'now','now',1,?)`).run(newPath,`${plannedCode}-new.pdf`,crypto).lastInsertRowid);
  query.associatePdf(current.id,pdfId,'source');
  expect(query.get(current.id).fileObservation?.source.entries[0].files[0].pdfIndexId).toBe(pdfId);
  writeFileSync(join(root,newPath),'changed bytes');
  expect(query.get(current.id).fileObservation?.source.entries).toEqual([]);
  expect(()=>query.resolveObservedFile({kind:'drawing-file',origin:'planned',recordId:current.id,relativePath:newPath})).toThrow();
 }finally{rmSync(root,{recursive:true,force:true});}
});
