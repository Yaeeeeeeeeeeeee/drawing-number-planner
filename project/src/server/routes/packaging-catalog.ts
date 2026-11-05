import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PackagingCatalogError, type PackagingCatalogService } from '../../core/packaging/packaging-catalog.js';
import type { DimensionProfileInput, PackagingProjectConfig, PackagingTemplateInput, TemplateRuleInput } from '../../core/packaging/packaging-types.js';
import { ensureMultipart } from '../multipart.js';
const idSchema=z.number().int().positive();
function idFromParams(request:FastifyRequest):number{const result=z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);if(!result.success)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','无效包材编号');return result.data.id;}
function optionalId(body:unknown):number|undefined{const id=(body as {id?:unknown}|null)?.id;if(id===undefined)return;const result=idSchema.safeParse(id);if(!result.success)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','无效包材编号');return result.data;}
async function upload(request:FastifyRequest):Promise<{metadata?:unknown;file:{fileName:string;buffer:Buffer}}>{
  if(!request.isMultipart())throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','请选择 AIT 模板文件');
  let metadata:unknown,file:{fileName:string;buffer:Buffer}|undefined;
  for await(const part of request.parts()){
    if(part.type==='file'){if(file||part.fieldname!=='file')throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','请选择一个 AIT 模板文件');file={fileName:part.filename,buffer:await part.toBuffer()};}
    else if(part.fieldname==='metadata'){try{metadata=JSON.parse(String(part.value));}catch{throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','模板元数据必须是有效 JSON');}}
  }
  if(!file)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','请选择 AIT 模板文件');return{metadata,file};
}
export function registerPackagingCatalogRoutes(app:FastifyInstance,service:PackagingCatalogService):void{
  ensureMultipart(app);
  const errorResponse=(error:unknown,reply:FastifyReply)=>{if(error instanceof PackagingCatalogError)return reply.code(error.code==='PACKAGING_TEMPLATE_NOT_FOUND'?404:400).send({error:{code:error.code,message:error.message}});throw error;};
  app.get('/api/packaging/catalog',async()=>service.getCatalog());
  app.post('/api/packaging/templates',async(request,reply)=>{try{const data=await upload(request);return reply.code(201).send(service.uploadTemplate(data.metadata as PackagingTemplateInput,data.file));}catch(error){return errorResponse(error,reply);}});
  app.put('/api/packaging/templates/:id',async(request,reply)=>{try{return service.saveTemplate(idFromParams(request),request.body as PackagingTemplateInput);}catch(error){return errorResponse(error,reply);}});
  app.post('/api/packaging/templates/:id/file',async(request,reply)=>{try{const id=idFromParams(request),data=await upload(request);const existing=service.getCatalog().templates.find(t=>t.id===id);if(!existing)throw new PackagingCatalogError('PACKAGING_TEMPLATE_NOT_FOUND','包材模板不存在');return service.uploadTemplate((data.metadata??existing) as PackagingTemplateInput,data.file,id);}catch(error){return errorResponse(error,reply);}});
  app.post('/api/packaging/dimensions',async(request,reply)=>{try{return service.saveDimension(request.body as DimensionProfileInput,optionalId(request.body));}catch(error){return errorResponse(error,reply);}});
  app.post('/api/packaging/rules',async(request,reply)=>{try{return service.saveRule(request.body as TemplateRuleInput,optionalId(request.body));}catch(error){return errorResponse(error,reply);}});
  app.post('/api/packaging/configs',async(request,reply)=>{try{return service.saveConfig(request.body as PackagingProjectConfig);}catch(error){return errorResponse(error,reply);}});
}
