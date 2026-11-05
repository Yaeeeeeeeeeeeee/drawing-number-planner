import {useRef,useState} from 'react';
import type {MaterialBatchView,ProductView} from '../data/client';
import type {PdfManagementApi,PdfClassificationPreview} from '../data/pdf-management-client';
import {useModalFocus} from './useModalFocus';
export function PdfClassificationDialog({api,ids,products,batches,onClose,onSaved}:{api:PdfManagementApi;ids:number[];products:ProductView[];batches:MaterialBatchView[];onClose():void;onSaved(updated:number,conflictCount?:number):Promise<void>}){
 const [product,setProduct]=useState(''),[batch,setBatch]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[preview,setPreview]=useState<PdfClassificationPreview|null>(null);
 const panel=useRef<HTMLDivElement>(null);useModalFocus({panel,open:true,onClose:()=>{if(!busy)onClose();}});
 const productLabel=(id:number|null)=>{const p=products.find(p=>p.id===id);return p?`${p.sku??'无 SKU'} · ${p.model} · ${p.productCategory} · 内部ID ${p.id}`:id?`产品 ID ${id}`:'未关联产品';};
 const batchLabel=(id:number|null)=>{const b=batches.find(b=>b.id===id);return b?`${b.displayName??b.name} · ${b.relativePath??'目录未提供'} · ID ${b.id}`:id?`批次 ID ${id}`:'未归入批次';};
 const invalidate=()=>{setPreview(null);setConfirmed(false);setError('');};
 const showPreview=async()=>{setBusy(true);setError('');try{setPreview(await api.previewPdfClassification!({ids,productId:Number(product),materialBatchId:Number(batch)}));setConfirmed(false);}catch(e){setError(e instanceof Error?e.message:'归属预览失败');}finally{setBusy(false);}};
 const save=async()=>{if(!preview)return;setBusy(true);setError('');try{const result=await api.applyPdfClassification!({ids:preview.ids,productId:preview.productId,materialBatchId:preview.materialBatchId,fingerprint:preview.fingerprint,confirmed:true,reason:reason.trim()});await onSaved(result.updated,result.conflicts.length);}catch(e){setError(e instanceof Error?e.message:'归纳失败');}finally{setBusy(false);}};
 return <div className="pdf-classification-backdrop"><div ref={panel} className="pdf-classification-dialog" role="dialog" aria-modal="true" aria-label="PDF 人工归纳" tabIndex={-1}>
 <h2>PDF 人工归纳</h2><p>已选 {ids.length} 个文件</p>
 <label>目标产品<select aria-label="目标产品" value={product} disabled={busy} onChange={e=>{setProduct(e.target.value);invalidate();}}><option value="">请选择实际产品</option>{products.map(p=><option key={p.id} value={p.id}>{productLabel(p.id)}</option>)}</select></label>
 <label>目标资料批次<select aria-label="目标资料批次" value={batch} disabled={busy} onChange={e=>{setBatch(e.target.value);invalidate();}}><option value="">请选择实际资料批次</option>{batches.map(b=><option key={b.id} value={b.id}>{batchLabel(b.id)}</option>)}</select></label>
 <button className="secondary-button" disabled={busy||!product||!batch} onClick={()=>void showPreview()}>预览归属</button>
 {error&&<p className="error-banner" role="alert">{error}</p>}
 {preview&&<><h3>原归属 → 目标归属</h3>{preview.conflicts.length>0&&<p className="error-banner" role="alert">{preview.conflicts.length} 个文件存在图号归属冲突。确认仅修改所选 PDF 的产品和批次，图号原归属及历史引用保持。</p>}<ul className="pdf-classification-preview">{preview.entries.map(e=><li key={e.id}><strong>{e.fileName}</strong><span>{productLabel(e.previousProductId)} / {batchLabel(e.previousMaterialBatchId)} → {productLabel(e.productId)} / {batchLabel(e.materialBatchId)}</span>{e.conflict&&<span className="error-banner">{e.conflict}</span>}</li>)}</ul>
 <label>归纳原因<textarea aria-label="归纳原因" value={reason} disabled={busy} onChange={e=>setReason(e.target.value)}/></label><label className="pdf-classification-confirm"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/>已核对原归属与目标归属</label></>}
 <div className="pdf-classification-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>取消</button><button className="primary-button" disabled={busy||!preview||!confirmed||!reason.trim()} onClick={()=>void save()}>{busy?'处理中…':'确认归纳'}</button></div>
 </div></div>;
}
