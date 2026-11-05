import {fireEvent,render,screen,within} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {ProductCatalogNavigation} from '../../src/renderer/components/ProductCatalogNavigation';
const batch={id:4,name:'01.首批',relativePath:'library/01.首批',productId:1,currentState:'current'};
const counts={total:1,categories:[],products:[],batches:[],unassociated:0};
afterEach(()=>vi.restoreAllMocks());
function fixture(orphan=false){
 const onSelect=vi.fn(),onRenameBatch=vi.fn(),onDeleteBatch=vi.fn();
 render(<ProductCatalogNavigation mode="files" products={orphan?[]:[{id:1,sku:'SKU',model:'T40',productCategory:'洗碗机'}] as never} batches={[{...batch,productId:orphan?null:1}] as never} counts={counts} scope={orphan?{kind:'all'}:{kind:'product',productId:1}} {...{onSelect,onRenameBatch,onDeleteBatch}}/>);
 if(orphan)fireEvent.click(screen.getByText('未关联产品批次（1）'));
 return {onSelect,onRenameBatch,onDeleteBatch,node:screen.getByRole('button',{name:'批次 首批'})};
}
it.each([false,true])('offers exactly rename and delete on right click without selecting (orphan=%s)',orphan=>{
 const api=fixture(orphan);
 expect(screen.queryByRole('button',{name:/重命名/})).not.toBeInTheDocument();
 fireEvent.contextMenu(api.node,{clientX:120,clientY:160});
 expect(api.onSelect).not.toHaveBeenCalled();
 const menu=screen.getByRole('menu',{name:'批次操作'});
 expect(within(menu).getAllByRole('menuitem').map(item=>item.textContent)).toEqual(['重命名批次','删除批次']);
 expect(within(menu).getByRole('separator')).toBeInTheDocument();
 fireEvent.click(within(menu).getByRole('menuitem',{name:'重命名批次'}));
 expect(api.onRenameBatch).toHaveBeenCalledWith(expect.objectContaining({id:4}));
 expect(api.onSelect).not.toHaveBeenCalled();expect(screen.queryByRole('menu')).not.toBeInTheDocument();
 fireEvent.click(api.node);expect(api.onSelect).toHaveBeenCalledWith({kind:'batch',productId:orphan?undefined:1,batchId:4});
});
it('clamps the menu to the viewport and closes on Escape and outside click',()=>{
 vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({width:168,height:82} as DOMRect);
 Object.defineProperty(window,'innerWidth',{configurable:true,value:500});Object.defineProperty(window,'innerHeight',{configurable:true,value:400});
 const api=fixture();fireEvent.contextMenu(api.node,{clientX:499,clientY:399});
 expect(screen.getByRole('menu')).toHaveStyle({left:'324px',top:'310px'});
 fireEvent.keyDown(document,{key:'Escape'});expect(screen.queryByRole('menu')).not.toBeInTheDocument();expect(api.node).toHaveFocus();
 fireEvent.contextMenu(api.node);fireEvent.pointerDown(document.body);expect(screen.queryByRole('menu')).not.toBeInTheDocument();
 fireEvent.contextMenu(api.node);fireEvent.click(document.body);expect(screen.queryByRole('menu')).not.toBeInTheDocument();
 expect(api.onSelect).not.toHaveBeenCalled();
 fireEvent.contextMenu(api.node);fireEvent.click(screen.getByRole('menuitem',{name:'删除批次'}));expect(api.onDeleteBatch).toHaveBeenCalledWith(expect.objectContaining({id:4}));expect(api.onSelect).not.toHaveBeenCalled();
});

it('renders source files as a counted product node without a batch state or batch menu',()=>{
 const onSelect=vi.fn();
 render(<ProductCatalogNavigation mode="files" products={[{id:1,sku:'SKU',model:'T40',productCategory:'洗碗机'}] as never} batches={[]} counts={{total:3,categories:[{name:'洗碗机',count:3}],products:[{productId:1,count:3}],sources:[{productId:1,count:3}],batches:[],unassociated:0}} scope={{kind:'product',productId:1}} onSelect={onSelect}/>);
 const source=screen.getByRole('button',{name:'未转曲源文件'});
 expect(source).toHaveTextContent('3');expect(source).not.toHaveTextContent('当前批次');expect(source).not.toHaveTextContent('历史批次');
 fireEvent.click(source);expect(onSelect).toHaveBeenCalledWith({kind:'source',productId:1});
 fireEvent.contextMenu(source);expect(screen.queryByRole('menu')).toBeNull();
});

it('gives every batch action an icon and marks deletion as dangerous',()=>{
 const api=fixture();fireEvent.contextMenu(api.node);
 const actions=screen.getAllByRole('menuitem');expect(actions.every(action=>action.querySelector('svg'))).toBe(true);
 expect(screen.getByRole('menuitem',{name:'删除批次'})).toHaveClass('pdf-batch-delete');
});
