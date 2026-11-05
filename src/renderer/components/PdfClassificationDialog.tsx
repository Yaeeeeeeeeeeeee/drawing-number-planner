import {useRef,useState} from 'react';
import type {MaterialBatchView,ProductView} from '../data/client';
import type {PdfManagementApi,PdfClassificationPreview,PdfClassificationResult} from '../data/pdf-management-client';
import {createPdfBatches,previewPdfBatches,applyPdfBatches,type PdfBatch} from '../data/pdf-batches';
import {useModalFocus} from './useModalFocus';
export function PdfClassificationDialog({api,ids,products,batches,onClose,onSaved}:{api:PdfManagementApi;ids:number[];products:ProductView[];batches:MaterialBatchView[];onClose():void;onSaved(updated:number,conflictCount?:number,progress?:{complete:boolean;completedIds:number[]}):Promise<void>}){
 const selectedIds=useRef([...ids]).current;
 const [product,setProduct]=useState(''),[batch,setBatch]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<PdfClassificationPreview|null>(null);
 const panel=useRef<HTMLDivElement>(null);useModalFocus({panel,open:true,onClose:()=>{if(!busy)onClose();}});
 const [parts,setParts]=useState<PdfBatch<PdfClassificationPreview,PdfClassificationResult>[]>([]),working=useRef(false);
 const productLabel=(id:number|null)=>{const p=products.find(p=>p.id===id);return p?`${p.sku??'无 SKU'} · ${p.model} · ${p.productCategory} · 内部ID ${p.id}`:id?`产品 ID ${id}`:'未关联产品';};
 const batchLabel=(id:number|null)=>{const b=batches.find(b=>b.id===id);return b?`${b.displayName??b.name} · ${b.relativePath??'目录未提供'} · ID ${b.id}`:id?`批次 ID ${id}`:'未归入批次';};
 const invalidate=()=>{setPreview(null);setParts([]);setConfirmed(false);setError('');};
 const showPreview=async()=>{
  if(working.current)return;working.current=true;setBusy(true);setError('');
  try{
   const next=await previewPdfBatches(createPdfBatches<PdfClassificationPreview,PdfClassificationResult>(selectedIds),part=>api.previewPdfClassification!({ids:part,productId:Number(product),materialBatchId:Number(batch)}),setParts);setParts(next);
   if(next.some(part=>part.status==='preview-failed')){setError(next.filter(part=>part.error).map(part=>`第 ${part.number} 批：${part.error}`).join('；'));setPreview(null);return;}
   const previews=next.map(part=>part.preview!);setPreview({...previews[0],ids:previews.flatMap(part=>part.ids),entries:previews.flatMap(part=>part.entries),conflicts:previews.flatMap(part=>part.conflicts)});setConfirmed(false);
  }catch(e){setError(e instanceof Error?e.message:'归属预览失败');}finally{working.current=false;setBusy(false);}
 };
 const save=async()=>{
  if(!preview||working.current)return;working.current=true;setBusy(true);setError('');
  try{
   const next=await applyPdfBatches(parts,part=>api.applyPdfClassification!({ids:part.ids,productId:part.productId,materialBatchId:part.materialBatchId,fingerprint:part.fingerprint,confirmed:true,reason:reason.trim()}),setParts);setParts(next);
   const done=next.filter(part=>part.status==='done'),complete=done.length===next.length;
   if(done.length)await onSaved(done.reduce((n,part)=>n+part.result!.updated,0),done.reduce((n,part)=>n+part.result!.conflicts.length,0),{complete,completedIds:done.flatMap(part=>part.ids)});
   const failed=next.filter(part=>part.status==='failed');if(failed.length)setError(failed.map(part=>part.error).join('；'));
  }catch(e){setError(e instanceof Error?e.message:'归纳失败');}finally{working.current=false;setBusy(false);}
 };
 const hasApplied=parts.some(part=>part.status==='done'),hasFailed=parts.some(part=>part.status==='failed');
 return <div className="pdf-classification-backdrop"><div ref={panel} className="pdf-classification-dialog" role="dialog" aria-modal="true" aria-label="PDF 人工归纳" tabIndex={-1}>
 <h2>PDF 人工归纳</h2><p>已选 {selectedIds.length} 个文件</p>
 <label>目标产品<select aria-label="目标产品" value={product} disabled={busy||hasApplied} onChange={e=>{setProduct(e.target.value);invalidate();}}><option value="">请选择实际产品</option>{products.map(p=><option key={p.id} value={p.id}>{productLabel(p.id)}</option>)}</select></label>
 <label>目标资料批次<select aria-label="目标资料批次" value={batch} disabled={busy||hasApplied} onChange={e=>{setBatch(e.target.value);invalidate();}}><option value="">请选择实际资料批次</option>{batches.map(b=><option key={b.id} value={b.id}>{batchLabel(b.id)}</option>)}</select></label>
 <button className="secondary-button" disabled={busy||hasApplied||!product||!batch} onClick={()=>void showPreview()}>预览归属</button>
 {parts.length>1&&<><p role="status">已完成：{parts.filter(part=>part.status==='done').reduce((n,part)=>n+part.ids.length,0)} / {selectedIds.length} 条</p><ul>{parts.map(part=><li key={part.number}>第 {part.number} 批 · {part.ids.length} 条 · {part.status==='done'?'已完成':part.status==='failed'?'处理失败':part.status==='applying'?'处理中':part.status==='ready'?'待确认':part.status==='preview-failed'?'预检失败':'预检中'}</li>)}</ul></>}
 {error&&<p className="error-banner" role="alert">{error}</p>}
 {preview&&<><h3>原归属 → 目标归属</h3>{preview.conflicts.length>0&&<p className="error-banner" role="alert">{preview.conflicts.length} 个文件存在图号归属冲突。确认仅修改所选 PDF 的产品和批次，图号原归属及历史引用保持。</p>}<ul className="pdf-classification-preview">{preview.entries.map(e=><li key={e.id}><strong>{e.fileName}</strong><span>{productLabel(e.previousProductId)} / {batchLabel(e.previousMaterialBatchId)} → {productLabel(e.productId)} / {batchLabel(e.materialBatchId)}</span>{e.conflict&&<span className="error-banner">{e.conflict}</span>}</li>)}</ul>
 <label>归纳原因<textarea aria-label="归纳原因" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><label className="pdf-classification-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>已核对原归属与目标归属</label></>}
 <div className="pdf-classification-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy||!preview||!confirmed||!reason.trim()} onClick={()=>void save()}>{busy?'处理中…':hasFailed?'重试失败批次':'确认归纳'}</button></div>
 </div></div>;
}
