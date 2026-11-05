import {useState} from 'react';
import type {PlannerApi,DrawingDetailView,ProductView} from '../data/client';
import type {AppearanceVersion} from '../data/appearance-client';
import type {DrawingReusePreview} from '../../core/drawings/drawing-reuse-service';
export function DrawingReusePanel({api,drawing,products,versions,onSaved,onBusy}:{api:PlannerApi;drawing:DrawingDetailView;products:ProductView[];versions:AppearanceVersion[];onSaved():Promise<void>;onBusy?(busy:boolean):void}) {
 const [product,setProduct]=useState(''),[version,setVersion]=useState(''),[reason,setReason]=useState(''),[preview,setPreview]=useState<DrawingReusePreview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(!api.previewDrawingReuse||!api.confirmDrawingReuse)return null;
 const run=async(confirm:boolean)=>{setBusy(true);onBusy?.(true);setError('');try{if(confirm&&preview){await api.confirmDrawingReuse!({signedId:preview.signedId,productId:preview.productId,appearanceVersionId:preview.appearanceVersionId,reason:preview.reason,fingerprint:preview.fingerprint,confirmed:true});setPreview(null);await onSaved();}else setPreview(await api.previewDrawingReuse!({signedId:drawing.id,productId:Number(product),appearanceVersionId:Number(version),reason}));}catch(e){setError(e instanceof Error?e.message:'沿用失败');}finally{setBusy(false);onBusy?.(false);}};
 return <section aria-label="沿用到外观版本"><h3>沿用到外观版本</h3><p>保留图号原始归属，记录所选外观的明确使用关系。</p>
 <label>目标产品<select aria-label="沿用目标产品" disabled={busy} value={product} onChange={e=>{setProduct(e.target.value);setVersion('');setPreview(null);}}><option value="">请选择产品</option>{products.filter(p=>p.id===drawing.productId).map(p=><option key={p.id} value={p.id}>{p.model}</option>)}</select></label>
 <label>目标外观<select aria-label="沿用目标外观版本" disabled={busy} value={version} onChange={e=>{setVersion(e.target.value);setPreview(null);}}><option value="">请选择外观版本</option>{versions.filter(v=>v.productId===Number(product)&&v.id!==drawing.appearanceVersionId&&v.appearanceId!=null).map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
 <label>沿用原因<input aria-label="沿用原因" disabled={busy} value={reason} onChange={e=>{setReason(e.target.value);setPreview(null);}}/></label>
 <button type="button" disabled={busy||!product||!version||!reason.trim()} onClick={()=>void run(false)}>预览沿用</button>
 {preview&&<div role="status"><p>{preview.fullCode} → {preview.versionLabel} · {preview.reason}</p><button type="button" disabled={busy} onClick={()=>void run(true)}>确认沿用到外观版本</button></div>}{error&&<p role="alert">{error}</p>}</section>;
}
