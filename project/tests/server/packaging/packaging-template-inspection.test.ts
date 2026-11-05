// @vitest-environment node
// Native Illustrator is unavailable here; only the automation boundary is substituted.
import Fastify from 'fastify';
import { existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { setup } from '../../core/packaging/catalog-fixture';
import { IllustratorAutomationError, type IllustratorAutomation } from '../../../src/core/packaging/illustrator-automation';
import { registerPackagingTemplateInspectionRoutes } from '../../../src/server/routes/packaging-template-inspection';

const result={fields:[],textObjects:[{objectName:'图号',matches:1,editable:true}],fonts:['ArialMT'],issues:[],fontValidation:'declared-and-observed-only' as const};
const fields=[{objectName:'图号',sourceKey:'DRAWING_NO',required:true}];
function form(fileName='selected.ait',metadata?:unknown,content='selected AIT bytes'){
 const body=new FormData();body.append('file',new Blob([content]),fileName);if(metadata!==undefined)body.append('metadata',typeof metadata==='string'?metadata:JSON.stringify(metadata));return body;
}
it('inspects a selected upload over real HTTP without saving catalog/task rows, moving originals or retaining a settled upload',async()=>{
 const f=setup(),app=Fastify();const original=join(f.dir,'original.ait');writeFileSync(original,'selected AIT bytes');let inspected='';
 const automation:IllustratorAutomation={inspect:async input=>{inspected=input.templatePath;expect(readFileSync(inspected,'utf8')).toBe(readFileSync(original,'utf8'));expect(input.fields).toEqual(fields);expect(input.requiredFonts).toEqual(['ArialMT']);return result;},generate:async()=>{throw new Error('must not generate');}};
 try{
  const before=f.db.serialize();registerPackagingTemplateInspectionRoutes(app,automation,{dataDir:f.dir});await app.listen({host:'127.0.0.1',port:0});
  const response=await fetch(`${app.listeningOrigin}/api/packaging/inspect-template-file`,{method:'POST',body:form('../selected.ait',{fields,requiredFonts:['ArialMT']})});
  expect(response.status).toBe(200);expect(await response.json()).toEqual(result);expect(inspected.startsWith(join(f.dir,'packaging-template-inspections'))).toBe(true);expect(existsSync(inspected)).toBe(false);expect(readFileSync(original,'utf8')).toBe('selected AIT bytes');expect(f.db.serialize()).toEqual(before);expect(f.service.getCatalog().templates).toEqual([]);
 }finally{await app.close();f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});
it('validates uploads and optional metadata and cleans only its own settled scratch files on native errors',async()=>{
 const f=setup(),app=Fastify();let called=0,scratch='';const original=join(f.dir,'original.ait');writeFileSync(original,'KEEP');
 const automation:IllustratorAutomation={inspect:async input=>{called++;scratch=input.templatePath;expect(input.fields).toEqual([]);expect(input.requiredFonts).toEqual([]);throw new IllustratorAutomationError('ILLUSTRATOR_UNAVAILABLE','No Illustrator');},generate:async()=>{throw new Error('must not generate');}};
 try{
  registerPackagingTemplateInspectionRoutes(app,automation,{dataDir:f.dir});await app.listen({host:'127.0.0.1',port:0});const url=`${app.listeningOrigin}/api/packaging/inspect-template-file`;
  for(const body of [form('bad.pdf'),form('empty.ait',undefined,''),form('selected.ait','bad JSON'),form('selected.ait',{fields:[{objectName:'x',sourceKey:'DRAWING_NO',required:'yes'}]})])expect((await fetch(url,{method:'POST',body})).status).toBe(400);
  expect(called).toBe(0);const failed=await fetch(url,{method:'POST',body:form()});expect(failed.status).toBe(503);expect((await failed.json()).error.code).toBe('ILLUSTRATOR_UNAVAILABLE');expect(existsSync(scratch)).toBe(false);expect(readdirSync(join(f.dir,'packaging-template-inspections'))).toEqual([]);expect(readFileSync(original,'utf8')).toBe('KEEP');
 }finally{await app.close();f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});
it('retains only its own upload while an Illustrator operation is unsettled',async()=>{
 const f=setup(),app=Fastify();let scratch='';const automation:IllustratorAutomation={inspect:async input=>{scratch=input.templatePath;throw new IllustratorAutomationError('ILLUSTRATOR_TIMEOUT','still running');},generate:async()=>{throw new Error('must not generate');}};
 try{registerPackagingTemplateInspectionRoutes(app,automation,{dataDir:f.dir});await app.listen({host:'127.0.0.1',port:0});const response=await fetch(`${app.listeningOrigin}/api/packaging/inspect-template-file`,{method:'POST',body:form()});expect(response.status).toBe(503);expect(readFileSync(scratch,'utf8')).toBe('selected AIT bytes');}
 finally{await app.close();f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});
it('preserves operation input after an unknown failure whose settlement cannot be established',async()=>{
 const f=setup(),app=Fastify();let scratch='';const automation:IllustratorAutomation={inspect:async input=>{scratch=input.templatePath;throw new Error('unconfirmed native operation');},generate:async()=>{throw new Error('must not generate');}};
 try{registerPackagingTemplateInspectionRoutes(app,automation,{dataDir:f.dir});await app.listen({host:'127.0.0.1',port:0});const response=await fetch(`${app.listeningOrigin}/api/packaging/inspect-template-file`,{method:'POST',body:form()});expect(response.status).toBe(500);expect(readFileSync(scratch,'utf8')).toBe('selected AIT bytes');}
 finally{await app.close();f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});
it('accepts separate field/font metadata and keeps the shared 20 MB upload limit',async()=>{
 const f=setup(),app=Fastify();let called=0;const automation:IllustratorAutomation={inspect:async input=>{called++;expect(input.fields).toEqual(fields);expect(input.requiredFonts).toEqual(['ArialMT']);return result;},generate:async()=>{throw new Error('must not generate');}};
 try{registerPackagingTemplateInspectionRoutes(app,automation,{dataDir:f.dir});await app.listen({host:'127.0.0.1',port:0});const url=`${app.listeningOrigin}/api/packaging/inspect-template-file`;const body=form();body.append('fields',JSON.stringify(fields));body.append('requiredFonts',JSON.stringify(['ArialMT']));expect((await fetch(url,{method:'POST',body})).status).toBe(200);const tooLarge=await fetch(url,{method:'POST',body:form('large.ait',undefined,'a'.repeat(20*1024*1024+1))});expect(tooLarge.status).toBe(413);expect(called).toBe(1);expect(readdirSync(join(f.dir,'packaging-template-inspections'))).toEqual([]);}
 finally{await app.close();f.db.close();rmSync(f.dir,{recursive:true,force:true});}
});
