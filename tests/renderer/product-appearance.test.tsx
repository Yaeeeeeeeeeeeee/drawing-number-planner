import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProductsPage } from '../../src/renderer/pages/ProductsPage';
const product = {id:1,sku:'SKU',model:'M',brandId:1,brandName:'Brand',productSizeId:2,productSizeName:'Size',defaultAppearanceId:3,defaultAppearanceName:'Black',productCategory:'Category',referenceProductId:null,referenceProductModel:null,status:'active'};
const current={id:10,productId:1,versionNumber:1,label:'原外观',appearanceId:3,status:'current',predecessorId:null,revision:2,createdAt:'2026-01-01',activatedAt:'2026-01-01'};
it('shows nine columns and expands even a single actual appearance with scoped navigation', async()=>{
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current],productId:1,revision:4})};
 const onOpenVersion=vi.fn(); render(<ProductsPage api={api as never} onOpenVersion={onOpenVersion}/>);
 await screen.findByRole('button',{name:'展开 M 的外观版本'}); expect(screen.getAllByRole('columnheader').map(e=>e.textContent)).toEqual(['SKU','型号','品牌','产品类别','状态','说明书','售后卡','菜谱','操作']);
 fireEvent.click(screen.getByRole('button',{name:'展开 M 的外观版本'})); await screen.findByText('原外观');
 fireEvent.click(screen.getByRole('button',{name:'查看 原外观 的 BOM'})); expect(onOpenVersion).toHaveBeenCalledWith({productId:1,appearanceVersionId:10,section:'bom'});
});
it('creates a draft without activating and activates only with refreshed revisions after explicit preview', async()=>{
 const draft={...current,id:11,versionNumber:2,label:'新黑色',status:'draft',revision:1,predecessorId:10};
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([{id:3,code:'01',name:'黑色',status:'active'}]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current],productId:1,revision:4}),createAppearanceDraft:vi.fn().mockResolvedValue(draft),activateAppearanceVersion:vi.fn().mockResolvedValue({...draft,status:'current'})};
 render(<ProductsPage api={api as never}/>); fireEvent.click(await screen.findByRole('button',{name:'编辑 M'})); fireEvent.click(screen.getByRole('button',{name:'外观换代'}));
 fireEvent.change(await screen.findByLabelText('新外观名称'),{target:{value:'新黑色'}}); fireEvent.click(screen.getByRole('button',{name:'保存外观草稿'}));
 await screen.findByText('外观草稿已保存'); expect(api.activateAppearanceVersion).not.toHaveBeenCalled();
 expect(api.createAppearanceDraft).toHaveBeenCalledWith(1,expect.objectContaining({label:'新黑色',predecessorId:10}));
});
it('merge requires an explicit preview and confirms its fingerprint and selected identities',async()=>{
 const other={...product,id:2,sku:'OTHER',model:'Other'};
 const preview={primaryProductId:1,aliasProductIds:[2],revision:5,fingerprint:'abc',references:[{table:'bom_versions',ids:[7,8]}],versions:[current],qrConflicts:[{purposeId:1,qrCodeIds:[3,4]}],blockers:[]};
 const api={listProducts:vi.fn().mockResolvedValue([product,other]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),previewProductMerge:vi.fn().mockResolvedValue(preview),confirmProductMerge:vi.fn().mockResolvedValue({})};
 render(<ProductsPage api={api as never}/>); fireEvent.click(await screen.findByRole('button',{name:'产品归并'}));
 expect(api.previewProductMerge).not.toHaveBeenCalled(); fireEvent.change(screen.getByLabelText('归并目标主档案'),{target:{value:'1'}}); fireEvent.click(screen.getByLabelText('归并来源 OTHER · Other (#2)')); fireEvent.click(screen.getByRole('button',{name:'预览归并影响'}));
 await screen.findByText('bom_versions：2 条（7、8）'); expect(api.confirmProductMerge).not.toHaveBeenCalled(); fireEvent.click(screen.getByLabelText('已核对身份、引用和二维码冲突')); fireEvent.click(screen.getByRole('button',{name:'确认归并所选档案'})); await waitFor(()=>expect(api.confirmProductMerge).toHaveBeenCalledWith({primaryProductId:1,aliasProductIds:[2],confirmed:true,expectedFingerprint:'abc',expectedRevision:5}));
});
it('previews real BOM differences and sends current identity and appearance revisions only on explicit activation',async()=>{
 const draft={...current,id:11,versionNumber:2,label:'新外观',status:'draft',revision:7,predecessorId:10};
 const before={id:41,items:[{projectItemId:1,projectItemName:'纸箱',fullCode:'OLD',material:'旧纸',dimensions:'10',position:null,changeDetails:null,notes:null}]};
 const after={id:42,items:[{...before.items[0],fullCode:'NEW',material:'新纸'}]};
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current,draft],productId:1,revision:9}),getAppearanceBom:vi.fn((_:number,id:number)=>Promise.resolve(id===10?before:after)),activateAppearanceVersion:vi.fn().mockResolvedValue({...draft,status:'current'})};
 render(<ProductsPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑 M'}));fireEvent.click(screen.getByRole('button',{name:'外观换代'}));fireEvent.click(await screen.findByRole('button',{name:'预览并启用 新外观'}));
 await screen.findByRole('region',{name:'外观启用预览'});expect(screen.getByText(/纸箱：OLD · 旧纸 · 10 → NEW · 新纸 · 10/)).toBeVisible();expect(api.activateAppearanceVersion).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'确认启用此外观'}));await screen.findByText('当前外观已切换，历史版本和历史资料保留。');expect(api.activateAppearanceVersion).toHaveBeenCalledWith(11,{expectedRevision:7,expectedIdentityRevision:9});
});
it('copies the actual predecessor BOM into the saved draft without activating either version',async()=>{
 const draft={...current,id:11,status:'draft',label:'复制外观',predecessorId:10};
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current],productId:1,revision:4}),createAppearanceDraft:vi.fn().mockResolvedValue(draft),getAppearanceBom:vi.fn().mockResolvedValue({id:77,items:[]}),copyAppearanceBom:vi.fn().mockResolvedValue({version:{id:78},diff:[]}),activateAppearanceVersion:vi.fn()};
 render(<ProductsPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑 M'}));fireEvent.click(screen.getByRole('button',{name:'外观换代'}));await screen.findByText('原外观');fireEvent.change(screen.getByLabelText('新外观名称'),{target:{value:'复制外观'}});fireEvent.click(screen.getByLabelText('复制前代当前 BOM'));fireEvent.change(screen.getByLabelText('新 BOM 业务日期'),{target:{value:'2026-10-20'}});fireEvent.click(screen.getByRole('button',{name:'保存外观草稿'}));await screen.findByText('外观草稿已保存，前代 BOM 已复制；请编辑新版本物料后预览差异。');expect(api.copyAppearanceBom).toHaveBeenCalledWith(77,11,'2026-10-20');expect(api.activateAppearanceVersion).not.toHaveBeenCalled();
});
it('keeps resource records scoped to the selected appearance and marks unbound provenance separately',async()=>{
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current],productId:1,revision:4}),getAppearanceResources:vi.fn().mockResolvedValue({appearanceVersionId:10,drawings:[{id:55,fullCode:'REAL-10',displayName:'纸箱'}],pdfs:[{id:66,fileName:'REAL-10.pdf',isPresent:true}],qrCodes:[],outboundPackages:[],unboundCounts:{drawings:2,pdfs:1}})};
 render(<ProductsPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'展开 M 的外观版本'}));fireEvent.click(await screen.findByRole('button',{name:'版本资料 原外观'}));
 fireEvent.click(screen.getByRole('tab',{name:'图号'}));expect(await screen.findByText('REAL-10')).toBeVisible();expect(screen.getByText('另有 2 条未明确归属外观的记录，未列为本版本资料。')).toBeVisible();fireEvent.click(screen.getByRole('tab',{name:'PDF'}));expect(await screen.findByText('REAL-10.pdf')).toBeVisible();expect(api.getAppearanceResources).toHaveBeenCalledWith(10);
});
it('remembers the uniform product page size and moves through canonical products',async()=>{
 localStorage.setItem('planner:page-size:products','10');
 const api={listProducts:vi.fn().mockResolvedValue(Array.from({length:11},(_,index)=>({...product,id:index+1,model:`M${index+1}`,sku:`SKU${index+1}`}))),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]})};
 render(<ProductsPage api={api as never}/>);await screen.findByRole('button',{name:'展开 M1 的外观版本'});expect(screen.getByLabelText('产品每页数量')).toHaveValue('10');expect(screen.queryByRole('button',{name:'展开 M11 的外观版本'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'下一页'}));expect(screen.getByRole('button',{name:'展开 M11 的外观版本'})).toBeVisible();fireEvent.change(screen.getByLabelText('产品每页数量'),{target:{value:'25'}});expect(localStorage.getItem('planner:page-size:products')).toBe('25');localStorage.removeItem('planner:page-size:products');
});
it('saves explicitly selected color dictionary IDs on an appearance draft',async()=>{
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn((type:string)=>Promise.resolve(type==='color'?[{id:23,code:'BK',name:'黑色',status:'active'},{id:24,code:'WH',name:'白色',status:'active'}]:[])),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[{...current,colorIds:[]}],productId:1,revision:4}),createAppearanceDraft:vi.fn().mockResolvedValue({...current,id:11,label:'双色',colorIds:[23,24],status:'draft'})};
 render(<ProductsPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑 M'}));fireEvent.click(screen.getByRole('button',{name:'外观换代'}));fireEvent.change(await screen.findByLabelText('新外观名称'),{target:{value:'双色'}});fireEvent.click(screen.getByLabelText('外观颜色 BK · 黑色'));fireEvent.click(screen.getByLabelText('外观颜色 WH · 白色'));fireEvent.click(screen.getByRole('button',{name:'保存外观草稿'}));await screen.findByText('外观草稿已保存');expect(api.createAppearanceDraft).toHaveBeenCalledWith(1,expect.objectContaining({colorIds:[23,24]}));
});
it('edits only draft metadata with the loaded revision and preserves color selection',async()=>{
 const draft={...current,id:11,label:'待定双色',status:'draft',colorIds:[23],revision:7};
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn((type:string)=>Promise.resolve(type==='color'?[{id:23,code:'BK',name:'黑色',status:'active'}]:[])),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current,draft],productId:1,revision:4}),updateAppearanceDraft:vi.fn().mockResolvedValue({...draft,label:'确认黑色',revision:8}),createAppearanceDraft:vi.fn()};
 render(<ProductsPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑 M'}));fireEvent.click(screen.getByRole('button',{name:'外观换代'}));fireEvent.click(await screen.findByRole('button',{name:'编辑外观草稿 待定双色'}));expect(screen.getByLabelText('外观颜色 BK · 黑色')).toBeChecked();fireEvent.change(screen.getByLabelText('新外观名称'),{target:{value:'确认黑色'}});fireEvent.click(screen.getByRole('button',{name:'保存草稿修改'}));await screen.findByText('外观草稿已保存');expect(api.updateAppearanceDraft).toHaveBeenCalledWith(11,expect.objectContaining({label:'确认黑色',colorIds:[23],expectedRevision:7}));expect(api.createAppearanceDraft).not.toHaveBeenCalled();
});
it('includes changed attachment content in the real BOM activation difference',async()=>{
 const draft={...current,id:11,label:'换附件外观',status:'draft',colorIds:[]};
 const item={projectItemId:1,projectItemName:'说明书',fullCode:'SAME',assets:[{role:'image',originalFileName:'原图片.png',contentSha256:'a'}]};
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current,draft],productId:1,revision:4}),getAppearanceBom:vi.fn((_:number,id:number)=>Promise.resolve({id,items:[id===10?item:{...item,assets:[{role:'image',originalFileName:'新图片.png',contentSha256:'b'}]}]}))};
 render(<ProductsPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'编辑 M'}));fireEvent.click(screen.getByRole('button',{name:'外观换代'}));fireEvent.click(await screen.findByRole('button',{name:'预览并启用 换附件外观'}));await screen.findByRole('region',{name:'外观启用预览'});expect(screen.getByText(/原图片.png.*新图片.png/)).toBeVisible();expect(screen.queryByText('BOM 未发现物料差异。')).toBeNull();
});
it('restores product scroll after navigating to version data and returning',async()=>{
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn().mockResolvedValue({items:[current],productId:1,revision:4})};
 const onOpenVersion=vi.fn();const {rerender}=render(<ProductsPage api={api as never} onOpenVersion={onOpenVersion}/>);fireEvent.click(await screen.findByRole('button',{name:'展开 M 的外观版本'}));await screen.findByText('原外观');const table=document.querySelector('.table-wrap')!;table.scrollTop=140;table.scrollLeft=65;fireEvent.click(screen.getByRole('button',{name:'查看 原外观 的 图号'}));rerender(<ProductsPage api={api as never} onOpenVersion={onOpenVersion} active={false}/>);rerender(<ProductsPage api={api as never} onOpenVersion={onOpenVersion} active/>);await waitFor(()=>expect(document.querySelector('.table-wrap')?.scrollTop).toBe(140));expect(document.querySelector('.table-wrap')?.scrollLeft).toBe(65);
});
