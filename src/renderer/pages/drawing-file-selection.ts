import type {DrawingFileView,DrawingBatchUsageView} from '../data/client';
type FileUsage=Pick<DrawingBatchUsageView,'occurrences'|'effectiveCurrentFileIds'>;
export interface DrawingFileSelection {state:'present'|'missing'|'ambiguous'|'unavailable'|'unlinked';files:DrawingFileView[];message?:string}
/** File availability and current-business usage are different facts. Never choose by date alone. */
export function selectDrawingFiles(files:DrawingFileView[],usage:Partial<FileUsage>|undefined,context:{batchId?:number;productId?:number;directory?:string}):DrawingFileSelection{
 const occurrences=usage?.occurrences??[];
 let candidates=files;
 if(context.batchId!=null){
  const ids=new Set(occurrences.filter(o=>o.batchId===context.batchId).flatMap(o=>o.files.map(f=>f.pdfIndexId)));
  candidates=files.filter(f=>f.materialBatchId===context.batchId||ids.has(f.pdfIndexId));
 }else if(context.directory){
  const ids=new Set(occurrences.filter(o=>o.productDirectory===context.directory).flatMap(o=>o.files.map(f=>f.pdfIndexId)));
  candidates=files.filter(f=>ids.has(f.pdfIndexId));
 }
 const present=candidates.filter(f=>f.isPresent);
 if(present.length===1)return{state:'present',files:present,...(present[0].presenceStatus==='index-stale'?{message:'存在，索引待更新'}:{})};
 if(present.length>1){
  const trusted=new Set((usage?.effectiveCurrentFileIds??occurrences.filter(o=>o.usageState==='current').flatMap(o=>o.files.map(f=>f.pdfIndexId))).filter(id=>context.productId==null||occurrences.some(o=>o.files.some(f=>f.pdfIndexId===id)&&(o.productId==null||o.productId===context.productId))));
  const resolved=present.filter(f=>trusted.has(f.pdfIndexId));
  if(context.batchId==null&&!context.directory&&resolved.length===1)return{state:'present',files:resolved};
  return{state:'ambiguous',files:[],message:`找到 ${present.length} 个存在的文件，尚未唯一确认。`};
 }
 if(candidates.length===0&&files.some(f=>f.isPresent))return{state:'ambiguous',files:[],message:'其他资料批次存在文件，当前范围尚未确认。'};
 const unavailable=candidates.filter(file=>file.presenceStatus&& !['missing','present','index-stale'].includes(file.presenceStatus));
 if(unavailable.length)return{state:'unavailable',files:[],message:[...new Set(unavailable.map(file=>file.presenceMessage??'文件状态无法核验'))].join('；')};
 if(!candidates.length)return{state:'unlinked',files:[],message:'未找到对应文件索引'};
 return{state:'missing',files:[],message:'磁盘文件不存在'};
}
