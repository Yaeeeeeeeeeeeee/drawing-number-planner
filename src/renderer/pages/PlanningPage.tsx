import {useEffect,useMemo,useRef,useState,type CSSProperties} from 'react';
import type {BatchPlanningCheck,BatchPlanningPreview,BatchPlanningResult,BatchReservePlanningInput,PlanningDraftInput,PlanningDraftMode,WhiteDrawingBase} from '../../core/planning/planning-types';
import {parseDrawingCode} from '../../core/drawings/drawing-code';
import type {DictionaryItemView,PlannerApi,ProductView} from '../data/client';
import {PageHeader} from '../components/PageHeader';
import {PanelResizeHandle} from '../components/PanelResizeHandle';
import type {PackagingNavigationTarget} from './packaging/PackagingTaskPanel';
import {isPlanningMock,PlanningMockPage} from './planning-mock';
import {usePlanningDrafts} from './planning/usePlanningDrafts';
import {batchInput,isConfiguredProject,newPlanningProject,planningRowKey,planningWhiteKey,type DraftProject} from './planning/planning-workspace-state';
import {PlanningProducts,PlanningProjects} from './planning/PlanningProductInputs';
import {PlanningChecks} from './planning/PlanningChecks';
import {PlanningResults} from './planning/PlanningResults';
import './planning-workspace.css';

export interface PlanningDrawingTarget {productId:number;appearanceVersionId?:number;drawingIds?:number[];fullCodes?:string[];initialDrawingId?:number}
interface PlanningPageProps {api:PlannerApi;active?:boolean;onOpenDrawingLibrary?(target:PlanningDrawingTarget):void;onGenerateFiles?(target:PackagingNavigationTarget):void}
interface References {products:ProductView[];appearance:DictionaryItemView[];color:DictionaryItemView[];main_category:DictionaryItemView[];project_item:DictionaryItemView[];brand:DictionaryItemView[];product_size:DictionaryItemView[]}
const emptyReferences:References={products:[],appearance:[],color:[],main_category:[],project_item:[],brand:[],product_size:[]};
const newSteps=['产品资料','选择项目','图号检查','确认占号'];
const batchSteps=['选择产品与外观','配置项目','检查与确认占号'];
const describeCode=(items:DictionaryItemView[],code:string)=>`${items.find(item=>item.code===code)?.name??'未识别'}（${code}）`;
const errorText=(reason:unknown)=>reason instanceof Error?reason.message:'操作失败，请重试';
const rowSignature=(group:PlanningDraftInput['groups'][number],row:DraftProject)=>JSON.stringify({productId:group.productId,appearanceId:group.appearanceId,appearanceVersionId:group.appearanceVersionId,row});

export function PlanningPage(props:PlanningPageProps) {return isPlanningMock()?<PlanningMockPage/>:<PlanningWorkspace {...props}/>;}
function PlanningWorkspace({api,active=true,onOpenDrawingLibrary,onGenerateFiles}:PlanningPageProps) {
  const [mode,setMode]=useState<PlanningDraftMode>('new'),[references,setReferences]=useState<References>(emptyReferences);
  const batch=mode==='batch',steps=batch?batchSteps:newSteps;
  const [loading,setLoading]=useState(true),[lookupErrors,setLookupErrors]=useState<string[]>([]),[loaded,setLoaded]=useState(false);
  const saved=usePlanningDrafts(api,mode),draft=saved.draft;
  const [checks,setChecks]=useState<BatchPlanningPreview|null>(null),[focused,setFocused]=useState('');
  const [results,setResults]=useState<Partial<Record<PlanningDraftMode,BatchPlanningResult>>>({}),[showResults,setShowResults]=useState(false);
  const [requestBusy,setBusy]=useState(false),[error,setError]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [failedOnly,setFailedOnly]=useState(false),[editRow,setEditRow]=useState<string>();
  const busy=requestBusy||saved.removing;
  const [whiteBases,setWhiteBases]=useState<Record<string,WhiteDrawingBase[]>>({}),[whiteErrors,setWhiteErrors]=useState<Record<string,string>>({});
  const [preferredWidth,setPreferredWidth]=useState(360),[width,setWidth]=useState(1200);
  const root=useRef<HTMLDivElement>(null),lookupsRequest=useRef(0),checkRequest=useRef(0),epoch=useRef(0),busyRef=useRef(false),reserving=useRef(false);
  const checkedInputs=useRef(new Map<string,string>()),lookupSignature=useRef('');
  const currentMode=useRef(mode);currentMode.current=mode;
  const load=async()=>{
    const request=++lookupsRequest.current;if(!loaded)setLoading(true);
    const names=['products','appearance','color','main_category','project_item','brand','product_size'] as const;
    const resources=await Promise.allSettled(names.map(name=>name==='products'?api.listProducts({status:'all'}):api.listDictionaries(name,false)));
    if(request!==lookupsRequest.current)return;
    const errors:string[]=[];const changes:Partial<References>={};
    resources.forEach((result,index)=>{const name=names[index];if(result.status==='fulfilled')Object.assign(changes,{[name]:result.value});else errors.push(`${{products:'产品',appearance:'外观',color:'颜色',main_category:'主类别',project_item:'项目明细',brand:'品牌',product_size:'品类尺寸'}[name]}：${errorText(result.reason)}`);});
    const signature=JSON.stringify(resources.map(result=>result.status==='fulfilled'?result.value:null));
    if(lookupSignature.current&&signature!==lookupSignature.current){checkedInputs.current.clear();setConfirmed(false);epoch.current++;}
    lookupSignature.current=signature;setReferences(current=>({...current,...changes}));setLookupErrors(errors);setLoaded(true);setLoading(false);
  };
  useEffect(()=>{if(active)void load();else{checkRequest.current++;setConfirmed(false);if(!reserving.current){busyRef.current=false;setBusy(false);}}return()=>{lookupsRequest.current++;checkRequest.current++;};},[api,active]);
  useEffect(()=>{setChecks(null);checkedInputs.current.clear();setConfirmed(false);setFailedOnly(false);setEditRow(undefined);setError('');setShowResults(false);checkRequest.current++;epoch.current++;},[mode]);
  useEffect(()=>{
    const element=root.current;if(!element)return;const measure=()=>{const next=element.clientWidth;if(next>0)setWidth(current=>current===next?current:next);};measure();
    const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(element);window.addEventListener('resize',measure);return()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[]);
  const update=(next:PlanningDraftInput)=>{epoch.current++;setConfirmed(false);setError('');saved.update(next);};
  const selectedGroup=draft.groups.find(group=>group.productId===draft.activeProductId)??draft.groups[0];
  const effective=useMemo<BatchPlanningPreview>(()=>{
    const groups=draft.groups.map(group=>({productId:group.productId,model:references.products.find(product=>product.id===group.productId)?.model??`产品 ${group.productId}`,rows:group.rows.map<BatchPlanningCheck>(row=>{
      const key=planningRowKey(group.productId,row.clientId),previous=checks?.groups.find(item=>item.productId===group.productId)?.rows.find(item=>item.clientId===row.clientId);
      if(previous&&checkedInputs.current.get(key)===rowSignature(group,row))return {...previous};
      return {clientId:row.clientId,productId:group.productId,colorId:row.colorId??0,mainCategoryId:row.mainCategoryId??0,projectItemId:row.projectItemId??0,available:false,error:{code:'CHECK_REQUIRED',message:previous?'本项目有修改，请重新检查':'尚未检查'}};
    })}));
    const byCode=new Map<string,BatchPlanningCheck[]>();for(const group of groups)for(const row of group.rows)if(row.available&&row.fullCode)byCode.set(row.fullCode,[...(byCode.get(row.fullCode)??[]),row]);
    for(const rows of byCode.values())if(rows.length>1){const first=rows[0],sameShared=rows.every(row=>row.productId===first.productId&&row.projectItemId===first.projectItemId&&row.shared&&first.shared&&row.shared.id===first.shared.id&&row.shared.origin===first.shared.origin);if(!sameShared)for(const row of rows){row.available=false;row.error={code:'BATCH_CODE_CONFLICT',message:'不同型号或项目产生相同完整图号，请核对编码资料'};}}
    return {groups};
  },[draft,checks,references]);
  const rows=effective.groups.flatMap(group=>group.rows),eligible=rows.filter(row=>row.available&&row.fullCode&&row.fingerprint);
  const check=async(only?:BatchPlanningCheck,source=draft)=>{
    const input=batchInput(source);
    if(batch)input.groups=input.groups.filter(group=>group.rows.length);
    if(busyRef.current||!input.groups.length)return;busyRef.current=true;setBusy(true);setError('');setConfirmed(false);
    if(!only){checkedInputs.current.clear();setChecks(null);}
    const request=++checkRequest.current,captured=epoch.current,capturedMode=mode;
    const narrowed=only?{groups:input.groups.filter(group=>group.productId===only.productId).map(group=>({...group,rows:group.rows.filter(row=>row.clientId===only.clientId)}))}:input;
    try{
      const next=await api.previewBatchPlan(narrowed);if(request!==checkRequest.current||captured!==epoch.current||capturedMode!==currentMode.current)return;
      for(const group of source.groups)for(const row of group.rows)if(!only||group.productId===only.productId&&row.clientId===only.clientId)checkedInputs.current.set(planningRowKey(group.productId,row.clientId),rowSignature(group,row));
      setChecks(current=>only&&current?{groups:effective.groups.map(group=>({...group,rows:group.rows.map(row=>group.productId===only.productId&&row.clientId===only.clientId?next.groups.find(item=>item.productId===group.productId)?.rows.find(item=>item.clientId===row.clientId)??row:row)}))}:next);
      const first=next.groups.flatMap(group=>group.rows)[0];if(first)setFocused(planningRowKey(first.productId,first.clientId));
    }catch(reason){if(request===checkRequest.current)setError(errorText(reason));}finally{if(request===checkRequest.current){busyRef.current=false;setBusy(false);}}
  };
  const ready=saved.ready&&loaded&&!loading;
  const review=batch?draft.step===3:draft.step===4;
  useEffect(()=>{
    if(batch&&review&&ready&&active&&!showResults)void check();
  },[batch,review,ready,active,showResults]);
  const nextStep=()=>{
    if(draft.step===1){update({...draft,step:2,activeProductId:selectedGroup?.productId});return;}
    if(draft.step===2){update({...draft,step:3});if(!batch)void check();return;}
    if(draft.step===3)update({...draft,step:4});
  };
  const reserve=async()=>{
    if(!confirmed||!eligible.length||busyRef.current||saved.removing)return;busyRef.current=true;reserving.current=true;setBusy(true);setError('');
    const accepted=new Map(eligible.map(row=>[planningRowKey(row.productId,row.clientId),row]));
    const input:BatchReservePlanningInput={confirmed:true,groups:batchInput(draft).groups.map(group=>({...group,rows:group.rows.filter(row=>accepted.has(planningRowKey(group.productId,row.clientId))).map(row=>({...row,expectedFullCode:accepted.get(planningRowKey(group.productId,row.clientId))!.fullCode!,fingerprint:accepted.get(planningRowKey(group.productId,row.clientId))!.fingerprint!}))})).filter(group=>group.rows.length)};
    try{
      const result=await api.reserveBatchPlan(input);const combined=new Map((results[mode]?.results??[]).map(row=>[planningRowKey(row.productId,row.clientId),row]));
      for(const row of rows.filter(row=>!row.available))combined.set(planningRowKey(row.productId,row.clientId),{productId:row.productId,clientId:row.clientId,outcome:'failed',error:row.error});
      for(const row of result.results)combined.set(planningRowKey(row.productId,row.clientId),row);
      setResults(current=>({...current,[mode]:{results:[...combined.values()]}}));setShowResults(true);setConfirmed(false);
      const succeeded=new Set(result.results.filter(row=>row.outcome!=='failed').map(row=>planningRowKey(row.productId,row.clientId)));
      const groups=draft.groups.map(group=>{const remaining=group.rows.filter(row=>!succeeded.has(planningRowKey(group.productId,row.clientId)));return {...group,rows:batch||remaining.length?remaining:[newPlanningProject()]};});
      const retainBatchReview=batch&&groups.some(group=>group.rows.length);
      saved.update({...draft,step:retainBatchReview||result.results.some(row=>row.outcome==='failed')?3:1,groups});setChecks(null);checkedInputs.current.clear();
    }catch(reason){setError(errorText(reason));setConfirmed(false);checkedInputs.current.clear();saved.update({...draft,step:3});}finally{reserving.current=false;busyRef.current=false;setBusy(false);}
  };
  const white=async(row:DraftProject)=>{
    if(!selectedGroup||!row.projectItemId)return;
    const key=planningWhiteKey(selectedGroup,row);
    try{const result=await api.listPlanningWhiteBases({productId:selectedGroup.productId,appearanceId:selectedGroup.appearanceId,appearanceVersionId:selectedGroup.appearanceVersionId,projectItemId:row.projectItemId,mainCategoryId:row.mainCategoryId});setWhiteBases(current=>({...current,[key]:result.items}));setWhiteErrors(current=>({...current,[key]:result.items.length?'':'没有真实可用的白色基准，不能自动共用'}));}
    catch(reason){setWhiteErrors(current=>({...current,[key]:errorText(reason)}));}
  };
  const visibleRows=review&&batch&&failedOnly?rows.filter(row=>!row.available):rows;
  const focus=visibleRows.find(row=>planningRowKey(row.productId,row.clientId)===focused)??visibleRows.find(row=>row.fullCode)??visibleRows[0];
  const parts=focus?.parts??(focus?.fullCode?parseDrawingCode(focus.fullCode):null);
  const canProducts=draft.groups.length>0&&draft.groups.every(group=>references.products.some(product=>product.id===group.productId&&product.status==='active'&&product.brandId&&product.productSizeId&&(group.appearanceId||batch&&product.appearanceVersions?.some(version=>version.id===group.appearanceVersionId&&version.appearanceId))));
  const canCheck=draft.groups.some(group=>group.rows.length);
  const openProject=(row:BatchPlanningCheck)=>{setEditRow(row.clientId);setFocused(planningRowKey(row.productId,row.clientId));update({...draft,activeProductId:row.productId,step:2});};
  const removeProject=(row:BatchPlanningCheck)=>{
    const next={...draft,groups:draft.groups.map(group=>group.productId===row.productId?{...group,rows:group.rows.filter(item=>item.clientId!==row.clientId)}:group)};
    update(next);void check(undefined,next);
  };
  const projectProduct=references.products.find(product=>product.id===selectedGroup?.productId);
  const projectFocus=selectedGroup?.rows.find(row=>planningRowKey(selectedGroup.productId,row.clientId)===focused)??selectedGroup?.rows.find(isConfiguredProject)??selectedGroup?.rows[0];
  const dictionaryCode=(items:DictionaryItemView[],id?:number|null)=>items.find(item=>item.id===id)?.code;
  const structure=selectedGroup&&{
    品牌:dictionaryCode(references.brand,projectProduct?.brandId)??'??',
    品类尺寸:dictionaryCode(references.product_size,projectProduct?.productSizeId)??'????',
    外观:dictionaryCode(references.appearance,selectedGroup.appearanceId??projectProduct?.appearanceVersions?.find(version=>version.id===selectedGroup.appearanceVersionId)?.appearanceId)??'??',
    颜色:dictionaryCode(references.color,projectFocus?.colorId)??'?',
    主类别:dictionaryCode(references.main_category,projectFocus?.mainCategoryId)??'??',
    项目明细:dictionaryCode(references.project_item,projectFocus?.projectItemId)??'??',
  };
  const hasPreview = batch && draft.step <= 2 ? Boolean(selectedGroup) : visibleRows.some(row => row.fullCode);
  return <section className={`page-surface page-enter planning-page planning-workbench${batch?' planning-batch-workbench':''}`}>
    <PageHeader title="图号规划" description=""/>
    <div className="planning-workbench-toolbar"><div role="group" aria-label="规划模式">{(['new','batch'] as const).map(value=><button type="button" key={value} aria-pressed={mode===value} disabled={busy} onClick={()=>setMode(value)}>{value==='new'?'新建图号':'批量规划'}</button>)}</div><div className="row-actions">{results[mode]&&<button type="button" onClick={()=>setShowResults(true)}>查看本次结果</button>}{saved.hasDraft&&<button type="button" disabled={!saved.ready||busy} onClick={()=>void saved.remove().then(()=>{setChecks(null);checkedInputs.current.clear();setConfirmed(false);}).catch(()=>{})}>删除当前草稿</button>}</div></div>
    {loading&&<p role="status">正在加载规划资料…</p>}{lookupErrors.length>0&&<div role="alert" className="error-banner"><strong>{Object.keys(references).some(key=>references[key as keyof References].length)?'部分资料加载失败':'规划资料加载失败'}</strong>{lookupErrors.map(item=><p key={item}>{item}</p>)}<button type="button" onClick={()=>void load()}>重新加载资料</button></div>}
    {saved.error&&<div role="alert" className="error-banner">{saved.error}<button type="button" onClick={()=>saved.ready?saved.retry():void saved.reload()}>{saved.ready?'重试保存草稿':'重新读取草稿'}</button></div>}{saved.status&&<p className="planning-draft-status" role="status">{saved.status}</p>}{error&&<p role="alert" className="error-banner">{error}</p>}
    {showResults&&results[mode]?<PlanningResults result={results[mode]!} products={references.products} onBack={()=>setShowResults(false)} onOpenLibrary={onOpenDrawingLibrary} onGenerate={onGenerateFiles}/>:<>
    <nav className="planning-steps" aria-label="规划步骤">{steps.map((label,index)=><button type="button" aria-label={label} aria-current={draft.step===index+1?'step':undefined} key={label} disabled={!ready||busy||(index>0&&!draft.groups.length)||(batch&&draft.step<index+1&&(!canProducts||index===2&&!canCheck))} onClick={()=>{if(draft.step!==index+1){setEditRow(undefined);update({...draft,step:(index+1) as PlanningDraftInput['step']});}}}><span>{index+1}</span>{label}</button>)}</nav>
    <div ref={root} className={`planning-workbench-layout${width<900?' compact':''}${hasPreview?'':' preview-empty'}`} style={{'--planning-preview-width':`${Math.min(preferredWidth,Math.max(280,width*.45))}px`} as CSSProperties}>
      <div className="planning-step-content" aria-busy={busy||!ready}>
        {draft.step===1&&<PlanningProducts key={mode} mode={mode} draft={draft} products={references.products} appearances={references.appearance} disabled={!ready||busy} onChange={update}/>}
        {draft.step===2&&<PlanningProjects key={mode} mode={mode} group={selectedGroup} groups={draft.groups} products={references.products} mains={references.main_category} projects={references.project_item} colors={references.color} packaging={api.packaging} disabled={!ready||busy} editRow={editRow} onGroups={groups=>update({...draft,groups})} onSelect={id=>{setEditRow(undefined);update({...draft,activeProductId:id});}} onFocus={row=>{if(selectedGroup)setFocused(planningRowKey(selectedGroup.productId,row.clientId));}} whiteBases={whiteBases} whiteError={whiteErrors} onLoadWhite={row=>void white(row)}/>}
        {(draft.step===3||review)&&<><div className="planning-section-title"><h2>{steps[draft.step-1]}</h2><button type="button" disabled={busy||!ready||!canCheck} onClick={()=>void check()}>重新检查全部项目</button></div>
          {batch&&<div className="planning-check-toolbar">
            <div role="status" className="planning-check-totals">{busy&&!reserving.current?'正在检查项目…':<><span>通过 {eligible.length} 项</span><span>未通过 {rows.length-eligible.length} 项</span></>}</div>
            <label><input type="checkbox" checked={failedOnly} onChange={event=>setFailedOnly(event.target.checked)}/>仅看未通过</label>
          </div>}
          <PlanningChecks preview={effective} projects={references.project_item} colors={references.color} busy={busy} failedOnly={batch&&failedOnly} onFocus={row=>setFocused(planningRowKey(row.productId,row.clientId))} onRecheck={row=>void check(row)} onEdit={batch?openProject:undefined} onRemove={batch?removeProject:undefined}/>
        </>}
      </div>
      {hasPreview?<><PanelResizeHandle label="调整图号预览宽度" value={Math.min(preferredWidth,Math.max(280,width*.45))} min={280} max={Math.max(280,width*.45)} reversed onChange={setPreferredWidth}/>
      <aside className="planning-preview-panel" aria-label={batch&&draft.step===1?'已选产品清单':batch&&draft.step===2?'图号结构预览':'完整图号与编码拆解'}>
        {batch&&draft.step===1?<><h2>已选产品清单</h2>{draft.groups.length?<ul className="planning-selected-list">{draft.groups.map(group=>{
          const product=references.products.find(item=>item.id===group.productId);
          return <li key={group.productId}><strong>{product?.model??`产品 ${group.productId}`}</strong>{product?.sku&&<small>{product.sku}</small>}</li>;
        })}</ul>:<p>请选择产品型号。</p>}</>:batch&&draft.step===2?<><h2>图号结构预览</h2>{structure&&<>
          <p>{projectProduct?.model??`产品 ${selectedGroup.productId}`}</p>
          <strong className="planning-code planning-preview-code">{structure.品牌}.{structure.品类尺寸}.{structure.外观}{structure.颜色}.{structure.主类别}{structure.项目明细}???</strong>
          <dl>{Object.entries({...structure,流水号:'检查后推荐'}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        </>}</>:<>
          <h2>{batch?'占号汇总与编码拆解':'图号预览'}</h2>
          {batch&&<p>待新占号 {eligible.filter(row=>!row.shared).length} 项 · 共用 {eligible.filter(row=>row.shared).length} 项 · 跳过 {rows.length-eligible.length} 项</p>}
          {focus?.fullCode?<><strong className="planning-code planning-preview-code">{focus.fullCode}</strong><p className={focus.available?'planning-pass':'error-banner'}>{focus.available?focus.shared?'共用已有图号，不重复占号':'检查通过，尚未正式占号':focus.error?.message}</p>{parts&&<dl>{Object.entries({品牌:describeCode(references.brand,parts.brandCode),品类尺寸:describeCode(references.product_size,parts.productSizeCode),外观:describeCode(references.appearance,parts.appearanceCode),颜色:describeCode(references.color,parts.colorCode),主类别:describeCode(references.main_category,parts.mainCategoryCode),项目明细:describeCode(references.project_item.filter(project=>references.main_category.some(main=>main.code===parts.mainCategoryCode&&main.id===project.parentId)),parts.projectItemCode),最后使用流水号:focus.lastUsedSequence===undefined?'未读取':focus.lastUsedSequence?String(focus.lastUsedSequence).padStart(3,'0'):'暂无',推荐流水号:focus.sequence?String(focus.sequence).padStart(3,'0'):'—'}).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}</>:<p>{focus?.error?.message??'选择产品和项目后进行图号检查'}</p>}
        </>}
      </aside></>:<p className="planning-empty-preview">{batch&&draft.step===1?'已选产品清单：请选择产品型号':'图号预览：暂无候选图号'}</p>}
    </div>
    <footer className="planning-step-actions">
      {(draft.step>1||!batch)&&<button type="button" disabled={!ready||busy||draft.step===1} onClick={()=>{setEditRow(undefined);update({...draft,step:(draft.step-1) as PlanningDraftInput['step']});}}>上一步</button>}
      {review?<div className="planning-confirmation">
        <span>{batch?'未通过的项目将跳过占号，并保留在草稿中。':`本次确认 ${eligible.length} 项；未通过检查的项目不占号。`}</span>
        <label><input type="checkbox" aria-label="已核对本次占号清单" checked={confirmed} disabled={busy||!eligible.length} onChange={event=>setConfirmed(event.target.checked)}/>已核对本次占号清单</label>
        <button type="button" className="primary-button" disabled={busy||!eligible.length||!confirmed} onClick={()=>void reserve()}>{reserving.current?'正在占号…':'确认批量占号'}</button>
      </div>:<button type="button" className="primary-button" disabled={!ready||busy||!draft.groups.length||draft.step===1&&!canProducts||batch&&draft.step===2&&!canCheck||draft.step===3&&!eligible.length} onClick={nextStep}>下一步</button>}
    </footer></>}
  </section>;
}
