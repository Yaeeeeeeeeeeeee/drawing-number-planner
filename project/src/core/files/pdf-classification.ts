import {createHash} from 'node:crypto';
import {dirname,join} from 'node:path';
import type {PlannerDatabase} from '../../db/database.js';
import {createDatabaseBackup} from '../../db/backup.js';
import {FileError} from './file-errors.js';
import {effectiveDrawingProductSql,getDrawingProductEvidence,canonicalProductSql} from '../drawings/drawing-product-evidence.js';
import {resolveCanonicalProductId} from '../products/appearance-identity.js';
import {pdfDirectoryProductSql} from './pdf-product-context.js';
export interface PdfClassificationInput {ids:number[];productId:number;materialBatchId:number}
export interface PdfClassificationEntry {id:number;fileName:string;previousProductId:number|null;previousMaterialBatchId:number|null;productId:number;materialBatchId:number;conflict?:string}
export interface PdfClassificationPreview extends PdfClassificationInput {fingerprint:string;entries:PdfClassificationEntry[];conflicts:PdfClassificationEntry[]}
export interface PdfClassificationApplyInput extends PdfClassificationInput {fingerprint:string;confirmed:true;reason:string}
export interface PdfClassificationResult {updated:number;conflicts:PdfClassificationEntry[];backupPath:string|null}
export class PdfClassificationRepository {
 constructor(private readonly db:PlannerDatabase){}
 preview(input:PdfClassificationInput):PdfClassificationPreview {
  if(!Array.isArray(input.ids)||!input.ids.length||input.ids.length>500||input.ids.some(id=>!Number.isInteger(id)||id<=0)||new Set(input.ids).size!==input.ids.length||!Number.isInteger(input.productId)||!Number.isInteger(input.materialBatchId)) throw new FileError('INVALID_CLEANUP_IDS','请选择 1–500 个不同的 PDF 和有效目标');
  if(resolveCanonicalProductId(this.db,input.productId)!==input.productId)throw new FileError('PDF_CLEANUP_NOT_ALLOWED','目标产品已归并，请选择规范产品档案');
  const product=this.db.prepare('select * from products where id=? and deleted_at is null').get(input.productId);
  const batch=this.db.prepare('select * from material_batches where id=?').get(input.materialBatchId);
  if(!product||!batch) throw new FileError('PDF_CLEANUP_NOT_ALLOWED','目标产品或资料批次不存在，请重新选择实际记录');
  const ids=[...input.ids].sort((a,b)=>a-b);
  const snapshots=ids.map(id=>{
   const row=this.db.prepare(`select file.*,coalesce(${canonicalProductSql('assignment.product_id')},${pdfDirectoryProductSql},${effectiveDrawingProductSql("'planned'",'file.drawing_id')},${effectiveDrawingProductSql("'historical'",'file.historical_drawing_id')}) as previous_product_id
    from pdf_files file left join pdf_product_assignments assignment on assignment.pdf_file_id=file.id where file.id=?`).get(id) as Record<string,unknown>|undefined;
   if(!row) throw new FileError('PDF_FILE_NOT_FOUND','PDF 索引不存在，请刷新后重试');
   const origin=row.drawing_id!=null?'planned':'historical'; const recordId=row.drawing_id??row.historical_drawing_id;
   const evidence=recordId==null?[]:getDrawingProductEvidence(this.db,origin,Number(recordId));
   const assignment=this.db.prepare('select * from pdf_product_assignments where pdf_file_id=?').get(id)??null;
   return {row,evidence,assignment};
  });
  const entries=snapshots.map(({row,evidence}):PdfClassificationEntry=>{
   const conflicting=evidence.filter(e=>e.productId!==input.productId);
   return {id:Number(row.id),fileName:String(row.file_name),previousProductId:row.previous_product_id==null?null:Number(row.previous_product_id),previousMaterialBatchId:row.material_batch_id==null?null:Number(row.material_batch_id),productId:input.productId,materialBatchId:input.materialBatchId,
    ...(conflicting.length?{conflict:`已有图号产品证据指向产品 ${[...new Set(conflicting.map(e=>e.productId))].join('、')}；仅修正此 PDF，不覆盖图号绑定或历史业务记录`}:{})};
  });
  return {...input,ids,entries,conflicts:entries.filter(e=>e.conflict),fingerprint:createHash('sha256').update(JSON.stringify({ids,product,batch,snapshots})).digest('hex')};
 }
 apply(input:PdfClassificationApplyInput):PdfClassificationResult {
  if(input.confirmed!==true||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>2000) throw new FileError('PDF_CLEANUP_NOT_ALLOWED','请明确确认归纳并填写原因');
  const initial=this.preview(input);
  if(initial.fingerprint!==input.fingerprint) throw new FileError('PDF_PREVIEW_STALE','PDF 或目标已变化，请重新预览');
  const backupPath=this.db.name===':memory:'?null:createDatabaseBackup(this.db,this.db.name,join(dirname(this.db.name),'backups'),'restore');
  return this.db.transaction(()=>{
   const preview=this.preview(input);
   if(preview.fingerprint!==input.fingerprint) throw new FileError('PDF_PREVIEW_STALE','PDF 或目标已变化，请重新预览');
   const now=new Date().toISOString();
   for(const entry of preview.entries){
    this.db.prepare('insert into pdf_product_assignment_audit(pdf_file_id,previous_json,target_json,reason,created_at) values(?,?,?,?,?)').run(entry.id,JSON.stringify({productId:entry.previousProductId,materialBatchId:entry.previousMaterialBatchId,assignment:this.db.prepare('select * from pdf_product_assignments where pdf_file_id=?').get(entry.id)??null}),JSON.stringify({productId:input.productId,materialBatchId:input.materialBatchId,conflict:entry.conflict??null}),input.reason.trim(),now);
    this.db.prepare(`insert into pdf_product_assignments(pdf_file_id,product_id,material_batch_id,revision,updated_at) values(?,?,?,1,?) on conflict(pdf_file_id) do update set product_id=excluded.product_id,material_batch_id=excluded.material_batch_id,revision=pdf_product_assignments.revision+1,updated_at=excluded.updated_at`).run(entry.id,input.productId,input.materialBatchId,now);
    this.db.prepare('update pdf_files set material_batch_id=? where id=?').run(input.materialBatchId,entry.id);
   }
   return {updated:preview.entries.length,conflicts:preview.conflicts,backupPath};
  }).immediate();
 }
}
