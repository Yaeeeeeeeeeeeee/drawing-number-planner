import {expect,it,vi} from 'vitest';
import {createPdfBatches,previewPdfBatches,applyPdfBatches} from '../../src/renderer/data/pdf-batches';
it('automatically splits 1201 selected identities into bounded stable batches and reports aggregate progress',async()=>{
  const ids=Array.from({length:1201},(_,index)=>index+1),preview=vi.fn(async(part:number[])=>({ids:part,fingerprint:part[0]})),apply=vi.fn(async(value:{ids:number[]})=>({changed:value.ids.length})),progress=vi.fn();
  let batches=createPdfBatches<{ids:number[];fingerprint:number},{changed:number}>(ids);
  batches=await previewPdfBatches(batches,preview,progress);expect(preview.mock.calls.map(call=>call[0].length)).toEqual([500,500,201]);
  batches=await applyPdfBatches(batches,apply,progress);expect(batches.every(batch=>batch.status==='done')).toBe(true);expect(batches.reduce((count,batch)=>count+batch.result!.changed,0)).toBe(1201);expect(progress).toHaveBeenCalled();
  await applyPdfBatches(batches,apply,progress);expect(apply).toHaveBeenCalledTimes(3);
});
it('retains failures and original previews, retrying only failures without repeating acknowledged successes',async()=>{
  let fail=true;const apply=vi.fn(async(preview:{ids:number[];fingerprint:string})=>{if(preview.ids[0]===501&&fail)throw new Error('断开连接');return {changed:preview.ids.length};});
  let batches=createPdfBatches<{ids:number[];fingerprint:string},{changed:number}>(Array.from({length:1001},(_,index)=>index+1));
  batches=await previewPdfBatches(batches,async ids=>({ids,fingerprint:`original-${ids[0]}`}));
  batches=await applyPdfBatches(batches,apply);expect(batches.map(batch=>batch.status)).toEqual(['done','failed','done']);expect(batches[1].error).toBe('断开连接');
  fail=false;batches=await applyPdfBatches(batches,apply);expect(apply.mock.calls.map(call=>call[0].fingerprint)).toEqual(['original-1','original-501','original-1001','original-501']);expect(batches.every(batch=>batch.status==='done')).toBe(true);
});
it('shows a failed preview separately and retries it without reloading valid previews or applying unseen data',async()=>{
  const preview=vi.fn(async(ids:number[])=>{if(ids[0]===501)throw new Error('预检失败');return {ids};}),apply=vi.fn(async()=>({changed:500}));
  let batches=createPdfBatches<{ids:number[]},{changed:number}>(Array.from({length:501},(_,index)=>index+1));
  batches=await previewPdfBatches(batches,preview);expect(batches[1].status).toBe('preview-failed');
  batches=await applyPdfBatches(batches,apply);expect(apply).toHaveBeenCalledTimes(1);
  await previewPdfBatches(batches,async ids=>({ids}));expect(batches[0].status).toBe('done');
});
it('rejects invalid or duplicate identities rather than expanding the selection scope',()=>{
  expect(()=>createPdfBatches([1,1])).toThrow();expect(()=>createPdfBatches([0])).toThrow();expect(()=>createPdfBatches([])).toThrow();
});
