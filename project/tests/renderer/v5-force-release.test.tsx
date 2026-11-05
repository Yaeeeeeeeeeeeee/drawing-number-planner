import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {describe,it,expect,vi} from 'vitest';
import {DrawingForceRelease} from '../../src/renderer/pages/DrawingForceRelease';
import type {PlannerApi} from '../../src/renderer/data/client';
const references={drawingRecords:1,pdf:3,presentPdf:2,missingPdf:1,currentBom:1,historicalBom:2,deletedBom:4,bomSnapshots:5,outboundItems:2,outboundSnapshots:1,emailDrafts:1,appearanceUsages:0,bindings:1,lineage:0,audits:3,products:2};
describe('independent force release',()=>{
 it('shows concrete impact before a single explicit confirmation and refreshes after success',async()=>{
  const preview=vi.fn().mockResolvedValue({signedId:7,fullCode:'02.0209.010.0401001',origin:'planned',fingerprint:'impact',references,affectedProductIds:[1,2]});
  const confirm=vi.fn().mockResolvedValue({occupied:false});const refresh=vi.fn().mockResolvedValue(undefined);const native=vi.spyOn(window,'confirm');
  render(<DrawingForceRelease api={{getDrawingForceReleasePreview:preview,forceReleaseDrawing:confirm} as unknown as PlannerApi} signedId={7} disabled={false} onReleased={refresh} onError={vi.fn()}/>);
  fireEvent.click(screen.getByRole('button',{name:'强制取消占号并删除图号'}));
  expect(await screen.findByText('已删除 BOM 保留明细：4')).toBeVisible();
  expect(screen.getByText('BOM 纠错快照：5')).toBeVisible();
  expect(screen.getByText('涉及产品 ID：1、2')).toBeVisible();
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'确认强制释放并删除'}));
  await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
  expect(confirm).toHaveBeenCalledWith(7,{confirmed:true,fingerprint:'impact'});
  expect(native).not.toHaveBeenCalled();native.mockRestore();
 });
 it('requires fresh impact after a stale failure and lets user cancel without writing',async()=>{
  const confirm=vi.fn().mockRejectedValue(new Error('引用已变化'));const onError=vi.fn();
  render(<DrawingForceRelease api={{getDrawingForceReleasePreview:vi.fn().mockResolvedValue({fullCode:'code',fingerprint:'old',references,affectedProductIds:[]}),forceReleaseDrawing:confirm} as unknown as PlannerApi} signedId={7} disabled={false} onReleased={vi.fn()} onError={onError}/>);
  fireEvent.click(screen.getByRole('button',{name:'强制取消占号并删除图号'}));
  fireEvent.click(await screen.findByRole('button',{name:'取消'}));
  expect(confirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'强制取消占号并删除图号'}));
  fireEvent.click(await screen.findByRole('button',{name:'确认强制释放并删除'}));
  await waitFor(()=>expect(onError).toHaveBeenCalledWith('引用已变化'));
  expect(screen.queryByRole('button',{name:'确认强制释放并删除'})).not.toBeInTheDocument();
 });
});
