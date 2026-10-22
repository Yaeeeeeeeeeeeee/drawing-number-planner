import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'暂不纳入已选'}));await screen.findByRole('dialog',{name:'PDF 管理预览'});
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
