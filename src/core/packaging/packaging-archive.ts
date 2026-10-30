import {existsSync} from 'node:fs';
import {join} from 'node:path';
import type {PackagingTaskService} from './packaging-task-service.js';
import {packagingName} from './packaging-task-service.js';
import {taskFail} from './packaging-task-store.js';
import {cleanupOwnedTaskFiles,copyPdfExclusive,pdfFact,replacePdfWithBackup} from './packaging-file-operations.js';
import {ensureSafeDirectory,assertSafeAbsolutePath} from './packaging-workspace.js';
import type {PackagingArchivePreview,PackagingTask,PackagingTaskItem} from './packaging-types.js';
import {toWorkspacePathKey} from '../files/workspace-paths.js';

interface Journal {task_id:string;item_id:number;source_relative_path:string;source_sha256:string;destination_relative_path:string;original_sha256:string|null;backup_relative_path:string|null;state:'prepared'|'published'|'indexed'}
async function indexedCompletion(service:PackagingTaskService,task:PackagingTask):Promise<Journal[]|undefined>{
 const scan=service.db.prepare('select index_scan_id as id from packaging_tasks where id=?').get(task.id) as {id:number|null};
 if(task.state!=='awaiting_index'||scan.id===null)return;
 const rows=service.db.prepare('select * from packaging_archive_journal where task_id=? order by item_id').all(task.id) as Journal[];
 if(rows.length!==task.items.filter(item=>item.mode!=='none').length||rows.some(row=>row.state!=='indexed'))return;
 service.validateTaskDrawings(task);
 for(const row of rows){
  const item=service.store.item(task.id,row.item_id),index=service.db.prepare('select drawing_id,historical_drawing_id,content_sha256,is_present from pdf_files where path_key=?').get(toWorkspacePathKey(row.destination_relative_path)) as {drawing_id:number|null;historical_drawing_id:number|null;content_sha256:string;is_present:number}|undefined;
  if(!index||!index.is_present||index.content_sha256!==row.source_sha256||(item.drawing.origin==='planned'?index.drawing_id:index.historical_drawing_id)!==item.drawing.id)taskFail('INDEX_NOT_CONFIRMED','归档索引尚未完整核实，临时文件保留');
  if((await pdfFact(service.taskPath(task.id,row.destination_relative_path))).sha256!==row.source_sha256)taskFail('ARCHIVE_CHANGED','已归档正式文件发生变化，不能自动完成清理');
  if(existsSync(service.taskPath(task.id,row.source_relative_path))&&(await pdfFact(service.taskPath(task.id,row.source_relative_path))).sha256!==row.source_sha256)taskFail('FILE_CHANGED','临时文件在归档后发生变化，已保留供人工核对');
  if(row.original_sha256&&(await pdfFact(join(service.options.dataDir,row.backup_relative_path!))).sha256!==row.original_sha256)taskFail('BACKUP_NOT_VERIFIED','原文件备份校验未通过');
 }
 return rows;
}
async function finishCleanup(service:PackagingTaskService,task:PackagingTask){
 const owned=service.store.owned(task.id).filter(file=>existsSync(service.taskPath(task.id,file.relativePath)));
 const cleanup=await cleanupOwnedTaskFiles(service.taskWorkspace(task.id),task.taskDirectory,owned);
 service.store.state(task.id,'completed',cleanup.retained.length?'已归档，部分已变化或非任务所有的临时文件保留，请人工核对':undefined);return service.store.task(task.id);
}
function destination(service:PackagingTaskService,task:PackagingTask,item:PackagingTaskItem){
 if(task.type==='modify'){if(!item.originalRelativePath||!item.originalSha256)taskFail('ORIGINAL_NOT_CONFIRMED','正式源文件尚未完整复制确认');return item.originalRelativePath!;}
 const product=service.workspace.product(task.productId);
 return join(task.productDirectory,'02.未转曲源文件',`${item.fullCode}-${packagingName(product.brandName)}-${packagingName(product.model)}${packagingName(item.color)}-${packagingName(item.projectName)}.pdf`);
}
export async function previewPackagingArchive(service:PackagingTaskService,id:string):Promise<PackagingArchivePreview>{
 const task=await service.getTask(id),blockers:string[]=[],files:PackagingArchivePreview['files']=[];
 try{service.validateTaskDrawings(task);}catch(error){blockers.push(error instanceof Error?error.message:'图号所属校验失败');}
 if(task.state==='completed')return{taskId:id,ready:false,blockers:['任务已完成归档'],files:[]};
 const indexed=await indexedCompletion(service,task);if(indexed)return{taskId:id,ready:true,blockers,files:indexed.map(row=>({itemId:row.item_id,fullCode:task.items.find(item=>item.id===row.item_id)!.fullCode,destination:row.destination_relative_path,replaces:task.type==='modify'}))};
 if(task.items.some(item=>item.state==='generating'))blockers.push('仍有项目正在生成');
 if(task.pendingFiles.some(file=>file.status==='pending'))blockers.push('仍有待关联或未完成写入的 PDF');
 for(const item of task.items){
  if(item.mode==='none')continue;
  try{
   if(!item.relativePath||!item.reviewedSha256||item.state!=='completed')taskFail('REVIEW_REQUIRED',`${item.projectName}尚未生成或完成人工检查`);
   const source=await pdfFact(service.taskPath(id,item.relativePath!));if(source.sha256!==item.reviewedSha256)taskFail('FILE_CHANGED',`${item.projectName}在人工确认后发生变化，请重新检查`);
   const target=destination(service,task,item),journal=service.db.prepare('select * from packaging_archive_journal where item_id=?').get(item.id) as Journal|undefined;
   if(!journal&&existsSync(service.taskPath(id,target))){
    if(task.type==='new')taskFail('DESTINATION_EXISTS',`${item.projectName}正式文件同名冲突，不允许覆盖`);
    if((await pdfFact(service.taskPath(id,target))).sha256!==item.originalSha256)taskFail('ORIGINAL_CHANGED',`${item.projectName}正式文件在任务创建后发生变化`);
   }
   files.push({itemId:item.id,fullCode:item.fullCode,destination:target,replaces:task.type==='modify'});
  }catch(error){blockers.push(error instanceof Error?error.message:'PDF 检查失败');}
 }
 return{taskId:id,ready:blockers.length===0,blockers,files};
}
export async function archivePackagingTask(service:PackagingTaskService,id:string){
 const task=service.store.task(id);if(task.state==='completed')return task;
 if(await indexedCompletion(service,task))return finishCleanup(service,task);
 const preview=await previewPackagingArchive(service,id);if(!preview.ready)taskFail('ARCHIVE_BLOCKED',preview.blockers.join('；'));
 // Pin the reviewed bytes and every destination before the first publication.
 service.db.transaction(()=>{
  for(const file of preview.files){
   const item=service.store.item(id,file.itemId);
   if(!service.db.prepare('select item_id from packaging_archive_journal where item_id=?').get(item.id)){
    const backup=task.type==='modify'?join('packaging-backups',id,`${item.id}-${packagingName(item.fileName??'原文件.pdf')}`):null;
    service.db.prepare(`insert into packaging_archive_journal(task_id,item_id,source_relative_path,source_sha256,destination_relative_path,original_sha256,backup_relative_path,state,created_at) values(?,?,?,?,?,?,?,'prepared',?)`).run(id,item.id,item.relativePath!,item.reviewedSha256!,file.destination,item.originalSha256??null,backup,new Date().toISOString());
    if(backup)service.store.updateItem(item.id,{backupRelativePath:backup});
   }
  }
  service.store.state(id,'archiving');
 }).immediate();
 try{
  const journals=service.db.prepare('select * from packaging_archive_journal where task_id=? order by item_id').all(id) as Journal[];
  for(const journal of journals){
   const source=service.taskPath(id,journal.source_relative_path),target=service.taskPath(id,journal.destination_relative_path);
   if((await pdfFact(source)).sha256!==journal.source_sha256)taskFail('FILE_CHANGED','临时文件在归档确认后发生变化，已保留文件，请核对后恢复本次归档');
   if(journal.original_sha256===journal.source_sha256&&existsSync(target)&&(await pdfFact(target)).sha256===journal.source_sha256){
    const backup=join(service.options.dataDir,journal.backup_relative_path!);assertSafeAbsolutePath(backup);
    if(existsSync(backup)){if((await pdfFact(backup)).sha256!==journal.original_sha256)taskFail('BACKUP_NOT_VERIFIED','原文件备份校验未通过');}
    else await copyPdfExclusive(target,backup,journal.original_sha256);
   }else if(existsSync(target)&&(await pdfFact(target)).sha256===journal.source_sha256){
    // Resume an already published copy, proving an old-file backup for replacements.
    if(journal.original_sha256){const backup=join(service.options.dataDir,journal.backup_relative_path!);assertSafeAbsolutePath(backup);if((await pdfFact(backup)).sha256!==journal.original_sha256)taskFail('BACKUP_NOT_VERIFIED','正式文件备份不完整，已保留临时文件');}
   }else if(journal.original_sha256){
    const backup=join(service.options.dataDir,journal.backup_relative_path!);assertSafeAbsolutePath(backup);
    await replacePdfWithBackup({source,destination:target,backup,expectedOriginalSha256:journal.original_sha256,expectedSourceSha256:journal.source_sha256});
   }else{await copyPdfExclusive(source,target,journal.source_sha256);}
   if((await pdfFact(target)).sha256!==journal.source_sha256)taskFail('ARCHIVE_VERIFY_FAILED','正式目录中的 PDF 校验未通过');
   service.db.prepare("update packaging_archive_journal set state='published' where item_id=?").run(journal.item_id);
  }
  service.store.state(id,'awaiting_index');
  service.assertWorkspace(id);
  const scan=await service.options.files.scanProducts([task.productDirectory]);
  service.db.transaction(()=>{
   service.validateTaskDrawings(service.store.task(id));
   for(const journal of journals){
    const item=service.store.item(id,journal.item_id),index=service.db.prepare('select id,drawing_id,historical_drawing_id,content_sha256,detected_codes_json,management_state from pdf_files where path_key=? and is_present=1').get(toWorkspacePathKey(journal.destination_relative_path)) as {id:number;drawing_id:number|null;historical_drawing_id:number|null;content_sha256:string;detected_codes_json:string;management_state:string}|undefined;
    if(!index||index.content_sha256!==journal.source_sha256||!JSON.parse(index.detected_codes_json).includes(item.fullCode))taskFail('INDEX_NOT_CONFIRMED','归档文件尚未正确进入正式 PDF 索引，已保留临时文件');
    const targetId=item.drawing.origin==='planned'?index.drawing_id:index.historical_drawing_id;
    const otherId=item.drawing.origin==='planned'?index.historical_drawing_id:index.drawing_id;
    if(targetId!==null&&targetId!==item.drawing.id||otherId!==null)taskFail('INDEX_IDENTITY_CONFLICT','归档文件已关联其他图号身份，不能覆盖关联');
    // The reviewed task + hash-pinned publication provides explicit ownership, including a newly reserved generation after release.
    service.db.prepare(`update pdf_files set drawing_id=?,historical_drawing_id=?,match_status='matched',conversion_type='source',classification_warning=case when classification_warning='drawing-force-released' then null else classification_warning end where id=?`).run(item.drawing.origin==='planned'?item.drawing.id:null,item.drawing.origin==='historical'?item.drawing.id:null,index.id);
    service.db.prepare("update packaging_archive_journal set state='indexed' where item_id=?").run(item.id);
   }
   service.db.prepare('update packaging_tasks set index_scan_id=? where id=?').run(scan.scanId,id);
  }).immediate();
  for(const journal of journals)if((await pdfFact(service.taskPath(id,journal.destination_relative_path))).sha256!==journal.source_sha256)taskFail('ARCHIVE_CHANGED','索引确认后正式文件发生变化，临时文件不清理');
  return finishCleanup(service,task);
 }catch(error){service.store.state(id,'awaiting_index',error instanceof Error?error.message:'归档未完成，临时文件已保留');throw error;}
}
