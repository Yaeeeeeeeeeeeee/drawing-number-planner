import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {PdfClassificationDialog} from '../../src/renderer/components/PdfClassificationDialog';
it('classifies more than500 selected files with independent server previews and retries only the failed part',async()=>{
  let fail=true;const api={previewPdfClassification:vi.fn(async(input:any)=>({...input,fingerprint:`proof-${input.ids[0]}`,entries:input.ids.map((id:number)=>({id,fileName:`${id}.pdf`,previousProductId:null,previousMaterialBatchId:null,productId:1,materialBatchId:1})),conflicts:[]})),applyPdfClassification:vi.fn(async(input:any)=>{if(input.ids[0]===501&&fail)throw new Error('第二批失败');return{updated:input.ids.length,conflicts:[],backupPath:null};})},saved=vi.fn().mockResolvedValue(undefined);
  render(<PdfClassificationDialog api={api} ids={Array.from({length:501},(_,index)=>index+1)} products={[{id:1,model:'T40'} as never]} batches={[{id:1,name:'首批'} as never]} onClose={()=>{}} onSaved={saved}/>);
  fireEvent.change(screen.getByLabelText('目标产品'),{target:{value:'1'}});fireEvent.change(screen.getByLabelText('目标资料批次'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'预览归属'}));
  await screen.findByText('原归属 → 目标归属');expect(api.previewPdfClassification.mock.calls.map(call=>call[0].ids.length)).toEqual([500,1]);
  fireEvent.change(screen.getByLabelText('归纳原因'),{target:{value:'人工核实'}});fireEvent.click(screen.getByLabelText('已核对原归属与目标归属'));fireEvent.click(screen.getByRole('button',{name:'确认归纳'}));
  await screen.findByText('第二批失败');expect(screen.getByText('已完成：500 / 501 条')).toBeVisible();fail=false;fireEvent.click(screen.getByRole('button',{name:'重试失败批次'}));
  await waitFor(()=>expect(saved).toHaveBeenLastCalledWith(501,0,expect.objectContaining({complete:true})));
  expect(api.applyPdfClassification.mock.calls.map(call=>call[0].ids[0])).toEqual([1,501,501]);
});
