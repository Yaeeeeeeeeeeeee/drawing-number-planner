import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProductsPage } from '../../src/renderer/pages/ProductsPage';
const product = {id:1,sku:'SKU',model:'M',brandId:1,brandName:'Brand',productSizeId:2,productSizeName:'Size',defaultAppearanceId:3,defaultAppearanceName:'Black',productCategory:'Category',referenceProductId:null,referenceProductModel:null,status:'active',currentAppearanceVersionId:10};
it('keeps nine product fields and the original appearance dictionary without independent version management', async()=>{
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn((type:string)=>Promise.resolve(type==='appearance'?[{id:3,code:'01',name:'Black',status:'active'}]:[])),listQrCodes:vi.fn().mockResolvedValue({items:[]}),listAppearanceVersions:vi.fn()};
 render(<ProductsPage api={api as never}/>);
 await screen.findByRole('button',{name:'编辑 M'});
 expect(screen.getAllByRole('columnheader').map(e=>e.textContent)).toEqual(['SKU','型号','品牌','产品类别','状态','说明书','售后卡','菜谱','操作']);
 expect(screen.queryByRole('button',{name:/的外观版本/})).toBeNull();
 expect(screen.queryByRole('button',{name:'产品归并'})).toBeNull();
 expect(screen.queryByLabelText('产品每页数量')).toBeNull();
 fireEvent.click(screen.getByRole('button',{name:'编辑 M'}));
 expect(screen.getByLabelText('默认外观')).toHaveValue('3');
 expect(screen.queryByRole('button',{name:'外观换代'})).toBeNull();
 expect(api.listAppearanceVersions).not.toHaveBeenCalled();
});
it('summarizes all actual product QR records and opens a product-only scope',async()=>{
 const codes=[{id:1,productId:1,key:'user_manual',status:'inactive',appearanceVersionId:10},{id:2,productId:1,key:'user_manual',status:'active',appearanceVersionId:11}];
 const api={listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:codes})};
 const open=vi.fn();render(<ProductsPage api={api as never} onOpenQr={open}/>);
 const button=await screen.findByRole('button',{name:'说明书 · 已启用'});fireEvent.click(button);
 expect(button).toHaveTextContent('2 条');expect(open).toHaveBeenCalledWith(expect.objectContaining({productId:1,model:'M'}));
 expect(open.mock.calls[0][0]).not.toHaveProperty('appearanceVersionId');
});
it('does not discard products beyond the old page-size boundary',async()=>{
 localStorage.setItem('planner:page-size:products','10');
 const api={listProducts:vi.fn().mockResolvedValue(Array.from({length:11},(_,i)=>({...product,id:i+1,model:`M${i+1}`,sku:`SKU${i+1}`}))),listDictionaries:vi.fn().mockResolvedValue([]),listQrCodes:vi.fn().mockResolvedValue({items:[]})};
 render(<ProductsPage api={api as never}/>);await screen.findByRole('button',{name:'编辑 M11'});
 expect(screen.queryByRole('button',{name:'下一页'})).toBeNull();localStorage.removeItem('planner:page-size:products');
});
