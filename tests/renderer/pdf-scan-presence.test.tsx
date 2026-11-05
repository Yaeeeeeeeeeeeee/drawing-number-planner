import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {beforeEach,expect,it,vi} from 'vitest';
import {FilesPage} from '../../src/renderer/pages/FilesPage';
import {plannerQueryCache} from '../../src/renderer/data/query-cache';
const file={id:1,fileName:'source.pdf',relativePath:'洗碗机/SKU-T40/02.未转曲源文件/source.pdf',isPresent:true,scannedAt:'2026-11-05T01:00:00Z',matchStatus:'unmatched',conversionType:'source',detectedCodes:[],managementState:'included'};
function fixture(){return {getWorkspaceSettings:vi.fn().mockResolvedValue({configured:true,available:true,workspaceRoot:'/library'}),listProducts:vi.fn().mockResolvedValue([{id:1,model:'T40',sku:'SKU',productCategory:'洗碗机',status:'active'}]),listMaterialBatches:vi.fn().mockResolvedValue([]),searchPdfFiles:vi.fn().mockResolvedValue({items:[file],total:1,page:1,pageSize:100}),getPdfFileNavigation:vi.fn().mockResolvedValue({total:1,unassociatedProducts:0,categories:[{name:'洗碗机',count:1}],products:[{productId:1,count:1}],batches:[]}),getPdfFilePresence:vi.fn().mockResolvedValue({id:1,scanIsPresent:true,scannedAt:file.scannedAt,checkedAt:'2026-11-05T02:00:00Z',status:'missing',message:'磁盘文件不存在'}),packaging:{scanProduct:vi.fn(),scanCategory:vi.fn().mockResolvedValue({scanId:2,currentTotal:1,scannedAt:'2026-11-05T02:00:00Z',comparison:{scope:{kind:'products',productDirectories:['洗碗机/SKU-T40']}}})},scanPdfFiles:vi.fn()};}
beforeEach(()=>{localStorage.clear();plannerQueryCache.invalidate();Object.defineProperty(window,'innerWidth',{configurable:true,value:1600});});
it('scans the explicitly selected category rather than the model or entire library',async()=>{
  const api=fixture();render(<FilesPage api={api as never}/>);await screen.findByText('source',{selector:'.file-primary'});
  expect(screen.getByRole('button',{name:'扫描当前类别'})).toBeDisabled();fireEvent.click(await screen.findByRole('button',{name:'分类 洗碗机'}));
  fireEvent.click(screen.getByRole('button',{name:'扫描当前类别'}));await waitFor(()=>expect(api.packaging.scanCategory).toHaveBeenCalledWith('洗碗机'));
  expect(api.packaging.scanProduct).not.toHaveBeenCalled();expect(api.scanPdfFiles).not.toHaveBeenCalled();await screen.findByText('当前类别扫描完成');
});
it('shows last-scan presence in the list and checks only the expanded file in real time',async()=>{
  const api=fixture();render(<FilesPage api={api as never}/>);await screen.findByText('source',{selector:'.file-primary'});
  expect(api.getPdfFilePresence).not.toHaveBeenCalled();expect(screen.getByText('上次扫描：存在')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'查看 source.pdf 的完整相对路径'}));
  expect(await screen.findByText('当前核实：磁盘文件不存在')).toBeVisible();expect(api.getPdfFilePresence).toHaveBeenCalledTimes(1);expect(api.getPdfFilePresence).toHaveBeenCalledWith(1);
  expect(screen.getByText('上次扫描：存在')).toBeVisible();expect(api.scanPdfFiles).not.toHaveBeenCalled();
});
