import { scanExecutionLabel, scanExecutionProgress, useOwnedScanProgress } from '../useScanProgress';
import { templateRanges } from './packaging-dimensions';
import { isMaterialDirectory } from '../../../core/files/material-directory-policy';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawingView, PlannerApi } from '../../data/client';
import type { PackagingApi } from '../../data/packaging-client';
import type { PackagingArchivePreview, PackagingCatalog, PackagingDrawingRef, PackagingMode, PackagingParameter, PackagingProductDirectory, PackagingTask, PackagingTaskItem, PackagingTaskItemInput } from '../../../core/packaging/packaging-types';
import { DataTable } from '../../components/DataTable';
import { modeLabels, ParameterValues, productLabel, type PackagingLookups } from './PackagingEditors';
import { ProductLinePicker } from '../../components/ProductLinePicker';
import { resetTableLayouts } from '../../components/useTableLayout';
import { ChevronRight } from 'lucide-react';
import { ActionToast } from '../../components/ActionToast';
import { CopyButton } from '../../components/CopyButton';
import { useModalFocus } from '../../components/useModalFocus';

export interface PackagingNavigationTarget { productId:number; drawings:PackagingDrawingRef[]; revision?:number; itemSettings?:Array<{origin:PackagingDrawingRef['origin'];id:number;input:PackagingTaskItemInput}> }
const isOpenTask=(task:PackagingTask)=>!task.endedAt&&task.state!=='completed';
const itemState:Record<PackagingTaskItem['state'],string>={pending:'待生成',generating:'生成中',generated:'待检查',failed:'异常',awaiting_upload:'待关联',awaiting_review:'待检查',completed:'已确认',none:'无需生成'};
const itemStatus=(item:PackagingTaskItem)=>item.error?'failed':item.state==='completed'&&item.sha256!==item.reviewedSha256?'awaiting_review':item.state;
const needsWork=(item:PackagingTaskItem)=>item.mode!=='none'&&itemStatus(item)!=='completed';
const sourceModes:readonly PackagingMode[]=['ait','manual','existing'];

const taskLabel=(task:PackagingTask)=>task.endedAt?'已结束':taskState[task.state];
const taskState:Record<PackagingTask['state'],string>={active:'处理中',archiving:'归档中',awaiting_index:'等待索引',completed:'已完成'};
async function productDrawings(api:PlannerApi,productId:number):Promise<DrawingView[]> {
  const first=await api.searchDrawings({productId,page:1,pageSize:100});const items=[...first.items];
  for(let page=2;items.length<first.total;page++){const result=await api.searchDrawings({productId,page,pageSize:100});if(!result.items.length)break;items.push(...result.items);}
  return items;
}
const errorText=(reason:unknown)=>reason instanceof Error?reason.message:'操作失败，请重试';

export function PackagingTasks({api,catalog,lookups,target,active=true}:{active?:boolean;api:PlannerApi;catalog:PackagingCatalog;lookups:PackagingLookups;target?:PackagingNavigationTarget|null}) {
  const packaging=api.packaging!;
  const [tasks,setTasks]=useState<PackagingTask[]>([]);const [selected,setSelected]=useState<PackagingTask|null>(null);
  const [detailVisible,setDetailVisible]=useState(false);
  const [historyFilter,setHistoryFilter]=useState<'active'|'all'>('all');
  const [historySearch,setHistorySearch]=useState('');
  const [createExpanded,setCreateExpanded]=useState(Boolean(target));
  const [productId,setProductId]=useState(target?.productId??0);const [type,setType]=useState<'new'|'modify'>('new');
  const [directories,setDirectories]=useState<PackagingProductDirectory[]>([]);const [directory,setDirectory]=useState('');
  const [drawings,setDrawings]=useState<DrawingView[]>([]);const [refs,setRefs]=useState<PackagingDrawingRef[]>(target?.drawings??[]);
  const [sourceChoices,setSourceChoices]=useState<Record<string,Array<{pdfIndexId:number;fileName:string;relativePath:string}>>>({});
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [loading,setLoading]=useState(true);const requestGeneration=useRef(0);
  const [temporaryProducts,setTemporaryProducts]=useState<number[]>([]);const [deletion,setDeletion]=useState<Awaited<ReturnType<PackagingApi['deletionPreview']>>|null>(null);const [acknowledged,setAcknowledged]=useState(false);const [deleteError,setDeleteError]=useState('');const deletePanel=useRef<HTMLDivElement>(null);
  useModalFocus({panel:deletePanel,open:Boolean(deletion),onClose:()=>{if(!busy)setDeletion(null);}});
  const [ending,setEnding]=useState(false);
  const historyRequest=useRef(0),detailRequest=useRef(0),mutation=useRef(false),mutationRequest=useRef(0),taskRevision=useRef(0);
  // A history snapshot may finish after a newer detail or mutation; merge only those newer task revisions.
  const taskUpdates=useRef(new Map<string,{revision:number;task:PackagingTask}>());
  const [historyError,setHistoryError]=useState('');const [hasHistory,setHasHistory]=useState(false);
  const appliedTarget=useRef<PackagingNavigationTarget|null>(null);
  const refreshHistory=useCallback(async()=>{
    const request=++historyRequest.current;const revision=taskRevision.current;setLoading(true);
    try{const items=await packaging.listTasks();if(request===historyRequest.current){const updates=[...taskUpdates.current.values()].filter(update=>update.revision>revision);const latest=new Map(items.map(task=>[task.id,task]));for(const update of updates)latest.set(update.task.id,update.task);setTasks([...latest.values()]);setHasHistory(true);setHistoryError('');return true;}return false;}
    catch(reason){if(request===historyRequest.current)setHistoryError(errorText(reason));return false;}
    finally{if(request===historyRequest.current)setLoading(false);}
  },[packaging]);
  const refresh=async()=>{const refreshed=await refreshHistory();if(productId){const generation=requestGeneration.current;const result=await productDrawings(api,productId);if(generation===requestGeneration.current)setDrawings(result.filter(d=>!d.deletedAt&&d.status!=='voided'));}return refreshed;};
  useEffect(()=>{if(active)void refreshHistory();return()=>{historyRequest.current++;detailRequest.current++;};},[active,refreshHistory]);
  useEffect(()=>{
    const previous=appliedTarget.current;
    if(!target){
      if(previous){appliedTarget.current=null;setCreateExpanded(false);setRefs([]);}
      return;
    }
    if(previous?.revision===target.revision&&previous?.productId===target.productId&&JSON.stringify(previous.drawings)===JSON.stringify(target.drawings))return;
    appliedTarget.current=target;detailRequest.current++;setProductId(target.productId);setCreateExpanded(true);
    setRefs(target.drawings);setType('new');setSelected(null);setDetailVisible(false);setError('');
  },[target]);
  useEffect(()=>{
    const generation=++requestGeneration.current;setDirectories([]);setDirectory('');setDrawings([]);setSourceChoices({});setError('');
    if(!productId)return;
    void Promise.all([packaging.getProductDirectories(productId),productDrawings(api,productId)]).then(([dirs,result])=>{
      if(generation!==requestGeneration.current)return;setDirectories(dirs);if(dirs.length===1&&dirs[0].exists)setDirectory(dirs[0].relativePath);setDrawings(result.filter(d=>!d.deletedAt&&d.status!=='voided'));
    }).catch(e=>{if(generation===requestGeneration.current)setError(errorText(e));});
  },[productId,packaging,api]);
  const missingSource=type==='modify'&&refs.some(ref=>{const options=sourceChoices[`${ref.origin}:${ref.id}`];return !options||options.length===0||options.length>1&&!ref.sourcePdfFileId;});
  const activeTask=tasks.find(t=>t.productId===productId&&isOpenTask(t));
  const filteredTasks=tasks.filter(t=>(historyFilter==='all'||isOpenTask(t))&&t.model.toLowerCase().includes(historySearch.trim().toLowerCase()));
  const openTask=async(id:string)=>{const request=++detailRequest.current;setBusy(true);setError('');try{const next=await packaging.getTask(id);if(request===detailRequest.current){setSelected(next);setDetailVisible(true);}}catch(e){if(request===detailRequest.current)setError(errorText(e));}finally{setBusy(false);}};
  const chooseDrawing=async(drawing:DrawingView,checked:boolean)=>{
    const ref:PackagingDrawingRef={origin:drawing.origin,id:Math.abs(drawing.id)};const key=`${ref.origin}:${ref.id}`;
    if(!checked){setRefs(refs.filter(r=>!(r.id===ref.id&&r.origin===ref.origin)));return;}
    setRefs([...refs,ref]);
    if(type==='modify'){
      try{const detail=await api.getDrawing(drawing.origin==='historical'?-Math.abs(drawing.id):drawing.id);setSourceChoices(current=>({...current,[key]:detail.sourceFiles.filter(f=>f.isPresent)}));}catch(e){setError(errorText(e));}
    }
  };
  const fromPlanning=target?.productId===productId&&type==='new';
  const acceptTask=useCallback((task:PackagingTask,select=false)=>{taskUpdates.current.set(task.id,{revision:++taskRevision.current,task});setSelected(current=>select||current?.id===task.id?task:current);setTasks(current=>current.some(t=>t.id===task.id)?current.map(t=>t.id===task.id?task:t):[task,...current]);},[]);
  const refreshTask=useCallback(async(id:string)=>{
    if(mutation.current)return;const request=++detailRequest.current;
    try{const next=await packaging.getTask(id);if(request===detailRequest.current)acceptTask(next);}
    catch(reason){if(request===detailRequest.current)throw reason;}
  },[packaging,acceptTask]);
  // Visibility invalidates reads, but a successful save must still settle the mounted editor.
  const runTask=async(operation:()=>Promise<PackagingTask>)=>{
    mutation.current=true;const request=++mutationRequest.current;detailRequest.current++;historyRequest.current++;setLoading(false);
    try{const next=await operation();if(request===mutationRequest.current)acceptTask(next);}
    finally{if(request===mutationRequest.current)mutation.current=false;}
  };
  const prepareRemoval=async(task:PackagingTask,terminate:boolean)=>{
    setBusy(true);setError('');setDeleteError('');setAcknowledged(false);setEnding(terminate);
    try{setDeletion(await (terminate?packaging.terminationPreview(task.id):packaging.deletionPreview(task.id)));}
    catch(reason){setError(errorText(reason));}finally{setBusy(false);}
  };
  const refreshList=async()=>{
    setBusy(true);setError('');setMessage('');
    try{if(await refresh())setMessage('任务记录已刷新');}
    catch(reason){setError(errorText(reason));}finally{setBusy(false);}
  };
  return <section className="pkg-tasks" aria-label="制图任务管理">
    {selected&&<div hidden={!detailVisible}><TaskDetail readScanStatus={api.getPdfScanStatus} active={active} visible={detailVisible} refreshTask={refreshTask} runTask={runTask} key={selected.id} packaging={packaging} task={selected} catalog={catalog} brands={lookups.brands} productId={selected.productId} productTitle={[lookups.products.find(p=>p.id===selected.productId)?.brandName,selected.model].filter(Boolean).join(' · ')} onBack={()=>{detailRequest.current++;setDetailVisible(false);void refresh().catch(e=>setError(errorText(e)));}}/></div>}
    <div hidden={detailVisible}>
      <div className="pkg-editor pkg-task-create">
        <div className="pkg-task-launch">
          <label>产品型号<select value={productId||''} disabled={busy||Boolean(target)} onChange={event=>{setProductId(Number(event.target.value));setCreateExpanded(false);setRefs([]);}}>
            <option value="">请选择产品</option>{lookups.products.map(product=><option key={product.id} value={product.id}>{productLabel(product)}</option>)}
          </select></label>
          {!fromPlanning&&<button type="button" className="primary-button" aria-expanded={createExpanded} aria-controls="pkg-task-create-fields" disabled={busy||!productId||Boolean(activeTask)} onClick={()=>setCreateExpanded(value=>!value)}>发起任务</button>}
        </div>
        {activeTask&&<p className="pkg-muted">{activeTask.model} 已有未完成任务，可在任务历史中继续。</p>}
        {createExpanded&&!activeTask&&<div id="pkg-task-create-fields">
        <div className="pkg-fields">{!fromPlanning&&<label>任务类型<select value={type} disabled={busy} onChange={event=>{setType(event.target.value as 'new'|'modify');setRefs([]);setSourceChoices({});}}><option value="new">新建文件</option><option value="modify">修改正式文件</option></select></label>}{productId>0&&(directories.length!==1||!directories[0]?.exists)&&<label>实际产品目录<select value={directory} disabled={busy} onChange={event=>setDirectory(event.target.value)}><option value="">{directories.length>1?'存在多个目录，请明确选择':'请核对目录'}</option>{directories.map((d,index)=><option key={`${d.relativePath}-${index}`} value={d.relativePath}>{d.relativePath}{d.exists?'':'（尚未建立）'}</option>)}</select></label>}</div>
      {productId>0&&directories.length===0&&<p className="pkg-muted">未找到实际产品目录，请在 PDF 文件中心扫描或核对产品档案。</p>}
        <fieldset className="pkg-drawing-choices" disabled={busy}><legend>{fromPlanning?'本次已占号图号':type==='modify'?'选择需要修改的正式源 PDF':'选择已占号图号'}</legend>{drawings.filter(d=>(type!=='modify'||d.hasSourceFile)&&(!fromPlanning||refs.some(r=>r.origin===d.origin&&r.id===Math.abs(d.id)))).map(d=>{
          const checked=refs.some(r=>r.origin===d.origin&&r.id===Math.abs(d.id));const key=`${d.origin}:${Math.abs(d.id)}`;return <div key={key}>{fromPlanning?<span><strong>{d.fullCode}</strong> · {d.projectItemName} · {d.colorName}</span>:<label className="pkg-check"><input type="checkbox" checked={checked} onChange={event=>void chooseDrawing(d,event.target.checked)}/>{d.fullCode} · {d.projectItemName} · {d.colorName}</label>}{checked&&type==='modify'&&sourceChoices[key]&&<label>原始源 PDF<select aria-label={`${d.fullCode} 原始源 PDF`} value={refs.find(r=>r.origin===d.origin&&r.id===Math.abs(d.id))?.sourcePdfFileId??''} onChange={event=>setRefs(refs.map(r=>r.origin===d.origin&&r.id===Math.abs(d.id)?{...r,sourcePdfFileId:Number(event.target.value)||undefined}:r))}><option value="">{sourceChoices[key].length===1?'使用唯一正式源文件':'请选择要修改的源 PDF'}</option>{sourceChoices[key].map(f=><option key={f.pdfIndexId} value={f.pdfIndexId}>{f.relativePath}</option>)}</select></label>}</div>;
        })}{refs.filter(ref=>!drawings.some(d=>d.origin===ref.origin&&Math.abs(d.id)===ref.id)).map(ref=><p key={`${ref.origin}:${ref.id}`}>已带入本次确认占号的图号</p>)}{productId>0&&!drawings.length&&!refs.length&&<small>此产品暂无可用图号，请先规划并确认占号。</small>}</fieldset>
        <div className="pkg-actions"><button type="button" className="primary-button" disabled={busy||loading||!productId||!directory||!refs.length||missingSource} onClick={async()=>{setBusy(true);setError('');setMessage('');try{const current=await packaging.listTasks(productId);const existing=current.find(t=>!t.endedAt&&t.state!=='completed');if(existing){setTasks(prev=>[...prev.filter(t=>t.id!==existing.id),existing]);throw new Error('此产品已有未完成任务，请继续现有任务');}const task=await packaging.createTask({productId,type,productDirectory:directory,drawings:refs});acceptTask(task,true);setDetailVisible(true);await refresh();}catch(e){setError(errorText(e));void refresh().catch(()=>{});}finally{setBusy(false);}}}>{busy?'处理中…':'创建任务'}</button>{missingSource&&<small>请明确选择可用的正式源 PDF。</small>}</div>
      </div>}</div>
      <div className="pkg-section-heading">
        <h2>任务历史</h2>
        <details className="pkg-task-settings"><summary>列表设置</summary><div className="pkg-actions">
          <button type="button" disabled={busy} onClick={()=>void refreshList()}>刷新任务记录</button>
          <button type="button" onClick={()=>resetTableLayouts('packaging-tasks')}>恢复默认表格布局</button>
        </div></details>
      </div>
      <div className="pkg-task-history-filters">
        <div className="pkg-view-switch" role="group" aria-label="任务范围">
          <button type="button" aria-pressed={historyFilter==='active'} onClick={()=>setHistoryFilter('active')}>进行中</button>
          <button type="button" aria-pressed={historyFilter==='all'} onClick={()=>setHistoryFilter('all')}>全部历史</button>
        </div>
        <input type="search" aria-label="搜索任务型号" placeholder="搜索型号" value={historySearch} onChange={event=>setHistorySearch(event.target.value)}/>
      </div>
      {loading&&!hasHistory&&<p role="status">加载任务记录…</p>}
      {hasHistory?<DataTable tableId="packaging-tasks" showLayoutTools={false} items={filteredTasks} columns={[
        {key:'model',label:'产品型号',width:150,render:t=><strong>{t.model}</strong>},
        {key:'type',label:'任务类型',width:130,render:t=>t.type==='new'?'新建文件':'修改正式文件'},
        {key:'status',label:'状态',width:105,render:t=><span className={`pkg-state state-${t.endedAt?'ended':t.state}`}>{taskLabel(t)}</span>},
        {key:'files',label:'项目数',width:82,render:t=>t.items.length},
        {key:'date',label:'创建 / 完成',width:155,render:t=><>{localTime(t.createdAt)}<small>{t.endedAt?`结束于 ${localTime(t.endedAt)}`:t.completedAt?localTime(t.completedAt):'未完成'}</small></>},
        {key:'actions',label:'操作',align:'right',width:200,render:t=><div className="pkg-task-row-actions">
          <button type="button" disabled={busy} onClick={()=>void openTask(t.id)}>{isOpenTask(t)?'继续任务':'查看记录'}</button>
          <details className="pkg-task-row-menu"><summary aria-label={`${t.model} 更多操作`}>更多操作</summary><div>
            {isOpenTask(t)&&<button type="button" disabled={busy} onClick={()=>void prepareRemoval(t,true)}>取消任务（保留文件）</button>}
            <button type="button" className="pkg-danger" disabled={busy} onClick={()=>void prepareRemoval(t,false)}>删除任务记录</button>
          </div></details>
        </div>},
      ]}/>:null}
      {loading&&hasHistory&&<p role="status" className="sr-only">正在刷新任务记录…</p>}
      {!loading&&hasHistory&&!historyError&&!filteredTasks.length&&<p className="pkg-empty">{tasks.length?'没有符合筛选条件的任务记录。':'暂无制图任务记录。'}</p>}
      <details className="pkg-config pkg-task-tools"><summary>辅助操作</summary>
        <h3>批量检查临时文件夹</h3>
        <ProductLinePicker products={lookups.products} selectedIds={temporaryProducts} onChange={setTemporaryProducts} label="待检查产品" disabled={busy}/>
        <div className="pkg-actions"><button type="button" disabled={busy||!temporaryProducts.length} onClick={async()=>{setBusy(true);setError('');setMessage('');try{const result=await packaging.createTemporaryDirectories(temporaryProducts);const failed=result.items.filter(i=>i.error);if(failed.length)throw new Error(failed.map(i=>`${lookups.products.find(p=>p.id===i.productId)?.model??i.productId}：${i.error}`).join('；'));setMessage('所选产品的临时文件夹检查完成');}catch(reason){setError(errorText(reason));}finally{setBusy(false);}}}>检查 {temporaryProducts.length} 个产品并创建临时文件夹</button>{!temporaryProducts.length&&<small>请先选择产品。</small>}</div>
      </details>
    </div>
    {!detailVisible&&historyError&&<p className="pkg-error" role="alert">任务记录加载失败：{historyError}<button type="button" onClick={()=>void refreshHistory()}>重试任务记录</button></p>}{error&&<p className="pkg-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {deletion&&<div className="pkg-modal-backdrop"><div ref={deletePanel} className="pkg-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="pkg-delete-title" tabIndex={-1}><h3 id="pkg-delete-title">{ending?'取消任务（保留文件）':'删除制图任务记录'}</h3><p><strong>{lookups.products.find(p=>p.id===deletion.productId)?.brandName} · {deletion.model}</strong></p><p>{taskState[deletion.state]} · 创建于 {localTime(deletion.createdAt)}</p><p>{ending?'结束当前任务并保留历史，不代表归档成功。':'仅删除任务记录。'}{deletion.fileCount} 个关联文件及实际 PDF、原始 AIT、正式文件均保留；已占图号、BOM、外发历史和 PDF 索引保持不变。</p>{deletion.releasesLock&&<label className="pkg-check"><input type="checkbox" checked={acknowledged} disabled={busy||!deletion.canDelete} onChange={event=>setAcknowledged(event.target.checked)}/>我已知晓任务尚未完成，{ending?'取消':'删除'}后不能继续此任务，并解除该型号的未完成任务占用；现有文件保留。</label>}{!deletion.canDelete&&<p role="alert" className="pkg-error">{deletion.reason??'当前任务暂时不能删除，请稍后重试。'}</p>}{deleteError&&<p role="alert" className="pkg-error">{deleteError}</p>}<div className="pkg-actions"><button type="button" disabled={busy} onClick={()=>setDeletion(null)}>取消</button><button type="button" className="pkg-danger" disabled={busy||!deletion.canDelete||(deletion.releasesLock&&!acknowledged)} onClick={async()=>{setBusy(true);setDeleteError('');try{historyRequest.current++;detailRequest.current++;setLoading(false);const input={confirmed:true as const,token:deletion.token,...(deletion.releasesLock?{acknowledgeUnfinished:true}:{})};if(ending){await packaging.terminateTask(deletion.taskId,input);await refreshHistory();}else{await packaging.deleteTask(deletion.taskId,input);historyRequest.current++;setLoading(false);setTasks(current=>current.filter(t=>t.id!==deletion.taskId));}if(selected?.id===deletion.taskId){setSelected(null);setDetailVisible(false);}setDeletion(null);setMessage(ending?'任务已结束，全部文件和历史已保留':'任务记录已删除，实际文件已保留');}catch(reason){setDeleteError(errorText(reason));if((reason as {code?:string}).code==='TASK_DELETE_CHANGED'||/状态已变化/.test(errorText(reason))){setAcknowledged(false);try{setDeletion(await(ending?packaging.terminationPreview(deletion.taskId):packaging.deletionPreview(deletion.taskId)));}catch(refreshError){setDeleteError(errorText(refreshError));}}}finally{setBusy(false);}}}>{ending?'确认结束任务':'确认删除记录'}</button></div></div></div>}
  </section>;
}

export function localTime(value:string):string {
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '时间未知';
  const parts=new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
  const get=(type:string)=>parts.find(part=>part.type===type)?.value??'';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

function TaskDetail({readScanStatus,packaging,task,catalog,brands,productId,productTitle,onBack,active,visible,refreshTask,runTask}:{readScanStatus:PlannerApi['getPdfScanStatus'];active:boolean;visible:boolean;refreshTask(id:string):Promise<void>;runTask(operation:()=>Promise<PackagingTask>):Promise<void>;packaging:PackagingApi;task:PackagingTask;catalog:PackagingCatalog;brands:PackagingLookups['brands'];productId:number;productTitle:string;onBack():void}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [message,setMessage]=useState('');const [preview,setPreview]=useState<PackagingArchivePreview|null>(null);const [confirmed,setConfirmed]=useState(false);const [previewItem,setPreviewItem]=useState<number|null>(null);const [links,setLinks]=useState<Record<number,string>>({});
  const [dirtyItems,setDirtyItems]=useState<Record<number,boolean>>({});
  const [expandedItem,setExpandedItem]=useState<number|null>(()=>isOpenTask(task)?task.items.find(needsWork)?.id??null:null);
  const rowControls=useRef(new Map<number,HTMLButtonElement>());
  const focusNext=useRef<number|null>(null);
  useEffect(()=>{
    if(focusNext.current===null||focusNext.current!==expandedItem)return;
    rowControls.current.get(focusNext.current)?.focus();
    focusNext.current=null;
  },[expandedItem]);
  const onDirty=useCallback((id:number,dirty:boolean)=>{setDirtyItems(current=>current[id]===dirty?current:{...current,[id]:dirty});if(dirty){setPreview(null);setConfirmed(false);}},[]);
  const hasDrafts=Object.values(dirtyItems).some(Boolean);
  const generating=task.items.some(item=>item.state==='generating');const completed=Boolean(task.endedAt)||task.state==='completed';
  const indexScan = useOwnedScanProgress(readScanStatus, active && visible && !completed);
  const ownsIndexScan = (scan: NonNullable<typeof indexScan.status>['active']) =>
    scan?.source === 'archive' && scan.packagingTaskId === task.id;
  const activeIndex = indexScan.status?.active ?? null;
  const recentIndex = indexScan.status?.recent ?? null;
  const ownActiveIndex = ownsIndexScan(activeIndex) ? activeIndex : null;
  const ownRecentIndex = ownsIndexScan(recentIndex) ? recentIndex : null;
  const fileItems = task.items.filter(item => item.mode !== 'none');
  const confirmedFiles = fileItems.filter(item => !item.error && item.reviewedSha256 && item.reviewedSha256 === item.sha256).length;
  const ownIndex=ownActiveIndex??ownRecentIndex;
  const indexLabel = ownActiveIndex
    ? `${scanExecutionLabel(ownActiveIndex)} · ${scanExecutionProgress(ownActiveIndex)}`
    : task.state === 'completed' && !task.endedAt ? '已完成'
    : task.endedAt ? '任务已取消'
    : indexScan.error && task.state === 'awaiting_index' ? '状态未知，正在重试查询'
    : task.state === 'awaiting_index'
      ? activeIndex ? '等待当前扫描结束'
        : ownRecentIndex?.status === 'failed' ? '本次索引扫描失败，可重试' : '等待索引核验，可重试'
      : '尚未进入归档索引';
  const wasActive=useRef(active);
  useEffect(()=>{
    let live=true;
    const refresh=()=>{if(!live)return;void refreshTask(task.id).then(()=>{if(live)setError('');}).catch(reason=>{if(live)setError(errorText(reason));});};
    if(active&&visible&&!wasActive.current)refresh();wasActive.current=active;
    if(!active||!visible||completed)return()=>{live=false;};
    const timer=window.setInterval(refresh,generating?1000:3000);return()=>{live=false;window.clearInterval(timer);};
  },[active,visible,task.id,generating,completed,refreshTask]);
  const fileVersion=JSON.stringify(task.items.map(i=>[i.id,i.sha256,i.reviewedSha256,i.state]));
  useEffect(()=>{setPreview(null);setConfirmed(false);},[fileVersion,task.state]);
  const act=async(operation:()=>Promise<PackagingTask>,success='')=>{
    setBusy(true);setError('');setMessage('');setPreview(null);setConfirmed(false);
    try{await runTask(operation);setMessage(success);}
    catch(e){setError(errorText(e));}
    finally{setBusy(false);}
  };
  const discover=()=>act(()=>packaging.discover(task.id),'已重新检查临时文件');
  const review=async(item:PackagingTaskItem)=>{
    await act(async()=>{
      const next=await packaging.reviewItem(task.id,item.id,item.sha256!);
      const reviewed=next.items.find(row=>row.id===item.id);
      if(reviewed&&reviewed.reviewedSha256===item.sha256){
        setPreviewItem(current=>current===item.id?null:current);
        const index=next.items.findIndex(row=>row.id===item.id);
        const following=[...next.items.slice(index+1),...next.items.slice(0,index)].find(needsWork);
        if(following){focusNext.current=following.id;setExpandedItem(following.id);}
      }
      return next;
    },'当前文件已确认');
  };
  return <section className="pkg-task-detail" aria-label="当前制图任务">
    <nav className="pkg-task-breadcrumb" aria-label="制图任务面包屑">
      <button type="button" disabled={busy} onClick={onBack}>返回制图任务</button>
      <span aria-hidden="true">/</span><h3 aria-current="page">{productTitle}</h3>
    </nav>
    <div className="pkg-task-actions"><span className={`pkg-state state-${task.endedAt?'ended':task.state}`}>{taskLabel(task)}</span><button type="button" disabled={busy} onClick={()=>{indexScan.refresh();void act(()=>packaging.getTask(task.id),'任务已刷新');}}>刷新当前任务</button></div>
    <details className="pkg-diagnostics"><summary>任务诊断信息</summary><p className="pkg-path">任务标识：{task.id}</p><p className="pkg-path">任务目录：{task.taskDirectory}</p></details>{task.error&&<p role="alert" className="pkg-error">{task.error}</p>}
    <div className="pkg-task-counters" aria-label="制图核验与索引进度">
      <span>文件核验：{confirmedFiles} / {fileItems.length}</span>
      <span role="status">资料库索引：{indexLabel}</span>
      {ownIndex&&<div className="pkg-index-scope"><span>发起来源：制图归档</span><span>扫描范围：{ownIndex.scope.kind==='workspace'?'整个资料库':ownIndex.scope.productDirectories.join('、')}</span>{!ownActiveIndex&&<span>{scanExecutionLabel(ownIndex)}</span>}</div>}
    </div>
    <div className="pkg-actions">{!completed&&<><button type="button" disabled={busy||generating||hasDrafts||task.state!=='active'} onClick={()=>void act(()=>packaging.generate(task.id))}>批量生成待处理项目</button><button type="button" disabled={busy||generating||task.state!=='active'} onClick={()=>void discover()}>识别人工文件</button>{task.state==='awaiting_index'&&<button type="button" disabled={busy||generating||hasDrafts} onClick={()=>void act(()=>packaging.archive(task.id),'归档索引状态已更新')}>重试归档索引</button>}<button type="button" disabled={busy||generating||hasDrafts} onClick={async()=>{setBusy(true);setError('');setConfirmed(false);try{setPreview(await packaging.archivePreview(task.id));}catch(e){setError(errorText(e));}finally{setBusy(false);}}}>归档预览</button></>}</div>
    {hasDrafts&&<p className="pkg-muted">有尚未保存的项目设置，请先保存后批量生成或归档。</p>}{error&&error!==task.error&&<p role="alert" className="pkg-error">{error}</p>}{message==='已重新检查临时文件'?<ActionToast message={message}/>:message&&<p role="status">{message}</p>}
    <div className="pkg-task-table">
      <div className="pkg-task-columns" aria-hidden="true"><span/><span>完整图号</span><span>项目明细</span><span>颜色</span><span>制作方式</span><span>模板匹配</span><span>文件状态</span></div>
      <div className="pkg-task-items">{task.items.map(item=><TaskItem key={item.id} packaging={packaging} task={task} item={item} catalog={catalog} brands={brands} productId={productId} disabled={busy||completed||generating||task.state!=='active'} onAction={act} onDirty={onDirty} expanded={expandedItem===item.id} onToggle={()=>setExpandedItem(current=>current===item.id?null:item.id)} controlRef={element=>{if(element)rowControls.current.set(item.id,element);else rowControls.current.delete(item.id);}} onDiscover={discover} onReview={()=>review(item)} onPreview={()=>setPreviewItem(item.id)}/>)}</div>
    </div>
    {task.pendingFiles.some(f=>f.status==='pending')&&<section className="pkg-pending"><h4>待关联文件</h4>{task.pendingFiles.filter(f=>f.status==='pending').map(file=><div className="pkg-pending-file" key={file.id}><div><strong>{file.fileName}</strong><small>{file.reason} · {file.relativePath}</small></div><label>关联项目<select aria-label={`${file.fileName} 关联项目`} value={links[file.id]??''} disabled={busy||completed} onChange={event=>setLinks({...links,[file.id]:event.target.value})}><option value="">请选择</option>{task.items.filter(i=>i.mode!=='none').map(item=><option key={item.id} value={item.id}>{item.fullCode} · {item.projectName}</option>)}</select></label><button type="button" disabled={busy||completed||!links[file.id]} onClick={()=>void act(()=>packaging.linkFile(task.id,file.id,Number(links[file.id])),'人工文件已关联')}>确认关联</button></div>)}</section>}
    {preview&&<section className="pkg-archive" aria-label="归档确认"><h4>归档预览</h4>{preview.blockers.map((blocker,index)=><p key={index} className="pkg-error">{blocker}</p>)}{preview.files.map(file=><p key={file.itemId}><strong>{file.fullCode}</strong> → {file.destination}{file.replaces?' · 将备份后替换原始文件':''}</p>)}{preview.ready&&<><label className="pkg-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/>已核对全部文件和归档位置，确认统一归档</label><button type="button" className="primary-button" disabled={busy||!confirmed||hasDrafts} onClick={()=>void act(()=>packaging.archive(task.id),'归档状态已更新，请查看任务状态')}>确认统一归档</button></>}</section>}
    {previewItem!==null&&<section className="pkg-pdf-preview" aria-label="PDF 检查预览"><div className="pkg-section-heading"><strong>检查当前 PDF</strong><button type="button" onClick={()=>setPreviewItem(null)}>关闭预览</button></div><iframe title="当前 PDF 文件预览" src={packaging.itemFileUrl(task.id,previewItem)}/></section>}
  </section>;
}

function TaskItem({packaging,task,item,catalog,brands,productId,disabled,onAction,onDirty,onPreview,onDiscover,onReview,expanded,onToggle,controlRef}:{
  packaging:PackagingApi;task:PackagingTask;item:PackagingTaskItem;catalog:PackagingCatalog;brands:PackagingLookups['brands'];productId:number;disabled:boolean;
  onAction(operation:()=>Promise<PackagingTask>,success?:string):Promise<void>;onDirty(id:number,dirty:boolean):void;onPreview():void;onDiscover():Promise<void>;onReview():Promise<void>;
  expanded:boolean;onToggle():void;controlRef(element:HTMLButtonElement|null):void;
}) {
  const initial:PackagingTaskItemInput={mode:item.mode,parameters:item.parameters,templateId:item.templateId,dimensionProfileId:item.dimensionProfileId,ratioLocked:item.ratioLocked};
  const [explicitTemplate,setExplicitTemplate]=useState(Boolean(item.templateId&&(item.match?.status!=='unique'||item.match.templateIds[0]!==item.templateId)));
  const [draft,setDraft]=useState(initial);const [reviewed,setReviewed]=useState(false);const [regenerate,setRegenerate]=useState(false);const [message,setMessage]=useState('');const [localBusy,setLocalBusy]=useState(false);
  const serverSettings=JSON.stringify(initial),previousSettings=useRef(serverSettings);
  useEffect(()=>{const previous=previousSettings.current;if(previous!==serverSettings){setDraft(current=>JSON.stringify(current)===previous?JSON.parse(serverSettings):current);previousSettings.current=serverSettings;}},[serverSettings]);
  useEffect(()=>{setReviewed(false);setRegenerate(false);},[item.sha256,item.reviewedSha256]);
  const definitions=catalog.configs.find(c=>c.projectItemId===item.projectItemId)?.parameters??[];
  const profiles=catalog.dimensions.filter(d=>d.status==='active'&&d.projectItemId===item.projectItemId&&d.productIds.includes(productId)).sort((a,b)=>(a.scope==='specific'?0:1)-(b.scope==='specific'?0:1));
  const profile=profiles.find(p=>p.id===draft.dimensionProfileId);const dirty=JSON.stringify(initial)!==JSON.stringify(draft);const editable=!disabled&&!localBusy;
  useEffect(()=>{onDirty(item.id,dirty);return()=>onDirty(item.id,false);},[item.id,dirty,onDirty]);
  const successful=Boolean(item.sha256);const match=item.match;
  const matchLabel=draft.mode!=='ait'?'—':dirty?'设置待保存':item.templateName??(match?.status==='multiple'?'多个适用模板':match?.status==='missing_dimensions'?'待填写尺寸':'无匹配模板');
  const compatibleDefinitions:PackagingParameter[]=[...definitions,...Object.keys(draft.parameters??{}).filter(key=>!definitions.some(d=>d.key===key)).map((key,index)=>({key,label:`历史参数 ${index+1}`,type:typeof draft.parameters?.[key]==='number'?'number' as const:'text' as const,required:false}))];
  const dimensionDefinitions=compatibleDefinitions.map(p=>({...p,label:p.label||(p.axis?{length:'长',width:'宽',height:'高'}[p.axis]:'尺寸')}));
  const path=item.relativePath?.replaceAll('\\','/'),base=task.productDirectory.replaceAll('\\','/');
  const formal=Boolean(path?.startsWith(`${base}/`)&&isMaterialDirectory(path.slice(base.length+1).split('/')[0]));
  const changeDimensions=(parameters:PackagingTaskItemInput['parameters'])=>setDraft({...draft,parameters,...(!explicitTemplate?{templateId:undefined}:{})});
  const status=itemStatus(item);
  const [sourceFile,setSourceFile]=useState('');
  const pendingFiles=task.pendingFiles.filter(file=>file.status==='pending');
  return <section className="pkg-task-item" aria-label={`${item.fullCode} ${item.projectName}`}>
    <div className="pkg-task-row"><button type="button" className="pkg-item-expander" ref={controlRef} aria-label={`展开或收起 ${item.fullCode}`} aria-expanded={expanded} aria-controls={`pkg-item-${item.id}`} onClick={onToggle}><ChevronRight size={16} aria-hidden="true"/></button><strong data-label="完整图号">{item.fullCode}</strong><span data-label="项目明细">{item.projectName}</span><span data-label="颜色">{item.color}</span><span data-label="制作方式">{modeLabels[draft.mode??item.mode]}</span><span data-label="模板匹配">{matchLabel}</span><span data-label="文件状态" className={`pkg-state state-${status}`}>{itemState[status]}</span></div>
    <div id={`pkg-item-${item.id}`} className="pkg-task-expansion" hidden={!expanded}>
    <section className="pkg-task-source" aria-label="文件来源"><h4>文件来源</h4>
    {(dirty||isOpenTask(task))&&<>
    <form onSubmit={event=>{event.preventDefault();void onAction(async()=>{const next=await packaging.updateItem(task.id,item.id,draft);const saved=next.items.find(i=>i.id===item.id)!;setDraft({mode:saved.mode,parameters:saved.parameters,templateId:saved.templateId,dimensionProfileId:saved.dimensionProfileId,ratioLocked:saved.ratioLocked});return next;},'本次参数已保存');}}>
    <fieldset disabled={!editable}>
      <div className="pkg-source-modes pkg-view-switch" role="group" aria-label="本次生成方式">{sourceModes.map(mode=><button key={mode} type="button" aria-pressed={draft.mode===mode} onClick={()=>setDraft({...draft,mode})}>{modeLabels[mode]}</button>)}</div>
      {draft.mode==='none'&&<p className="pkg-muted">{modeLabels.none}</p>}
      <div className="pkg-fields">{draft.mode==='ait'&&<>{profiles.length>0&&<label>已保存尺寸<select value={draft.dimensionProfileId??''} onChange={event=>{const selected=profiles.find(p=>p.id===Number(event.target.value));setDraft({...draft,dimensionProfileId:selected?.id,parameters:selected?{...selected.parameters}:{...draft.parameters},ratioLocked:Boolean(selected?.ratioKeys),...(!explicitTemplate?{templateId:undefined}:{})});}}><option value="">本次临时参数</option>{profiles.map(p=><option key={p.id} value={p.id}>{p.name} · {p.scope==='specific'?'指定':'通用'}{(p.defaultProductIds?.includes(productId)??p.isDefault)?' · 默认':''}</option>)}</select></label>}<label>本次模板<select value={draft.templateId??''} onChange={event=>{setExplicitTemplate(Boolean(event.target.value));setDraft({...draft,templateId:Number(event.target.value)||undefined});}}><option value="">保存参数后自动匹配</option>{catalog.templates.filter(t=>t.status==='active'&&t.projectItemId===item.projectItemId&&(t.productIds.length===0||t.productIds.includes(productId))).map(t=><option key={t.id} value={t.id}>{t.name}{match?.templateIds.includes(t.id)?' · 匹配':''}</option>)}</select></label></>}</div>
    {draft.mode==='ait'&&<><ParameterValues definitions={dimensionDefinitions} value={draft.parameters??{}} onChange={changeDimensions} ratioKeys={draft.ratioLocked?profile?.ratioKeys:undefined} ratio={profile?.ratio}/><p className="pkg-muted">临时参数只作用于本次任务。</p>{profile?.ratioKeys&&<label className="pkg-check"><input type="checkbox" checked={Boolean(draft.ratioLocked)} onChange={event=>setDraft({...draft,ratioLocked:event.target.checked})}/>沿用已保存尺寸比例</label>}{match&&!dirty&&<p className={match.status==='unique'?'pkg-muted':'pkg-notice'}>{match.status==='multiple'?'有多个匹配模板，请明确选择后保存。':match.status==='none'?'没有匹配模板，请维护模板 / 规则或人工选择。':match.status==='missing_dimensions'?`请填写：${match.missingParameters.map(key=>definitions.find(p=>p.key===key)?.label??'必要尺寸').join('、')}`:'已找到唯一匹配模板。'}</p>}</>}
    {draft.mode==='ait'&&!dirty&&match?.status==='multiple'&&<section aria-label="匹配冲突列表"><h4>匹配冲突列表</h4>{match.templateIds.map(id=>{const candidate=catalog.templates.find(t=>t.id===id);return candidate?<div key={id}><strong>{candidate.name}</strong><p>品牌限制：{candidate.brandIds.length?candidate.brandIds.map(brand=>brands.find(b=>b.id===brand)?.name??`品牌编号 ${brand}`).join('、'):'全部品牌'}</p>{templateRanges(catalog,candidate).map((range,index)=><p key={index}>尺寸范围：{range}</p>)}<p>匹配原因：符合项目、品牌和尺寸筛选，与其他候选同等匹配。</p></div>:<p key={id}>模板编号 {id}：资料不可用</p>;})}</section>}
    {draft.mode==='ait'&&!dirty&&(()=>{const selected=catalog.templates.find(t=>t.id===(item.templateId??(match?.status==='unique'?match.templateIds[0]:undefined)));return selected&&<section aria-label="生成前模板信息"><h4>生成前模板信息</h4><p>模板：{selected.name}</p><p>原始文件：{selected.assetRelativePath&&(/^(?:[A-Za-z]:[\\/]|[\\/])/.test(selected.assetRelativePath))?selected.assetRelativePath:selected.fileName}</p>{templateRanges(catalog,selected).map((range,index)=><p key={index}>尺寸范围：{range}</p>)}<p>项目：{item.projectName}；完整图号：{item.fullCode}</p></section>;})()}
    </fieldset><div className="pkg-actions"><button type="submit" disabled={!editable||!dirty}>保存本次设置</button>{dirty&&<small>设置有修改，请先保存。</small>}</div></form>
    {(draft.mode==='manual'||draft.mode==='existing')&&<>
      <p className="pkg-muted">{draft.mode==='existing'?'优先匹配正式目录中的已索引图号。也可从临时目录中选择已识别的 PDF。':'将 PDF 放入此产品的 00.临时文件目录，重新识别后可手动关联。'}</p>
      <div className="pkg-actions"><button type="button" disabled={!editable||dirty} onClick={()=>void onDiscover()}>{draft.mode==='manual'?'重新识别临时文件':'查找现成文件'}</button></div>
      {!item.relativePath&&pendingFiles.length>0&&<div className="pkg-field-row">
        <label>选择已识别的 PDF<select disabled={!editable||dirty} value={sourceFile} onChange={event=>setSourceFile(event.target.value)}><option value="">请选择 PDF</option>{pendingFiles.map(file=><option key={file.id} value={file.id}>{file.fileName}</option>)}</select></label>
        <button type="button" disabled={!editable||dirty||!pendingFiles.some(file=>String(file.id)===sourceFile)} onClick={()=>void onAction(()=>packaging.linkFile(task.id,Number(sourceFile),item.id),'文件已关联')}>关联所选 PDF</button>
      </div>}
    </>}
    {item.error&&<p className="pkg-error" role="alert">{item.error}</p>}
    {draft.mode==='ait'&&<div className="pkg-actions">{successful&&<label className="pkg-check"><input type="checkbox" disabled={!editable||dirty} checked={regenerate} onChange={event=>setRegenerate(event.target.checked)}/>明确重新生成本项目（可能已有人工修改）</label>}<button type="button" disabled={!editable||dirty||(successful&&!regenerate)} onClick={()=>void onAction(()=>packaging.generate(task.id,{itemIds:[item.id],...(successful?{regenerate:true}:{})}))}>{successful?'重新生成此项目':item.state==='failed'?'重试此项目':'生成此项目'}</button></div>}
    </>}
    {!isOpenTask(task)&&<p className="pkg-muted">{modeLabels[item.mode]}{item.templateName&&` · ${item.templateName}`}</p>}
    </section>
    <section className="pkg-task-verification" aria-label="目标 PDF 核验"><h4>目标 PDF 核验</h4>
    {!item.sha256&&<p className="pkg-muted">当前没有可核验的 PDF。</p>}
    {item.backupRelativePath&&<p className="pkg-backup"><a href={packaging.itemBackupUrl(task.id,item.id)} target="_blank" rel="noreferrer">查看已校验的原件备份</a></p>}
    {item.sha256&&<div className="pkg-review"><p><strong>{item.fileName}</strong></p><div className="pkg-actions">{item.fileName&&<CopyButton label="复制文件名" onClick={async()=>{try{await navigator.clipboard.writeText(item.fileName!);setMessage('已复制文件名');}catch{setMessage('无法复制文件名，请手动选中文件名');}}}/>}<button type="button" onClick={onPreview}>预览 PDF</button>{!formal&&!task.endedAt&&task.state!=='completed'&&<button type="button" disabled={!editable} onClick={async()=>{setLocalBusy(true);setMessage('');try{await packaging.openItem(task.id,item.id);setMessage('已请求在 Illustrator 中打开；修改保存后请重新识别并确认文件');}catch(e){setMessage(errorText(e));}finally{setLocalBusy(false);}}}>在 Illustrator 中检查 / 修改</button>}</div>{formal&&!task.endedAt&&task.state!=='completed'&&<p>正式文件不能直接编辑，请创建修改正式文件任务并编辑临时副本。</p>}{!task.endedAt&&task.state!=='completed'&&<div className="pkg-actions"><label className="pkg-check"><input type="checkbox" disabled={!editable||dirty} checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>已检查当前 PDF 内容</label><button type="button" disabled={!editable||dirty||!reviewed||item.reviewedSha256===item.sha256} onClick={()=>void onReview()}>确认当前文件</button>{item.reviewedSha256===item.sha256&&<span>此版本已确认</span>}</div>}{message&&<p role="status">{message}</p>}</div>}
    </section>
  </div></section>;
}
