import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FilesPage } from '../../src/renderer/pages/FilesPage';
import { plannerQueryCache } from '../../src/renderer/data/query-cache';
const item = {id:1,fileName:'first.pdf',relativePath:'first.pdf',drawingId:null,fullCode:null,productId:null,matchStatus:'unmatched',detectedCodes:[],conversionType:'source',isPresent:true,managementState:'included'};
function fixture() { return {
 getWorkspaceSettings:vi.fn().mockResolvedValue({workspaceRoot:'/temp',configured:true,available:true}),
 listProducts:vi.fn().mockResolvedValue([]),listMaterialBatches:vi.fn().mockResolvedValue([]),
 searchPdfFiles:vi.fn().mockImplementation(async (q:any)=>({items:[{...item,id:q.page,fileName:`page-${q.page}.pdf`}],total:1,page:q.page,pageSize:q.pageSize})),
 previewPdfManagement:vi.fn().mockResolvedValue({ids:[1],action:'ignore',fingerprint:'f'.repeat(64),confirmation:'暂不纳入 PDF',entries:[{id:1,relativePath:'first.pdf',allowed:true,reason:null}],allowed:1,blocked:0}),
 applyPdfManagement:vi.fn().mockResolvedValue({changed:1,blocked:[]}),
 }; }
beforeEach(()=>{localStorage.clear();plannerQueryCache.invalidate();Object.defineProperty(window,'innerWidth',{configurable:true,value:1600});});
it('loads the next 100-file chunk without replacing rows or losing selection',async()=>{
 const api=fixture();let resolveNext!:(value:unknown)=>void;
 const records=Array.from({length:100},(_,i)=>({...item,id:i+1,fileName:`file-${i+1}.pdf`}));
 api.searchPdfFiles.mockImplementation(async(q:any)=>q.page===2?new Promise(resolve=>{resolveNext=resolve;}):({items:records,total:101,page:1,pageSize:100}));
 const view=render(<FilesPage api={api as never}/>);await screen.findByText('file-1',{selector:'.file-primary'});
 const table=screen.getByRole('table');const header=screen.getByRole('columnheader',{name:'文件名'});
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 file-1.pdf'}));
 const scroll=view.container.querySelector('.table-wrap')!;fireEvent.scroll(scroll,{target:{scrollTop:4400}});
 await waitFor(()=>expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({page:2,pageSize:100,keyword:''})));
 expect(screen.getByRole('columnheader',{name:'文件名'})).toBe(header);
 resolveNext({items:[{...item,id:101,fileName:'last.pdf'}],total:101,page:2,pageSize:100});await screen.findByText('last',{selector:'.file-primary'});
 expect(screen.getByRole('table')).toBe(table);expect(screen.getByText('已选 1 条')).toBeVisible();
 fireEvent.scroll(scroll,{target:{scrollTop:0}});expect(screen.getByRole('checkbox',{name:'选择 file-1.pdf'})).toBeChecked();
 expect(screen.queryByRole('navigation',{name:'PDF 分页'})).not.toBeInTheDocument();
});
it('uses one preview and explicit confirmation for a current PDF; sends only the confirmed API payload',async()=>{
 const api=fixture();render(<FilesPage api={api as never}/>);await screen.findByText('page-1',{selector:'.file-primary'});
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'排除所选文件'}));await screen.findByRole('dialog',{name:'PDF 管理预览'});
 expect(api.previewPdfManagement).toHaveBeenCalledWith({ids:[1],action:'ignore'});expect(screen.getByRole('button',{name:'确认处理'})).toBeDisabled();
 fireEvent.change(screen.getByLabelText('PDF 管理确认短语'),{target:{value:'暂不纳入 PDF'}});fireEvent.click(screen.getByRole('button',{name:'确认处理'}));
 await waitFor(()=>expect(api.applyPdfManagement).toHaveBeenCalledWith({ids:[1],action:'ignore',fingerprint:'f'.repeat(64),confirmation:'暂不纳入 PDF'}));
 await screen.findByText('已处理 1 条 PDF，保留 0 条受保护记录');expect(api.searchPdfFiles.mock.calls.length).toBeGreaterThan(1);
});
it('keeps the latest search result when scopes change rapidly and refreshes metadata when reactivated',async()=>{
 const api=fixture();let release!:(value:unknown)=>void;
 api.searchPdfFiles.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
 const view=render(<FilesPage api={api as never}/>);
 fireEvent.click(screen.getByRole('button',{name:'待关联产品'}));await screen.findByText('page-1',{selector:'.file-primary'});
 release({items:[{...item,fileName:'old.pdf'}],total:1,page:1,pageSize:50});await Promise.resolve();expect(screen.queryByText('old',{selector:'.file-primary'})).not.toBeInTheDocument();
 const calls=api.getWorkspaceSettings.mock.calls.length;view.rerender(<FilesPage api={api as never} active={false}/>);view.rerender(<FilesPage api={api as never} active/>);
 await waitFor(()=>expect(api.getWorkspaceSettings).toHaveBeenCalledTimes(calls+1));
});
it('discards an old incremental response after changing the navigation scope',async()=>{
 const api=fixture();let release!:(value:unknown)=>void;
 const records=Array.from({length:100},(_,i)=>({...item,id:i+1,fileName:`old-${i+1}.pdf`}));
 api.searchPdfFiles.mockImplementation(async(q:any)=>q.unassociatedProduct
   ?{items:[{...item,id:300,fileName:'new-scope.pdf'}],total:1,page:1,pageSize:100}
   :q.page===2?new Promise(resolve=>{release=resolve;})
   :{items:records,total:101,page:1,pageSize:100});
 const view=render(<FilesPage api={api as never}/>);await screen.findByText('old-1',{selector:'.file-primary'});
 fireEvent.scroll(view.container.querySelector('.table-wrap')!,{target:{scrollTop:4400}});
 await waitFor(()=>expect(api.searchPdfFiles).toHaveBeenCalledWith(expect.objectContaining({page:2})));
 fireEvent.click(screen.getByRole('button',{name:'待关联产品'}));
 await screen.findByText('new-scope',{selector:'.file-primary'});
 await act(async()=>{release({items:[{...item,id:101,fileName:'late-old.pdf'}],total:101,page:2,pageSize:100});});
 await waitFor(()=>expect(screen.getByText('已加载 1 / 1 条')).toBeVisible());
 expect(screen.queryByText('late-old',{selector:'.file-primary'})).not.toBeInTheDocument();
 expect(view.container.querySelector('.table-wrap')!.scrollTop).toBe(0);
});
it('shows unmatched file counts independently of pending product attribution in the compact toolbar',async()=>{
 const api={...fixture(),getPdfFileNavigation:vi.fn().mockImplementation(async(q:any)=>({total:q.matchStatus==='unmatched'?2:8,unassociatedProducts:5,categories:[],products:[],batches:[]}))};
 const view=render(<FilesPage api={api as never}/>);
 await waitFor(()=>expect(view.container.querySelector('.files-scan-toolbar')).toHaveTextContent('未匹配 2'));
 expect(view.container.querySelector('.files-scan-toolbar')).toHaveTextContent('PDF 8');
});
it('keeps the six management actions in two groups and applies each state-specific action only to eligible selections',async()=>{
 const api={...fixture(),previewPdfClassification:vi.fn(),applyPdfClassification:vi.fn()};
 api.searchPdfFiles.mockResolvedValue({items:[{...item,id:1,fileName:'normal.pdf'},{...item,id:2,fileName:'excluded.pdf',managementState:'ignored'}],total:2,page:1,pageSize:100});
 render(<FilesPage api={api as never}/>);await screen.findByText('normal',{selector:'.file-primary'});
 const toolbar=screen.getByRole('region',{name:'PDF 索引管理'});
 const groups=within(toolbar).getAllByRole('group');expect(groups).toHaveLength(2);
 expect(within(groups[0]).getAllByRole('button').map(button=>button.textContent)).toEqual(['全选','取消选择','人工归纳']);
 expect(within(groups[1]).getAllByRole('button').map(button=>button.textContent)).toEqual(['排除所选文件','恢复所选文件','移除文件记录']);
 expect(screen.getByRole('button',{name:'排除所选文件'})).toBeDisabled();expect(screen.getByRole('button',{name:'恢复所选文件'})).toBeDisabled();
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 excluded.pdf'}));expect(screen.getByRole('button',{name:'排除所选文件'})).toBeDisabled();
 fireEvent.click(screen.getByRole('button',{name:'恢复所选文件'}));await waitFor(()=>expect(api.previewPdfManagement).toHaveBeenCalledWith({ids:[2],action:'restore'}));
 fireEvent.click(screen.getByRole('button',{name:'取消'}));fireEvent.click(screen.getByRole('button',{name:'全选'}));
 fireEvent.click(screen.getByRole('button',{name:'排除所选文件'}));await waitFor(()=>expect(api.previewPdfManagement).toHaveBeenCalledWith({ids:[1],action:'ignore'}));
 fireEvent.click(screen.getByRole('button',{name:'取消'}));fireEvent.click(screen.getByRole('button',{name:'取消选择'}));expect(screen.getByText('已选 0 条')).toBeVisible();
});
function batchFixture(allowed=true){
 const batch={id:7,productId:1,name:'01.首批',relativePath:'actual/batch',displayRevision:0};
 const api={...fixture(),listProducts:vi.fn().mockResolvedValue([{id:1,sku:'SKU',model:'T40',productCategory:'洗碗机'}]),listMaterialBatches:vi.fn().mockResolvedValue([batch]),getPdfFileNavigation:vi.fn().mockResolvedValue({total:0,unassociatedProducts:0,categories:[],products:[],batches:[]}),renameMaterialBatch:vi.fn().mockResolvedValue({...batch,displayName:'生产资料'}),previewMaterialBatchDeletion:vi.fn().mockResolvedValue({id:7,name:'首批',relativePath:'actual/batch',allowed,reason:allowed?null:'批次仍被引用：PDF 人工归纳历史 1 条',references:[],fingerprint:'a'.repeat(64)}),deleteMaterialBatch:vi.fn().mockResolvedValue({deleted:7})};
 return {api,batch};
}
it('renames from the context menu and immediately refreshes the catalog without changing selected scope',async()=>{
 const {api,batch}=batchFixture();render(<FilesPage api={api as never} initialTarget={{productId:1,materialBatchId:7}}/>);
 const node=await screen.findByRole('button',{name:'批次 首批'});const searches=api.searchPdfFiles.mock.calls.length;
 fireEvent.contextMenu(node);expect(api.searchPdfFiles).toHaveBeenCalledTimes(searches);
 fireEvent.click(screen.getByRole('menuitem',{name:'重命名批次'}));const dialog=screen.getByRole('dialog',{name:'批次显示名称'});
 fireEvent.change(within(dialog).getByLabelText('批次显示名称'),{target:{value:'生产资料'}});
 api.listMaterialBatches.mockResolvedValue([{...batch,name:'生产资料',displayName:'生产资料'}] as never);
 fireEvent.click(within(dialog).getByRole('button',{name:'保存显示名称'}));
 await screen.findByRole('button',{name:'批次 生产资料'});expect(api.renameMaterialBatch).toHaveBeenCalledWith(7,{displayName:'生产资料',revision:0});
 await waitFor(()=>expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({productId:1,materialBatchId:7})));
});
it('confirms batch deletion and returns selected batch to its parent while preserving independent file filters',async()=>{
 const {api}=batchFixture();render(<FilesPage api={api as never} initialTarget={{productId:1,materialBatchId:7,fullCode:'keep-filter'}}/>);
 fireEvent.contextMenu(await screen.findByRole('button',{name:'批次 首批'}));fireEvent.click(screen.getByRole('menuitem',{name:'删除批次'}));
 const dialog=await screen.findByRole('dialog',{name:'删除批次'});expect(api.deleteMaterialBatch).not.toHaveBeenCalled();
 expect(dialog).toHaveTextContent('磁盘文件和文件夹保持保留');api.listMaterialBatches.mockResolvedValue([]);
 fireEvent.click(within(dialog).getByRole('button',{name:'确认删除批次'}));await screen.findByText('已删除批次记录');
 await waitFor(()=>{const last=api.searchPdfFiles.mock.calls.at(-1)![0];expect(last).toMatchObject({productId:1,keyword:'keep-filter',managementState:'included'});expect(last).not.toHaveProperty('materialBatchId');});
 expect(screen.queryByRole('button',{name:'批次 首批'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'产品 SKU · T40'})).toHaveAttribute('aria-current','page');
});
it('shows the actual batch reference reason and prevents confirmation when preflight is blocked',async()=>{
 const {api}=batchFixture(false);render(<FilesPage api={api as never} initialTarget={{productId:1,materialBatchId:7}}/>);
 fireEvent.contextMenu(await screen.findByRole('button',{name:'批次 首批'}));fireEvent.click(screen.getByRole('menuitem',{name:'删除批次'}));
 const dialog=await screen.findByRole('dialog',{name:'删除批次'});expect(within(dialog).getByRole('alert')).toHaveTextContent('PDF 人工归纳历史 1 条');
 expect(within(dialog).getByRole('button',{name:'确认删除批次'})).toBeDisabled();fireEvent.click(within(dialog).getByRole('button',{name:'取消'}));expect(api.deleteMaterialBatch).not.toHaveBeenCalled();
});
it('preserves the active scope and file selection when deleting another empty batch from its context menu',async()=>{
 const {api}=batchFixture();render(<FilesPage api={api as never}/>);await screen.findByText('page-1',{selector:'.file-primary'});
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'展开产品 SKU · T40'}));
 fireEvent.contextMenu(screen.getByRole('button',{name:'批次 首批'}));fireEvent.click(screen.getByRole('menuitem',{name:'删除批次'}));
 const dialog=await screen.findByRole('dialog',{name:'删除批次'});api.listMaterialBatches.mockResolvedValue([]);fireEvent.click(within(dialog).getByRole('button',{name:'确认删除批次'}));
 await screen.findByText('已删除批次记录');await waitFor(()=>expect(screen.getByRole('checkbox')).toBeChecked());expect(screen.getByText('已选 1 条')).toBeVisible();
 expect(screen.getByRole('button',{name:'全部文件'})).toHaveAttribute('aria-current','page');expect(api.searchPdfFiles.mock.calls.at(-1)![0]).not.toHaveProperty('materialBatchId');
});
it('returns a deleted orphan batch to all files while retaining the applied keyword',async()=>{
 const {api}=batchFixture();api.listProducts.mockResolvedValue([]);
 render(<FilesPage api={api as never} initialTarget={{materialBatchId:7,fullCode:'keep'}}/>);
 fireEvent.click(await screen.findByText('未关联产品批次（1）'));fireEvent.contextMenu(screen.getByRole('button',{name:'批次 首批'}));fireEvent.click(screen.getByRole('menuitem',{name:'删除批次'}));
 const dialog=await screen.findByRole('dialog',{name:'删除批次'});api.listMaterialBatches.mockResolvedValue([]);fireEvent.click(within(dialog).getByRole('button',{name:'确认删除批次'}));
 await screen.findByText('已删除批次记录');await waitFor(()=>{const last=api.searchPdfFiles.mock.calls.at(-1)![0];expect(last).toHaveProperty('keyword','keep');expect(last).not.toHaveProperty('materialBatchId');expect(last).not.toHaveProperty('productId');});
 expect(screen.getByRole('button',{name:'全部文件'})).toHaveAttribute('aria-current','page');
});
