import {useEffect,useRef,useState} from 'react';
import type {PlanningDraftInput,PlanningDraftMode} from '../../../core/planning/planning-types';
import type {PlanningWorkspaceApi} from '../../data/planning-client';
import {emptyPlanningDraft} from './planning-workspace-state';

const message=(error:unknown)=>error instanceof Error?error.message:'草稿保存失败';
export function usePlanningDrafts(api:PlanningWorkspaceApi,mode:PlanningDraftMode) {
  const [drafts,setDrafts]=useState<Record<PlanningDraftMode,PlanningDraftInput>>({new:emptyPlanningDraft(),batch:emptyPlanningDraft()});
  const [ready,setReady]=useState({new:false,batch:false}),[status,setStatus]=useState<Record<PlanningDraftMode,string>>({new:'',batch:''});
  const [error,setError]=useState<Record<PlanningDraftMode,string>>({new:'',batch:''});
  const [removing,setRemoving]=useState(false);
  const revision=useRef<Record<PlanningDraftMode,number|undefined>>({new:undefined,batch:undefined}),saved=useRef({new:'',batch:''});
  const pending=useRef<Partial<Record<PlanningDraftMode,PlanningDraftInput>>>({}),running=useRef<Partial<Record<PlanningDraftMode,Promise<void>>>>({});
  const live=useRef(true),requests=useRef({new:0,batch:0}),deleting=useRef({new:false,batch:false});
  useEffect(()=>{live.current=true;return()=>{live.current=false;requests.current.new++;requests.current.batch++;};},[api]);
  const load=async(target:PlanningDraftMode)=>{
    const request=++requests.current[target];setError(current=>({...current,[target]:''}));
    try{
      const {draft,revision:token}=await api.getPlanningDraft(target);if(!live.current||request!==requests.current[target])return;
      const input=draft?.input??emptyPlanningDraft();revision.current[target]=token;saved.current[target]=JSON.stringify(input);
      setDrafts(current=>({...current,[target]:input}));setReady(current=>({...current,[target]:true}));setStatus(current=>({...current,[target]:draft?'草稿已恢复，请重新检查图号及基础资料':''}));
    }catch(reason){if(live.current&&request===requests.current[target])setError(current=>({...current,[target]:message(reason)}));}
  };
  useEffect(()=>{if(!ready[mode])void load(mode);},[api,mode]);
  const pump=(target:PlanningDraftMode)=>{
    if(running.current[target]||deleting.current[target])return running.current[target];
    const work=(async()=>{
      while(pending.current[target]){
        const input=pending.current[target]!;delete pending.current[target];if(JSON.stringify(input)===saved.current[target])continue;
        if(live.current){setStatus(current=>({...current,[target]:'正在保存草稿…'}));setError(current=>({...current,[target]:''}));}
        try{const {draft}=await api.savePlanningDraft(target,input,revision.current[target]);revision.current[target]=draft.revision;saved.current[target]=JSON.stringify(input);if(live.current)setStatus(current=>({...current,[target]:'草稿已保存'}));}
        catch(reason){pending.current[target]??=input;if(live.current)setError(current=>({...current,[target]:message(reason)}));break;}
      }
    })();running.current[target]=work;void work.finally(()=>{delete running.current[target];});return work;
  };
  useEffect(()=>{if(ready[mode]&&!deleting.current[mode]&&JSON.stringify(drafts[mode])!==saved.current[mode]){pending.current[mode]=drafts[mode];void pump(mode);}},[api,mode,drafts,ready]);
  const update=(next:PlanningDraftInput)=>{if(!deleting.current[mode])setDrafts(current=>({...current,[mode]:next}));};
  const remove=async()=>{
    const target=mode;if(deleting.current[target])return;deleting.current[target]=true;setRemoving(true);delete pending.current[target];
    try{
      await running.current[target];delete pending.current[target];const result=await api.deletePlanningDraft(target,revision.current[target]);
      const input=emptyPlanningDraft();revision.current[target]=result.revision;saved.current[target]=JSON.stringify(input);
      setDrafts(current=>({...current,[target]:input}));setError(current=>({...current,[target]:''}));setStatus(current=>({...current,[target]:'草稿已删除，正式图号保持不变'}));
    }catch(reason){setError(current=>({...current,[target]:message(reason)}));throw reason;}finally{deleting.current[target]=false;if(live.current)setRemoving(false);}
  };
  return {draft:drafts[mode],update,removing,ready:ready[mode],status:status[mode],error:error[mode],reload:()=>load(mode),retry:()=>{if(!deleting.current[mode]){pending.current[mode]=drafts[mode];void pump(mode);}},remove};
}
