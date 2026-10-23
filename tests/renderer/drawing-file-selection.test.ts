import {describe,expect,it} from 'vitest';
import {selectDrawingFiles} from '../../src/renderer/pages/drawing-file-selection';
const file=(id:number,batch:number|null=null,present=true)=>({pdfIndexId:id,fileName:`${id}.pdf`,relativePath:`${id}.pdf`,isPresent:present,conversionType:'outlined' as const,materialBatchId:batch});
const occurrence=(batchId:number,files:ReturnType<typeof file>[],productId=1)=>({batchId,productId,batchName:`批次${batchId}`,productDirectory:'产品目录',sequenceNumber:batchId,recognitionStatus:'recognized' as const,usageState:'historical' as const,files});
describe('drawing file availability selection',()=>{
 it('shows an existing unbatched file even without current batch membership',()=>{const files=[file(1)];expect(selectDrawingFiles(files,undefined,{})).toMatchObject({state:'present',files});});
 it('shows the unique actual file even when old batch attribution disagrees with current product',()=>{const files=[file(1,3)];const usage={effectiveCurrentFileIds:[],occurrences:[occurrence(3,files,8)]};expect(selectDrawingFiles(files,usage,{productId:1})).toMatchObject({state:'present',files});});
 it('keeps multiple unresolved existing files ambiguous instead of picking the latest or marking missing',()=>{const files=[file(1,1),file(2,2)];expect(selectDrawingFiles(files,{occurrences:[occurrence(1,[files[0]]),occurrence(2,[files[1]])]},{})).toMatchObject({state:'ambiguous',files:[]});});
 it('uses a unique explicitly resolved current instance without duplicating older cards',()=>{const files=[file(1,1),file(2,2)];expect(selectDrawingFiles(files,{effectiveCurrentFileIds:[2],occurrences:[occurrence(1,[files[0]]),occurrence(2,[files[1]])]},{productId:1})).toMatchObject({state:'present',files:[files[1]]});});
 it('honors an explicit batch including missing indices without substituting another batch',()=>{const files=[file(1,1),file(2,2,false)];expect(selectDrawingFiles(files,{occurrences:[occurrence(1,[files[0]])]},{batchId:2})).toMatchObject({state:'missing',files:[]});});
 it('allows an explicit batch to resolve ambiguity and keeps the original file array intact',()=>{const files=[file(1,1),file(2,2)];expect(selectDrawingFiles(files,undefined,{batchId:2})).toMatchObject({state:'present',files:[files[1]]});expect(files).toHaveLength(2);});
});
