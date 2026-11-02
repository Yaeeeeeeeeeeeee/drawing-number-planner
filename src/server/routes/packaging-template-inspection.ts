import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { IllustratorAutomationError, type IllustratorAutomation } from '../../core/packaging/illustrator-automation.js';
import { packagingTemplateSchema } from '../../core/packaging/packaging-catalog.js';
import { ensureMultipart } from '../multipart.js';

const metadataSchema=packagingTemplateSchema.pick({fields:true,requiredFonts:true}).partial();
function invalid(message:string):never {throw new IllustratorAutomationError('INVALID_PACKAGING_INPUT',message);}
function json(value:unknown):unknown {try{return JSON.parse(String(value));}catch{invalid('模板元数据必须是有效 JSON');}}
const hash=(value:Buffer)=>createHash('sha256').update(value).digest('hex');

/** Inspect a selected file without creating or changing template/task records. */
export function registerPackagingTemplateInspectionRoutes(app:FastifyInstance,automation:IllustratorAutomation,options:{dataDir:string}):void {
 ensureMultipart(app);
 app.post('/api/packaging/inspect-template-file',async(request,reply)=>{
  let scratchDirectory:string|undefined,templatePath:string|undefined,uploadedHash:string|undefined,retain=false;
  try{
   if(!request.isMultipart())invalid('请选择 AIT 模板文件');
   let file:{fileName:string;buffer:Buffer}|undefined,metadata:unknown={},fields:unknown,requiredFonts:unknown;
   for await(const part of request.parts()){
    if(part.type==='file'){
     if(file||part.fieldname!=='file')invalid('请选择一个 AIT 模板文件');
     file={fileName:part.filename,buffer:await part.toBuffer()};
    }else if(part.fieldname==='metadata')metadata=json(part.value);
    else if(part.fieldname==='fields')fields=json(part.value);
    else if(part.fieldname==='requiredFonts')requiredFonts=json(part.value);
   }
   if(!file||!/\.ait$/iu.test(file.fileName)||!file.buffer.length||file.buffer.length>20*1024*1024)invalid('请选择不超过 20 MB 的非空 AIT 模板文件');
   const parsed=metadataSchema.safeParse(metadata);
   if(!parsed.success)invalid('模板字段及字体设置无效');
   const combined=metadataSchema.safeParse({...parsed.data,...(fields===undefined?{}:{fields}),...(requiredFonts===undefined?{}:{requiredFonts})});
   if(!combined.success)invalid('模板字段及字体设置无效');
   const root=join(options.dataDir,'packaging-template-inspections');mkdirSync(root,{recursive:true});
   scratchDirectory=mkdtempSync(join(root,'inspect-'));templatePath=join(scratchDirectory,'selected.ait');uploadedHash=hash(file.buffer);
   writeFileSync(templatePath,file.buffer,{flag:'wx'});
   retain=true;
   const inspection=await automation.inspect({templatePath,fields:combined.data.fields??[],requiredFonts:combined.data.requiredFonts??[]});
   retain=false;
   return inspection;
  }catch(error){
   if(error instanceof IllustratorAutomationError){
    retain=error.code==='ILLUSTRATOR_TIMEOUT'||error.code==='AUTOMATION_UNSETTLED';
    const status=error.code==='INVALID_PACKAGING_INPUT'?400:/UNAVAILABLE|TIMEOUT|UNSETTLED/u.test(error.code)?503:/EXISTS|CHANGED|CONFLICT/u.test(error.code)?409:422;
    return reply.code(status).send({error:{code:error.code,message:error.message,details:error.details}});
   }
   throw error;
  }finally{
   if(!retain&&scratchDirectory&&templatePath&&uploadedHash){
    try{if(hash(readFileSync(templatePath))===uploadedHash){unlinkSync(templatePath);rmdirSync(scratchDirectory);}}catch{/* Retain changed or unreadable evidence; never clean unrelated files. */}
   }
  }
 });
}
