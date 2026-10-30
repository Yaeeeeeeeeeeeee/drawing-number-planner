import {createReadStream,existsSync} from 'node:fs';
import {join} from 'node:path';
import type {FastifyInstance,FastifyReply} from 'fastify';
import {z} from 'zod';
import type {PackagingTaskService} from '../../core/packaging/packaging-task-service.js';
import type {WindowsIllustratorAutomation} from '../../core/packaging/illustrator-automation.js';

const numberId=z.number().int().positive(),params=z.object({id:z.string().uuid(),itemId:z.coerce.number().int().positive().optional(),fileId:z.coerce.number().int().positive().optional()});
const drawing=z.object({origin:z.enum(['planned','historical']),id:numberId,sourcePdfFileId:numberId.optional()}).strict();
const create=z.object({productId:numberId,name:z.string().trim().min(1).max(150),type:z.enum(['new','modify']),productDirectory:z.string().max(2000).optional(),drawings:z.array(drawing).min(1).max(100)}).strict();
const item=z.object({templateId:numberId.optional(),dimensionProfileId:numberId.optional(),mode:z.enum(['ait','manual','none']).optional(),ratioLocked:z.boolean().optional(),parameters:z.record(z.string().min(1).max(100).refine(key=>!['__proto__','prototype','constructor'].includes(key)),z.union([z.string().max(1000),z.number().finite()])).optional()}).strict();
function parsed<T>(schema:z.ZodType<T>,value:unknown):T{const result=schema.safeParse(value);if(!result.success)throw Object.assign(new Error('制图请求参数无效，请核对所选记录和输入内容'),{code:'INVALID_PACKAGING_REQUEST'});return result.data;}
export function registerPackagingTaskRoutes(app:FastifyInstance,service:PackagingTaskService,automation:WindowsIllustratorAutomation){
 const failure=(reply:FastifyReply,error:unknown)=>{const value=error as {code?:string;message?:string;details?:unknown};if(!value.code)throw error;const status=/NOT_FOUND/u.test(value.code)?404:/UNAVAILABLE|TIMEOUT|UNSETTLED/u.test(value.code)?503:/BUSY|EXISTS|CHANGED|CONFLICT|IN_PROGRESS/u.test(value.code)?409:422;return reply.code(status).send({error:{code:value.code,message:value.message??'制图操作未完成',details:value.details}});};
 const execute=(work:(request:any,reply:FastifyReply)=>unknown)=>async(request:any,reply:FastifyReply)=>{try{return await work(request,reply);}catch(error){return failure(reply,error);}};
 const status=()=>{const blocked=existsSync(join(service.options.dataDir,'illustrator-operations','active-operation.json'));return{platform:process.platform,available:process.platform==='win32'&&!blocked,blocked,message:blocked?'上次 Illustrator 操作尚未核实结束，请执行中断核对':process.platform==='win32'?'将在本机调用 Illustrator；真实模板和字体需在本机检查':'Illustrator 自动制图仅支持已安装 Illustrator 的 Windows 本机；模板和人工文件任务仍可管理'};};
 app.get('/api/packaging/automation',async()=>status());
 app.post('/api/packaging/automation/reconcile',execute(async()=>{await automation.reconcile({abandonIfIllustratorClosed:true});return status();}));
 app.post('/api/packaging/templates/:templateId/inspect',execute(async request=>{const id=parsed(z.coerce.number().int().positive(),request.params.templateId),asset=service.options.catalog.templateAsset(id);return automation.inspect({templatePath:asset.absolutePath,fields:asset.template.fields,requiredFonts:asset.template.requiredFonts});}));
 app.get('/api/packaging/product-directories',execute(request=>{const {productId}=parsed(z.object({productId:z.coerce.number().int().positive()}).strict(),request.query);return{items:service.workspace.productDirectories(productId)};}));
 app.post('/api/packaging/create-temporary-directories',execute(request=>{const{productIds}=parsed(z.object({productIds:z.array(numberId).min(1).max(1000)}).strict(),request.body);return service.workspace.createTemporaryDirectories(productIds);}));
 app.post('/api/packaging/scan-product',execute(async request=>{const{productId}=parsed(z.object({productId:numberId}).strict(),request.body);const directories=service.workspace.productDirectories(productId).map(directory=>service.workspace.resolveProductDirectory(productId,directory.relativePath).relativePath);return service.options.files.scanProducts(directories);}));
 app.get('/api/packaging/tasks',execute(request=>{const {productId}=parsed(z.object({productId:z.coerce.number().int().positive().optional()}).strict(),request.query);return{items:service.listTasks(productId)};}));
 app.post('/api/packaging/tasks',execute((request,reply)=>service.createTask(parsed(create,request.body)).then(task=>reply.code(201).send(task))));
 app.get('/api/packaging/tasks/:id',execute(request=>service.getTask(parsed(params,request.params).id)));
 app.put('/api/packaging/tasks/:id/items/:itemId',execute(request=>{const{id,itemId}=parsed(params,request.params);return service.configureItem(id,itemId!,parsed(item,request.body));}));
 app.post('/api/packaging/tasks/:id/generate',execute(request=>service.startGenerate(parsed(params,request.params).id,parsed(z.object({itemIds:z.array(numberId).min(1).max(100).optional(),regenerate:z.boolean().optional()}).strict(),request.body??{}))));
 app.post('/api/packaging/tasks/:id/discover',execute(request=>service.discover(parsed(params,request.params).id)));
 app.post('/api/packaging/tasks/:id/files/:fileId/link',execute(request=>{const{id,fileId}=parsed(params,request.params);return service.linkFile(id,fileId!,parsed(z.object({itemId:numberId}).strict(),request.body).itemId);}));
 app.post('/api/packaging/tasks/:id/items/:itemId/review',execute(request=>{const{id,itemId}=parsed(params,request.params);return service.reviewItem(id,itemId!,parsed(z.object({sha256:z.string().regex(/^[a-f0-9]{64}$/u)}).strict(),request.body).sha256);}));
 app.post('/api/packaging/tasks/:id/items/:itemId/open',execute(request=>{const{id,itemId}=parsed(params,request.params);return service.openItem(id,itemId!);}));
 app.get('/api/packaging/tasks/:id/items/:itemId/file',execute(async(request,reply)=>{const{id,itemId}=parsed(params,request.params),path=await service.filePath(id,itemId!);return reply.type('application/pdf').header('Content-Disposition','inline').send(createReadStream(path));}));
 app.get('/api/packaging/tasks/:id/items/:itemId/backup',execute(async(request,reply)=>{const{id,itemId}=parsed(params,request.params),path=await service.backupPath(id,itemId!);return reply.type('application/pdf').header('Content-Disposition','inline').send(createReadStream(path));}));
 app.get('/api/packaging/tasks/:id/archive-preview',execute(request=>service.archivePreview(parsed(params,request.params).id)));
 app.post('/api/packaging/tasks/:id/archive',execute(request=>service.archive(parsed(params,request.params).id,parsed(z.object({confirmed:z.literal(true)}).strict(),request.body).confirmed)));
}
