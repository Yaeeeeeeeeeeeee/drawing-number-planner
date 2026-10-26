import {useState} from 'react';
import type {PlannerApi} from '../data/client';
import type {DrawingForceReleasePreview,DrawingForceReleaseReferences} from '../../core/drawings/drawing-force-release-types';
const labels:Array<[keyof DrawingForceReleaseReferences,string]>=[['drawingRecords','当前占号身份'],['pdf','PDF 索引'],['currentBom','当前 BOM'],['historicalBom','历史 BOM'],['deletedBom','已删除 BOM 保留明细'],['bomSnapshots','BOM 纠错快照'],['outboundItems','外发明细'],['outboundSnapshots','外发快照'],['emailDrafts','邮件草稿'],['appearanceUsages','外观复用'],['bindings','产品归属'],['lineage','图号前序 / 来源'],['audits','审计记录'],['products','涉及产品']];
export function DrawingForceRelease({api,signedId,disabled,onReleased,onError}:{api:PlannerApi;signedId:number;disabled:boolean;onReleased():Promise<void>;onError(message:string):void}) {
  const [preview,setPreview]=useState<DrawingForceReleasePreview|null>(null);
  const [busy,setBusy]=useState(false);
  const inspect=async()=>{
    if(!api.getDrawingForceReleasePreview)return;
    setBusy(true);onError('');
    try{setPreview(await api.getDrawingForceReleasePreview(signedId));}
    catch(error){onError(error instanceof Error?error.message:'强制释放影响检查失败');}
    finally{setBusy(false);}
  };
  const confirm=async()=>{
    if(!preview||!api.forceReleaseDrawing||busy)return;
    setBusy(true);onError('');
    try{await api.forceReleaseDrawing(signedId,{fingerprint:preview.fingerprint,confirmed:true});await onReleased();}
    catch(error){setPreview(null);onError(error instanceof Error?error.message:'强制释放失败，请重新检查影响');}
    finally{setBusy(false);}
  };
  if(!api.getDrawingForceReleasePreview||!api.forceReleaseDrawing)return null;
  return <section className="drawing-force-release" aria-label="强制取消占号">
    {!preview?<button type="button" className="text-button danger" disabled={disabled||busy} onClick={()=>void inspect()}>强制取消占号并删除图号</button>:<>
      <h4>强制取消占号并删除 {preview.fullCode}</h4>
      <ul className="deletion-reference-list">{labels.map(([key,label])=><li key={key}>{label}：{preview.references[key]}</li>)}</ul>
      {preview.affectedProductIds.length>0&&<p>涉及产品 ID：{preview.affectedProductIds.join('、')}</p>}
      <p role="alert" className="error-banner">将解除当前图号及 PDF 关联并释放完整号码。历史 BOM、外发和审计仍保留原始身份，不能恢复为当前图号；旧文件不会自动关联到重新分配的号码。原始文件不会删除。</p>
      <div className="drawing-detail-toolbar"><button type="button" className="danger-button" disabled={disabled||busy} onClick={()=>void confirm()}>确认强制释放并删除</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>setPreview(null)}>取消</button></div>
    </>}
  </section>;
}
