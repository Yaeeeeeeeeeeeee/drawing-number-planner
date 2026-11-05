import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {PdfBulkManagementDialog} from '../../src/renderer/components/PdfBulkManagementDialog';
it('previews 501 selected records in bounded requests, confirms once and retries only a failed batch',async()=>{
  let fail=true;const api={previewPdfManagement:vi.fn(async({ids,action}:any)=>({ids,action,fingerprint:`original-${ids[0]}`,confirmation:'暂不纳入 PDF',allowed:ids.length,blocked:0,entries:ids.map((id:number)=>({id,relativePath:`${id}.pdf`,allowed:true,reason:null}))})),applyPdfManagement:vi.fn(async(input:any)=>{if(input.ids[0]===501&&fail)throw new Error('网络暂时失败');return {changed:input.ids.length,blocked:[]};})},saved=vi.fn().mockResolvedValue(undefined);
  render(<PdfBulkManagementDialog api={api} ids={Array.from({length:501},(_,index)=>index+1)} action="ignore" onClose={()=>{}} onApplied={saved}/>);
  await screen.findByText('预检完成：2 / 2 批');expect(api.previewPdfManagement.mock.calls.map(call=>call[0].ids.length)).toEqual([500,1]);expect(api.applyPdfManagement).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('PDF 管理确认短语'),{target:{value:'暂不纳入 PDF'}});fireEvent.click(screen.getByRole('button',{name:'确认处理'}));
  expect(await screen.findByText('网络暂时失败')).toBeVisible();await waitFor(()=>expect(saved).toHaveBeenCalledWith(expect.objectContaining({changed:500,completedIds:expect.arrayContaining([1,500])})));
  expect(screen.getByText('已完成：500 / 501 条')).toBeVisible();fail=false;fireEvent.click(screen.getByRole('button',{name:'重试失败批次'}));
  await screen.findByText('已完成：501 / 501 条');expect(api.applyPdfManagement.mock.calls.map(call=>call[0].ids[0])).toEqual([1,501,501]);expect(api.applyPdfManagement.mock.calls[2][0].fingerprint).toBe('original-501');
});
