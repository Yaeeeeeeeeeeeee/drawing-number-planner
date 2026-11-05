import type {BatchPlanningInput,BatchPlanningPreview,BatchReservePlanningInput,BatchPlanningResult,PlanningDraftInput,PlanningDraftMode,PlanningDraftRecord,PlanningWhiteBasesInput,WhiteDrawingBase} from '../../core/planning/planning-types';

export interface PlanningWorkspaceApi {
  previewBatchPlan(input:BatchPlanningInput):Promise<BatchPlanningPreview>;
  reserveBatchPlan(input:BatchReservePlanningInput):Promise<BatchPlanningResult>;
  listPlanningWhiteBases(input:PlanningWhiteBasesInput):Promise<{items:WhiteDrawingBase[]}>;
  getPlanningDraft(mode:PlanningDraftMode):Promise<{draft:PlanningDraftRecord|null;revision:number}>;
  savePlanningDraft(mode:PlanningDraftMode,input:PlanningDraftInput,expectedRevision?:number):Promise<{draft:PlanningDraftRecord}>;
  deletePlanningDraft(mode:PlanningDraftMode,expectedRevision?:number):Promise<{deleted:true;revision:number}>;
}
export function createPlanningWorkspaceApi(request:<T>(path:string,init?:RequestInit)=>Promise<T>):PlanningWorkspaceApi {
  const json=(method:string,body:unknown):RequestInit=>({method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return {
    previewBatchPlan:input=>request('/api/planning/batch-preview',json('POST',input)),
    reserveBatchPlan:input=>request('/api/planning/batch-reserve',json('POST',input)),
    listPlanningWhiteBases:input=>{const params=new URLSearchParams();for(const[key,value]of Object.entries(input))if(value!==undefined)params.set(key,String(value));return request('/api/planning/white-bases?'+params);},
    getPlanningDraft:mode=>request('/api/planning/drafts/'+mode),
    savePlanningDraft:(mode,input,expectedRevision)=>request('/api/planning/drafts/'+mode,json('PUT',{input,expectedRevision})),
    deletePlanningDraft:(mode,expectedRevision)=>request('/api/planning/drafts/'+mode,json('DELETE',{expectedRevision})),
  };
}
