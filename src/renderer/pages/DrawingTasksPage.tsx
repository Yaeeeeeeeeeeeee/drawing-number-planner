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
  const loadRequest=useRef(0);
  const packaging=api.packaging;
  const load=async(throwOnError=false)=>{
    const request=++loadRequest.current;
    if(!packaging){setError('当前服务尚未提供制图任务接口，请使用配套版本的本地服务。');setLoading(false);return;}
    if(!data)setLoading(true);setError('');try{
      const [catalog,products,projects,mains,brands]=await Promise.all([packaging.getCatalog(),api.listProducts({status:'all'}),api.listDictionaries('project_item'),api.listDictionaries('main_category'),api.listDictionaries('brand')]);
      if(request!==loadRequest.current)return;
      setData({catalog,lookups:{products,projects,mains,brands}});
    }catch(reason){if(request===loadRequest.current){setError(reason instanceof Error?reason.message:'任务资料加载失败');if(throwOnError)throw reason;}}finally{if(request===loadRequest.current)setLoading(false);}
  };
  useEffect(()=>{if(active)void load();return()=>{loadRequest.current++;};},[api,packaging,active]);
  useEffect(()=>{if(packaging?.getAutomation)void packaging.getAutomation().then(setAutomation).catch(reason=>setAutomation({message:reason instanceof Error?reason.message:'本机自动化状态读取失败'}));},[packaging]);
  return <section className="page-surface page-enter packaging-page drawing-tasks-page"><PageHeader title="制图任务" description="从已占号图号制作文件、检查并统一归档"/>
    {loading&&<p role="status">加载任务资料…</p>}{error&&<div className="pkg-error" role="alert">{error}<button type="button" onClick={()=>void load()}>重新加载</button></div>}
    {data&&packaging&&<>
      {automation&&<div className="pkg-automation"><span>Illustrator：{automation.message}</span>{automation.blocked&&<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{setAutomation(await packaging.reconcileAutomation());}catch(reason){setAutomation({...automation,message:reason instanceof Error?reason.message:'检查失败'});}finally{setBusy(false);}}}>检查上次本机操作是否已结束</button>}</div>}
      <PackagingTasks api={api} catalog={data.catalog} lookups={data.lookups} target={target} onCatalogChanged={()=>load(true)}/>
    </>}
  </section>;
}
