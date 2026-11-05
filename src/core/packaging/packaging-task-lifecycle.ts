import {createHash} from 'node:crypto';
import type {PackagingTaskService} from './packaging-task-service.js';
import {taskFail} from './packaging-task-store.js';
import type {PackagingTaskDeleteInput,PackagingTaskDeletionPreview} from './packaging-types.js';

/** Ending observes ownership, not PDF existence or the validity of an old drawing. */
export function previewTaskTermination(service:PackagingTaskService,id:string):PackagingTaskDeletionPreview {
  const task=service.store.task(id),base=service.deletionPreview(id);
  const busy=service.isTaskBusy(id)||task.items.some(item=>item.state==='generating');
  const unsettled=service.hasUnsettledAutomation();
  const reason=task.endedAt?'任务已经安全结束':task.state==='completed'?'任务已经完成归档，可删除任务记录':busy?'任务仍在处理文件，请等待当前操作停止后重新检查':unsettled?'Illustrator 上次操作尚未核对结束，请先执行中断核对':undefined;
  return {...base,token:createHash('sha256').update(`terminate:${base.token}`).digest('hex'),canDelete:!reason,reason};
}

export function terminatePackagingTask(service:PackagingTaskService,id:string,input:PackagingTaskDeleteInput) {
  return service.db.transaction(()=>{
    const task=service.store.task(id);
    if(task.endedAt)return {id,terminated:true as const,filesPreserved:true as const};
    const preview=previewTaskTermination(service,id);
    if(!input.confirmed||input.token!==preview.token)taskFail('TASK_DELETE_CHANGED','任务状态已变化，请重新核对结束信息');
    if(!preview.canDelete)taskFail('TASK_TERMINATION_BLOCKED',preview.reason!);
    if(!input.acknowledgeUnfinished)taskFail('TASK_UNFINISHED_CONFIRMATION','请确认保留全部文件并结束此任务');
    const snapshot={action:'terminated',task,owned:service.store.owned(id),journal:service.db.prepare('select * from packaging_archive_journal where task_id=? order by item_id').all(id),filesPreserved:true,archiveCompleted:false};
    service.db.prepare('update packaging_tasks set deleted_at=?,deletion_snapshot_json=? where id=? and deleted_at is null').run(new Date().toISOString(),JSON.stringify(snapshot),id);
    return {id,terminated:true as const,filesPreserved:true as const};
  }).immediate();
}
