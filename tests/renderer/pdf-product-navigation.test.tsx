import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { PdfProductBatchNavigation } from '../../src/renderer/components/PdfProductBatchNavigation';

it('uses explicit business usage instead of inferred sequence state and expands search ancestors', () => {
  const select = vi.fn();
  render(<PdfProductBatchNavigation products={[{id:9,sku:'SKU-LONG',model:'T40',productCategory:'洗碗机'}] as never}
    batches={[{id:2,productId:9,name:'06.20260309',recognitionStatus:'recognized',currentState:'current'}] as never}
    usageBatches={[{id:2,usageProducts:[{productId:9,state:'historical'}]}] as never}
    counts={{total:10001,unassociatedProducts:3,categories:[{name:'洗碗机',count:9998}],products:[{productId:9,count:9998}],batches:[{materialBatchId:2,productId:9,count:6000}]}}
    scope={{kind:'all'}} onSelect={select} filters={null} />);
  fireEvent.click(screen.getByRole('button',{name:'收起分类 洗碗机'}));
  fireEvent.change(screen.getByLabelText('搜索产品 SKU 或型号'),{target:{value:'t40'}});
  expect(screen.getByRole('button',{name:'收起分类 洗碗机'})).toHaveAttribute('aria-expanded','true');
  const batch = screen.getByRole('button',{name:'批次 20260309'});
  expect(batch).toHaveTextContent('历史使用');
  expect(batch).not.toHaveTextContent('当前使用');
  expect(within(batch).getByLabelText('6000 个文件')).toBeVisible();
  expect(screen.getByRole('button',{name:'产品 SKU-LONG · T40'})).toHaveAttribute('title','SKU-LONG · T40');
  fireEvent.click(batch);
  expect(select).toHaveBeenCalledWith({kind:'batch',productId:9,batchId:2});
});

it('shows unavailable counts and indeterminate usage when actual data is unavailable', () => {
  render(<PdfProductBatchNavigation products={[{id:9,sku:'SKU',model:'T40',productCategory:'洗碗机'}] as never}
    batches={[{id:2,productId:9,name:'01.首批',recognitionStatus:'recognized',currentState:'current'}] as never}
    counts={null} scope={{kind:'all'}} onSelect={vi.fn()} filters={null} />);
  fireEvent.click(screen.getByRole('button',{name:'展开产品 SKU · T40'}));
  expect(screen.getByRole('button',{name:'批次 首批'})).toHaveTextContent('使用未确定');
  expect(screen.getByText('数量暂不可用')).toBeVisible();
  expect(screen.queryByText('当前使用')).not.toBeInTheDocument();
});

it('keeps explicit current usage visible even when batch recognition remains pending', () => {
  render(<PdfProductBatchNavigation products={[{id:9,sku:'SKU',model:'T40',productCategory:'洗碗机'}] as never}
    batches={[{id:2,productId:9,name:'01.首批',recognitionStatus:'pending'}] as never}
    usageBatches={[{id:2,usageProducts:[{productId:9,state:'current'}]}] as never}
    counts={null} scope={{kind:'all'}} onSelect={vi.fn()} filters={null} />);
  fireEvent.click(screen.getByRole('button',{name:'展开产品 SKU · T40'}));
  expect(screen.getByRole('button',{name:'批次 首批'})).toHaveTextContent('当前使用');
  expect(screen.getByRole('button',{name:'批次 首批'})).not.toHaveTextContent('待确认');
});
