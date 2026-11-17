import {useCallback,useEffect,useState} from 'react';
import type {LocalTaskView} from '../data/client';

const scanKinds=new Set(['workspace_scan','product_scan','category_scan']);
export function useScanProgress(list:(()=>Promise<LocalTaskView[]>)|undefined,active:boolean,starting:boolean|number){
 const [task,setTask]=useState<LocalTaskView|null>(null);
 const [error,setError]=useState('');const [retry,setRetry]=useState(0);
 const refresh=useCallback(()=>setRetry(value=>value+1),[]);
 useEffect(()=>{
  if(!active||!list)return;
  let live=true;let timer:ReturnType<typeof setTimeout>|undefined;
  const load=async()=>{
   try{
    const tasks=await list();if(!live)return;
    const latest=tasks.find(item=>scanKinds.has(item.kind))??null;
    setTask(latest);setError('');
    if((latest&&['queued','running','finalizing'].includes(latest.status))||starting)
     timer=setTimeout(load,500);
   }catch(reason){if(live)setError(reason instanceof Error?reason.message:'扫描状态获取失败');}
  };
  void load();return()=>{live=false;if(timer)clearTimeout(timer);};
 },[list,active,starting,retry]);
 return {task,error,refresh};
}
