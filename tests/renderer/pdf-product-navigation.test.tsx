import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProductCatalogNavigation } from '../../src/renderer/components/ProductCatalogNavigation';
import { PdfProductBatchNavigation } from '../../src/renderer/components/PdfProductBatchNavigation';

it('uses reliable code-scoped batch chronology and expands search ancestors', () => {
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
  expect(batch).toHaveTextContent('当前批次');
  expect(batch).not.toHaveTextContent('历史批次');
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
  expect(screen.getByRole('button',{name:'批次 首批'})).toHaveTextContent('当前批次');
  expect(screen.getByText('数量暂不可用')).toBeVisible();
  expect(screen.queryByText('当前使用')).not.toBeInTheDocument();
});

it('keeps explicit current usage visible even when batch recognition remains pending', () => {
  render(<PdfProductBatchNavigation products={[{id:9,sku:'SKU',model:'T40',productCategory:'洗碗机'}] as never}
    batches={[{id:2,productId:9,name:'01.首批',recognitionStatus:'pending'}] as never}
    usageBatches={[{id:2,usageProducts:[{productId:9,state:'current'}]}] as never}
    counts={null} scope={{kind:'all'}} onSelect={vi.fn()} filters={null} />);
  fireEvent.click(screen.getByRole('button',{name:'展开产品 SKU · T40'}));
  expect(screen.getByRole('button',{name:'批次 首批'})).not.toHaveTextContent('当前批次');
  expect(screen.getByRole('button',{name:'批次 首批'})).not.toHaveTextContent('待确认');
});

it('places pending products directly after the tree inside its scroll region before filters', () => {
  const {container}=render(<PdfProductBatchNavigation products={[]} batches={[]} counts={null} scope={{kind:'all'}} onSelect={vi.fn()} filters={<input aria-label="保留的文件筛选" />} />);
  const pending=screen.getByRole('button',{name:'待关联产品'});
  const scroll=container.querySelector('.pdf-nav-scroll')!;
  expect(scroll).toContainElement(pending);
  expect(pending.compareDocumentPosition(screen.getByText('文件筛选')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(pending.querySelector('svg')).toHaveAttribute('width','18');
  expect(pending.querySelector('svg')).toHaveAttribute('stroke-width','1.8');
});

it('preserves direct orphan batch navigation with truthful unavailable file counts',()=>{
  const select=vi.fn();
  render(<PdfProductBatchNavigation products={[]} batches={[{id:7,productId:null,name:'01.首批',recognitionStatus:'pending'}] as never} counts={null} scope={{kind:'all'}} onSelect={select} filters={<input aria-label="手工文件筛选"/>}/>);
  fireEvent.click(screen.getByText('未关联产品批次（1）'));
  const batch=screen.getByRole('button',{name:'批次 首批'});
  expect(batch).not.toHaveTextContent('待确认');
  expect(batch).toHaveTextContent('—');
  fireEvent.click(batch);
  expect(select).toHaveBeenCalledWith({kind:'batch',batchId:7});
  expect(screen.getByText('文件筛选').closest('details')).not.toHaveAttribute('open');
});


it('uses drawing-number terminology for the shared drawing catalog',()=>{
  render(<ProductCatalogNavigation products={[]} batches={[]} counts={{total:2,unassociated:1,categories:[],products:[],batches:[]}} scope={{kind:'all'}} onSelect={vi.fn()} mode="drawings"/>);
  expect(screen.getByRole('button',{name:'全部图号'})).toBeVisible();
  expect(screen.getByRole('button',{name:'未关联图号'})).toBeVisible();
  expect(screen.getByLabelText('2 个图号')).toBeVisible();
});
