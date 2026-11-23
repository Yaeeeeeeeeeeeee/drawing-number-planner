// @vitest-environment node
// Adapter/ExtendScript contracts only. These tests do not run licensed Illustrator.
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { WindowsIllustratorAutomation, type IllustratorRunner } from '../../src/core/packaging/illustrator-automation.js';
import { buildIllustratorJsx } from '../../src/core/packaging/illustrator-jsx.js';

const roots: string[] = [];
const setup = () => { const root=mkdtempSync(join(tmpdir(),'illustrator-contract-')); roots.push(root); const templatePath=join(root,'source.ait'); writeFileSync(templatePath,'ORIGINAL TEMPLATE'); return {root,templatePath,outputPath:join(root,'editable.pdf')}; };
afterEach(()=>{for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
const fields=[{objectName:'DRAWING_NO',sourceKey:'DRAWING_NO',required:true}];
const inspection={drawingNumber:{originalText:'12.3456.789.1234567',matches:1,replaced:1},fields:[{objectName:'DRAWING_NO',sourceKey:'DRAWING_NO',required:true,matches:1,editable:true}],fonts:['ArialMT'],issues:[],fontValidation:'declared-and-observed-only' as const};
const runner:IllustratorRunner=async job=>{expect(job.templatePath).toBe(job.sourceTemplatePath);expect(readFileSync(job.templatePath!,'utf8')).toBe('ORIGINAL TEMPLATE');if(job.outputPath)writeFileSync(job.outputPath,'%PDF-1.7\ncontract fixture');writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:true,inspection}));};

describe('Windows Illustrator adapter contract (no licensed AI)',()=>{
 it('allows automatic detection without a saved object mapping after full replacement proof',async()=>{
  const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner});
  await expect(ai.generate({...x,fields:[],values:{DRAWING_NO:'98.7654.321.7654321'}})).resolves.toMatchObject({preserveEditability:true});
 });
 it('rejects successful evidence without proof that every original full code was replaced',async()=>{
  const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{
   await runner(job);const {drawingNumber,...unproven}=inspection;writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:true,inspection:unproven}));
  }});
  await expect(ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'DRAWING_NUMBER_FIELD_REQUIRED'});expect(existsSync(x.outputPath)).toBe(false);
 });
 it('rejects incomplete multi-object replacement evidence without publishing',async()=>{
  const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{
   await runner(job);writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:true,inspection:{...inspection,drawingNumber:{originalText:'12.3456.789.1234567',matches:2,replaced:1}}}));
  }});
  await expect(ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'DRAWING_NUMBER_FIELD_REQUIRED'});expect(existsSync(x.outputPath)).toBe(false);
 });

 it('opens original AIT and publishes an exclusive PDF after positive terminal evidence',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner});const result=await ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}});expect(result.preserveEditability).toBe(true);expect(result.sha256).toMatch(/^[a-f0-9]{64}$/);expect(readFileSync(x.templatePath,'utf8')).toBe('ORIGINAL TEMPLATE');expect(readFileSync(x.outputPath,'utf8')).toContain('%PDF');});
 it('cleans the candidate while retaining the original, PDF and small operation evidence',async()=>{const x=setup();let operation:Parameters<IllustratorRunner>[0]|undefined;const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{operation=job;await runner(job);}});await ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}});expect(existsSync(operation!.templatePath!)).toBe(true);expect(existsSync(operation!.outputPath!)).toBe(false);expect(existsSync(operation!.resultPath)).toBe(true);expect(readFileSync(x.templatePath,'utf8')).toBe('ORIGINAL TEMPLATE');expect(existsSync(x.outputPath)).toBe(true);});
 it('refuses an existing output and never invokes automation',async()=>{const x=setup();writeFileSync(x.outputPath,'MANUALLY EDITED');let called=false;const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async()=>{called=true;}});await expect(ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'OUTPUT_EXISTS'});expect(called).toBe(false);expect(readFileSync(x.outputPath,'utf8')).toBe('MANUALLY EDITED');});
 it('does not accept PDF existence without a successful matching terminal result',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{writeFileSync(job.outputPath!,'%PDF-1.7\npartial');}});await expect(ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'AUTOMATION_UNSETTLED'});expect(existsSync(x.outputPath)).toBe(false);});
 it('retains a timeout lock across adapter instances until terminal reconciliation',async()=>{const x=setup();let resolve!:()=>void;let job:any;const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',timeoutMs:10,runner:async value=>{job=value;await new Promise<void>(r=>{resolve=r;});}});await expect(ai.inspect({...x,fields})).rejects.toMatchObject({code:'ILLUSTRATOR_TIMEOUT'});const next=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner});await expect(next.inspect({...x,fields})).rejects.toMatchObject({code:'AUTOMATION_UNSETTLED'});writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:true,inspection}));resolve();await new Promise<void>(done=>setImmediate(done));await next.reconcile();await expect(next.inspect({...x,fields})).resolves.toMatchObject(inspection);});
 it('returns inspection issues for catalog preflight instead of discarding them',async()=>{const x=setup();const problem={...inspection,issues:[{code:'MISSING_FIELD',message:'missing DRAWING_NO',severity:'error' as const}]};const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:false,inspection:problem,error:{code:'TEMPLATE_VALIDATION_FAILED'}}));}});await expect(ai.inspect({...x,fields})).resolves.toMatchObject(problem);});
 it('rejects a queued generation when the original changes before its turn',async()=>{
  const first=setup(),second=setup();let release!:()=>void,started!:()=>void;const entered=new Promise<void>(resolve=>{started=resolve;});let calls=0;
  const ai=new WindowsIllustratorAutomation({operationRoot:join(first.root,'ops'),platform:'win32',runner:async job=>{calls++;if(calls===1){started();await new Promise<void>(resolve=>{release=resolve;});}if(job.outputPath)writeFileSync(job.outputPath,'%PDF-1.7\nfixture');writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:true,inspection}));}});
  const firstOperation=ai.inspect({...first,fields});await entered;
  const expectedTemplateSha256=createHash('sha256').update(readFileSync(second.templatePath)).digest('hex');
  const queued=ai.generate({...second,fields,values:{DRAWING_NO:'98.7654.321.7654321'},expectedTemplateSha256});
  writeFileSync(second.templatePath,'CHANGED WHILE QUEUED');release();await firstOperation;
  await expect(queued).rejects.toMatchObject({code:'TEMPLATE_CHANGED'});expect(calls).toBe(1);expect(existsSync(second.outputPath)).toBe(false);
 });
 it('serializes operations across different adapter instances',async()=>{const x=setup();let running=0,max=0;const busy:IllustratorRunner=async job=>{running++;max=Math.max(max,running);await new Promise<void>(r=>setTimeout(r,5));await runner(job);running--;};const a=new WindowsIllustratorAutomation({operationRoot:join(x.root,'a'),platform:'win32',runner:busy}),b=new WindowsIllustratorAutomation({operationRoot:join(x.root,'b'),platform:'win32',runner:busy});await Promise.all([a.inspect({...x,fields}),b.inspect({...x,fields})]);expect(max).toBe(1);});
 it('retains generated evidence and refuses publication if the original changed externally',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{await runner(job);writeFileSync(x.templatePath,'EXTERNAL CHANGE');}});await expect(ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'TEMPLATE_CHANGED'});expect(existsSync(x.outputPath)).toBe(false);});
 it('blocks malformed successful inspection evidence',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:true,inspection:{}}));}});await expect(ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'INVALID_ILLUSTRATOR_RESULT'});});
 it('does not overwrite a PDF created while Illustrator was running',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{await runner(job);writeFileSync(x.outputPath,'USER CREATED WHILE GENERATING');}});await expect(ai.generate({...x,fields,values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'OUTPUT_EXISTS'});expect(readFileSync(x.outputPath,'utf8')).toBe('USER CREATED WHILE GENERATING');});
 it('releases a definitively failed completed operation and exposes its driver error',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:false,error:{code:'ILLUSTRATOR_COM_FAILED',message:'未安装 Illustrator'}}));}});await expect(ai.inspect({...x,fields})).rejects.toMatchObject({code:'ILLUSTRATOR_COM_FAILED',message:'未安装 Illustrator'});const next=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner});await expect(next.inspect({...x,fields})).resolves.toMatchObject(inspection);});
 it('does not release a timeout merely because a result was written before the worker returned',async()=>{const x=setup();let release!:()=>void;let job:any;const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',timeoutMs:10,runner:async j=>{job=j;writeFileSync(j.resultPath,JSON.stringify({operationId:j.operationId,ok:true,inspection}));await new Promise<void>(r=>{release=r;});}});await expect(ai.inspect({...x,fields})).rejects.toMatchObject({code:'ILLUSTRATOR_TIMEOUT'});await expect(ai.reconcile()).rejects.toMatchObject({code:'AUTOMATION_UNSETTLED'});release();await new Promise<void>(r=>setImmediate(r));await ai.reconcile();expect(existsSync(job.resultPath)).toBe(true);});
 it('filters legacy nonnumber mappings even when directly generating through the adapter',async()=>{const x=setup();let sent:any;const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{sent=job;await runner(job);}});await ai.generate({...x,fields:[...fields,{objectName:'BRAND',sourceKey:'BRAND',required:true}],values:{DRAWING_NO:'98.7654.321.7654321',BRAND:'new brand'}});expect(sent.fields).toEqual(fields);});
 it('blocks missing number configuration before invoking the runner',async()=>{const x=setup();let called=false;const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async()=>{called=true;}});await expect(ai.generate({...x,fields:[{objectName:'BRAND',sourceKey:'BRAND',required:true}],values:{BRAND:'new'}})).rejects.toMatchObject({code:'DRAWING_NUMBER_FIELD_REQUIRED'});expect(called).toBe(false);});
 it('blocks a successful runner result with no actual editable number object',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'win32',runner:async job=>{writeFileSync(job.outputPath!,'%PDF-1.7\nshould not publish');writeFileSync(job.resultPath,JSON.stringify({operationId:job.operationId,ok:true,inspection:{...inspection,fields:[{...fields[0],required:false,matches:0,editable:false}]}}));}});await expect(ai.generate({...x,fields:[{...fields[0],required:false}],values:{DRAWING_NO:'98.7654.321.7654321'}})).rejects.toMatchObject({code:'DRAWING_NUMBER_FIELD_REQUIRED'});expect(existsSync(x.outputPath)).toBe(false);});
 it('rejects unavailable platforms honestly',async()=>{const x=setup();const ai=new WindowsIllustratorAutomation({operationRoot:join(x.root,'ops'),platform:'linux'});await expect(ai.inspect({...x,fields})).rejects.toMatchObject({code:'ILLUSTRATOR_UNAVAILABLE'});});
});

function executeJsx(overrides:Record<string,unknown>={}, input:Record<string,unknown>={}, textFonts?:unknown){
 const writes:Record<string,string>={};const saved:{options:any;path:string}[]=[];let closed=0;let opened=0;
 let content='12.3456.789.1234567';
 const characters=Array.from(content,(_,i)=>({get contents(){return content[i];},set contents(v:string){content=content.slice(0,i)+v+content.slice(i+1);},characterAttributes:{textFont:{name:'ArialMT'}}}));
 const frame:any={name:'DRAWING_NO',typename:'TextFrame',get contents(){return content;},set contents(v:string){content=v;},editable:true,locked:false,hidden:false,parent:{typename:'Layer',locked:false,visible:true},characters};
 const doc:any={textFrames:[frame],pageItems:[frame],placedItems:[],rasterItems:[],saveAs:(file:any,options:any)=>{saved.push({path:file.path,options});},close:()=>{closed++;}};
 const app:any={documents:[],textFonts:textFonts??{getByName:(name:string)=>{if(name!=='ArialMT')throw Error('missing');return{name};}},userInteractionLevel:'normal',open:()=>{opened++;return doc;}};
 Object.assign(doc,overrides);
 function File(this:any,path:string){this.path=path;this.exists=true;this.open=()=>true;this.write=(text:string)=>{writes[path]=text;};this.close=()=>true;}
 const payload:any={operationId:'op-1',mode:'generate',templatePath:'copy.ait',outputPath:'candidate.pdf',resultPath:'result.json',fields,values:{DRAWING_NO:'98.7654.321.7654321'},requiredFonts:['ArialMT'],...input};
 runInNewContext(buildIllustratorJsx(payload),{app,File,PDFSaveOptions:function(){},SaveOptions:{DONOTSAVECHANGES:'discard'},UserInteractionLevel:{DONTDISPLAYALERTS:'quiet'}});
 return{result:JSON.parse(writes['result.json']),frame,saved,closed,opened,app};
}
describe('generated JSX against a VM Illustrator DOM contract (no real AI)',()=>{
 it('detects and replaces the entire full drawing number and exports an editable PDF option',()=>{const x=executeJsx();expect(x.result.ok).toBe(true);expect(x.frame.contents).toBe('98.7654.321.7654321');expect(x.result.inspection.drawingNumber).toMatchObject({originalText:'12.3456.789.1234567',matches:1,replaced:1});expect(x.saved[0].options.preserveEditability).toBe(true);expect(x.saved[0].path).toBe('candidate.pdf');expect(x.closed).toBe(1);expect(x.app.userInteractionLevel).toBe('normal');});
 it('inspects without a configured mapping or changing the document',()=>{const x=executeJsx({}, {mode:'inspect',fields:[]});expect(x.result.ok).toBe(true);expect(x.saved).toEqual([]);expect(x.frame.contents).toBe('12.3456.789.1234567');expect(x.result.inspection.drawingNumber).toMatchObject({originalText:'12.3456.789.1234567',matches:1});expect(x.result.inspection.textObjects).toEqual(expect.arrayContaining([expect.objectContaining({objectName:'DRAWING_NO',sourceText:'12.3456.789.1234567'})]));});
 it('blocks missing linked resources',()=>{const x=executeJsx({placedItems:[{file:{exists:false,fsName:'missing.png'}}]});expect(x.result.ok).toBe(false);expect(x.result.inspection.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'MISSING_RESOURCE'})]));expect(x.saved).toHaveLength(0);});
 it('checks declared fonts before opening',()=>{const x=executeJsx({}, {requiredFonts:['UnavailableFont']});expect(x.opened).toBe(0);expect(x.result.ok).toBe(false);expect(x.result.inspection.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'MISSING_FONT'})]));});
 it.each([' ',{bad:'value'},undefined])('rejects invalid drawing numbers',value=>{const x=executeJsx({}, {values:{DRAWING_NO:value}});expect(x.result.ok).toBe(false);expect(x.saved).toHaveLength(0);});
 it('preserves quotes, backslashes and line breaks in error evidence',()=>{const x=executeJsx({saveAs:()=>{throw Error('quote " slash \\ and line\nnext');}});expect(x.result.ok).toBe(false);expect(x.result.error.message).toContain('quote " slash \\ and line\nnext');});
 it('reports the original-font substitution limit explicitly',()=>{const x=executeJsx({}, {mode:'inspect'});expect(x.result.inspection.issues).toEqual(expect.arrayContaining([expect.objectContaining({code:'FONT_SUBSTITUTION_NOT_VERIFIED',severity:'warning'})]));});
 it('opens a trusted PDF without closing it or saving an AI file',()=>{const x=executeJsx({}, {mode:'open',pdfPath:'manual-edit.pdf'});expect(x.result.ok).toBe(true);expect(x.opened).toBe(1);expect(x.closed).toBe(0);expect(x.saved).toHaveLength(0);});
});

it('reports missing fonts only from a readable Illustrator catalogue and still reads template objects',()=>{
 const registry=Object.assign([{name:'ArialMT'}],{getByName:(name:string)=>{
   if(name==='ArialMT')return {name};
   throw Error('font unavailable');
 }});
 const x=executeJsx({}, {mode:'inspect',requiredFonts:['ArialMT','UnavailableFont']}, registry);
 expect(x.opened).toBe(1);
 expect(x.closed).toBe(1);
 expect(x.saved).toEqual([]);
 expect(x.result.inspection.documentRead).toBe(true);
 expect(x.result.inspection.textObjects).toEqual([expect.objectContaining({objectName:'DRAWING_NO'})]);
 expect(x.result.inspection.fontStatuses).toEqual([{name:'ArialMT',status:'installed'},{name:'UnavailableFont',status:'missing'}]);
 const uncertain=executeJsx({}, {mode:'inspect',requiredFonts:['UnavailableFont']});
 expect(uncertain.result.inspection.fontStatuses).toContainEqual({name:'UnavailableFont',status:'unknown'});
});
