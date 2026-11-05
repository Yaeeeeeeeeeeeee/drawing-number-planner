import {ensureProductAppearance} from '../../src/core/products/appearance-identity';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { ProductCleanupService } from '../../src/core/products/product-cleanup-service';
import { QrRepository } from '../../src/core/qr/qr-repository';
import { MaterialBatchRepository } from '../../src/core/files/material-batch-repository';
import { DrawingDeletionService } from '../../src/core/drawings/drawing-deletion-service';
import { FileRepository } from '../../src/core/files/file-repository';
import { parseDrawingCode } from '../../src/core/drawings/drawing-code';
import { OccupiedNumberRepository } from '../../src/core/planning/occupied-number-repository';

let db: PlannerDatabase;
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); });
afterEach(() => db.close());
function fixture() {
  const d = new DictionaryService(db);
  const brandId = d.create({ type: 'brand', code: '02', name: 'B' }).id;
  const productSizeId = d.create({ type: 'product_size', code: '0209', name: 'S' }).id;
  const products = new ProductService(db);
  const product = products.create({ brandId, productSizeId, sku: 'SKU', model: 'T40', productCategory: '冰柜' });
  db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, product_id, first_seen_at, last_seen_at)
    values ('02.0209.010.0401001', '02', '0209', '01', '0', '04', '01', 1, ?, '2026-09-23', '2026-09-23')`).run(product.id);
  db.prepare(`insert into bom_versions (product_id, version_number, business_change_date, created_at)
    values (?, 1, '2026-09-23', '2026-09-23')`).run(product.id);
  db.prepare("insert into bom_current(product_id, version_id, updated_at) values (?, 1, '2026-09-23')").run(product.id);
  return { product, products };
}
function selection(service: ProductCleanupService, id: number, occupancy: 'retain_occupied' | 'release', history: 'retain' | 'purge') {
  const preview = service.preview(id);
  const choices = (preview as any).choices;
  expect(choices).toBeDefined();
  return { occupancy, history, expectedFingerprint: choices.fingerprint,
    confirmedHistory: history === 'purge' ? '永久清除历史' : undefined,
    confirmedCodes: occupancy === 'release' ? choices.occupiedDrawings.map((row: any) => ({ signedId: row.signedId, confirmedCode: row.fullCode })) : [] };
}
function linkedHistory() {
  const {product,products}=fixture();
  const dictionary=new DictionaryService(db);const main=dictionary.create({type:'main_category',code:'04',name:'印刷'});
  const project=dictionary.create({type:'project_item',parentId:main.id,code:'01',name:'说明书'});
  const other=products.create({...product,sku:'OTHER',model:'OTHER'});
  new QrRepository(db).ensurePurposeForProduct(product.id,1);
  db.prepare("insert into material_batches(relative_path,product_directory,product_id,name,recognition_status,first_seen_at,last_seen_at) values ('batch','product',?,'batch','recognized','now','now')").run(product.id);
  db.exec("insert into qr_code_files(relative_path,path_key,file_name,mime_type,size_bytes,modified_at,qr_code_id,match_status,first_seen_at,last_seen_at) values ('qr.png','qr.png','qr.png','image/png',1,'now',1,'matched','now','now')");
  db.prepare('insert into bom_items(bom_version_id,project_item_id,historical_drawing_id,effective_material_batch_id) values (1,?,1,1)').run(project.id);
  db.exec("insert into bom_assets(relative_path,original_file_name,mime_type,size_bytes,content_sha256,created_at) values ('image.png','image.png','image/png',1,'hash','now')");
  db.exec("insert into bom_item_assets(bom_item_id,asset_id,role) values (1,1,'image'); insert into bom_asset_archive_mappings(source_asset_id,archived_asset_id,bom_item_asset_id,created_at) values (1,1,1,'now'); insert into bom_item_qr_codes values (1,1)");
  db.exec("insert into pdf_files(relative_path,path_key,file_name,historical_drawing_id,material_batch_id,match_status,conversion_type,size_bytes,modified_at,scanned_at,is_present) values ('exists.pdf','exists.pdf','exists.pdf',1,1,'matched','source',1,'now','now',1)");
  db.prepare("insert into outbound_packages(product_id,material_type,package_mode,selected_material_batch_id,package_name,zip_relative_path,status,created_at) values (?,'initial','current_complete',1,'package','package.zip','completed','now')").run(product.id);
  db.prepare("insert into outbound_package_items(package_id,project_item_id,historical_drawing_id,pdf_file_id,source_material_batch_id,project_item_name_snapshot,drawing_code_snapshot,file_name_snapshot,relative_path_snapshot,source_batch_name_snapshot) values (1,?,1,1,1,'说明书','02.0209.010.0401001','exists.pdf','exists.pdf','batch')").run(project.id);
  db.exec("insert into outbound_package_parts(package_id,part_number,zip_relative_path) values (1,1,'package.zip'); insert into outbound_email_drafts(package_id,subject,body,created_at,updated_at) values (1,'subject','body','now','now')");
  return {product,other};
}
it.each(['retain','purge'] as const)('handles a complete linked product graph with history %s without deleting file indexes or another product', history=>{
  const {product,other}=linkedHistory();const service=new ProductCleanupService(db);
  const otherBefore=db.prepare('select * from products where id=?').get(other.id);
  const otherQrBefore=db.prepare('select * from product_qr_codes where product_id=? order by id').all(other.id);
  const countsBefore=Object.fromEntries(['bom_versions','bom_items','bom_item_assets','bom_asset_archive_mappings','bom_item_qr_codes','outbound_packages','outbound_package_parts','outbound_package_items','outbound_email_drafts','product_qr_codes','material_batches'].map(table=>[table,(db.prepare(`select count(*) n from ${table}`).get() as {n:number}).n]));
  const assetBefore=db.prepare('select * from bom_assets').all();
  const oldPackage=db.prepare('select * from outbound_packages').all();
  service.cleanup(product.id,{confirmedModel:product.model,selection:selection(service,product.id,'retain_occupied',history)});
  for(const table of ['bom_versions','bom_items','bom_item_assets','bom_asset_archive_mappings','bom_item_qr_codes','outbound_packages','outbound_package_parts','outbound_package_items','outbound_email_drafts','product_qr_codes','material_batches']) {
    expect(db.prepare(`select count(*) n from ${table}`).get(),table).toEqual({n:history==='purge'?(table==='product_qr_codes'?otherQrBefore.length:0):countsBefore[table]});
  }
  if(history==='retain')expect(db.prepare('select * from outbound_packages').all()).toEqual(oldPackage);
  expect(db.prepare('select * from products where id=?').get(other.id)).toEqual(otherBefore);
  expect(db.prepare('select * from product_qr_codes where product_id=? order by id').all(other.id)).toEqual(otherQrBefore);
  expect(db.prepare('select * from bom_assets').all()).toEqual(assetBefore);
  expect(db.prepare('select relative_path,is_present,historical_drawing_id from pdf_files').get()).toEqual({relative_path:'exists.pdf',is_present:1,historical_drawing_id:null});
  expect(db.prepare('select relative_path,qr_code_id from qr_code_files').get()).toEqual({relative_path:'qr.png',qr_code_id:history==='purge'?null:1});
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('includes newly associated QR files in the impact fingerprint',()=>{
  const {product}=linkedHistory();const service=new ProductCleanupService(db);const chosen=selection(service,product.id,'release','purge');
  db.exec("update qr_code_files set file_name='changed.png'");
  expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:chosen})).toThrow(/变化|重新/);
  expect(db.prepare('select deleted_at from products where id=?').get(product.id)).toEqual({deleted_at:null});
});
it('rolls back purged history, released numbers and detached indexes together on audit failure',()=>{
  const {product}=linkedHistory();const service=new ProductCleanupService(db);const chosen=selection(service,product.id,'retain_occupied','purge');
  const snapshot=()=>Object.fromEntries((db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as Array<{name:string}>).map(({name})=>[name,db.prepare(`select * from "${name}" order by rowid`).all()]));
  const before=snapshot();
  db.exec("create trigger fail_product_exit before insert on product_cleanup_events begin select raise(abort,'audit-failed'); end");
  expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:chosen})).toThrow('audit-failed');
  expect(snapshot()).toEqual(before);
});
it('rejects releasing real historical occupancy while retaining BOM and drawing identity',()=>{
 const {product}=fixture();const service=new ProductCleanupService(db);const chosen=selection(service,product.id,'release','retain');
 expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:chosen})).toThrow(/历史扫描/);
 expect(new OccupiedNumberRepository(db).hasFullCode('02.0209.010.0401001')).toBe(true);
 expect(db.prepare('select count(*) n from bom_versions').get()).toEqual({n:1});
 expect(db.prepare('select deleted_at from historical_drawing_numbers').get()).toEqual({deleted_at:null});
});
it.each(['retain_occupied', 'release'] as const)('purges only owned business history and honors %s independently', occupancy => {
  const {product} = fixture(); const service = new ProductCleanupService(db);
  if(occupancy==='release'){expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:selection(service,product.id,occupancy,'purge')})).toThrow(/历史扫描/);expect(db.prepare('select count(*) n from bom_versions').get()).toEqual({n:1});return;}
  service.cleanup(product.id,{confirmedModel:product.model,selection:selection(service, product.id,occupancy,'purge')} as any);
  expect(db.prepare('select count(*) n from bom_versions').get()).toEqual({n:0});
  expect(new OccupiedNumberRepository(db).hasFullCode('02.0209.010.0401001')).toBe(occupancy==='retain_occupied');
  expect(db.prepare('select count(*) n from product_cleanup_events').get()).toEqual({n:1});
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('rejects stale impact checks, missing complete codes and missing historical confirmation without partial writes', () => {
  const {product} = fixture(); const service = new ProductCleanupService(db);
  const chosen = selection(service, product.id,'release','purge');
  expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:{...chosen,confirmedCodes:[]}} as any)).toThrow(/图号/);
  expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:{...chosen,confirmedHistory:''}} as any)).toThrow(/历史/);
  db.exec("update bom_versions set business_change_date = '2026-10-19'");
  expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:chosen} as any)).toThrow(/变化|重新/);
  expect(db.prepare('select deleted_at from products').get()).toEqual({deleted_at:null});
  expect(db.prepare('select count(*) n from bom_versions').get()).toEqual({n:1});
});
it.each(['RESTRICT','CASCADE','SET NULL'])('blocks external %s references before permanent history clearing', action => {
  const {product} = fixture();
  db.exec(`create table future_history(id integer primary key, version_id integer references bom_versions(id) on delete ${action}); insert into future_history values (1,1)`);
  const service = new ProductCleanupService(db); const chosen=selection(service,product.id,'retain_occupied','purge');
  expect((service.preview(product.id) as any).choices.purgeBlockers.join()).toContain('future_history');
  expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:chosen} as any)).toThrow(/future_history/);
  expect(db.prepare('select version_id from future_history').get()).toEqual({version_id:1});
  expect(db.prepare('select deleted_at from products').get()).toEqual({deleted_at:null});
});
it('invalidates impact confirmation when another indexed file becomes associated after preview', () => {
  const {product}=fixture();const service=new ProductCleanupService(db);const chosen=selection(service,product.id,'retain_occupied','purge');
  db.exec(`insert into pdf_files(relative_path,path_key,file_name,historical_drawing_id,match_status,conversion_type,size_bytes,modified_at,scanned_at,is_present)
    values ('late.pdf','late.pdf','late.pdf',1,'matched','source',1,'now','now',1)`);
  expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:chosen})).toThrow(/变化|重新/);
  expect(db.prepare('select historical_drawing_id from pdf_files').get()).toEqual({historical_drawing_id:1});
});
it('centrally exits owned records while retaining identity, number occupancy and historical rows', () => {
  const { product } = fixture(); const cleanup = new ProductCleanupService(db);
  expect(cleanup.preview(product.id).blockers).toEqual([]);
  cleanup.cleanup(product.id, { confirmedModel: product.model });
  expect(db.prepare('select deleted_at, status from products where id = ?').get(product.id))
    .toMatchObject({ deleted_at: expect.any(String), status: 'inactive' });
  expect(db.prepare('select count(*) as n from bom_current').get()).toEqual({ n: 0 });
  expect(db.prepare('select deleted_at from bom_versions').get()).toMatchObject({ deleted_at: expect.any(String) });
  expect(db.prepare('select full_code, deletion_mode from historical_drawing_numbers').get())
    .toEqual({ full_code: '02.0209.010.0401001', deletion_mode: 'retain_occupied' });
  expect(db.prepare('select count(*) as n from product_cleanup_events').get()).toEqual({ n: 1 });
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('does not treat previously deleted owned records as blockers and never releases their numbers', () => {
  const { product } = fixture();
  db.exec("update historical_drawing_numbers set deleted_at = 'old', deletion_mode = 'retain_occupied', deleted_full_code = full_code");
  db.exec("update bom_versions set deleted_at = 'old'");
  const service = new ProductCleanupService(db);
  expect(service.preview(product.id).blockers).toEqual([]);
  service.cleanup(product.id, { confirmedModel: product.model });
  expect(db.prepare('select deleted_at, deletion_mode from historical_drawing_numbers').get())
    .toEqual({ deleted_at: 'old', deletion_mode: 'retain_occupied' });
});
it('requires exact confirmation and refuses cleanup during a running task', () => {
  const { product } = fixture();
  expect(() => new ProductCleanupService(db).cleanup(product.id, { confirmedModel: 'wrong' })).toThrow(/型号/);
  expect(() => new ProductCleanupService(db, () => true).cleanup(product.id, { confirmedModel: product.model })).toThrow(/任务/);
  expect(db.prepare('select deleted_at from products where id = ?').get(product.id)).toEqual({ deleted_at: null });
});
it('separates deleted business rows from live and missing PDF indexes in the preview', () => {
  const { product } = fixture();
  db.exec("update bom_versions set deleted_at = 'old'");
  for (const [path, present] of [['exists.pdf', 1], ['missing.pdf', 0]] as const) {
    db.prepare(`insert into pdf_files(relative_path, path_key, file_name, historical_drawing_id,
      match_status, conversion_type, size_bytes, modified_at, scanned_at, is_present)
      values (?, ?, ?, 1, 'matched', 'outlined', 1, '2026-09-29', '2026-09-29', ?)`)
      .run(path, path, path, present);
  }
  const result = new ProductCleanupService(db).preview(product.id);
  expect(result.classification).toEqual({ alreadyDeleted: 1, presentPdfIndexes: 1, missingPdfIndexes: 1, preservedDrafts: 0 });
  expect(result.blockers).toEqual([]);
});
it('blocks retirement while another live product references its identity, but ignores retired dependents', () => {
  const { product, products } = fixture();
  const dependent = products.create({ brandId: product.brandId, productSizeId: product.productSizeId,
    sku: 'DEPENDENT', model: 'T60', productCategory: '冰柜', referenceProductId: product.id });
  const cleanup = new ProductCleanupService(db);
  expect(cleanup.preview(product.id).blockers).toContain('其他产品 T60 仍以本产品为参考来源');
  expect(() => cleanup.cleanup(product.id, { confirmedModel: product.model })).toThrow(/T60/);
  expect(products.update(dependent.id, { ...dependent, sku: 'DEPENDENT-EDIT' }).sku).toBe('DEPENDENT-EDIT');
  cleanup.cleanup(dependent.id, { confirmedModel: dependent.model });
  expect(cleanup.preview(product.id).blockers).toEqual([]);
});
it('rolls back every record when the cleanup audit cannot be stored', () => {
  const { product } = fixture();
  db.exec("create trigger reject_cleanup before insert on product_cleanup_events begin select raise(abort, 'audit-failed'); end");
  expect(() => new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model })).toThrow('audit-failed');
  expect(db.prepare('select deleted_at from products where id = ?').get(product.id)).toEqual({ deleted_at: null });
  expect(db.prepare('select deleted_at from historical_drawing_numbers').get()).toEqual({ deleted_at: null });
  expect(db.prepare('select count(*) as n from bom_current').get()).toEqual({ n: 1 });
  expect(db.prepare('select count(*) as n from drawing_deletion_events').get()).toEqual({ n: 0 });
});
it('excludes exited identities and QR records from normal lists and prevents reactivation', () => {
  const { product, products } = fixture();
  new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  expect(products.list({ status: 'all' }).items).toEqual([]);
  expect(() => products.activate(product.id)).toThrow();
  expect(new QrRepository(db).list({ productId: product.id })).toEqual([]);
});
it('does not reconnect a rescanned directory to an exited product or mark its batch as current eligible', () => {
  const { product } = fixture();
  new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  db.exec("insert into file_scan_runs(started_at, completed_at) values ('now', 'now')");
  const batches = new MaterialBatchRepository(db);
  const id = batches.upsert({ relativePath: '冰柜/SKU-T40/03.变更/00.首批大货', productDirectory: '冰柜/SKU-T40',
    directoryContext: { productCategory: '冰柜', sku: 'SKU', model: 'T40' }, name: '00.首批大货',
    sequenceNumber: 0, businessDate: null, recognitionStatus: 'recognized', classificationWarning: null }, 'now', 1);
  expect(db.prepare('select product_id, recognition_status from material_batches where id = ?').get(id))
    .toEqual({ product_id: null, recognition_status: 'pending' });
});
it('does not restore a deleted drawing into an exited product through the ordinary drawing restore action', () => {
  const { product } = fixture();
  new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  expect(() => new DrawingDeletionService(db).restore(-1)).toThrow(/产品.*退出/);
  expect(db.prepare('select deletion_mode from historical_drawing_numbers').get()).toEqual({ deletion_mode: 'retain_occupied' });
});
it('blocks another product active BOM reference but ignores that same BOM after it is soft deleted', () => {
  const { product, products } = fixture();
  const other = products.create({ brandId: product.brandId, productSizeId: product.productSizeId,
    sku: 'OTHER', model: 'OTHER', productCategory: '冰柜' });
  const dict = new DictionaryService(db); const main = dict.create({ type: 'main_category', code: '04', name: '印刷' });
  const project = dict.create({ type: 'project_item', code: '01', name: '说明书', parentId: main.id });
  db.prepare("insert into bom_versions(product_id, version_number, created_at) values (?, 1, 'now')").run(other.id);
  db.prepare('insert into bom_items(bom_version_id, project_item_id, historical_drawing_id) values (2, ?, 1)').run(project.id);
  const cleanup = new ProductCleanupService(db);
  expect(cleanup.preview(product.id).blockers.join()).toContain('OTHER');
  expect(() => cleanup.cleanup(product.id, { confirmedModel: product.model })).toThrow(/BOM/);
  db.exec("update bom_versions set deleted_at = 'now' where id = 2");
  expect(cleanup.preview(product.id).blockers).toEqual([]);
  cleanup.cleanup(product.id, { confirmedModel: product.model });
  expect(db.prepare('select historical_drawing_id from bom_items where bom_version_id = 2').get()).toEqual({ historical_drawing_id: 1 });
  expect(db.pragma('foreign_key_check')).toEqual([]);
});
it('keeps newly discovered numbers unassigned rather than reconnecting an exited product', () => {
  const { product } = fixture(); new ProductCleanupService(db).cleanup(product.id, { confirmedModel: product.model });
  const code = parseDrawingCode('02.0209.010.0401002')!;
  new FileRepository(db).replaceScan([], [{ ...code,
    directoryContext: { productCategory: '冰柜', sku: 'SKU', model: 'T40' } }], new Date().toISOString());
  expect(db.prepare('select product_id from historical_drawing_numbers where full_code = ?').get(code.fullCode))
    .toEqual({ product_id: null });
});
it('blocks legacy cleanup from detaching batches used by outbound V2 scope or baseline',()=>{
 const {product}=fixture();ensureProductAppearance(db,product.id);db.prepare("insert into material_batches(relative_path,product_directory,product_id,name,recognition_status,first_seen_at,last_seen_at) values('V2batch','V2',?,'V2batch','recognized','then','now')").run(product.id);
 const appearance=(db.prepare('select id from product_appearance_versions where product_id=?').get(product.id) as {id:number}).id;
 db.prepare("insert into outbound_batch_scopes(batch_id,appearance_version_id,completeness,updated_at,reason) values(1,?,'complete','now','人工确认')").run(appearance);
 const service=new ProductCleanupService(db);expect(service.preview(product.id).blockers.join('')).toContain('外发V2');expect(()=>service.cleanup(product.id,{confirmedModel:product.model})).toThrow(/外发V2/);expect(db.prepare('select product_id from material_batches where id=1').get()).toEqual({product_id:product.id});
});
it('blocks cleanup of immutable outbound V2 history and protects snapshots and confirmation audit from raw mutation',()=>{
 const {product}=fixture();db.prepare("insert into outbound_packages(product_id,material_type,package_mode,package_name,zip_relative_path,status,created_at) values(?,'initial','current_complete','V2','V2.zip','completed','now')").run(product.id);
 db.prepare("insert into material_batches(relative_path,product_directory,product_id,name,recognition_status,first_seen_at,last_seen_at) values('V2immutable','V2',?,'V2immutable','recognized','then','now')").run(product.id);
 db.exec("insert into outbound_v2_snapshots(package_id,context_json,files_json,parts_json) values(1,'{}','[]','[]');insert into outbound_batch_scope_audit(batch_id,after_json,reason,created_at) values(1,'{}','确认','now')");
 const service=new ProductCleanupService(db);expect(service.preview(product.id).blockers.join('')).toContain('不可变历史快照');expect(()=>service.cleanup(product.id,{confirmedModel:product.model})).toThrow(/外发V2/);
 expect(()=>db.exec("update outbound_v2_snapshots set files_json='[]' where package_id=1")).toThrow('外发快照不可修改');expect(()=>db.exec('delete from outbound_v2_snapshots')).toThrow('外发快照不可删除');expect(()=>db.exec('delete from outbound_batch_scope_audit')).toThrow('外发批次确认审计不可删除');
});

it('checks protected release before purging any product history',()=>{
 const {product}=fixture();const service=new ProductCleanupService(db);const chosen=selection(service,product.id,'release','purge');
 db.exec("create trigger reject_unsafe_purge before delete on bom_versions begin select raise(abort,'purge-started-before-qualification'); end");
 expect(()=>service.cleanup(product.id,{confirmedModel:product.model,selection:chosen})).toThrow(/历史扫描/);
 expect(db.prepare('select deleted_at from products where id=?').get(product.id)).toEqual({deleted_at:null});
 expect(db.prepare('select count(*) n from bom_versions').get()).toEqual({n:1});
});

it('keeps deletion reference evidence even when product history is explicitly purged',()=>{
 const {product}=linkedHistory();const service=new ProductCleanupService(db);
 service.cleanup(product.id,{confirmedModel:product.model,selection:selection(service,product.id,'retain_occupied','purge')});
 const audit=db.prepare("select reference_summary_json from drawing_deletion_events where origin='historical'").get() as {reference_summary_json:string};
 expect(JSON.parse(audit.reference_summary_json)).toMatchObject({presentPdf:1,currentBom:1,outboundSnapshot:1});
});

it('preserves protected evidence for an already-retained drawing before product purge',()=>{
 const {product}=fixture();const d=new DictionaryService(db);
 const appearance=d.create({type:'appearance',code:'01',name:'A'}),color=d.create({type:'color',code:'0',name:'C'}),main=d.create({type:'main_category',code:'04',name:'M'}),project=d.create({type:'project_item',code:'01',name:'P',parentId:main.id});
 const id=Number(db.prepare("insert into drawing_numbers(full_code,display_name,product_id,appearance_id,color_id,main_category_id,project_item_id,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,status,created_at) values('02.0209.010.0401002','D',?,?,?,?,?,'02','0209','01','0','04','01',2,'reserved','now')").run(product.id,appearance.id,color.id,main.id,project.id).lastInsertRowid);
 db.prepare("insert into bom_items(bom_version_id,project_item_id,drawing_id,deleted_at) values(1,?,?,'2026-01-01')").run(project.id,id);
 const drawings=new DrawingDeletionService(db);drawings.delete({signedId:id,mode:'retain_occupied',confirmedCode:'02.0209.010.0401002'});
 // Old versions did not snapshot soft-deleted references in the deletion audit.
 db.prepare("update drawing_deletion_events set reference_summary_json='{}' where origin='planned' and record_id=?").run(id);
 const service=new ProductCleanupService(db);service.cleanup(product.id,{confirmedModel:product.model,selection:selection(service,product.id,'retain_occupied','purge')});
 expect(db.prepare('select * from bom_items').all()).toEqual([]);
 expect(drawings.preview(id).releaseEligible).toBe(false);
 expect(()=>drawings.delete({signedId:id,mode:'release',confirmedCode:'02.0209.010.0401002'})).toThrow(/历史引用/);
});
