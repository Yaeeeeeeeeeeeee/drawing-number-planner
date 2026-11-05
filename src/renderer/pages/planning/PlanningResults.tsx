import {useState} from 'react';
import type {BatchPlanningResult} from '../../../core/planning/planning-types';
import type {ProductView} from '../../data/client';
import type {PlanningDrawingTarget} from '../PlanningPage';
import type {PackagingNavigationTarget} from '../packaging/PackagingTaskPanel';
import {CopyButton} from '../../components/CopyButton';

export function PlanningResults({result,products,onBack,onOpenLibrary,onGenerate}:{result:BatchPlanningResult;products:ProductView[];onBack():void;onOpenLibrary?(target:PlanningDrawingTarget):void;onGenerate?(target:PackagingNavigationTarget):void}) {
  const [copyFeedback,setCopyFeedback]=useState<{message:string;error:boolean}|null>(null);
  const copy=async(code:string)=>{try{await navigator.clipboard.writeText(code);setCopyFeedback({message:'完整图号已复制',error:false});}catch{setCopyFeedback({message:'复制失败，请手动选择完整图号复制',error:true});}};
  const success=result.results.filter(row=>row.outcome!=='failed'&&row.drawing),failed=result.results.filter(row=>row.outcome==='failed');
  const ids=[...new Set(result.results.map(row=>row.productId))];
  return <section className="planning-results" aria-label="本次占号结果"><div className="planning-section-title"><h2>本次占号结果</h2><button type="button" onClick={onBack}>返回规划工作台</button></div>
    {copyFeedback&&<p role={copyFeedback.error?'alert':'status'} className={copyFeedback.error?'error-banner':''}>{copyFeedback.message}</p>}
    <p role="status">成功 {success.length} 项{failed.length?`，异常 ${failed.length} 项`:''}</p>
    {ids.map(id=>{
      const rows=success.filter(row=>row.productId===id),product=products.find(item=>item.id===id),model=product?.model??`产品 ${id}`;
      const drawings=[...new Map(rows.map(row=>[`${row.drawing!.origin}:${row.drawing!.id}`,row.drawing!])).values()];
      return <section className="planning-result-group" key={id}><div className="planning-section-title"><h3>{product?.brandName} · {model}</h3><div className="row-actions">
        {drawings.length>0&&onOpenLibrary&&<button type="button" onClick={()=>onOpenLibrary({productId:id,drawingIds:drawings.map(row=>row.origin==='historical'?-row.id:row.id),fullCodes:drawings.map(row=>row.fullCode),initialDrawingId:drawings[0].origin==='historical'?-drawings[0].id:drawings[0].id})}>查看 {model} 图号库</button>}
        {drawings.length>0&&onGenerate&&<button type="button" onClick={()=>onGenerate({productId:id,drawings:drawings.map(row=>({origin:row.origin,id:row.id})),revision:Date.now()})}>生成文件</button>}
      </div></div><ul>{rows.map(row=><li key={row.clientId}><div><strong className="planning-code">{row.drawing!.fullCode}</strong><span>{row.drawing!.displayName}</span></div><span>{row.outcome==='shared'?'共用已有图号':'正式保存'}</span><CopyButton label={`复制图号 ${row.drawing!.fullCode}`} onClick={()=>void copy(row.drawing!.fullCode)}/></li>)}</ul>
      {failed.filter(row=>row.productId===id).map(row=><p className="error-banner" role="alert" key={row.clientId}>{row.error?.message??'本项目未保存，请重新检查'}</p>)}
      </section>;
    })}
  </section>;
}
