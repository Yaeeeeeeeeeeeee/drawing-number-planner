import { useEffect, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { DataTable } from '../components/DataTable';
import type { PlannerApi } from '../data/client';
import type { DimensionProfile, PackagingCatalog, PackagingTemplate, TemplateRule } from '../../core/packaging/packaging-types';
import { ConfigEditor, DimensionEditor, ProductChecks, RuleEditor, TemplateEditor, type PackagingLookups } from './packaging/PackagingEditors';
import { PackagingTasks, type PackagingNavigationTarget } from './packaging/PackagingTaskPanel';
import './packaging/packaging.css';

const emptyCatalog:PackagingCatalog={templates:[],dimensions:[],rules:[],configs:[]};
const emptyLookups:PackagingLookups={products:[],projects:[],mains:[],brands:[]};
export function PackagingTemplatesPage({api,target}:{api:PlannerApi;target?:PackagingNavigationTarget|null}) {
  const [catalog,setCatalog]=useState(emptyCatalog);const [lookups,setLookups]=useState(emptyLookups);const [tab,setTab]=useState<'templates'|'dimensions'|'rules'>('templates');const [view,setView]=useState<'catalog'|'tasks'>(target?'tasks':'catalog');const [tasksVisited,setTasksVisited]=useState(Boolean(target));
  const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState('');const [search,setSearch]=useState('');const [project,setProject]=useState('');const [status,setStatus]=useState('all');
  const [templateEditor,setTemplateEditor]=useState<PackagingTemplate|null|false>(false);const [dimensionEditor,setDimensionEditor]=useState<DimensionProfile|null|false>(false);const [ruleEditor,setRuleEditor]=useState<TemplateRule|null|false>(false);
  const [feedback,setFeedback]=useState<{id:number;message:string;error?:boolean}|null>(null);const [busy,setBusy]=useState(false);const [temporaryProducts,setTemporaryProducts]=useState<number[]>([]);const [temporaryMessage,setTemporaryMessage]=useState('');
  const packaging=api.packaging;
  const [automation,setAutomation]=useState<{available:boolean;message:string;blocked?:boolean}|null>(null);
  useEffect(()=>{if(packaging?.getAutomation)void packaging.getAutomation().then(setAutomation).catch(e=>setAutomation({available:false,message:e instanceof Error?e.message:'本机自动化状态读取失败'}));},[packaging]);
  const reload=async()=>{if(packaging)setCatalog(await packaging.getCatalog());};
  const load=async()=>{
    if(!packaging){setLoadError('当前服务尚未提供包材模板接口，请使用配套版本的本地服务。');setLoading(false);return;}
    setLoading(true);setLoadError('');try{
      const [next,products,projects,mains,brands]=await Promise.all([packaging.getCatalog(),api.listProducts({status:'all'}),api.listDictionaries('project_item'),api.listDictionaries('main_category'),api.listDictionaries('brand')]);
      setCatalog(next);setLookups({products,projects,mains,brands});
    }catch(e){setLoadError(e instanceof Error?e.message:'包材资料加载失败');}finally{setLoading(false);}
  };
  useEffect(()=>{void load();},[api,packaging]);
  useEffect(()=>{if(target){setView('tasks');setTasksVisited(true);}},[target]);
  const visible=(item:{name:string;status:string;projectItemId?:number})=>(!search||item.name.toLowerCase().includes(search.toLowerCase()))&&(status==='all'||status===item.status)&&(!project||item.projectItemId===Number(project));
  const projectName=(id:number)=>lookups.projects.find(p=>p.id===id)?.name??`项目 #${id}`;
  return <section className="page-surface page-enter packaging-page"><PageHeader title="包材模板" description="AIT 模板、尺寸与制图任务管理"><div className="pkg-view-switch"><button type="button" className={view==='catalog'?'active':''} aria-pressed={view==='catalog'} onClick={()=>setView('catalog')}>模板与尺寸</button><button type="button" className={view==='tasks'?'active':''} aria-pressed={view==='tasks'} onClick={()=>{setView('tasks');setTasksVisited(true);}}>制图任务</button></div></PageHeader>
    {loading&&<p role="status">加载包材资料…</p>}{loadError&&<div className="pkg-error" role="alert">{loadError}<button type="button" onClick={()=>void load()}>重新加载</button></div>}
    {!loading&&!loadError&&packaging&&<>
      {automation&&<div className="pkg-automation"><span>Illustrator：{automation.message}</span>{automation.blocked&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{setAutomation(await packaging.reconcileAutomation());}catch(e){setAutomation({...automation,message:e instanceof Error?e.message:'检查失败'});}finally{setBusy(false);}}}>检查上次本机操作是否已结束</button>}</div>}
      <div hidden={view!=='catalog'}><div role="tablist" aria-label="包材资料分类" className="pkg-tabs">{[['templates','AIT 模板管理'],['dimensions','尺寸档案'],['rules','模板匹配规则']].map(([key,label])=><button type="button" role="tab" id={`pkg-tab-${key}`} aria-controls={`pkg-panel-${key}`} aria-selected={tab===key} key={key} onClick={()=>setTab(key as typeof tab)}>{label}</button>)}</div>
      <div className="pkg-filters"><label>搜索<input value={search} placeholder="按名称搜索" onChange={event=>setSearch(event.target.value)}/></label><label>项目明细<select value={project} onChange={event=>setProject(event.target.value)}><option value="">全部项目</option>{lookups.projects.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label><label>状态<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></select></label><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setFeedback(null);try{await reload();}catch(e){setLoadError(e instanceof Error?e.message:'刷新失败');}finally{setBusy(false);}}}>刷新资料</button></div>
      <section role="tabpanel" id="pkg-panel-templates" aria-labelledby="pkg-tab-templates" hidden={tab!=='templates'}><div className="pkg-section-heading"><h2>AIT 模板管理</h2><button type="button" onClick={()=>setTemplateEditor(null)}>新增 AIT 模板</button></div>
        {templateEditor!==false&&<TemplateEditor key={templateEditor?.id??'new-template'} api={packaging} initial={templateEditor??undefined} lookups={lookups} onSaved={async()=>{await reload();setTemplateEditor(false);}} onCancel={()=>setTemplateEditor(false)}/>}
        <DataTable tableId="packaging-templates" items={catalog.templates.filter(visible)} columns={[
          {key:'name',label:'模板 / 原始文件',width:220,render:t=><><strong>{t.name}</strong><small>{t.fileName}</small></>},
          {key:'project',label:'资料类别 / 项目',width:180,render:t=><>{lookups.mains.find(m=>m.id===t.mainCategoryId)?.name}<small>{projectName(t.projectItemId)}</small></>},
          {key:'products',label:'适用范围',width:220,render:t=><>{t.brandIds.length?t.brandIds.map(id=>lookups.brands.find(b=>b.id===id)?.name??`品牌 #${id}`).join('、'):'全部品牌'}<small>{t.productIds.length?t.productIds.map(id=>lookups.products.find(p=>p.id===id)?.model??`产品 #${id}`).join('、'):'全部型号'}</small></>},
          {key:'mapping',label:'字段映射',width:100,render:t=>`${t.fields.length} 项`},{key:'status',label:'状态',width:85,render:t=>t.status==='active'?'启用':'停用'},
          {key:'actions',label:'操作',width:190,render:t=><div><div className="pkg-actions"><button type="button" disabled={busy} onClick={()=>setTemplateEditor(t)}>编辑 / 替换 AIT</button><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setFeedback(null);try{const result=await packaging.inspectTemplate(t.id);const issues=result.issues??[];const errors=issues.filter(i=>i.severity==='error');setFeedback({id:t.id,error:errors.length>0,message:`${errors.length?'检查未通过':'本机模板检查完成'}。${issues.map(i=>i.message).join('；')} 对象：${result.fields.map(f=>`${f.objectName} ${f.matches} 个${f.editable?'可编辑':'不可编辑'}`).join('、')}。字体仅检查声明及打开后可观察到的字体，仍需人工核对原始字体。`});}catch(e){setFeedback({id:t.id,error:true,message:e instanceof Error?e.message:'检查失败'});}finally{setBusy(false);}}}>本机检查</button></div>{feedback?.id===t.id&&<small role={feedback.error?'alert':'status'} className={feedback.error?'pkg-error':''}>{feedback.message}</small>}</div>},
        ]}/>{!catalog.templates.length&&<p className="pkg-empty">暂无 AIT 模板。上传原始 AIT 并配置对象名称与数据字段。</p>}
      </section>
      <section role="tabpanel" id="pkg-panel-dimensions" aria-labelledby="pkg-tab-dimensions" hidden={tab!=='dimensions'}><div className="pkg-section-heading"><h2>尺寸档案</h2><button type="button" onClick={()=>setDimensionEditor(null)}>新增尺寸档案</button></div>
        {dimensionEditor!==false&&<DimensionEditor key={dimensionEditor?.id??'new-dimension'} api={packaging} initial={dimensionEditor??undefined} lookups={lookups} catalog={catalog} onSaved={async()=>{await reload();setDimensionEditor(false);}} onCancel={()=>setDimensionEditor(false)}/>}
        <DataTable tableId="packaging-dimensions" items={catalog.dimensions.filter(visible)} columns={[
          {key:'name',label:'规格名称',width:170,render:d=>d.name},{key:'project',label:'项目',width:120,render:d=>projectName(d.projectItemId)},
          {key:'products',label:'适用型号',width:190,render:d=><>{d.scope==='specific'?'指定':'通用'}<small>{d.productIds.map(id=>lookups.products.find(p=>p.id===id)?.model??`产品 #${id}`).join('、')}</small></>},
          {key:'parameters',label:'尺寸参数',width:230,render:d=>Object.entries(d.parameters).map(([key,value])=>{const definition=catalog.configs.find(c=>c.projectItemId===d.projectItemId)?.parameters.find(p=>p.key===key);return `${definition?.label??key} ${value}${definition?.unit??''}`;}).join(' · ')||'无尺寸参数'},
          {key:'default',label:'默认 / 比例',width:160,render:d=><>{d.isDefault?`默认：${(d.defaultProductIds??d.productIds).map(id=>lookups.products.find(p=>p.id===id)?.model??id).join('、')}`:'非默认'}<small>{d.ratioKeys?`${d.ratioKeys.join(' / ')} = ${d.ratio}`:''}</small></>},{key:'status',label:'状态',width:85,render:d=>d.status==='active'?'启用':'停用'},{key:'actions',label:'操作',width:85,render:d=><button type="button" onClick={()=>setDimensionEditor(d)}>编辑规格</button>},
        ]}/>{!catalog.dimensions.length&&<p className="pkg-empty">暂无尺寸档案。不同项目可配置不同参数，指定型号规格优先于通用规格。</p>}
      </section>
      <section role="tabpanel" id="pkg-panel-rules" aria-labelledby="pkg-tab-rules" hidden={tab!=='rules'}><div className="pkg-section-heading"><h2>模板匹配规则</h2><button type="button" onClick={()=>setRuleEditor(null)}>新增匹配规则</button></div>
        {ruleEditor!==false&&<RuleEditor key={ruleEditor?.id??'new-rule'} api={packaging} initial={ruleEditor??undefined} catalog={catalog} onSaved={async()=>{await reload();setRuleEditor(false);}} onCancel={()=>setRuleEditor(false)}/>}
        <DataTable tableId="packaging-rules" items={catalog.rules.filter(r=>visible({...r,projectItemId:catalog.templates.find(t=>t.id===r.templateId)?.projectItemId}))} columns={[
          {key:'name',label:'规则名称',width:170,render:r=>r.name},{key:'template',label:'目标模板',width:170,render:r=>catalog.templates.find(t=>t.id===r.templateId)?.name??`模板 #${r.templateId}`},
          {key:'conditions',label:'尺寸条件',width:280,render:r=>r.conditions.map(c=>`${c.key} ${{lt:'<',lte:'≤',gt:'>',gte:'≥',eq:'=',between:'介于'}[c.operator]} ${c.value}${c.operator==='between'?` 至 ${c.max}`:''}`).join('；')||'固定模板（无尺寸条件）'},
          {key:'swap',label:'长宽互换',width:100,render:r=>r.allowLengthWidthSwap?'允许':'不允许'},{key:'status',label:'状态',width:85,render:r=>r.status==='active'?'启用':'停用'},{key:'actions',label:'操作',width:85,render:r=><button type="button" onClick={()=>setRuleEditor(r)}>编辑规则</button>},
        ]}/>{!catalog.rules.length&&<p className="pkg-empty">暂无匹配规则。多个模板符合条件时由用户明确选择。</p>}
      </section>
      <ConfigEditor api={packaging} catalog={catalog} projects={lookups.projects} onSaved={reload}/>
      <details className="pkg-config"><summary>批量创建临时文件夹</summary><ProductChecks products={lookups.products} value={temporaryProducts} onChange={setTemporaryProducts} label="待检查产品"/><div className="pkg-actions"><button type="button" disabled={busy||!temporaryProducts.length} onClick={async()=>{setBusy(true);setTemporaryMessage('');try{const result=await packaging.createTemporaryDirectories(temporaryProducts) ;const failures=result?.items?.filter(i=>i.error)??[];setTemporaryMessage(failures.length?failures.map(i=>`${lookups.products.find(p=>p.id===i.productId)?.model??i.productId}：${i.error}`).join('；'):'所选产品的临时文件夹检查及创建完成');}catch(e){setTemporaryMessage(e instanceof Error?e.message:'创建失败');}finally{setBusy(false);}}}>检查并创建临时文件夹</button>{temporaryMessage&&<span role="status">{temporaryMessage}</span>}</div></details>
      </div>
      {tasksVisited&&<div hidden={view!=='tasks'}><PackagingTasks api={api} catalog={catalog} lookups={lookups} target={target} onCatalogChanged={reload}/></div>}
    </>}
  </section>;
}
