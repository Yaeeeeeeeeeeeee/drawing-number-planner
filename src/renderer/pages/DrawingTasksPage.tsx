import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import type { PlannerApi } from '../data/client';
import type { PackagingCatalog } from '../../core/packaging/packaging-types';
import type { PackagingLookups } from './packaging/PackagingEditors';
import { PackagingTasks, type PackagingNavigationTarget } from './packaging/PackagingTaskPanel';
import './packaging/packaging.css';

export function DrawingTasksPage({api,target,active=true}:{api:PlannerApi;target?:PackagingNavigationTarget|null;active?:boolean}) {
  const [data,setData]=useState<{catalog:PackagingCatalog;lookups:PackagingLookups}|null>(null);
  const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const [automation,setAutomation]=useState<{message:string;blocked?:boolean}|null>(null);const [busy,setBusy]=useState(false);
  const loadRequest=useRef(0);const retainedLookups=useRef<PackagingLookups>({products:[],projects:[],mains:[],brands:[]});
  const packaging=api.packaging;
  const load=async(throwOnError=false)=>{
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
    }catch(reason){if(request===loadRequest.current){setError(reason instanceof Error?reason.message:'任务资料加载失败');if(throwOnError)throw reason;}}finally{if(request===loadRequest.current)setLoading(false);}
  };
  useEffect(()=>{if(active)void load();return()=>{loadRequest.current++;};},[api,packaging,active]);
  useEffect(()=>{if(packaging?.getAutomation)void packaging.getAutomation().then(setAutomation).catch(reason=>setAutomation({message:reason instanceof Error?reason.message:'本机自动化状态读取失败'}));},[packaging]);
  return <section className="page-surface page-enter packaging-page drawing-tasks-page"><PageHeader title="制图任务" description="从已占号图号制作文件、检查并统一归档"/>
    {loading&&<p role="status">加载任务资料…</p>}{error&&<div className="pkg-error" role="alert">{error}<button type="button" onClick={()=>void load()}>重新加载</button></div>}
    {data&&packaging&&<>
      {automation&&<div className="pkg-automation"><span>Illustrator：{automation.message}</span>{automation.blocked&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{setAutomation(await packaging.reconcileAutomation());}catch(reason){setAutomation({...automation,message:reason instanceof Error?reason.message:'检查失败'});}finally{setBusy(false);}}}>检查上次本机操作是否已结束</button>}</div>}
      <PackagingTasks active={active} api={api} catalog={data.catalog} lookups={data.lookups} target={target} onCatalogChanged={()=>load(true)}/>
    </>}
  </section>;
}
