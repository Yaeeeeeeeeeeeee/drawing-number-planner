/** Client-side orchestration only: every bounded request keeps server previews,
 * fingerprints, confirmation and reference protection. A failed apply keeps its
 * ORIGINAL preview so an uncertain response cannot silently replay a new action. */
export interface PdfBatch<P,R> {
  number:number;ids:number[];status:'pending'|'previewing'|'ready'|'preview-failed'|'applying'|'failed'|'done';
  preview?:P;result?:R;error?:string;
}
export function createPdfBatches<P,R>(ids:number[]):PdfBatch<P,R>[] {
  if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new Error('请选择有效且不重复的PDF记录');
  const result:PdfBatch<P,R>[]=[];
  for(let offset=0;offset<ids.length;offset+=500)result.push({number:result.length+1,ids:ids.slice(offset,offset+500),status:'pending'});
  return result;
}
type Progress<P,R>=(batches:PdfBatch<P,R>[])=>void;
const errorText=(error:unknown)=>error instanceof Error?error.message:'请求失败，请重试此批次';
export async function previewPdfBatches<P,R>(source:PdfBatch<P,R>[],preview:(ids:number[])=>Promise<P>,progress:Progress<P,R>=()=>{}):Promise<PdfBatch<P,R>[]> {
  const batches=source.map(batch=>({...batch}));const report=()=>progress(batches.map(batch=>({...batch})));
  for(const batch of batches){
    if(batch.status!=='pending'&&batch.status!=='preview-failed')continue;
    batch.status='previewing';delete batch.error;report();
    try{batch.preview=await preview([...batch.ids]);batch.status='ready';}
    catch(error){batch.status='preview-failed';batch.error=errorText(error);}report();
  }
  return batches;
}
export async function applyPdfBatches<P,R>(source:PdfBatch<P,R>[],apply:(preview:P)=>Promise<R>,progress:Progress<P,R>=()=>{}):Promise<PdfBatch<P,R>[]> {
  const batches=source.map(batch=>({...batch}));const report=()=>progress(batches.map(batch=>({...batch})));
  for(const batch of batches){
    if((batch.status!=='ready'&&batch.status!=='failed')||!batch.preview)continue;
    batch.status='applying';delete batch.error;report();
    try{batch.result=await apply(batch.preview);batch.status='done';}
    catch(error){batch.status='failed';batch.error=errorText(error);}report();
  }
  return batches;
}
