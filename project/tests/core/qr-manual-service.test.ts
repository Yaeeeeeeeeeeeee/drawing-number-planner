// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { ProductService } from '../../src/core/products/product-service';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { QrService } from '../../src/core/qr/qr-service';
import { QrManualService } from '../../src/core/qr/qr-manual-service';
let db:PlannerDatabase,dir:string,productId:number,purposeId:number,codeId:number,manual:QrManualService;
const PDF='%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
beforeEach(()=>{
 dir=mkdtempSync(join(tmpdir(),'qr-manual-'));db=openDatabase(':memory:');migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
 const dict=new DictionaryService(db);const brand=dict.create({type:'brand',code:'B',name:'Brand'}),size=dict.create({type:'product_size',code:'S',name:'Size'}),appearance=dict.create({type:'appearance',code:'A',name:'Appearance'});
 productId=new ProductService(db).create({sku:'SKU70',model:'ZU70SD',productCategory:'冰柜',brandId:brand.id,productSizeId:size.id,defaultAppearanceId:appearance.id}).id;
 const qr=new QrService(db);purposeId=qr.listPurposes().items.find(p=>p.englishName==='User Manual')!.id;
 codeId=qr.create({productId,purposeId,name:'Original',targetUrl:'https://qrs.ly/c2hg2h8',status:'active'}).id;
 manual=new QrManualService(db);
});
afterEach(()=>{db.close();rmSync(dir,{recursive:true,force:true});});
function preview(fileName='ZU70SD-User Manual（c2hg2h8）.pdf') {
 const path=join(dir,fileName);writeFileSync(path,PDF);const selected=manual.selectTrustedFile(path);
 return {path,selected,result:manual.preview({token:selected.token,qrCodeId:codeId,productId,purposeId,name:'Original',targetUrl:'https://qrs.ly/c2hg2h8'})};
}
function count(table:string){return (db.prepare(`select count(*) as n from ${table}`).get() as {n:number}).n;}
describe('manual PDF association persistence',()=>{
 it('links a real lowercase Warranty PDF without changing existing QR metadata or disk bytes',()=>{
  db.prepare('update products set model=? where id=?').run('B500',productId);
  const qr=new QrService(db),warranty=qr.listPurposes().items.find(p=>p.englishName==='Warranty')!;
  const code=qr.create({productId,purposeId:warranty.id,name:'B500售后卡',targetUrl:'https://qrs.ly/hwh0kd9',status:'active'});
  const path=join(dir,'B500-warranty （hwh0kd9）.pdf');writeFileSync(path,PDF);const before=readFileSync(path);
  const chosen=manual.selectTrustedFile(path),result=manual.preview({token:chosen.token,qrCodeId:code.id,productId,purposeId:warranty.id,name:code.name,targetUrl:code.targetUrl!});
  expect(result.issues).toEqual([]);const linked=manual.commit(result.previewId);
  expect(linked).toMatchObject({id:code.id,name:code.name,targetUrl:code.targetUrl,status:'active'});expect(linked.files[0].fileName).toBe('B500-warranty （hwh0kd9）.pdf');
  expect(readFileSync(path)).toEqual(before);expect(count('qr_manual_audit')).toBe(1);
 });

 it('keeps the existing reasoned audit exception for an extra historical filename suffix',()=>{
  db.prepare('update products set model=? where id=?').run('H10',productId);const qr=new QrService(db),warranty=qr.listPurposes().items.find(p=>p.englishName==='Warranty')!;
  const code=qr.create({productId,purposeId:warranty.id,name:'H10售后卡',targetUrl:'https://qrs.ly/g8gwcl6',status:'inactive'}),path=join(dir,'H10-warranty-avakyo（g8gwcl6）.pdf');writeFileSync(path,PDF);const before=readFileSync(path);
  const chosen=manual.selectTrustedFile(path),result=manual.preview({token:chosen.token,qrCodeId:code.id,productId,purposeId:warranty.id,name:code.name,targetUrl:code.targetUrl!});expect(result.issues).toEqual(['文件名须为 型号-英文用途(7位网址尾码).pdf']);
  expect(()=>manual.commit(result.previewId)).toThrowError(expect.objectContaining({code:'VALIDATION_BLOCKED'}));const linked=manual.commit(result.previewId,{confirmed:true,reason:'已核对历史文件型号用途及网址尾码'});expect(linked).toMatchObject({id:code.id,targetUrl:code.targetUrl,status:'inactive'});expect(readFileSync(path)).toEqual(before);expect(db.prepare('select reason from qr_manual_audit where qr_code_id=?').get(code.id)).toEqual({reason:'已核对历史文件型号用途及网址尾码'});
 });
 it('selection and preview cancel leave all DB tables untouched',()=>{preview();expect(count('qr_manual_files')).toBe(0);expect(count('qr_manual_links')).toBe(0);expect(count('qr_manual_audit')).toBe(0);expect(count('product_qr_codes')).toBe(1);});
 it('confirms real PDF and keeps name, status, original path/content unchanged',()=>{
 const p=preview();const original=readFileSync(p.path);const code=manual.commit(p.result.previewId);
 expect(code.name).toBe('Original');expect(code.status).toBe('active');expect(code.files).toHaveLength(1);expect(code.files[0].externalFileId).toBeTruthy();expect(code.files[0].relativePath).toBe(p.path);expect(readFileSync(p.path)).toEqual(original);
 expect(count('qr_manual_links')).toBe(1);expect(count('qr_manual_audit')).toBe(1);
 expect(new QrService(db).get(codeId).files[0].fileName).toBe('ZU70SD-User Manual（c2hg2h8）.pdf');
 });
 it('blocks wrong content despite correct extension',()=>{const path=join(dir,'ZU70SD-User Manual(c2hg2h8).pdf');writeFileSync(path,'not a PDF');expect(()=>manual.selectTrustedFile(path)).toThrowError(expect.objectContaining({code:'INVALID_PDF'}));expect(count('qr_manual_files')).toBe(0);});
 it('rejects executable extensions even when their bytes start with a PDF header',()=>{
  for (const name of ['manual.cmd','manual.bat','manual.exe','manual.pdf.cmd']) {
   const path=join(dir,name);writeFileSync(path,PDF+'\necho unsafe executable\n');
   expect(()=>manual.selectTrustedFile(path)).toThrowError(expect.objectContaining({code:'INVALID_PDF'}));
  }
  expect(count('qr_manual_files')).toBe(0);expect(count('qr_manual_links')).toBe(0);expect(count('qr_manual_audit')).toBe(0);
 });
 it('refuses to resolve an old registered non-PDF path for native shell opening',()=>{
  const path=join(dir,'previously-registered.cmd');writeFileSync(path,PDF);
  db.prepare('insert into qr_manual_files(id,absolute_path,file_name,size_bytes,modified_ms,content_sha256,created_at) values(?,?,?,?,?,?,?)')
   .run('old-executable',path,'previously-registered.cmd',PDF.length,0,createHash('sha256').update(PDF).digest('hex'),'2026-01-01');
  expect(()=>manual.resolveFile('old-executable')).toThrowError(expect.objectContaining({code:'INVALID_PDF'}));
 });
 it('blocks a mismatch until explicit reasoned exception and audits it',()=>{
 const p=preview('ZU70SD-Warranty(pdgp845).pdf');expect(p.result.issues).toHaveLength(2);
 expect(()=>manual.commit(p.result.previewId)).toThrowError(expect.objectContaining({code:'VALIDATION_BLOCKED'}));
 expect(()=>manual.commit(p.result.previewId,{confirmed:false,reason:'已核对特殊版本'})).toThrow();expect(count('qr_manual_links')).toBe(0);
 manual.commit(p.result.previewId,{confirmed:true,reason:'已核对特殊版本'});expect(db.prepare('select reason from qr_manual_audit').get()).toEqual({reason:'已核对特殊版本'});
 });
 it('does not permit file replacement to edit existing QR name or URL',()=>{
 const p=preview();expect(()=>manual.preview({token:p.selected.token,qrCodeId:codeId,productId,purposeId,name:'Changed',targetUrl:'https://qrs.ly/c2hg2h8'})).toThrowError(expect.objectContaining({code:'METADATA_CHANGED'}));expect(new QrService(db).get(codeId)).toMatchObject({name:'Original',targetUrl:'https://qrs.ly/c2hg2h8',status:'active'});expect(count('qr_manual_links')).toBe(0);
 });
 it('rejects changed file between preview and commit without writes',()=>{const p=preview();writeFileSync(p.path,PDF+'% changed');expect(()=>manual.commit(p.result.previewId)).toThrowError(expect.objectContaining({code:'FILE_CHANGED'}));expect(count('qr_manual_files')).toBe(0);});
 it('rejects changed record between preview and commit without writes',()=>{const p=preview();new QrService(db).update(codeId,{name:'Changed',targetUrl:'https://qrs.ly/c2hg2h8'});expect(()=>manual.commit(p.result.previewId)).toThrowError(expect.objectContaining({code:'RECORD_CHANGED'}));expect(count('qr_manual_files')).toBe(0);});
 it.each(['model','product-status','purpose','appearance'] as const)('rejects new-record previews after %s context changes without association writes',(change)=>{
  const products=new ProductService(db);const appearances=new AppearanceService(db);const product=products.get(productId);
  const version=appearances.createDraft(productId,{label:'New appearance',appearanceId:product.defaultAppearanceId});
  const file=join(dir,'ZU70SD-User Manual(c2hg2h8).pdf');writeFileSync(file,PDF);const selected=manual.selectTrustedFile(file);
  const p=manual.preview({token:selected.token,productId,purposeId,name:'New version manual',targetUrl:'https://qrs.ly/c2hg2h8',appearanceVersionId:version.id});
  expect(p.issues).toEqual([]);
  if(change==='model')products.update(productId,{...product,model:'RENAMED'});
  if(change==='product-status')products.deactivate(productId);
  if(change==='purpose')db.prepare("update qr_purposes set english_name='Changed Purpose' where id=?").run(purposeId);
  if(change==='appearance')appearances.updateDraft(version.id,{label:'Changed appearance',appearanceId:product.defaultAppearanceId,expectedRevision:version.revision});
  expect(()=>manual.commit(p.previewId)).toThrowError(expect.objectContaining({code:'RECORD_CHANGED'}));
  expect(count('qr_manual_files')).toBe(0);expect(count('qr_manual_links')).toBe(0);expect(count('qr_manual_audit')).toBe(0);expect(count('product_qr_codes')).toBe(1);
 });
 it('replacement and unlink append history while preserving QR id, URL and state',()=>{
 const first=preview();manual.commit(first.result.previewId);const before=new QrService(db).get(codeId);const second=preview('ZU70SD-User Manual(c2hg2h8).pdf');manual.commit(second.result.previewId);
 expect(count('qr_manual_links')).toBe(2);expect(new QrService(db).get(codeId).files).toHaveLength(1);const history=manual.history(codeId);expect(history.items).toHaveLength(2);
 const unlinked=manual.unlink(codeId,history.revision);expect(unlinked.id).toBe(before.id);expect(unlinked.targetUrl).toBe(before.targetUrl);expect(unlinked.status).toBe(before.status);expect(unlinked.files).toHaveLength(0);expect(count('qr_manual_audit')).toBe(3);expect(count('qr_manual_links')).toBe(2);expect(()=>new QrService(db).delete(codeId)).toThrowError(expect.objectContaining({code:'QR_CODE_REFERENCED'}));
 });
 it('reopens persisted registry and history after database restart without a selection token',()=>{
 const p=preview();manual.commit(p.result.previewId);const backupPath=join(dir,'persisted.db');db.exec(`vacuum into '${backupPath.replaceAll("'","''")}'`);db.close();db=openDatabase(backupPath);const restarted=new QrManualService(db);const code=new QrService(db).get(codeId);expect(code.files).toHaveLength(1);expect(restarted.resolveFile(code.files[0].externalFileId!)).toEqual({path:p.path,mimeType:'application/pdf'});expect(restarted.history(codeId).items).toHaveLength(1);
 });
 it('keeps shared and each appearance independent and rejects versions of other products',()=>{
 const appearance=new AppearanceService(db).createDraft(productId,{label:'Legacy version',appearanceId:new ProductService(db).get(productId).defaultAppearanceId}).id;
 const qr=new QrService(db);const versionQr=qr.create({productId,purposeId,name:'Version QR',targetUrl:'https://qrs.ly/c2hg2h8',status:'inactive',appearanceVersionId:appearance});
 expect(versionQr.id).not.toBe(codeId);expect(versionQr.appearanceVersionId).toBe(appearance);expect(qr.list({productId,appearanceVersionId:appearance}).items).toHaveLength(2);
 const path=join(dir,'ZU70SD-User Manual(c2hg2h8).pdf');writeFileSync(path,PDF);const chosen=manual.selectTrustedFile(path);const checked=manual.preview({token:chosen.token,qrCodeId:versionQr.id,productId,purposeId,name:versionQr.name,targetUrl:versionQr.targetUrl!,appearanceVersionId:appearance});expect(checked.issues).toEqual([]);expect(manual.commit(checked.previewId)).toMatchObject({id:versionQr.id,appearanceVersionId:appearance,status:'inactive'});expect(new QrService(db).get(codeId).files).toHaveLength(0);
 expect(()=>qr.list({productId,appearanceVersionId:99999})).toThrowError(expect.objectContaining({code:'INVALID_APPEARANCE'}));
 expect(()=>qr.create({productId,purposeId,name:'Invalid',targetUrl:null,status:'inactive',appearanceVersionId:99999})).toThrow();
 });
 it('reads missing state live without rescanning and preserves immutable audit and original registry facts',()=>{
 const p=preview();const code=manual.commit(p.result.previewId);expect(code.files[0].isPresent).toBe(true);rmSync(p.path);expect(new QrService(db).get(codeId).files[0].isPresent).toBe(false);
 expect(()=>db.prepare("update qr_manual_audit set reason='tampered'").run()).toThrow();expect(()=>db.prepare('delete from qr_manual_audit').run()).toThrow();expect(()=>db.prepare("update qr_manual_files set file_name='renamed.pdf'").run()).toThrow();expect(()=>db.prepare('delete from qr_manual_links').run()).toThrow();
 });
 it('unlinks legacy indexed file through audited override while preserving its original row',()=>{
 db.prepare(`insert into qr_code_files(relative_path,path_key,file_name,mime_type,size_bytes,modified_at,qr_code_id,match_status,first_seen_at,last_seen_at) values('legacy.pdf','legacy.pdf','legacy.pdf','application/pdf',1,'2026-01-01',?,'matched','2026-01-01','2026-01-01')`).run(codeId);
 const legacy=db.prepare('select * from qr_code_files').all();const history=manual.history(codeId);expect(history.legacyItems).toHaveLength(1);expect(new QrService(db).get(codeId).files).toHaveLength(1);manual.unlink(codeId,history.revision);expect(new QrService(db).get(codeId).files).toEqual([]);expect(db.prepare('select * from qr_code_files').all()).toEqual(legacy);expect(manual.history(codeId).legacyItems).toHaveLength(1);
 });
 it('canonical alias queries keep every old QR id while showing one product identity',()=>{
 const refs=db.prepare('select brand_id,product_size_id,default_appearance_id from products where id=?').get(productId) as {brand_id:number;product_size_id:number;default_appearance_id:number};
 const alias=new ProductService(db).create({sku:'ALIAS70',model:'OLDMODEL',productCategory:'冰柜',brandId:refs.brand_id,productSizeId:refs.product_size_id,defaultAppearanceId:refs.default_appearance_id});
 const qr=new QrService(db);const old=qr.create({productId:alias.id,purposeId,name:'Old alias',targetUrl:'https://qrs.ly/pdgp845',status:'active'});const appearances=new AppearanceService(db);const merge=appearances.mergePreview({primaryProductId:productId,aliasProductIds:[alias.id]});appearances.mergeConfirm({...merge,confirmed:true,expectedFingerprint:merge.fingerprint,expectedRevision:merge.revision});
 const all=qr.list({productId}).items;expect(all.map(c=>c.id).sort()).toEqual([codeId,old.id].sort());expect(all.every(c=>c.canonicalProductId===productId&&c.model==='ZU70SD'&&c.sku==='SKU70')).toBe(true);expect(qr.get(old.id)).toMatchObject({productId:alias.id,status:'active',targetUrl:'https://qrs.ly/pdgp845'});
 });
 it('rejects duplicate confirm and unknown file capability',()=>{const p=preview();manual.commit(p.result.previewId);expect(()=>manual.commit(p.result.previewId)).toThrow();expect(count('qr_manual_links')).toBe(1);expect(()=>manual.resolveFile('../../../secret')).toThrowError(expect.objectContaining({code:'NOT_FOUND'}));});
});
