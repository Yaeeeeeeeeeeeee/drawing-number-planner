import type { AitSelections } from '../../core/packaging/ait-selections.js';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PackagingCatalogError, type PackagingCatalogService } from '../../core/packaging/packaging-catalog.js';
import type { DimensionProfileInput, PackagingProjectConfig, PackagingTemplateInput, TemplateRuleInput, TemplateRangeInput } from '../../core/packaging/packaging-types.js';
const idSchema=z.number().int().positive();
function idFromParams(request:FastifyRequest):number{const result=z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);if(!result.success)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','无效包材编号');return result.data.id;}
function optionalId(body:unknown):number|undefined{const id=(body as {id?:unknown}|null)?.id;if(id===undefined)return;const result=idSchema.safeParse(id);if(!result.success)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','无效包材编号');return result.data;}
export function registerPackagingCatalogRoutes(app:FastifyInstance,service:PackagingCatalogService,selections?:AitSelections):void{
  const errorResponse=(error:unknown,reply:FastifyReply)=>{if(error instanceof PackagingCatalogError)return reply.code(error.code==='PACKAGING_TEMPLATE_NOT_FOUND'?404:400).send({error:{code:error.code,message:error.message}});throw error;};
  app.get('/api/packaging/catalog',async()=>service.getCatalog());
  app.get('/api/packaging/templates/:id/status',async(request,reply)=>{try{service.templateAsset(idFromParams(request));return {available:true};}catch(error){if(error instanceof PackagingCatalogError&&error.code!=='PACKAGING_TEMPLATE_NOT_FOUND')return {available:false,message:error.message};return errorResponse(error,reply);}});
  app.post('/api/packaging/template-reference',async(request,reply)=>{try{const body=request.body as {metadata:PackagingTemplateInput;token:unknown;id?:unknown;range?:TemplateRangeInput};if(!selections)throw new PackagingCatalogError('INVALID_PACKAGING_INPUT','请在桌面版选择 AIT 文件');const id=optionalId(body);return reply.code(id===undefined?201:200).send(service.saveTemplateReferenceWithRule(body.metadata,selections.resolve(body.token),id,body.range));}catch(error){return errorResponse(error,reply);}});
  app.put('/api/packaging/templates/:id',async(request,reply)=>{try{const body=request.body as PackagingTemplateInput|{metadata:PackagingTemplateInput;range?:TemplateRangeInput};return 'metadata' in body?service.saveTemplateWithRule(idFromParams(request),body.metadata,body.range):service.saveTemplate(idFromParams(request),body);}catch(error){return errorResponse(error,reply);}});
  app.post('/api/packaging/dimensions',async(request,reply)=>{try{return service.saveDimension(request.body as DimensionProfileInput,optionalId(request.body));}catch(error){return errorResponse(error,reply);}});
  app.post('/api/packaging/rules',async(request,reply)=>{try{return service.saveRule(request.body as TemplateRuleInput,optionalId(request.body));}catch(error){return errorResponse(error,reply);}});
  app.post('/api/packaging/configs',async(request,reply)=>{try{return service.saveConfig(request.body as PackagingProjectConfig);}catch(error){return errorResponse(error,reply);}});
}
