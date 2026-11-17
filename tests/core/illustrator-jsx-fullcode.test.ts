// VM DOM contract only; this is not evidence from Adobe Illustrator.
import { describe, expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { buildIllustratorJsx } from '../../src/core/packaging/illustrator-jsx.js';

const old='12.3456.789.1234567', next='98.7654.321.7654321', other='11.1111.111.1111111';
function frame(name:string, value:string, locked=false) {
 let content=value;
 const chars=Array.from(value,(_,i)=>({get contents(){return content[i];},set contents(v:string){content=content.slice(0,i)+v+content.slice(i+1);},characterAttributes:{textFont:{name:'ArialMT'},size:10+i,fillColor:{typename:'RGBColor',red:i,green:20,blue:30}}}));
 return {name,typename:'TextFrame',get contents(){return content;},set contents(v:string){content=v;},characters:chars,locked,parent:{typename:'Layer',visible:true},position:[10,20],rotation:0};
}
function run(frames:ReturnType<typeof frame>[], mode:'inspect'|'generate'='generate', fields:any[]=[], value:any=next) {
 let output='',saved=0,closed:any;
 const doc={textFrames:frames,pageItems:frames,placedItems:[],rasterItems:[],saveAs:()=>{saved++;},close:(v:any)=>{closed=v;}};
 const app={documents:[],textFonts:{getByName:(name:string)=>({name})},userInteractionLevel:'normal',open:()=>doc};
 function File(this:any,path:string){this.path=path;this.open=()=>true;this.write=(v:string)=>{output=v;};this.close=()=>{};}
 runInNewContext(buildIllustratorJsx({operationId:'op',mode,templatePath:'template.ait',outputPath:'candidate.pdf',resultPath:'result',fields,values:{DRAWING_NO:value}}),{app,File,PDFSaveOptions:function(){},SaveOptions:{DONOTSAVECHANGES:'discard'},UserInteractionLevel:{DONTDISPLAYALERTS:'quiet'}});
 return {result:JSON.parse(output),saved,closed};
}
describe('full drawing number JSX contract',()=>{
 it('replaces every exact occurrence while retaining per-character styles and unrelated text',()=>{
  const frames=[frame('DRAWING_NO',old),frame('copy',old),frame('label','prefix '+old),frame('other',other)];
  const styles=frames.map(f=>JSON.stringify(f.characters.map(c=>c.characterAttributes)));
  const x=run(frames);
  expect(x.result.ok).toBe(true);expect(frames.map(f=>f.contents)).toEqual([next,next,'prefix '+old,other]);
  expect(frames.map(f=>JSON.stringify(f.characters.map(c=>c.characterAttributes)))).toEqual(styles);
  expect(x.result.inspection.drawingNumber).toMatchObject({originalText:old,matches:2,replaced:2});expect(x.saved).toBe(1);expect(x.closed).toBe('discard');
 });
 it('requires manual mapping for ambiguous distinct codes and supports a saved mapping',()=>{
  const frames=[frame('first',old),frame('second',other)];
  const ambiguous=run(frames);expect(ambiguous.result.ok).toBe(false);expect(ambiguous.saved).toBe(0);
  const mapped=run(frames,'generate',[{objectName:'second',sourceKey:'DRAWING_NO',required:true}]);expect(mapped.result.ok).toBe(true);expect(frames.map(f=>f.contents)).toEqual([old,next]);
 });
 it('accepts multiple saved anchors with the same original code',()=>{
  const frames=[frame('first',old),frame('second',old)];
  const x=run(frames,'generate',[{objectName:'first',sourceKey:'DRAWING_NO',required:true},{objectName:'second',sourceKey:'DRAWING_NO',required:true}]);
  expect(x.result.ok).toBe(true);expect(frames.map(f=>f.contents)).toEqual([next,next]);
 });
 it('accepts repeated DRAWING_NO names with the same original code',()=>{
  const frames=[frame('DRAWING_NO',old),frame('DRAWING_NO',old)];
  const x=run(frames);expect(x.result.ok).toBe(true);expect(frames.map(f=>f.contents)).toEqual([next,next]);
 });
 it('rejects saved anchors that identify different original codes',()=>{
  const frames=[frame('first',old),frame('second',other)];
  const x=run(frames,'generate',[{objectName:'first',sourceKey:'DRAWING_NO',required:true},{objectName:'second',sourceKey:'DRAWING_NO',required:true}]);
  expect(x.result.ok).toBe(false);expect(x.saved).toBe(0);
 });
 it('rejects a missing saved anchor or an anchor containing a prefix',()=>{
  const mappings=[{objectName:'first',sourceKey:'DRAWING_NO',required:true},{objectName:'second',sourceKey:'DRAWING_NO',required:true}];
  expect(run([frame('first',old)],'generate',mappings).result.ok).toBe(false);
  expect(run([frame('first',old),frame('second','prefix '+old)],'generate',mappings).result.ok).toBe(false);
 });
 it('fails before editing if any exact target is locked or the replacement is invalid',()=>{
  const frames=[frame('DRAWING_NO',old),frame('copy',old,true)];
  expect(run(frames).result.ok).toBe(false);expect(frames[0].contents).toBe(old);
  expect(run([frame('DRAWING_NO',old)],'generate',[],'T40').result.ok).toBe(false);
 });
 it('blocks export if editing changes formatting or another text object',()=>{
  const target=frame('DRAWING_NO',old), unrelated=frame('label','unchanged');
  const char=target.characters[0];
  Object.defineProperty(char,'contents',{get:()=>old[0],set:()=>{unrelated.contents='changed';}});
  const x=run([target,unrelated]);expect(x.result.ok).toBe(false);expect(x.saved).toBe(0);
 });
 it('blocks export when a character edit changes formatting',()=>{
  const target=frame('DRAWING_NO',old), char=target.characters[0];
  const descriptor=Object.getOwnPropertyDescriptor(char,'contents')!;
  Object.defineProperty(char,'contents',{get:descriptor.get,set(v:string){descriptor.set!.call(char,v);char.characterAttributes.size=99;}});
  const x=run([target]);expect(x.result.ok).toBe(false);expect(x.saved).toBe(0);
 });
 it('does not accept a mapped prefix or suffix as a full drawing number',()=>{
  const x=run([frame('DRAWING_NO','prefix '+old)]);expect(x.result.ok).toBe(false);expect(x.saved).toBe(0);
 });
 it('reports automatic inspection evidence without a configured mapping',()=>{
  const x=run([frame('DRAWING_NO',old),frame('copy',old)],'inspect');
  expect(x.result.inspection.drawingNumber).toMatchObject({originalText:old,matches:2});
  expect(x.result.inspection.textObjects).toEqual(expect.arrayContaining([expect.objectContaining({objectName:'DRAWING_NO',sourceText:old})]));
 });
});
