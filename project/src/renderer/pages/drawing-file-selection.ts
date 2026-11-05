import type {DrawingFileView} from '../data/client';
import type {DrawingDetailView} from '../data/client';
import type {DrawingFileObservation,DrawingObservedSection,DrawingObservedEntry} from '../../core/files/drawing-file-observation';
/** Older API/mock payloads retain their indexed facts; the current API always supplies an actual observation. */
export function groupDrawingFileSections(detail:Pick<DrawingDetailView,'sourceFiles'|'outlinedFiles'|'batchUsage'|'fileObservation'>):DrawingFileObservation {
 if(detail.fileObservation)return detail.fileObservation;
 const project=(files:DrawingFileView[],role:'source'|'outlined'):DrawingObservedSection=>{
  const groups=new Map<string,DrawingObservedEntry>();
  for(const file of files){
   const occurrence=detail.batchUsage?.occurrences.find(value=>value.batchId===file.materialBatchId||value.files.some(item=>item.pdfIndexId===file.pdfIndexId));
   const key=occurrence?`batch:${occurrence.batchId}`:file.materialBatchId!=null?`batch:${file.materialBatchId}`:file.relativePath.split(/[\\/]/).slice(0,-1).join('/')||role;
   let entry=groups.get(key);if(!entry){entry={key,batchId:occurrence?.batchId??file.materialBatchId??null,batchName:occurrence?.batchName??(role==='source'?'未转曲源文件':'资料批次未记录'),businessDate:null,usageState:occurrence?.usageState==='current'?'current':occurrence?.usageState==='historical'?'historical':'indeterminate',state:'present',files:[]};groups.set(key,entry);}
   entry.files.push({pdfIndexId:file.pdfIndexId,fileName:file.fileName,relativePath:file.relativePath,isPresent:file.isPresent,indexed:true});
   if(!file.isPresent){entry.state='unavailable';entry.message=file.presenceMessage??(file.presenceStatus==='missing'?'磁盘文件不存在':'文件状态尚未核验');}
   if(entry.files.length>1){entry.state='conflict';entry.message=`同一批次有 ${entry.files.length} 个文件，内容尚未唯一核验`;}
  }
  const entries=[...groups.values()];
  return{state:entries.some(entry=>entry.state==='present')?'present':entries.length?'unavailable':'unindexed',message:!entries.length?'未找到对应文件索引，尚未核验磁盘':entries.some(entry=>entry.state==='present')?'文件存在':'文件状态尚未核验',entries};
 };
 return{source:project(detail.sourceFiles??[],'source'),outlined:project(detail.outlinedFiles??[],'outlined')};
}
