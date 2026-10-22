import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { CreatedOutboundPackageView, OutboundHistoryDetailView, OutboundHistoryFiltersView, OutboundPreflightView, OutboundRegenerationView, PlannerApi } from '../../data/client';
import { chooseOutboundDirectory, openOutboundPackageLocation } from '../../desktop-files';
import { PackageResult } from './PackageResult';

const record=(value:unknown):Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
const fieldNames:Record<string,string>={fileName:'文件名',fullCode:'完整图号',relativePath:'实际路径',contentSha256:'内容哈希',sourceBatchName:'来源批次',sourceBatchId:'来源批次编号',source:'来源',confirmationReason:'人工确认依据',sizeBytes:'文件大小（字节）',partNumber:'分包序号',pdfFileId:'文件索引编号',drawingId:'正式图号记录',historicalDrawingId:'历史图号记录',comparison:'上批对比',bomContext:'BOM 辅助核对',status:'核对状态',change:'差异状态',detail:'核对说明',conversionType:'转曲状态',appearanceVersionId:'外观版本编号'};
const display=(value:unknown):string=>value===null||value===undefined?'未记录':typeof value==='object'?JSON.stringify(value,null,2):String(value);

export function PackageHistory({ api, productId, refreshId }: { api: PlannerApi; productId?: number; refreshId?: number }) {
  const [packages, setPackages] = useState<Awaited<ReturnType<PlannerApi['listOutboundPackages']>>>([]);
  const [error, setError] = useState('');
  const [historyOptions,setHistoryOptions]=useState<Awaited<ReturnType<PlannerApi['listOutboundPackages']>>>([]);
  const [filters,setFilters]=useState<OutboundHistoryFiltersView>({});
  const [draft,setDraft]=useState<Record<string,string>>({});
  const [detail,setDetail]=useState<OutboundHistoryDetailView|null>(null);
  const [busy,setBusy]=useState(false);
  const [revision,setRevision]=useState(0);
  const [regeneration,setRegeneration]=useState<{plan:OutboundRegenerationView;preflight:OutboundPreflightView}|null>(null);
  const [created,setCreated]=useState<CreatedOutboundPackageView|null>(null);
  useEffect(() => {
    let current = true; setError('');
    const loading=Object.keys(filters).length?api.listOutboundPackages(productId,filters):api.listOutboundPackages(productId);
    void loading.then(items=>{if(current){setPackages(items);setHistoryOptions(previous=>[...new Map([...previous,...items].map(item=>[item.id,item])).values()]);}}).catch(failure=>{if(current)setError(failure instanceof Error?failure.message:'外发历史加载失败');});
    return()=>{current=false;};
  },[api,productId,refreshId,filters,revision]);
  const prepare=async(id:number)=>{
    setBusy(true);setError('');
    try{
      if(!api.prepareOutboundRegeneration||!api.preflightOutboundPackage)throw new Error('当前服务不支持历史再生成，请更新本地服务');
      const plan=await api.prepareOutboundRegeneration(id);
      const preflight=await api.preflightOutboundPackage({...plan.request,previewToken:plan.preview.previewToken,selectedPdfFileIds:plan.selectedPdfFileIds});
      setRegeneration({plan,preflight});
    }catch(error){setError(error instanceof Error?error.message:'历史源文件核查失败');}finally{setBusy(false);}
  };
  const regenerate=async()=>{
    if(!regeneration||regeneration.preflight.blockingErrors.length)return;
    setBusy(true);setError('');
    try{
      const picked=await chooseOutboundDirectory();
      if(!picked.ok){if(!picked.cancelled)throw new Error(picked.error?.message??'选择输出目录失败');return;}
      const {plan}=regeneration;
      const value=await api.createOutboundPackage({...plan.request,previewToken:plan.preview.previewToken,selectedPdfFileIds:plan.selectedPdfFileIds});
      setCreated(value);setRegeneration(null);setRevision(value=>value+1);
    }catch(error){setError(error instanceof Error?error.message:'重新生成失败');}finally{setBusy(false);}
  };
  return <details className="outbound-panel outbound-history" open={productId === undefined ? true : undefined}>
    <summary>已生成的压缩包</summary>
    <form className="outbound-history-filters" onSubmit={event=>{event.preventDefault();setFilters({brand:draft.brand||undefined,model:draft.model||undefined,sku:draft.sku||undefined,appearanceVersionId:draft.appearanceVersionId?Number(draft.appearanceVersionId):undefined,batchId:draft.batchId?Number(draft.batchId):undefined,materialType:draft.materialType as OutboundHistoryFiltersView['materialType']||undefined,dateFrom:draft.dateFrom||undefined,dateTo:draft.dateTo||undefined});}}>
      {([['brand','品牌','text'],['model','产品型号','text'],['sku','SKU','text'],['dateFrom','生成日期起','date'],['dateTo','生成日期止','date']] as const).map(([key,label,type])=><label key={key}>历史{label}<input aria-label={`历史${label}`} type={type} value={draft[key]??''} onChange={event=>setDraft(value=>({...value,[key]:event.target.value}))}/></label>)}
      {historyOptions.some(item=>item.appearanceVersionId)&&<label>历史外观版本<select aria-label="历史外观版本" value={draft.appearanceVersionId??''} onChange={event=>setDraft(value=>({...value,appearanceVersionId:event.target.value}))}><option value="">全部外观</option>{[...new Map(historyOptions.filter(item=>item.appearanceVersionId).map(item=>[item.appearanceVersionId,item])).values()].map(item=><option key={item.appearanceVersionId} value={item.appearanceVersionId!}>{item.model} · {item.appearanceLabel??'外观名称未记录'}</option>)}</select></label>}
      <label>历史资料批次<select aria-label="历史资料批次" value={draft.batchId??''} onChange={event=>setDraft(value=>({...value,batchId:event.target.value}))}><option value="">全部批次</option>{[...new Map(historyOptions.filter(item=>item.selectedMaterialBatchId).map(item=>[item.selectedMaterialBatchId,item])).values()].map(item=><option key={item.selectedMaterialBatchId} value={item.selectedMaterialBatchId}>{item.model} · {item.batchName??'历史批次名称未记录'}</option>)}</select></label>
      <label>历史资料类型<select aria-label="历史资料类型" value={draft.materialType??''} onChange={event=>setDraft(value=>({...value,materialType:event.target.value}))}><option value="">全部</option><option value="initial">初次资料</option><option value="update">更新资料</option></select></label>
      <button type="submit">查询历史</button><button type="button" onClick={()=>{setDraft({});setFilters({});}}>清除历史筛选</button>
    </form>
    {error&&<p role="alert" className="error-banner">{error}</p>}
    {!packages.length&&!error&&<p className="muted-text">暂无已生成记录</p>}
    {packages.map(item=><section key={item.id} className="outbound-result">
      <strong>{item.packageName}</strong><span>{item.createdAt} · {item.fileCount} 个文件</span>
      <p>{[item.brand,item.model,item.sku,item.appearanceLabel,item.batchName].filter(Boolean).join(' · ')}</p>
      {item.parts.map(part=><div key={part.partNumber}><span className="file-primary">{part.zipRelativePath}</span><span> · {part.sizeBytes===null?'大小未记录':`${(part.sizeBytes/1_000_000).toFixed(2)} MB`}{part.fileCount===undefined?'':` · ${part.fileCount} 个文件`}</span><button type="button" className="text-button" aria-label={`打开${item.packageName}第${part.partNumber}份位置`} onClick={async()=>{const result=await openOutboundPackageLocation(item.id,part.partNumber);if(!result.ok)setError(result.error?.message??'打开位置失败');}}>打开第{part.partNumber}份位置</button></div>)}
      {api.getOutboundPackageDetails&&<button type="button" className="text-button" onClick={async()=>{setError('');try{setDetail(await api.getOutboundPackageDetails!(item.id));}catch(error){setError(error instanceof Error?error.message:'读取历史快照失败');}}}>查看历史详情 #{item.id}</button>}
    </section>)}
    {detail&&createPortal(<aside role="dialog" aria-modal="true" aria-label="外发历史详情" className="outbound-file-drawer"><header><h2>外发历史 #{detail.id}</h2><button onClick={()=>setDetail(null)}>关闭历史详情</button></header><p>以下条件及文件来自生成时的只读快照。</p><dl>{[['品牌',record(detail.context.product).brand??record(detail.context.identity).brand],['产品型号',record(detail.context.product).model??record(detail.context.identity).model],['SKU',record(detail.context.product).sku??record(detail.context.identity).sku],...(record(detail.context.appearance).label?[['历史外观版本',record(detail.context.appearance).label]]:[]),['资料批次',record(detail.context.batch).name],['资料类型',record(detail.context.request).materialType==='initial'?'初次资料':record(detail.context.request).materialType==='update'?'更新资料':'历史未记录'],['打包范围',record(detail.context.request).packageMode==='current_complete'?'当前完整包材资料':record(detail.context.request).packageMode==='change_only'?'本次变更资料':'历史未记录'],['原操作记录',record(detail.context.request).regeneratedFromPackageId],['当时的警告',detail.context.warnings],['当时的人工确认',detail.context.fileConfirmations]].map(([label,value])=><div key={String(label)}><dt>{String(label)}</dt><dd>{display(value)}</dd></div>)}</dl><details><summary>当时的外发条件、警告与人工确认</summary><pre className="outbound-snapshot">{display(detail.context)}</pre></details><h3>实际外发文件（{detail.files.length}）</h3>{detail.files.map((file,index)=><details key={index}><summary>{display(file.fileName??file.file_name)} · {display(file.fullCode??file.full_code)}</summary><dl>{Object.entries(file).map(([key,value])=><div key={key}><dt>{fieldNames[key]??key}</dt><dd>{display(value)}</dd></div>)}</dl></details>)}<h3>实际分包</h3>{detail.parts.map((part,index)=><details key={index}><summary>{display(part.zipRelativePath)} · {display(part.fileCount)} 个文件 · {part.isPresent?'ZIP 存在':'ZIP 已不存在或不可读取'}</summary><pre className="outbound-snapshot">{display(part)}</pre></details>)}<button disabled={busy} onClick={()=>void prepare(detail.id)}>核查源文件并重新生成新记录</button><p className="muted-text">重新检查每个源文件的内容哈希、路径和归属；生成失败或内容变化时保留原历史。</p></aside>,document.body)}
    {regeneration&&createPortal(<div className="outbound-overlay"><section role="dialog" aria-modal="true" aria-label="历史重新生成预检" className="outbound-confirm-dialog"><h2>重新生成预检</h2><p>来源历史 #{regeneration.plan.sourcePackageId} · {regeneration.preflight.selectedCount} 个文件。确认后新建外发记录。</p>{regeneration.preflight.warnings.map((warning,index)=><p className="info-banner" key={index}>{warning}</p>)}{regeneration.preflight.blockingErrors.map((error,index)=><p className="error-banner" key={index}>{error.message}</p>)}<button disabled={busy} onClick={()=>setRegeneration(null)}>取消重新生成</button><button disabled={busy||regeneration.preflight.blockingErrors.length>0} onClick={()=>void regenerate()}>{busy?'生成中…':'确认生成新记录'}</button></section></div>,document.body)}
    {created&&<PackageResult value={created}/>}
  </details>;
}
