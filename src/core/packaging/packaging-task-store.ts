import type {PlannerDatabase} from '../../db/database.js';
import type {PackagingTask,PackagingTaskItem,PackagingTemplate,PackagingPendingFile} from './packaging-types.js';

export class PackagingTaskError extends Error {
  constructor(readonly code:string,message:string,readonly details?:unknown){super(message);this.name='PackagingTaskError';}
}
export function taskFail(code:string,message:string,details?:unknown):never{throw new PackagingTaskError(code,message,details);}
const optional=<T>(value:T|null):T|undefined=>value??undefined;
export interface OwnedPackagingFile {relativePath:string;sha256:string}
export class PackagingTaskStore {
 constructor(readonly db:PlannerDatabase){}
 task(id:string):PackagingTask{
  const row=this.db.prepare(`select id,product_id as productId,model_snapshot as model,name,type,state,product_directory as productDirectory,
   task_directory as taskDirectory,created_at as createdAt,completed_at as completedAt,error from packaging_tasks where id=?`).get(id) as PackagingTask|undefined;
  if(!row)taskFail('TASK_NOT_FOUND','制图任务不存在');
  return{...row!,completedAt:optional(row!.completedAt),error:optional(row!.error),items:this.items(id),pendingFiles:this.pending(id)};
 }
 items(taskId:string):PackagingTaskItem[]{
  return(this.db.prepare('select * from packaging_task_items where task_id=? order by id').all(taskId) as any[]).map(row=>({
   id:row.id,taskId:row.task_id,drawing:{origin:row.drawing_origin,id:row.drawing_id},fullCode:row.full_code,projectItemId:row.project_item_id,projectName:row.project_name,color:row.color,
   mode:row.mode,parameters:JSON.parse(row.parameters_json),templateId:optional(row.template_id),dimensionProfileId:optional(row.dimension_profile_id),ratioLocked:row.ratio_locked===1,
   state:row.state,error:optional(row.error),reviewedSha256:optional(row.reviewed_sha256),fileName:optional(row.file_name),relativePath:optional(row.relative_path),sha256:optional(row.sha256),templateName:optional(row.template_name),
   originalRelativePath:optional(row.original_relative_path),originalSha256:optional(row.original_sha256),backupRelativePath:optional(row.backup_relative_path),
  }));
 }
 item(taskId:string,itemId:number):PackagingTaskItem{const item=this.items(taskId).find(item=>item.id===itemId);if(!item)taskFail('TASK_ITEM_NOT_FOUND','任务项目不存在');return item!;}
 pending(taskId:string):PackagingPendingFile[]{return(this.db.prepare('select id,task_id as taskId,file_name as fileName,relative_path as relativePath,sha256,status,reason,item_id as itemId from packaging_pending_files where task_id=? order by id').all(taskId) as PackagingPendingFile[]).map(row=>({...row,itemId:optional(row.itemId)}));}
 updateItem(id:number,patch:Partial<PackagingTaskItem>){
  const columns:Record<string,string>={mode:'mode',parameters:'parameters_json',templateId:'template_id',dimensionProfileId:'dimension_profile_id',ratioLocked:'ratio_locked',state:'state',error:'error',reviewedSha256:'reviewed_sha256',fileName:'file_name',relativePath:'relative_path',sha256:'sha256',templateName:'template_name',originalRelativePath:'original_relative_path',originalSha256:'original_sha256',backupRelativePath:'backup_relative_path'};
  const entries=Object.entries(patch).filter(([key])=>columns[key]);if(!entries.length)return;
  this.db.prepare(`update packaging_task_items set ${entries.map(([key])=>`${columns[key]}=?`).join(',')} where id=?`).run(...entries.map(([key,value])=>key==='parameters'?JSON.stringify(value):key==='ratioLocked'?Number(value):value??null),id);
 }
 snapshot(itemId:number):PackagingTemplate|undefined{const row=this.db.prepare('select template_snapshot_json as json from packaging_task_items where id=?').get(itemId) as {json:string|null}|undefined;return row?.json?JSON.parse(row.json):undefined;}
 setSnapshot(itemId:number,template:PackagingTemplate|undefined){this.db.prepare('update packaging_task_items set template_snapshot_json=? where id=?').run(template?JSON.stringify(template):null,itemId);}
 state(id:string,state:PackagingTask['state'],error?:string){this.db.prepare('update packaging_tasks set state=?,error=?,completed_at=? where id=?').run(state,error??null,state==='completed'?new Date().toISOString():null,id);}
 owned(id:string):OwnedPackagingFile[]{const row=this.db.prepare('select owned_files_json as json from packaging_tasks where id=?').get(id) as {json:string};return JSON.parse(row.json);}
 own(id:string,file:OwnedPackagingFile){const owned=this.owned(id).filter(item=>item.relativePath!==file.relativePath);owned.push(file);this.db.prepare('update packaging_tasks set owned_files_json=? where id=?').run(JSON.stringify(owned),id);}
}
