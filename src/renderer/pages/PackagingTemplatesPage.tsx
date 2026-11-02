import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { DataTable } from '../components/DataTable';
import type { PlannerApi } from '../data/client';
import type { PackagingCatalog, PackagingTemplate, TemplateRule } from '../../core/packaging/packaging-types';
import { ConfigEditor, RuleEditor, TemplateEditor, type PackagingLookups } from './packaging/PackagingEditors';
import './packaging/packaging.css';
import './packaging/packaging-catalog.css';
import { dimensionLabel } from './packaging/packaging-dimensions';

const emptyCatalog:PackagingCatalog={templates:[],dimensions:[],rules:[],configs:[]};
const emptyLookups:PackagingLookups={products:[],projects:[],mains:[],brands:[]};
export function PackagingTemplatesPage({api,active=true}:{api:PlannerApi;active?:boolean}) {
  const [catalog,setCatalog]=useState(emptyCatalog);const [lookups,setLookups]=useState(emptyLookups);const [tab,setTab]=useState<'templates'|'rules'|'config'>('templates');
  const [loading,setLoading]=useState(true);const [loadError,setLoadError]=useState('');const [search,setSearch]=useState('');const [project,setProject]=useState('');const [status,setStatus]=useState('all');
  const [templateEditor,setTemplateEditor]=useState<PackagingTemplate|null|false>(false);const [ruleEditor,setRuleEditor]=useState<TemplateRule|null|false>(false);
  const [feedback,setFeedback]=useState<{id:number;message:string;error?:boolean}|null>(null);const [busy,setBusy]=useState(false);
  const [hasData,setHasData]=useState(false);const loadRequest=useRef(0);
  const packaging=api.packaging;
  const [automation,setAutomation]=useState<{available:boolean;message:string;blocked?:boolean}|null>(null);
  useEffect(()=>{if(packaging?.getAutomation)void packaging.getAutomation().then(setAutomation).catch(e=>setAutomation({available:false,message:e instanceof Error?e.message:'本机自动化状态读取失败'}));},[packaging]);
  const load=async(throwOnError=false)=>{
    const request=++loadRequest.current;
    if(!packaging){setLoadError('当前服务尚未提供包材模板接口，请使用配套版本的本地服务。');setLoading(false);return;}
    if(!hasData)setLoading(true);setLoadError('');try{
      const [next,products,projects,mains,brands]=await Promise.all([packaging.getCatalog(),api.listProducts({status:'all'}),api.listDictionaries('project_item'),api.listDictionaries('main_category'),api.listDictionaries('brand')]);
      if(request!==loadRequest.current)return;
      setCatalog(next);setLookups({products,projects,mains,brands});setHasData(true);
    }catch(e){if(request===loadRequest.current){setLoadError(e instanceof Error?e.message:'包材资料加载失败');if(throwOnError)throw e;}}finally{if(request===loadRequest.current)setLoading(false);}
  };
  const reload=()=>load(true);
  useEffect(()=>{if(active)void load();return()=>{loadRequest.current++;};},[api,packaging,active]);
  const visible=(item:{name:string;status:string;projectItemId?:number})=>(!search||item.name.toLowerCase().includes(search.toLowerCase()))&&(status==='all'||status===item.status)&&(!project||item.projectItemId===Number(project));
  const projectName=(id:number)=>lookups.projects.find(p=>p.id===id)?.name??`项目 #${id}`;
  return <section className="page-surface page-enter packaging-page packaging-catalog"><PageHeader title="包材模板" description="AIT 模板、匹配规则与项目生成设置"/>
    {loading&&<p role="status">加载包材资料…</p>}{loadError&&<div className="pkg-error" role="alert">{loadError}<button type="button" onClick={()=>void load()}>重新加载</button></div>}
    {hasData&&packaging&&<>
      {automation&&<div className="pkg-automation"><span>Illustrator：{automation.message}</span>{automation.blocked&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{setAutomation(await packaging.reconcileAutomation());}catch(e){setAutomation({...automation,message:e instanceof Error?e.message:'检查失败'});}finally{setBusy(false);}}}>检查上次本机操作是否已结束</button>}</div>}
      <div role="tablist" aria-label="包材资料分类" className="pkg-tabs">{[['templates','AIT 模板管理'],['rules','模板匹配规则'],['config','项目生成设置']].map(([key,label])=><button type="button" role="tab" id={`pkg-tab-${key}`} aria-controls={`pkg-panel-${key}`} aria-selected={tab===key} key={key} onClick={()=>setTab(key as typeof tab)}>{label}</button>)}</div>
      <div className="pkg-filters" hidden={tab==='config'}><label>搜索<input value={search} placeholder="按名称搜索" onChange={event=>setSearch(event.target.value)}/></label><label>项目明细<select value={project} onChange={event=>setProject(event.target.value)}><option value="">全部项目</option>{lookups.projects.map(p=><option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></label><label>状态<select value={status} onChange={event=>setStatus(event.target.value)}><option value="all">全部状态</option><option value="active">启用</option><option value="inactive">停用</option></select></label><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setFeedback(null);try{await reload();}catch(e){setLoadError(e instanceof Error?e.message:'刷新失败');}finally{setBusy(false);}}}>刷新资料</button></div>
      <section role="tabpanel" id="pkg-panel-templates" aria-labelledby="pkg-tab-templates" hidden={tab!=='templates'}><div className="pkg-section-heading"><h2>AIT 模板管理</h2><button type="button" onClick={()=>setTemplateEditor(null)}>新增 AIT 模板</button></div>
        {templateEditor!==false&&<TemplateEditor key={templateEditor?.id??'new-template'} api={packaging} initial={templateEditor??undefined} lookups={lookups} onSaved={async()=>{await reload();setTemplateEditor(false);}} onCancel={()=>setTemplateEditor(false)}/>}
        <DataTable tableId="packaging-templates" items={catalog.templates.filter(visible)} columns={[
          {key:'name',label:'模板 / 原始文件',width:220,render:t=><><strong>{t.name}</strong><small>{t.fileName}</small></>},
          {key:'project',label:'资料类别 / 项目',width:180,render:t=><>{lookups.mains.find(m=>m.id===t.mainCategoryId)?.name}<small>{projectName(t.projectItemId)}</small></>},
          {key:'products',label:'适用范围',width:220,render:t=><>{t.brandIds.length?t.brandIds.map(id=>lookups.brands.find(b=>b.id===id)?.name??`品牌 #${id}`).join('、'):'全部品牌'}<small>{t.productIds.length?t.productIds.map(id=>lookups.products.find(p=>p.id===id)?.model??`产品 #${id}`).join('、'):'全部型号'}</small></>},
          {key:'mapping',label:'字段映射',width:100,render:t=>`${t.fields.filter(f=>f.sourceKey==='DRAWING_NO').length} 项图号`},{key:'status',label:'状态',width:85,render:t=>t.status==='active'?'启用':'停用'},
          {key:'actions',label:'操作',width:190,render:t=><div><div className="pkg-actions"><button type="button" disabled={busy} onClick={()=>setTemplateEditor(t)}>编辑 / 替换 AIT</button><button type="button" disabled={busy} onClick={async()=>{setBusy(true);setFeedback(null);try{const result=await packaging.inspectTemplate(t.id);const issues=result.issues??[];const errors=issues.filter(i=>i.severity==='error');setFeedback({id:t.id,error:errors.length>0,message:`${errors.length?'检查未通过':'本机模板检查完成'}。${issues.map(i=>i.message).join('；')} 对象：${result.fields.map(f=>`${f.objectName} ${f.matches} 个${f.editable?'可编辑':'不可编辑'}`).join('、')}。字体仅检查声明及打开后可观察到的字体，仍需人工核对原始字体。`});}catch(e){setFeedback({id:t.id,error:true,message:e instanceof Error?e.message:'检查失败'});}finally{setBusy(false);}}}>本机检查</button></div>{feedback?.id===t.id&&<small role={feedback.error?'alert':'status'} className={feedback.error?'pkg-error':''}>{feedback.message}</small>}</div>},
        ]}/>{!catalog.templates.length&&<p className="pkg-empty">暂无 AIT 模板。上传 AIT，选择需要填入完整图号的文字对象。</p>}
      </section>
      <section role="tabpanel" id="pkg-panel-rules" aria-labelledby="pkg-tab-rules" hidden={tab!=='rules'}><div className="pkg-section-heading"><h2>模板匹配规则</h2><button type="button" onClick={()=>setRuleEditor(null)}>新增匹配规则</button></div>
        {ruleEditor!==false&&<RuleEditor key={ruleEditor?.id??'new-rule'} api={packaging} initial={ruleEditor??undefined} catalog={catalog} onSaved={async()=>{await reload();setRuleEditor(false);}} onCancel={()=>setRuleEditor(false)}/>}
        <DataTable tableId="packaging-rules" items={catalog.rules.filter(r=>visible({...r,projectItemId:catalog.templates.find(t=>t.id===r.templateId)?.projectItemId}))} columns={[
          {key:'name',label:'规则名称',width:170,render:r=>r.name},{key:'template',label:'目标模板',width:170,render:r=>catalog.templates.find(t=>t.id===r.templateId)?.name??`模板 #${r.templateId}`},
          {key:'conditions',label:'尺寸条件',width:280,render:r=>r.conditions.map(c=>`${dimensionLabel(catalog.configs.find(config=>config.projectItemId===catalog.templates.find(t=>t.id===r.templateId)?.projectItemId)?.parameters??[],c.key)} ${{lt:'<',lte:'≤',gt:'>',gte:'≥',eq:'=',between:'介于'}[c.operator]} ${c.value}${c.operator==='between'?` 至 ${c.max}`:''}`).join('；')||'固定模板（无尺寸条件）'},
          {key:'swap',label:'长宽互换',width:100,render:r=>r.allowLengthWidthSwap?'允许':'不允许'},{key:'status',label:'状态',width:85,render:r=>r.status==='active'?'启用':'停用'},{key:'actions',label:'操作',width:85,render:r=><button type="button" onClick={()=>setRuleEditor(r)}>编辑规则</button>},
        ]}/>{!catalog.rules.length&&<p className="pkg-empty">暂无匹配规则。多个模板符合条件时由用户明确选择。</p>}
      </section>
      <section role="tabpanel" id="pkg-panel-config" aria-labelledby="pkg-tab-config" hidden={tab!=='config'}><div className="pkg-section-heading"><h2>项目生成设置</h2></div><ConfigEditor api={packaging} catalog={catalog} projects={lookups.projects} onSaved={reload}/></section>
    </>}
  </section>;
}
