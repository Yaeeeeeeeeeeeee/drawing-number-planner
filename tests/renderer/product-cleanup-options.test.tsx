import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProductCleanupPanel } from '../../src/renderer/components/ProductCleanupPanel';

const preview={productId:1,model:'F60',sku:'SKU',blockers:[],owned:{drawings:1,historicalDrawings:0,bomRecords:1,qrCodes:0,batches:0},preservedSnapshots:0,
  classification:{alreadyDeleted:0,presentPdfIndexes:0,missingPdfIndexes:0,preservedDrafts:0},choices:{fingerprint:'f'.repeat(64),occupiedDrawings:[{signedId:1,fullCode:'02.0404.010.0401001'}],purgeCounts:{bomRecords:1,qrCodes:0,batches:0,outboundPackages:0,emailDrafts:0},purgeBlockers:[]}};
it('requires both explicit choices and exact release/history confirmation before inline final review',async()=>{
  const api={previewProductCleanup:vi.fn().mockResolvedValue(preview),cleanupProduct:vi.fn().mockResolvedValue(preview)};
  const complete=vi.fn();const native=vi.spyOn(window,'confirm');
  render(<ProductCleanupPanel api={api as never} productId={1} onCancel={vi.fn()} onComplete={complete}/>);
  fireEvent.change(await screen.findByLabelText('输入型号确认'),{target:{value:'F60'}});
  const review=screen.getByRole('button',{name:'核对处理结果'});expect(review).toBeDisabled();
  fireEvent.click(screen.getByLabelText('释放占号'));expect(review).toBeDisabled();
  fireEvent.click(screen.getByLabelText('永久清除业务历史'));
  expect(review).toBeDisabled();
  fireEvent.change(screen.getByLabelText('确认释放图号 02.0404.010.0401001'),{target:{value:'02.0404.010.0401001'}});
  fireEvent.change(screen.getByLabelText('输入“永久清除历史”确认'),{target:{value:'永久清除历史'}});
  fireEvent.click(review);
  const final=screen.getByRole('region',{name:'最后确认处理范围'});
  expect(within(final).getByText(/释放占号/)).toBeVisible();expect(within(final).getByText(/永久清除业务历史/)).toBeVisible();
  expect(api.cleanupProduct).not.toHaveBeenCalled();
  fireEvent.click(within(final).getByRole('button',{name:'确认执行'}));
  await waitFor(()=>expect(complete).toHaveBeenCalledTimes(1));
  expect(api.cleanupProduct).toHaveBeenCalledWith(1,'F60',expect.objectContaining({occupancy:'release',history:'purge',expectedFingerprint:preview.choices.fingerprint}));
  expect(native).not.toHaveBeenCalled();native.mockRestore();
});
it('displays actual blockers for permanent history clearing but still permits retaining it',async()=>{
  const api={previewProductCleanup:vi.fn().mockResolvedValue({...preview,choices:{...preview.choices,purgeBlockers:['其他产品历史 BOM 仍引用批次']}}),cleanupProduct:vi.fn()};
  render(<ProductCleanupPanel api={api as never} productId={1} onCancel={vi.fn()} onComplete={vi.fn()}/>);
  fireEvent.change(await screen.findByLabelText('输入型号确认'),{target:{value:'F60'}});
  fireEvent.click(screen.getByLabelText('继续保留占号'));fireEvent.click(screen.getByLabelText('永久清除业务历史'));
  expect(screen.getByText('其他产品历史 BOM 仍引用批次')).toBeVisible();expect(screen.getByRole('button',{name:'核对处理结果'})).toBeDisabled();
  fireEvent.click(screen.getByLabelText('保留业务历史'));
  expect(screen.getByRole('button',{name:'核对处理结果'})).toBeEnabled();expect(api.cleanupProduct).not.toHaveBeenCalled();
});
