import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import type { PlannerApi } from '../data/client';
import type { PackagingCatalog } from '../../core/packaging/packaging-types';
import type { PackagingLookups } from './packaging/PackagingEditors';
import { PackagingTasks, type PackagingNavigationTarget } from './packaging/PackagingTaskPanel';
import './packaging/packaging.css';
import './packaging/packaging-tasks.css';

export function DrawingTasksPage({api,target,active=true}:{api:PlannerApi;target?:PackagingNavigationTarget|null;active?:boolean}) {
  const [data,setData]=useState<{catalog:PackagingCatalog;lookups:PackagingLookups}|null>(null);
  const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const [automation,setAutomation]=useState<{platform?:string;message:string;blocked?:boolean;failed?:boolean}|null>(null);const [busy,setBusy]=useState(false);
  const loadRequest=useRef(0);const retainedLookups=useRef<PackagingLookups>({products:[],projects:[],mains:[],brands:[]});
  const packaging=api.packaging;
  const load=async()=>{
    const request=++loadRequest.current;
    if(!packaging){setError('当前服务尚未提供制图任务接口，请使用配套版本的本地服务。');setLoading(false);return;}
    if(!data)setLoading(true);setError('');try{
      const results=await Promise.allSettled([packaging.getCatalog(),api.listProducts({status:'all'}),api.listDictionaries('project_item'),api.listDictionaries('main_category'),api.listDictionaries('brand')]);
      if(request!==loadRequest.current)return;
      const [catalog,products,projects,mains,brands]=results;
      const previousLookups=retainedLookups.current;const lookups={products:products.status==='fulfilled'?products.value:previousLookups.products,projects:projects.status==='fulfilled'?projects.value:previousLookups.projects,mains:mains.status==='fulfilled'?mains.value:previousLookups.mains,brands:brands.status==='fulfilled'?brands.value:previousLookups.brands};retainedLookups.current=lookups;
      setData(previous=>{const nextCatalog=catalog.status==='fulfilled'?catalog.value:previous?.catalog;return nextCatalog?{catalog:nextCatalog,lookups}:previous;});
      const failures=results.flatMap((result,index)=>result.status==='rejected'?[`${['模板与规则','产品','项目','类别','品牌'][index]}：${result.reason instanceof Error?result.reason.message:'读取失败'}`]:[]);
      if(failures.length)throw new Error(failures.join('；'));
    }catch(reason){if(request===loadRequest.current){setError(reason instanceof Error?reason.message:'任务资料加载失败');}}finally{if(request===loadRequest.current)setLoading(false);}
  };
  useEffect(()=>{if(active)void load();return()=>{loadRequest.current++;};},[api,packaging,active]);
  useEffect(()=>{
    if(!active||!packaging?.getAutomation)return;
    let current=true;
    void packaging.getAutomation().then(result=>{if(current)setAutomation(result);})
      .catch(reason=>{if(current)setAutomation({failed:true,message:reason instanceof Error?reason.message:'本机自动化状态读取失败'});});
    return()=>{current=false;};
  },[active,packaging]);
  const illustratorState=automation?.blocked?'待核对':automation?.failed||(automation?.platform&&automation.platform!=='win32')?'无法检测':'未检测';
  const automationNotice=automation&&<div className="pkg-automation">
    <span>{automation.message}</span>
    <small>{automation.failed?'请检查本地服务连接后重新进入制图任务。':automation.blocked?'请保存文档并退出 Illustrator，再核对上次操作状态。':automation.platform!=='win32'?'请在已安装 Illustrator 的 Windows 电脑上生成，或选择人工制作。':'生成前请确认本机 Illustrator 可启动，且已安装模板所需字体。'}</small>
    {automation.blocked&&packaging&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{setAutomation(await packaging.reconcileAutomation());}catch(reason){setAutomation({...automation,message:reason instanceof Error?reason.message:'检查失败'});}finally{setBusy(false);}}}>检查上次本机操作是否已结束</button>}
  </div>;
  return <section className="page-surface page-enter packaging-page drawing-tasks-page"><PageHeader title="制图任务" description=""><small className="pkg-illustrator-status">Illustrator：{illustratorState}</small></PageHeader>
    {loading&&<p role="status">加载任务资料…</p>}{error&&<div className="pkg-error" role="alert">{error}<button type="button" onClick={()=>void load()}>重新加载</button></div>}
    {data&&packaging&&<PackagingTasks active={active} api={api} catalog={data.catalog} lookups={data.lookups} target={target} automationNotice={automationNotice}/>}
  </section>;
}
