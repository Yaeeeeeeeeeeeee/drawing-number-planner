import type { CurrentBatchSelection } from './material-batch-types.js';
export interface BusinessOrderedBatch { id:number; sequenceNumber:number|null; businessDate:string|null }
/** Only complete business chronology is comparable. File timestamps and directory text are not chronology. */
export function selectLatestBusinessBatch(rows:BusinessOrderedBatch[]):CurrentBatchSelection {
  if (!rows.length) return {status:'none',batchId:null};
  const useSequence=rows.every(row=>row.sequenceNumber!==null&&Number.isFinite(row.sequenceNumber));
  const validDate=(date:string|null):date is string=>Boolean(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)&&!Number.isNaN(Date.parse(date))&&new Date(date).toISOString().slice(0,10)===date);
  if (!useSequence&&!rows.every(row=>validDate(row.businessDate))) return {status:'none',batchId:null};
  const order=(row:BusinessOrderedBatch)=>useSequence?row.sequenceNumber!:Date.parse(row.businessDate!);
  const highest=Math.max(...rows.map(order)); const candidates=rows.filter(row=>order(row)===highest);
  return candidates.length===1?{status:'selected',batchId:candidates[0].id}:{status:'indeterminate',batchId:null};
}
/** Brand + size + dictionary appearance code; color does not define another appearance generation. */
export function codeScopeFromFullCode(code:string):string|null {
  const match=/^(\d{2})\.(\d{4})\.(\d{2})\d\.\d{7}$/.exec(code);
  return match?`${match[1]}:${match[2]}:${match[3]}`:null;
}
