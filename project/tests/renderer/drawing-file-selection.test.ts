import {describe,expect,it} from 'vitest';
import {groupDrawingFileSections} from '../../src/renderer/pages/drawing-file-selection';
const file=(id:number,batch:number|null=null,present=true)=>({pdfIndexId:id,fileName:`${id}.pdf`,relativePath:`${id}.pdf`,isPresent:present,conversionType:'outlined' as const,materialBatchId:batch});
const occurrence=(batchId:number,files:ReturnType<typeof file>[],productId=1)=>({batchId,productId,batchName:`批次${batchId}`,productDirectory:'产品目录',sequenceNumber:batchId,recognitionStatus:'recognized' as const,usageState:'historical' as const,files});
const project=(files:ReturnType<typeof file>[],occurrences:ReturnType<typeof occurrence>[] = [])=>groupDrawingFileSections({sourceFiles:[],outlinedFiles:files,batchUsage:{occurrences}} as never).outlined;
describe('drawing file groups',()=>{
 it('keeps missing indices distinct from physical absence',()=>{
  expect(project([])).toMatchObject({state:'unindexed',entries:[],message:'未找到对应文件索引，尚未核验磁盘'});
 });
 it('keeps unreadable and confirmed missing file messages without offering an instance',()=>{
  const unavailable={...file(1,null,false),presenceStatus:'read-failed',presenceMessage:'文件读取失败'};
  expect(project([unavailable])).toMatchObject({state:'unavailable',entries:[{state:'unavailable',message:'文件读取失败'}]});
  const absent={...file(2,null,false),presenceStatus:'missing'};
  expect(project([absent])).toMatchObject({entries:[{state:'unavailable',message:'磁盘文件不存在'}]});
 });
 it('shows an existing unbatched file without inferring current business membership',()=>{
  expect(project([file(1)])).toMatchObject({state:'present',entries:[{batchId:null,usageState:'indeterminate',files:[{pdfIndexId:1}]}]});
 });
 it('keeps independent batch identity despite equal displayed labels',()=>{
  const files=[file(1,1),file(2,2)];
  const result=project(files,[{...occurrence(1,[files[0]]),batchName:'同名'},{...occurrence(2,[files[1]]),batchName:'同名'}]);
  expect(result.entries).toHaveLength(2);
  expect(result.entries.map(entry=>entry.batchId)).toEqual([1,2]);
 });
 it('keeps competing files in one batch in a single conflict row without choosing a file',()=>{
  const files=[file(1,1),file(2,1)];
  expect(project(files,[occurrence(1,files)])).toMatchObject({entries:[{state:'conflict',files:[{pdfIndexId:1},{pdfIndexId:2}]}]});
 });
 it('does not replace an unavailable current batch with an older available file',()=>{
  const files=[file(1,1),file(2,2,false)];
  const result=project(files,[occurrence(1,[files[0]]),{...occurrence(2,[files[1]]),usageState:'current'}] as never);
  expect(result.entries).toMatchObject([{usageState:'historical',state:'present'},{usageState:'current',state:'unavailable'}]);
  expect(files).toHaveLength(2);
 });
 it('uses the service observation unchanged, including verified dates and scope',()=>{
  const observed={source:{state:'missing',message:'verified',entries:[]},outlined:{state:'present',message:'verified',entries:[{key:'new',businessDate:'2026-03-01',usageState:'historical',files:[]}]}};
  expect(groupDrawingFileSections({fileObservation:observed,sourceFiles:[file(99)],outlinedFiles:[]} as never)).toBe(observed);
 });
});

it('projects every batch without promoting an older found file to current',()=>{
 const files=[file(1,1),file(2,2)];
 const result=groupDrawingFileSections({sourceFiles:[],outlinedFiles:files,batchUsage:{occurrences:[{...occurrence(1,[files[0]]),usageState:'historical'},{...occurrence(2,[files[1]]),usageState:'historical'}]}} as never);
 expect(result.outlined.entries).toHaveLength(2);
 expect(result.outlined.entries.map(entry=>entry.usageState)).toEqual(['historical','historical']);
});
