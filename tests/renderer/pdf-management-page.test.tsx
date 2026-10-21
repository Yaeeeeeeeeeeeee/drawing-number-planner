import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { FilesPage } from '../../src/renderer/pages/FilesPage';
import { plannerQueryCache } from '../../src/renderer/data/query-cache';
const item = {id:1,fileName:'first.pdf',relativePath:'first.pdf',drawingId:null,fullCode:null,productId:null,matchStatus:'unmatched',detectedCodes:[],conversionType:'source',isPresent:true,managementState:'included'};
function fixture() { return {
 getWorkspaceSettings:vi.fn().mockResolvedValue({workspaceRoot:'/temp',configured:true,available:true}),
 listProducts:vi.fn().mockResolvedValue([]),listMaterialBatches:vi.fn().mockResolvedValue([]),
 searchPdfFiles:vi.fn().mockImplementation(async (q:any)=>({items:[{...item,id:q.page,fileName:`page-${q.page}.pdf`}],total:120,page:q.page,pageSize:q.pageSize})),
 previewPdfManagement:vi.fn().mockResolvedValue({ids:[1],action:'ignore',fingerprint:'f'.repeat(64),confirmation:'暂不纳入 PDF',entries:[{id:1,relativePath:'first.pdf',allowed:true,reason:null}],allowed:1,blocked:0}),
 applyPdfManagement:vi.fn().mockResolvedValue({changed:1,blocked:[]}),
 }; }
beforeEach(()=>{localStorage.clear();plannerQueryCache.invalidate();Object.defineProperty(window,'innerWidth',{configurable:true,value:1600});});
it('keeps headers and previous rows mounted while pagination loads, applies saved filters, and caches full page/size queries',async()=>{
 const api=fixture();let resolveNext!:(value:unknown)=>void;
 api.searchPdfFiles.mockImplementation(async(q:any)=>q.page===2?new Promise(resolve=>{resolveNext=resolve;}):({items:[{...item,fileName:'first.pdf'}],total:120,page:q.page,pageSize:q.pageSize}));
 render(<FilesPage api={api as never}/>);await screen.findByText('first',{selector:'.file-primary'});
 const header=screen.getByRole('columnheader',{name:'文件名'});
 fireEvent.change(screen.getByLabelText('文件关键词'),{target:{value:'unsaved'}});
 fireEvent.click(screen.getByRole('button',{name:'下一页'}));
 expect(screen.getByRole('columnheader',{name:'文件名'})).toBe(header);expect(screen.getByText('first',{selector:'.file-primary'})).toBeVisible();
 expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({keyword:'',page:2,pageSize:50}));
 resolveNext({items:[{...item,id:2,fileName:'second.pdf'}],total:120,page:2,pageSize:50});await screen.findByText('second',{selector:'.file-primary'});
 const calls=api.searchPdfFiles.mock.calls.length;fireEvent.click(screen.getByRole('button',{name:'上一页'}));await screen.findByText('first',{selector:'.file-primary'});expect(api.searchPdfFiles).toHaveBeenCalledTimes(calls);
 fireEvent.change(screen.getByLabelText('PDF 每页条数'),{target:{value:'25'}});await waitFor(()=>expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({keyword:'',page:1,pageSize:25})));
 expect(localStorage.getItem('planner:page-size:pdf')).toBe('25');
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
