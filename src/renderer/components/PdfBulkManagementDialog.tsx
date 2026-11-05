import {useEffect,useRef,useState} from 'react';
import type {PdfManagementApi,PdfManagementInput,PdfManagementPreview,PdfManagementEntry} from '../data/pdf-management-client';
import {createPdfBatches,previewPdfBatches,applyPdfBatches,type PdfBatch} from '../data/pdf-batches';
import {useModalFocus} from './useModalFocus';
type Result={changed:number;blocked:PdfManagementEntry[]};
type Batch=PdfBatch<PdfManagementPreview,Result>;
export function PdfBulkManagementDialog({api,ids,action,onClose,onApplied}:{api:PdfManagementApi;ids:number[];action:PdfManagementInput['action'];onClose():void;onApplied(result:{changed:number;blocked:number;completedIds:number[]}):Promise<void>}) {
  const [batches,setBatches]=useState<Batch[]>(()=>createPdfBatches(ids)),[busy,setBusy]=useState(true),[phrase,setPhrase]=useState(''),[error,setError]=useState('');
  const panel=useRef<HTMLDivElement>(null),working=useRef(false),live=useRef(true),notified=useRef(new Set<number>());
  useModalFocus({panel,open:true,onClose:()=>{if(!busy)onClose();}});
  const progress=(value:Batch[])=>{if(live.current)setBatches(value);};
  const load=async()=>{
    if(working.current)return;working.current=true;setBusy(true);setError('');
    try{progress(await previewPdfBatches(batches,part=>api.previewPdfManagement!({ids:part,action}),progress));}
    finally{working.current=false;if(live.current)setBusy(false);}
  };
  useEffect(()=>{live.current=true;void load();return()=>{live.current=false;};},[]);
  const confirmation={clear:'清除 PDF 索引',ignore:'暂不纳入 PDF',restore:'恢复纳入 PDF'}[action];
  const apply=async()=>{
    if(working.current||phrase!==confirmation)return;working.current=true;setBusy(true);setError('');
    try{
      const next=await applyPdfBatches(batches,preview=>api.applyPdfManagement!({ids:preview.ids,action:preview.action,fingerprint:preview.fingerprint,confirmation:phrase}),progress);progress(next);
      const newlyDone=next.filter(batch=>batch.status==='done'&&!notified.current.has(batch.number));
      if(newlyDone.length){
        // Mark acknowledged server successes before refreshing presentation. A
        // refresh failure must never cause those mutations to be submitted again.
        newlyDone.forEach(batch=>notified.current.add(batch.number));
        await onApplied({changed:newlyDone.reduce((n,b)=>n+b.result!.changed,0),blocked:newlyDone.reduce((n,b)=>n+b.result!.blocked.length,0),completedIds:newlyDone.flatMap(b=>b.ids)});
      }
    }catch(reason){if(live.current)setError(reason instanceof Error?reason.message:'结果刷新失败，请刷新列表核对已完成批次');}
    finally{working.current=false;if(live.current)setBusy(false);}
  };
  const completed=batches.filter(batch=>batch.status==='done'),failed=batches.some(batch=>batch.status==='failed'),previewFailed=batches.some(batch=>batch.status==='preview-failed');
  const ready=batches.some(batch=>batch.status==='ready'&&batch.preview?.allowed),reviewed=batches.filter(batch=>Boolean(batch.preview));
  const labels:Record<Batch['status'],string>={pending:'等待预检',previewing:'正在预检',ready:'待确认', 'preview-failed':'预检失败',applying:'正在处理',failed:'处理失败',done:'已完成'};
  return <div className="pdf-classification-backdrop"><div ref={panel} className="pdf-classification-dialog" role="dialog" aria-modal="true" aria-label="PDF 管理预览" tabIndex={-1}>
    <h2>{confirmation}</h2><p role="status">预检完成：{reviewed.length} / {batches.length} 批</p><p role="status">已完成：{completed.reduce((n,b)=>n+b.ids.length,0)} / {ids.length} 条</p>
    <p>原始 PDF、历史图号及既有业务引用保留。每批最多 500 条，失败重试保留原预检凭据。</p>
    {batches.map(batch=><section key={batch.number} className="pdf-batch-result"><strong>第 {batch.number} 批 · {batch.ids.length} 条 · {labels[batch.status]}</strong>{batch.preview&&<span>　可处理 {batch.preview.allowed} 条，保留 {batch.preview.blocked} 条</span>}{batch.error&&<p role="alert">{batch.error}</p>}{batch.preview&&<details><summary>查看本批文件与校验结果</summary><ul>{batch.preview.entries.map(entry=><li key={entry.id}>{entry.relativePath}：{entry.reason??'可处理'}</li>)}</ul></details>}</section>)}
    {error&&<p role="alert" className="error-banner">{error}</p>}
    <label>输入“{confirmation}”<input aria-label="PDF 管理确认短语" disabled={busy||completed.length>0} value={phrase} onChange={event=>setPhrase(event.target.value)}/></label>
    <div className="pdf-classification-actions"><button disabled={busy} className="secondary-button" onClick={onClose}>{completed.length?'关闭':'取消'}</button>{previewFailed&&<button disabled={busy} onClick={()=>void load()}>重试失败预检</button>}{failed&&<button disabled={busy||phrase!==confirmation} onClick={()=>void apply()}>重试失败批次</button>}{ready&&<button disabled={busy||phrase!==confirmation} className="primary-button" onClick={()=>void apply()}>确认处理</button>}</div>
  </div></div>;
}
