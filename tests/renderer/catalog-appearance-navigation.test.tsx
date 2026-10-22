import {render,screen,fireEvent,within} from '@testing-library/react';
import {it,expect,vi} from 'vitest';
import {ProductCatalogNavigation} from '../../src/renderer/components/ProductCatalogNavigation';
const product={id:1,model:'ZC100',sku:'SKFZC100JP',productCategory:'冰柜'} as never;
const versions=[{id:10,productId:1,label:'2号外观',status:'current',colorIds:[]},{id:11,productId:1,label:'1号外观',status:'historical',colorIds:[]}] as never;
const batches=[{id:20,productId:1,name:'20260422',displayName:'第二批显示名',relativePath:'ZC100/second',recognitionStatus:'recognized'},{id:21,productId:1,name:'首批大货',relativePath:'ZC100/first',recognitionStatus:'recognized'}] as never;
it('renders real batches once directly below products and keeps legacy version metadata invisible',()=>{
 const select=vi.fn();render(<ProductCatalogNavigation mode="files" products={[product]} appearances={versions} batches={batches} counts={{total:5,categories:[{name:'冰柜',count:5}],products:[{productId:1,count:5}],batches:[{materialBatchId:20,productId:1,count:3},{materialBatchId:21,productId:1,count:2}],appearanceBatches:[{appearanceVersionId:10,productId:1,materialBatchId:20,count:3}],unassociated:0}} scope={{kind:'product',productId:1}} onSelect={select}/>);
 expect(screen.queryByRole('button',{name:'外观 2号外观'})).not.toBeInTheDocument();
 expect(screen.getAllByRole('button',{name:'批次 第二批显示名'})).toHaveLength(1);
 expect(screen.getByRole('button',{name:'批次 首批大货'})).toBeVisible();
 expect(screen.queryByText('使用未确定')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'批次 第二批显示名'}));expect(select).toHaveBeenLastCalledWith({kind:'batch',productId:1,batchId:20});
 fireEvent.click(screen.getByRole('button',{name:'待关联产品'}));expect(select).toHaveBeenLastCalledWith({kind:'unassociated'});
});
it('keeps model-only drawing labels and automatically reveals matching parents during search',()=>{
 const select=vi.fn();render(<ProductCatalogNavigation mode="drawings" products={[product]} appearances={versions} batches={[]} counts={{total:3,categories:[{name:'冰柜',count:3}],products:[{productId:1,count:3}],batches:[],appearances:[{appearanceVersionId:10,count:3}],unassociated:0}} scope={{kind:'all'}} onSelect={select}/>);
 fireEvent.click(screen.getByRole('button',{name:'收起分类 冰柜'}));fireEvent.change(screen.getByLabelText('搜索产品 SKU 或型号'),{target:{value:'SKFZ'}});
 expect(screen.getByRole('button',{name:'产品 ZC100'})).toBeVisible();expect(screen.queryByRole('button',{name:'外观 2号外观'})).not.toBeInTheDocument();expect(screen.queryByText('SKFZC100JP · ZC100')).not.toBeInTheDocument();
});
