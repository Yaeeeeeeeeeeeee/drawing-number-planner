import { IllustratorAutomationError, type IllustratorAutomation } from '../../core/packaging/illustrator-automation.js';
import { PackagingCatalogError, packagingTemplateSchema } from '../../core/packaging/packaging-catalog.js';
import type { AitSelections } from '../../core/packaging/ait-selections.js';
import type { FastifyInstance } from 'fastify';
const metadataSchema=packagingTemplateSchema.pick({fields:true,requiredFonts:true}).partial();
function invalid(message:string):never {throw new IllustratorAutomationError('INVALID_PACKAGING_INPUT',message);}
export function registerPackagingTemplateInspectionRoutes(app:FastifyInstance,automation:IllustratorAutomation,options:{dataDir:string;selections?:AitSelections}):void {
 app.post('/api/packaging/inspect-template-reference',async(request,reply)=>{
  try{const body=request.body as {token:unknown;fields?:unknown;requiredFonts?:unknown};const parsed=metadataSchema.safeParse({fields:body.fields,requiredFonts:body.requiredFonts});if(!parsed.success||!options.selections)invalid('模板字段及字体设置无效');const selected=options.selections.resolveFact(body.token);return await automation.inspect({templatePath:selected.path,expectedTemplateSha256:selected.sha256,fields:parsed.data.fields??[],requiredFonts:parsed.data.requiredFonts??[]});}
  catch(error){if(error instanceof PackagingCatalogError)return reply.code(400).send({error:{code:error.code,message:error.message}});if(error instanceof IllustratorAutomationError){const status=error.code==='INVALID_PACKAGING_INPUT'?400:/UNAVAILABLE|TIMEOUT|UNSETTLED/u.test(error.code)?503:/EXISTS|CHANGED|CONFLICT/u.test(error.code)?409:422;return reply.code(status).send({error:{code:error.code,message:error.message,details:error.details}});}throw error;}
 });
}
