import {fireEvent,render,screen,waitFor,within} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {PackageBuilder} from '../../src/renderer/pages/outbound/PackageBuilder';
import {PackageResult} from '../../src/renderer/pages/outbound/PackageResult';
it('filters brand/category/model by real IDs and renders every file without redundant controls/history',async()=>{
 const products=[{id:11,brandId:1,productSizeId:10,productCategory:'类别甲',model:'T40',sku:'甲'},{id:12,brandId:1,productSizeId:10,productCategory:'类别甲',model:'T40',sku:'乙'},{id:13,brandId:1,productSizeId:20,productCategory:'类别乙',model:'T40',sku:'丙'},{id:14,brandId:2,productSizeId:10,productCategory:'类别甲',model:'T40',sku:'丁'}];
 const items=Array.from({length:151},(_,i)=>({pdfFileId:i+1,fileName:`file${i}.pdf`,projectItemName:`项目${i}`,status:'normal',change:'new',selectable:true}));
 const api={listProducts:vi.fn().mockResolvedValue(products),listDictionaries:vi.fn().mockResolvedValue([{id:1,name:'品牌甲'},{id:2,name:'品牌乙'}]),listMaterialBatches:vi.fn().mockResolvedValue([{id:1,name:'20261026',isPresent:true,recognitionStatus:'recognized'}]),previewOutboundPackage:vi.fn().mockResolvedValue({packageName:'本次包',items,warnings:['不应常驻'],bomCheck:{status:'missing',missingFullCodes:[],extraPdfFileIds:[]}}),listOutboundPackages:vi.fn()};
 render(<PackageBuilder api={api as never} onPackage={()=>{}}/>);
 await within(screen.getByLabelText('品牌')).findByRole('option',{name:'品牌甲'});fireEvent.change(screen.getByLabelText('品牌'),{target:{value:'1'}});
 fireEvent.change(screen.getByLabelText('产品类别'),{target:{value:'类别甲'}});
 expect(within(screen.getByLabelText('产品型号')).getAllByRole('option').map(x=>x.getAttribute('value'))).toEqual(['','11','12']);
 fireEvent.change(screen.getByLabelText('产品型号'),{target:{value:'12'}});await waitFor(()=>expect(api.listMaterialBatches).toHaveBeenCalledWith({productId:12}));
 await within(screen.getByLabelText('资料批次')).findByRole('option',{name:'20261026'});fireEvent.change(screen.getByLabelText('资料批次'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'预览文件'}));
 expect(await screen.findByText('file150.pdf')).toBeVisible();expect(screen.getByRole('table',{name:'外发文件预览'}).querySelectorAll('input[type=checkbox]')).toHaveLength(151);
 for(const label of ['搜索外发文件','资料状态筛选','外发每页条数'])expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
 for(const name of ['添加额外资料','上一页','下一页','只选本次变更'])expect(screen.queryByRole('button',{name})).not.toBeInTheDocument();
 expect(screen.queryByText('不应常驻')).not.toBeInTheDocument();expect(api.listOutboundPackages).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'取消全选'}));expect(screen.getByRole('button',{name:'生成压缩包'})).toBeDisabled();fireEvent.click(screen.getByRole('button',{name:'全选可用文件'}));expect(screen.getByRole('button',{name:'生成压缩包'})).toBeEnabled();
 fireEvent.change(screen.getByLabelText('产品类别'),{target:{value:'类别乙'}});expect(screen.getByLabelText('产品型号')).toHaveValue('');
},30000);
it('shows actual per-part counts and only part-level path/open controls',()=>{
 render(<PackageResult value={{id:1,fileCount:3,parts:[{partNumber:1,zipRelativePath:'a.zip',sizeBytes:123,fileCount:1},{partNumber:2,zipRelativePath:'b.zip',sizeBytes:456,fileCount:2}]} as never}/>);
 expect(screen.getByText('1 个')).toBeVisible();expect(screen.getByText('2 个')).toBeVisible();expect(screen.queryByText('压缩包已生成')).not.toBeInTheDocument();expect(screen.queryByRole('button',{name:/^打开位置$/})).not.toBeInTheDocument();
});

it('keeps independent product categories even when their size dictionary ID is shared',async()=>{
 const products=[{id:11,brandId:1,productSizeId:10,productCategory:'类别甲',model:'M1'},{id:12,brandId:1,productSizeId:10,productCategory:'类别乙',model:'M2'}];
 const api={listProducts:vi.fn().mockResolvedValue(products),listDictionaries:vi.fn().mockResolvedValue([{id:1,name:'品牌甲'}]),listMaterialBatches:vi.fn().mockResolvedValue([])};
 render(<PackageBuilder api={api as never} onPackage={()=>{}}/>);
 await within(screen.getByLabelText('品牌')).findByRole('option',{name:'品牌甲'});
 expect(within(screen.getByLabelText('产品类别')).getAllByRole('option').map(x=>x.textContent)).toEqual(['请选择','类别甲','类别乙']);
 fireEvent.change(screen.getByLabelText('产品类别'),{target:{value:'类别甲'}});
 expect(within(screen.getByLabelText('产品型号')).getAllByRole('option').map(x=>x.getAttribute('value'))).toEqual(['','11']);
});
