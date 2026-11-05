import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {DrawingLibraryPage} from '../../src/renderer/pages/DrawingLibraryPage';
import {ProductBatchNavigation} from '../../src/renderer/components/ProductBatchNavigation';
it('copies the complete drawing code without success text or opening row details',async()=>{
 const row={id:1,fullCode:'02.0404.010.0401038',origin:'planned',status:'reserved',sourceFiles:[],outlinedFiles:[],currentBomUsage:[]};
 const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn()};
 const writeText=vi.fn().mockResolvedValue(undefined);Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 render(<DrawingLibraryPage api={api as never}/>);
 const code=await screen.findByRole('button',{name:row.fullCode});const tableRow=code.closest('tr')!;
 fireEvent.click(within(tableRow).getByRole('button',{name:'复制完整图号'}));
 await waitFor(()=>expect(writeText).toHaveBeenCalledWith(row.fullCode));
 expect(screen.queryByText('已复制完整图号')).not.toBeInTheDocument();
 expect(api.getDrawing).not.toHaveBeenCalled();
 expect(tableRow.querySelector('.drawing-copy-control')?.tagName).toBe('SPAN');
});
it('separates orphan batches from drawing queries and preserves their distinct filters',()=>{
 const select=vi.fn();
 render(<ProductBatchNavigation products={[]} batches={[{id:9,productId:null,name:'待关联的旧批次',usageProducts:[]} as never]} scope={{kind:'all',title:'全部图号'}} onSelect={select}/>);
 const group=screen.getByText('未关联产品的批次（1）',{selector:'summary'}).parentElement!;
 expect(within(group).queryByRole('button',{name:'未关联图号'})).toBeNull();
 fireEvent.click(screen.getByText('待关联的旧批次 · 未关联产品',{selector:'button'}));
 expect(select).toHaveBeenLastCalledWith(expect.objectContaining({kind:'batch',batchId:9}));
 fireEvent.click(screen.getByRole('button',{name:'未关联图号'}));
 expect(select).toHaveBeenLastCalledWith({kind:'pending',title:'未关联图号（产品或使用批次）'});
 expect(screen.getByText('图号查询')).toBeVisible();
});
it('does not show an empty orphan-batch branch',()=>{
 render(<ProductBatchNavigation products={[]} batches={[]} scope={{kind:'all',title:'全部图号'}} onSelect={()=>{}}/>);
 expect(screen.queryByText(/未关联产品的批次/)).not.toBeInTheDocument();
 expect(screen.getByRole('button',{name:'未关联图号'})).toBeVisible();
});
