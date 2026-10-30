import {createHash,randomUUID} from 'node:crypto';
import {existsSync,readdirSync,unlinkSync,writeFileSync} from 'node:fs';
import {basename,join} from 'node:path';
import type {PlannerDatabase} from '../../db/database.js';
import {DrawingRepository} from '../drawings/drawing-repository.js';
import type {DrawingRecord} from '../drawings/drawing-types.js';
import type {FileService} from '../files/file-service.js';
import {resolveWorkspacePath} from '../files/workspace-paths.js';
import {resolveCanonicalProductId} from '../products/appearance-identity.js';
import {PackagingCatalogService} from './packaging-catalog.js';
import {matchPackagingTemplates,resolvePackagingDimensions} from './packaging-matcher.js';
import {PackagingWorkspace} from './packaging-workspace.js';
import {copyPdfExclusive,pdfFact,stablePdfFact} from './packaging-file-operations.js';
import {PackagingTaskStore,taskFail} from './packaging-task-store.js';
import {archivePackagingTask,previewPackagingArchive} from './packaging-archive.js';
import type {IllustratorAutomation} from './illustrator-automation.js';
import type {PackagingDrawingRef,PackagingTask,PackagingTaskCreate,PackagingTaskItem,PackagingTaskItemInput,PackagingParameters} from './packaging-types.js';

export interface PackagingTaskOptions {
 workspaceRoot:()=>string|null;dataDir:string;catalog:PackagingCatalogService;automation:IllustratorAutomation;
 files:Pick<FileService,'scanProducts'>;stableDelayMs?:number;
}
export const packagingName=(value:string)=>value.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f]/gu,'_').replace(/[ .]+$/u,'').slice(0,100)||'项目';
const codePattern=/(?<!\d)\d{2}\.\d{4}\.\d{3}\.\d{7}(?!\d)/gu;
const escaped=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const namedProjectMatch=(fileName:string,model:string,project:string)=>new RegExp(`(^|[^A-Z0-9])${escaped(model.normalize('NFKC'))}(?=$|[^A-Z0-9])`,'iu').test(fileName.normalize('NFKC'))&&new RegExp(`(^|[-_·\\s（(])${escaped(project.normalize('NFKC'))}(?=$|[-_·\\s）).])`,'iu').test(fileName.normalize('NFKC'));
const errorText=(error:unknown)=>error instanceof Error?error.message:'制图操作失败';
export class PackagingTaskService {
 readonly store:PackagingTaskStore;readonly workspace:PackagingWorkspace;
 private operations=new Map<string,Promise<unknown>>();private closed=false;
 constructor(readonly db:PlannerDatabase,readonly options:PackagingTaskOptions){this.store=new PackagingTaskStore(db);this.workspace=new PackagingWorkspace(db,options.workspaceRoot);}
 recover(){this.db.prepare(`update packaging_task_items set state='failed',error='上次 Illustrator 操作被中断，请先核对原文件和自动化状态，再单独重试' where state='generating' and task_id in(select id from packaging_tasks where state<>'completed')`).run();}
 async close(){this.closed=true;while(this.operations.size)await Promise.allSettled([...this.operations.values()]);}
 assertWorkspace(id:string){const key=(this.db.prepare('select workspace_key as key from packaging_tasks where id=?').get(id) as {key:string}|undefined)?.key;if(key!==this.workspaceKey())taskFail('TASK_WORKSPACE_CHANGED','资料根目录与任务创建时不同，请恢复原资料根目录后继续任务');}
 private workspaceKey(root=this.workspace.root()){const canonical=root.replaceAll('\\','/');return createHash('sha256').update(process.platform==='win32'?canonical.toLocaleLowerCase('en-US'):canonical).digest('hex');}
 hasOperations(){return this.operations.size>0;}
 taskWorkspace(id:string){const root=this.workspace.root();const key=(this.db.prepare('select workspace_key as key from packaging_tasks where id=?').get(id) as {key:string}|undefined)?.key;if(key!==this.workspaceKey(root))taskFail('TASK_WORKSPACE_CHANGED','资料根目录与任务创建时不同，请恢复原资料根目录后继续任务');return new PackagingWorkspace(this.db,()=>root);}
 taskPath(id:string,path:string){return this.taskWorkspace(id).path(path);}
 validateTaskDrawings(task:PackagingTask){this.assertWorkspace(task.id);for(const item of task.items){const drawing=this.drawing(item.drawing,task.productId);if(drawing.fullCode!==item.fullCode)taskFail('DRAWING_CHANGED','任务关联图号已变化，不能继续生成或归档');}}
 private mutable(id:string){if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');const task=this.store.task(id);this.assertWorkspace(id);if(task.state!=='active')taskFail('TASK_NOT_EDITABLE','任务正在归档或已完成，不能更改项目');return task;}
 private drawing(ref:PackagingDrawingRef,productId:number):DrawingRecord{
  if(!['planned','historical'].includes(ref.origin)||!Number.isSafeInteger(ref.id)||ref.id<=0)taskFail('INVALID_DRAWING','请选择真实已确认的图号');
  const drawing=new DrawingRepository(this.db).get(ref.origin==='historical'?-ref.id:ref.id);
  if(!drawing||drawing.deletedAt||!drawing.occupied||drawing.productId!==productId||!drawing.projectItemId||!drawing.mainCategoryId)taskFail('INVALID_DRAWING','图号不存在、已删除、未占号或不属于当前产品');
  return drawing!;
 }
 private match(task:PackagingTask,item:PackagingTaskItem){const drawing=this.drawing(item.drawing,task.productId),product=this.workspace.product(task.productId);return matchPackagingTemplates(this.options.catalog.getCatalog(),{productId:task.productId,brandId:product.brandId,projectItemId:item.projectItemId,mainCategoryId:drawing.mainCategoryId!,parameters:item.parameters});}
 listTasks(productId?:number){return(this.db.prepare(`select id from packaging_tasks ${productId===undefined?'':'where product_id=?'} order by created_at desc,id desc`).all(...(productId===undefined?[]:[resolveCanonicalProductId(this.db,productId)])) as {id:string}[]).map(row=>this.store.task(row.id));}
 async getTask(id:string):Promise<PackagingTask>{
  if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');
  const task=this.store.task(id);
  if(task.state==='active'&&!this.operations.has(id)){
   this.assertWorkspace(id);const work=this.refreshFiles(task);this.operations.set(id,work);try{await work;}finally{this.operations.delete(id);}
  }
  return this.presentTask(id);
 }
 private presentTask(id:string){
  const fresh=this.store.task(id);
  if(fresh.state==='active')fresh.items=fresh.items.map(item=>{try{return{...item,match:this.match(fresh,item)};}catch(error){return{...item,error:item.error??errorText(error)};}});
  return fresh;
 }
 private async refreshFiles(task:PackagingTask){for(const item of task.items){
   if(!item.relativePath||item.state==='generating'||item.mode==='none')continue;
    try{const fact=await pdfFact(this.taskPath(task.id,item.relativePath));if(fact.sha256!==item.sha256){this.store.updateItem(item.id,{sha256:fact.sha256,reviewedSha256:undefined,state:'awaiting_review',error:undefined});this.store.own(task.id,{relativePath:item.relativePath,sha256:fact.sha256});}}
   catch(error){this.store.updateItem(item.id,{reviewedSha256:undefined,error:errorText(error)});}
  }}
 async createTask(input:PackagingTaskCreate):Promise<PackagingTask>{
  if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');const key=`create:${randomUUID()}`,work=this.runCreateTask(input);this.operations.set(key,work);try{return await work;}finally{this.operations.delete(key);}
 }
 private async runCreateTask(input:PackagingTaskCreate):Promise<PackagingTask>{
  if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');
  const productId=resolveCanonicalProductId(this.db,input.productId),product=this.workspace.product(productId);
  if(!input.name?.trim()||!['new','modify'].includes(input.type)||!Array.isArray(input.drawings)||input.drawings.length<1||input.drawings.length>100)taskFail('INVALID_TASK','请填写任务名称并选择1至100个已占号项目');
  const drawings=input.drawings.map(ref=>this.drawing(ref,productId));if(new Set(drawings.map(row=>row.fullCode)).size!==drawings.length)taskFail('INVALID_TASK','任务中不能重复添加同一完整图号');
  const creationRoot=this.workspace.root(),creationKey=this.workspaceKey(creationRoot),creationWorkspace=new PackagingWorkspace(this.db,()=>creationRoot);
  const directory=creationWorkspace.resolveProductDirectory(productId,input.productDirectory),id=randomUUID();
  const originals=new Map<number,{relativePath:string;fileName:string;sha256:string}>();
  if(input.type==='modify')for(const[index,drawing]of drawings.entries()){
   if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');
   const files=new DrawingRepository(this.db).getDetail(drawing.id)!.sourceFiles.filter(file=>file.conversionType==='source'&&file.relativePath.replaceAll('\\','/').startsWith(`${directory.relativePath.replaceAll('\\','/')}/02.未转曲源文件/`));
   const selected=input.drawings[index].sourcePdfFileId,source=selected===undefined?(files.length===1?files[0]:undefined):files.find(file=>file.pdfIndexId===selected);
   if(!source)taskFail('SOURCE_AMBIGUOUS','正式源文件未唯一确认，请先扫描并明确选择源 PDF');
   const fact=await pdfFact(resolveWorkspacePath(creationRoot,source.relativePath));originals.set(index,{relativePath:source.relativePath,fileName:source.fileName,sha256:fact.sha256});
  }
  if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');
  if(this.workspaceKey()!==creationKey)taskFail('TASK_WORKSPACE_CHANGED','资料根目录已变化，请重新创建任务');
  this.db.transaction(()=>{
   for(const ref of input.drawings)this.drawing(ref,productId);
   const existing=this.db.prepare("select id from packaging_tasks where product_id=? and state<>'completed'").get(productId) as {id:string}|undefined;
   if(existing)taskFail('ACTIVE_TASK_EXISTS','该产品已有未完成制图任务，请继续现有任务',{existingTaskId:existing.id});
   const taskDirectory=creationWorkspace.createTaskDirectory(directory.relativePath,id,input.name);
   this.db.prepare(`insert into packaging_tasks(id,product_id,model_snapshot,name,type,state,product_directory,task_directory,created_at,workspace_key) values(?,?,?,?,?,'active',?,?,?,?)`).run(id,productId,product.model,input.name.trim(),input.type,directory.relativePath,taskDirectory,new Date().toISOString(),creationKey);
   const catalog=this.options.catalog.getCatalog();
   for(const [index,drawing]of drawings.entries()){
    const config=catalog.configs.find(row=>row.projectItemId===drawing.projectItemId),mode=input.type==='modify'?'manual':config?.mode??'manual';
    const profile=resolvePackagingDimensions(catalog,productId,drawing.projectItemId!).defaultProfile,parameters=profile?.parameters??{};
    const match=matchPackagingTemplates(catalog,{productId,brandId:product.brandId,projectItemId:drawing.projectItemId!,mainCategoryId:drawing.mainCategoryId!,parameters});
    const template=mode==='ait'&&match.status==='unique'?catalog.templates.find(row=>row.id===match.templateIds[0]):undefined;
    const rowId=Number(this.db.prepare(`insert into packaging_task_items(task_id,drawing_origin,drawing_id,planned_drawing_id,historical_drawing_id,full_code,project_item_id,project_name,color,mode,parameters_json,template_id,dimension_profile_id,template_snapshot_json,template_name,state)
     values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,input.drawings[index].origin,Math.abs(drawing.id),drawing.origin==='planned'?Math.abs(drawing.id):null,drawing.origin==='historical'?Math.abs(drawing.id):null,drawing.fullCode,drawing.projectItemId,drawing.projectItemName,drawing.colorName,mode,JSON.stringify(parameters),template?.id??null,profile?.id??null,template?JSON.stringify(template):null,template?.name??null,mode==='none'?'none':mode==='manual'?'awaiting_upload':'pending').lastInsertRowid);
    if(input.type==='modify'){
     const source=originals.get(index)!;this.store.updateItem(rowId,{originalRelativePath:source.relativePath,originalSha256:source.sha256,fileName:source.fileName});
    }
   }
  }).immediate();
  if(input.type==='modify'){const work=this.copyOriginalItems(id);this.operations.set(id,work);try{await work;}finally{this.operations.delete(id);}}
  return this.getTask(id);
 }
 private async copyOriginalItems(id:string){const task=this.store.task(id);if(task.type!=='modify')return;for(const item of task.items){
  if(item.relativePath||item.mode==='none')continue;
  try{if(!item.originalRelativePath||!item.originalSha256)taskFail('ORIGINAL_NOT_CONFIRMED','原文件基准未确认，请核对正式源文件');
   const destination=join(task.taskDirectory,packagingName(item.fileName??`${item.fullCode}.pdf`)),target=this.taskPath(id,destination);
   const fact=existsSync(target)?await pdfFact(target):await copyPdfExclusive(this.taskPath(id,item.originalRelativePath!),target,item.originalSha256);
   if(fact.sha256!==item.originalSha256)taskFail('COPY_CHANGED','已有临时副本已变化，请通过人工文件关联核对');
   this.store.updateItem(item.id,{relativePath:destination,sha256:fact.sha256,state:'awaiting_review',error:undefined});this.store.own(id,{relativePath:destination,sha256:fact.sha256});
  }catch(error){this.store.updateItem(item.id,{state:'failed',error:errorText(error)});}
 }}
 async configureItem(taskId:string,itemId:number,input:PackagingTaskItemInput){
  const task=this.mutable(taskId),item=this.store.item(taskId,itemId);if(item.state==='generating'||this.operations.has(taskId))taskFail('TASK_BUSY','项目正在生成，请完成后再修改');
  const catalog=this.options.catalog.getCatalog(),profile=input.dimensionProfileId===undefined?undefined:catalog.dimensions.find(row=>row.id===input.dimensionProfileId&&row.projectItemId===item.projectItemId&&row.productIds.includes(task.productId)&&row.status==='active');
  if(input.dimensionProfileId!==undefined&&!profile)taskFail('DIMENSION_NOT_FOUND','尺寸规格不适用于当前产品项目');
  const parameters=input.parameters??profile?.parameters??item.parameters;
  const config=catalog.configs.find(row=>row.projectItemId===item.projectItemId);
  for(const definition of config?.parameters??[]){const value=parameters[definition.key];if(value===undefined||value==='')continue;if(typeof value!==definition.type||typeof value==='number'&&(!Number.isFinite(value)||value<=0))taskFail('INVALID_DIMENSION',`${definition.label}的参数格式不正确`);}
  if((input.ratioLocked??item.ratioLocked??true)&&profile?.ratioKeys&&profile.ratio){const[a,b]=profile.ratioKeys.map(key=>Number(parameters[key]));if(a>0&&b>0&&Math.abs(a/b-profile.ratio)>0.00001)taskFail('INVALID_RATIO','当前尺寸未满足锁定的宽高比例');}
  const match=this.match(task,{...item,parameters});let templateId=input.templateId??(match.status==='unique'?match.templateIds[0]:item.templateId);
  if(JSON.stringify(parameters)!==JSON.stringify(item.parameters)&&match.status!=='unique'&&(input.templateId===undefined||input.templateId===item.templateId))templateId=undefined;
  const template=catalog.templates.find(row=>row.id===templateId);
  if(templateId!==undefined&&(!template||template.status!=='active'||template.projectItemId!==item.projectItemId||template.productIds.length&&!template.productIds.includes(task.productId)||template.brandIds.length&&!template.brandIds.includes(this.workspace.product(task.productId).brandId)))taskFail('TEMPLATE_NOT_APPLICABLE','请选择适用于当前产品项目的启用模板');
  const mode=input.mode??item.mode;
  if(item.relativePath&&mode==='none')taskFail('ITEM_HAS_FILE','项目已有 PDF，不能通过无需生成跳过文件检查');
  this.store.updateItem(itemId,{mode,parameters,dimensionProfileId:profile?.id??input.dimensionProfileId,ratioLocked:input.ratioLocked??item.ratioLocked,templateId:template?.id,templateName:template?.name,reviewedSha256:undefined,state:mode==='none'?'none':mode==='manual'?(item.relativePath?'awaiting_review':'awaiting_upload'):'pending',error:undefined});this.store.setSnapshot(itemId,template);return this.getTask(taskId);
 }
 async generate(taskId:string,input:{itemIds?:number[];regenerate?:boolean}={}){
  this.mutable(taskId);if(this.operations.has(taskId))taskFail('TASK_BUSY','任务正在处理中');
  const operation=this.runGeneration(taskId,input);this.operations.set(taskId,operation);try{await operation;}finally{this.operations.delete(taskId);}return this.getTask(taskId);
 }
 async startGenerate(taskId:string,input:{itemIds?:number[];regenerate?:boolean}={}){
  this.mutable(taskId);if(this.operations.has(taskId))taskFail('TASK_BUSY','任务正在处理中');
  const run=this.generate(taskId,input);void run.catch(error=>{if(this.db.open)this.db.prepare('update packaging_tasks set error=? where id=?').run(errorText(error),taskId);});return this.store.task(taskId);
 }
 private async runGeneration(taskId:string,input:{itemIds?:number[];regenerate?:boolean}){
  const task=this.store.task(taskId),items=task.items.filter(item=>!input.itemIds||input.itemIds.includes(item.id));
  if(input.itemIds?.some(id=>!task.items.some(item=>item.id===id)))taskFail('TASK_ITEM_NOT_FOUND','部分项目不属于当前任务');
  for(const item of items){
   if(this.closed)break;
   if(item.mode!=='ait'||item.state==='generating')continue;if(item.relativePath&&!input.regenerate)continue;
   try{
    const drawing=this.drawing(item.drawing,task.productId),product=this.workspace.product(task.productId),snapshot=this.store.snapshot(item.id),catalog=this.options.catalog.getCatalog();
    if(!snapshot||!catalog.templates.some(template=>template.id===snapshot.id&&template.status==='active'))taskFail('TEMPLATE_REQUIRED','请先匹配并明确选择启用的 AIT 模板');
    const config=catalog.configs.find(config=>config.projectItemId===item.projectItemId);for(const definition of config?.parameters??[])if(definition.required&&(item.parameters[definition.key]===undefined||item.parameters[definition.key]===''))taskFail('DIMENSIONS_REQUIRED',`请补充${definition.label}`);
    const asset=this.options.catalog.templateAsset(snapshot!.id,snapshot),fileName=`${item.fullCode}-${packagingName(product.model)}-${packagingName(item.projectName)}-${randomUUID().slice(0,8)}.pdf`,relativePath=join(task.taskDirectory,fileName);
    this.store.updateItem(item.id,{state:'generating',error:undefined,reviewedSha256:undefined});
    const size=Object.entries(item.parameters).map(([key,value])=>`${config?.parameters.find(p=>p.key===key)?.label??key}:${value}${config?.parameters.find(p=>p.key===key)?.unit??''}`).join(' × ');
    const values:PackagingParameters={...item.parameters,BRAND:product.brandName,MODEL:product.model,DRAWING_NO:item.fullCode,COLOR:drawing.colorName,SIZE:size,PRODUCT_NAME:product.productCategory};
    const result=await this.options.automation.generate({templatePath:asset.absolutePath,outputPath:this.taskPath(taskId,relativePath),fields:snapshot!.fields,requiredFonts:snapshot!.requiredFonts,values});
    const fact=await pdfFact(this.taskPath(taskId,relativePath));if(!result.preserveEditability||fact.sha256!==result.sha256)taskFail('PDF_VERIFICATION_FAILED','Illustrator 返回结果与实际 PDF 不一致');
    this.store.updateItem(item.id,{state:'awaiting_review',relativePath,fileName,sha256:fact.sha256,reviewedSha256:undefined,error:undefined});this.store.own(taskId,{relativePath,sha256:fact.sha256});
   }catch(error){this.store.updateItem(item.id,{state:'failed',error:errorText(error)});}
  }
 }
 async discover(taskId:string){
  this.mutable(taskId);if(this.operations.has(taskId))return this.store.task(taskId);
  const work=this.runDiscovery(taskId);this.operations.set(taskId,work);try{return await work;}finally{this.operations.delete(taskId);}
 }
 private async runDiscovery(taskId:string){
  const task=this.mutable(taskId);if(this.operations.has(taskId))return this.store.task(taskId);
  await this.copyOriginalItems(taskId);
  const directories=[join(task.productDirectory,'00.临时文件'),task.taskDirectory],observed=new Set<string>();
  for(const directory of directories){
   for(const entry of readdirSync(this.taskPath(taskId,directory),{withFileTypes:true})){
    if(!entry.name.toLowerCase().endsWith('.pdf'))continue;const relativePath=join(directory,entry.name);observed.add(relativePath);
    if(this.store.items(taskId).some(item=>item.relativePath===relativePath))continue;
    let sha256='',reason='无法唯一识别图号及项目，请人工关联';
    try{sha256=(await stablePdfFact(this.taskPath(taskId,relativePath),this.options.stableDelayMs??300)).sha256;}catch(error){reason=errorText(error);}
    const previous=this.store.pending(taskId).find(file=>file.relativePath===relativePath);if(previous?.status==='linked'&&previous.sha256===sha256)continue;
    this.db.prepare(`insert into packaging_pending_files(task_id,file_name,relative_path,sha256,status,reason) values(?,?,?,?,'pending',?) on conflict(task_id,relative_path) do update set sha256=excluded.sha256,reason=excluded.reason,status='pending',item_id=null`).run(taskId,entry.name,relativePath,sha256,reason);
    if(!sha256)continue;
    const codes=[...new Set(entry.name.match(codePattern)??[])],product=this.workspace.product(task.productId);
    const candidates=codes.length?task.items.filter(item=>codes.length===1&&item.fullCode===codes[0]):task.items.filter(item=>namedProjectMatch(entry.name,product.model,item.projectName));
    const pending=this.store.pending(taskId).find(file=>file.relativePath===relativePath)!;
    if(candidates.length===1&&!candidates[0].relativePath&&candidates[0].mode!=='none'){
     try{await this.runLinkFile(taskId,pending.id,candidates[0].id);}catch(error){this.db.prepare('update packaging_pending_files set reason=? where id=?').run(errorText(error),pending.id);}
    }
   }
  }
  for(const pending of this.store.pending(taskId))if(pending.status==='pending'&&!observed.has(pending.relativePath)&&!existsSync(this.taskPath(taskId,pending.relativePath)))this.db.prepare('delete from packaging_pending_files where id=?').run(pending.id);
  return this.getTask(taskId);
 }
 async linkFile(taskId:string,fileId:number,itemId:number){
  this.mutable(taskId);if(this.operations.has(taskId))taskFail('TASK_BUSY','任务正在整理文件，请稍后重试');
  const work=this.runLinkFile(taskId,fileId,itemId);this.operations.set(taskId,work);try{return await work;}finally{this.operations.delete(taskId);}
 }
 private async runLinkFile(taskId:string,fileId:number,itemId:number){
  const task=this.mutable(taskId),item=this.store.item(taskId,itemId),file=this.store.pending(taskId).find(file=>file.id===fileId);
  if(!file||file.status!=='pending')taskFail('PENDING_FILE_NOT_FOUND','文件不存在或已关联处理');
  if(item.relativePath||item.mode==='none'||item.state==='generating')taskFail('ITEM_HAS_FILE','该项目已有文件或无需生成，不能重复关联');
  const source=this.taskPath(taskId,file!.relativePath),fact=await stablePdfFact(source,this.options.stableDelayMs??300);
  const codes=[...new Set(file!.fileName.match(codePattern)??[])];if(codes.length&&(codes.length!==1||codes[0]!==item.fullCode))taskFail('DRAWING_MISMATCH','文件名中的完整图号与所选项目不一致');
  const already=this.store.pending(taskId).some(other=>other.id!==fileId&&other.status==='linked'&&other.relativePath===file!.relativePath);if(already)taskFail('FILE_ALREADY_LINKED','同一文件不能重复关联');
  const inside=file!.relativePath.replaceAll('\\','/').startsWith(`${task.taskDirectory.replaceAll('\\','/')}/`),relativePath=inside?file!.relativePath:join(task.taskDirectory,`${item.fullCode}-${packagingName(item.projectName)}-${randomUUID().slice(0,8)}.pdf`);
  if(!inside){await copyPdfExclusive(source,this.taskPath(taskId,relativePath),fact.sha256);if((await pdfFact(source)).sha256!==fact.sha256)taskFail('FILE_CHANGED','人工 PDF 正在变化，暂不整理原文件');}
  this.db.transaction(()=>{if(this.store.item(taskId,itemId).relativePath)taskFail('ITEM_HAS_FILE','项目已关联其他文件');this.store.updateItem(itemId,{relativePath,fileName:basename(relativePath),sha256:fact.sha256,reviewedSha256:undefined,mode:'manual',state:'awaiting_review',error:undefined});this.db.prepare("update packaging_pending_files set status='linked',item_id=? where id=? and status='pending'").run(itemId,fileId);this.store.own(taskId,{relativePath,sha256:fact.sha256});})();
  if(!inside&&(await pdfFact(source)).sha256===fact.sha256)unlinkSync(source);
  return this.getTask(taskId);
 }
 async reviewItem(taskId:string,itemId:number,sha256:string){
  if(this.operations.has(taskId))taskFail('TASK_BUSY','任务正在处理文件，请完成后再检查');
  this.mutable(taskId);const work=this.runReview(taskId,itemId,sha256);this.operations.set(taskId,work);try{return await work;}finally{this.operations.delete(taskId);}
 }
 private async runReview(taskId:string,itemId:number,sha256:string){
  this.mutable(taskId);const item=this.store.item(taskId,itemId);this.drawing(item.drawing,this.store.task(taskId).productId);
  if(!item.relativePath||!['awaiting_review','generated','completed'].includes(item.state))taskFail('FILE_REQUIRED','项目尚无可检查的 PDF；参数调整后请先另存重新生成');const fact=await pdfFact(this.taskPath(taskId,item.relativePath!));
  if(fact.sha256!==sha256)taskFail('FILE_CHANGED','文件已变化，请重新核对后确认');this.store.updateItem(itemId,{sha256:fact.sha256,reviewedSha256:fact.sha256,state:'completed',error:undefined});this.store.own(taskId,{relativePath:item.relativePath,sha256:fact.sha256});return this.getTask(taskId);
 }
 async filePath(taskId:string,itemId:number){if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');this.assertWorkspace(taskId);const task=this.store.task(taskId),item=this.store.item(taskId,itemId);let relativePath=item.relativePath;if(task.state==='completed'){const row=this.db.prepare('select destination_relative_path as path from packaging_archive_journal where task_id=? and item_id=?').get(taskId,itemId) as {path:string}|undefined;relativePath=row?.path;}if(!relativePath)taskFail('FILE_REQUIRED','项目尚无 PDF');const path=this.taskPath(taskId,relativePath!);await pdfFact(path);return path;}
 async backupPath(taskId:string,itemId:number){if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');const item=this.store.item(taskId,itemId);if(!item.backupRelativePath||!item.originalSha256)taskFail('BACKUP_NOT_FOUND','此项目没有正式原件备份');const path=resolveWorkspacePath(this.options.dataDir,item.backupRelativePath);if((await pdfFact(path)).sha256!==item.originalSha256)taskFail('BACKUP_CHANGED','原件备份内容已变化，不能作为已核实备份打开');return path;}
 async openItem(taskId:string,itemId:number){if(!this.options.automation.openPdf)taskFail('ILLUSTRATOR_UNAVAILABLE','当前环境不能打开 Illustrator');await this.options.automation.openPdf!(await this.filePath(taskId,itemId));return{ok:true};}
 archivePreview(taskId:string){return previewPackagingArchive(this,taskId);}
 async archive(taskId:string,confirmed:boolean){if(this.closed)taskFail('SERVICE_CLOSING','服务正在关闭');this.assertWorkspace(taskId);if(!confirmed)taskFail('CONFIRMATION_REQUIRED','请确认本次整批归档');if(this.operations.has(taskId))taskFail('TASK_BUSY','任务正在处理中');const work=archivePackagingTask(this,taskId);this.operations.set(taskId,work);try{return await work;}finally{this.operations.delete(taskId);}}
}
