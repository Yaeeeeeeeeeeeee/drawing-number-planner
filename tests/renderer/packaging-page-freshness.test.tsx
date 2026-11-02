import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PackagingTemplatesPage } from '../../src/renderer/pages/PackagingTemplatesPage';
import { DrawingTasksPage } from '../../src/renderer/pages/DrawingTasksPage';

const product={id:7,model:'T40',sku:'SKU7',brandId:1,brandName:'SAMKYO',productCategory:'冰柜',status:'active'};
const item={id:1,taskId:'saved-task',drawing:{origin:'planned',id:20},fullCode:'02.0404.010.0401001',projectItemId:3,projectName:'铭牌',color:'白',mode:'ait',parameters:{width:80},state:'pending'};
const task={id:'saved-task',productId:7,model:'T40',name:'首批',type:'new',state:'active',productDirectory:'冰柜/T40',taskDirectory:'冰柜/T40/00.临时文件',createdAt:'2026-11-02T00:00:00Z',items:[item],pendingFiles:[]};
function catalog(){return {templates:[],dimensions:[],rules:[],configs:[{projectItemId:3,mode:'ait',parameters:[{key:'width',label:'宽度',type:'number',required:true,unit:'mm'}]}]};}
function fixture(){return {
  listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockImplementation(async(type:string)=>type==='project_item'?[{id:3,name:'铭牌',code:'01',parentId:2,status:'active'}]:type==='main_category'?[{id:2,name:'印刷件',code:'04',status:'active'}]:[]),
  searchDrawings:vi.fn().mockResolvedValue({items:[],total:0}),
  packaging:{getCatalog:vi.fn().mockResolvedValue(catalog()),listTasks:vi.fn().mockResolvedValue([task]),getTask:vi.fn().mockResolvedValue(task),getProductDirectories:vi.fn().mockResolvedValue([{productId:7,relativePath:'冰柜/T40',exists:true}]),updateItem:vi.fn()},
};}
function pending<T>(){let resolve!:(value:T)=>void;let reject!:(reason:Error)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}

describe('mounted packaging page reactivation',()=>{
  it('refreshes catalog lookups once per activation without unmounting the template draft',async()=>{
    const api=fixture();const view=render(<PackagingTemplatesPage api={api as never} active/>);
    fireEvent.click(await screen.findByRole('button',{name:'新增 AIT 模板'}));fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'未保存的模板'}});
    const form=screen.getByRole('form',{name:'AIT 模板编辑'});expect(api.packaging.getCatalog).toHaveBeenCalledTimes(1);
    view.rerender(<PackagingTemplatesPage api={api as never} active={false}/>);
    const refresh=pending<ReturnType<typeof catalog>>();api.packaging.getCatalog.mockReturnValueOnce(refresh.promise);
    api.listProducts.mockResolvedValue([product,{...product,id:8,model:'T80',sku:'SKU8'}]);
    view.rerender(<PackagingTemplatesPage api={api as never} active/>);
    await waitFor(()=>expect(api.packaging.getCatalog).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('form',{name:'AIT 模板编辑'})).toBe(form);expect(screen.queryByText('加载包材资料…')).not.toBeInTheDocument();
    await act(async()=>{refresh.resolve(catalog());});
    expect(await within(form).findByLabelText('SKU8 · T80 · SAMKYO')).toBeVisible();expect(screen.getByLabelText('模板名称')).toHaveValue('未保存的模板');
    view.rerender(<PackagingTemplatesPage api={api as never} active/>);expect(api.packaging.getCatalog).toHaveBeenCalledTimes(2);
  });
  it('retains catalog data and editor after refresh failure and retries without losing drafts',async()=>{
    const api=fixture();const view=render(<PackagingTemplatesPage api={api as never}/>);
    fireEvent.click(await screen.findByRole('button',{name:'新增 AIT 模板'}));fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'保留草稿'}});
    view.rerender(<PackagingTemplatesPage api={api as never} active={false}/>);api.packaging.getCatalog.mockRejectedValueOnce(new Error('资料读取失败'));
    view.rerender(<PackagingTemplatesPage api={api as never} active/>);expect(await screen.findByRole('alert')).toHaveTextContent('资料读取失败');expect(screen.getByLabelText('模板名称')).toHaveValue('保留草稿');
    fireEvent.click(screen.getByRole('button',{name:'重新加载'}));await waitFor(()=>expect(screen.queryByText('资料读取失败')).not.toBeInTheDocument());expect(screen.getByLabelText('模板名称')).toHaveValue('保留草稿');
  });
  it('ignores an older catalog response after a newer activation has loaded',async()=>{
    const api=fixture();const first=pending<ReturnType<typeof catalog>>();api.packaging.getCatalog.mockReturnValueOnce(first.promise);
    const view=render(<PackagingTemplatesPage api={api as never} active/>);
    view.rerender(<PackagingTemplatesPage api={api as never} active={false}/>);
    api.listProducts.mockResolvedValue([product,{...product,id:8,model:'T80',sku:'SKU8'}]);view.rerender(<PackagingTemplatesPage api={api as never} active/>);
    fireEvent.click(await screen.findByRole('button',{name:'新增 AIT 模板'}));expect(await screen.findByLabelText('SKU8 · T80 · SAMKYO')).toBeVisible();
    const stale={...catalog(),templates:[{id:99,name:'过期模板'}]};await act(async()=>{first.resolve(stale as never);});
    expect(screen.queryByText('过期模板')).not.toBeInTheDocument();expect(screen.getByLabelText('SKU8 · T80 · SAMKYO')).toBeVisible();
  });
  it('refreshes task products, templates and config while retaining the selected task and unsaved dimensions',async()=>{
    const api=fixture();const view=render(<DrawingTasksPage api={api as never} active/>);
    fireEvent.click(await screen.findByRole('button',{name:'查看记录'}));const row=await screen.findByRole('region',{name:`${item.fullCode} 铭牌`});fireEvent.click(within(row).getByRole('button',{name:'设置 / 检查'}));
    fireEvent.change(within(row).getByRole('spinbutton',{name:'宽度 (mm)'}),{target:{value:'95'}});
    view.rerender(<DrawingTasksPage api={api as never} active={false}/>);const refresh=pending<ReturnType<typeof catalog>>();api.packaging.getCatalog.mockReturnValueOnce(refresh.promise);
    api.listProducts.mockResolvedValue([product,{...product,id:8,model:'T80',sku:'SKU8'}]);view.rerender(<DrawingTasksPage api={api as never} active/>);
    await waitFor(()=>expect(api.packaging.getCatalog).toHaveBeenCalledTimes(2));expect(screen.getByRole('region',{name:`${item.fullCode} 铭牌`})).toBe(row);expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(95);
    const next={...catalog(),templates:[{id:9,name:'新 AIT',projectItemId:3,status:'active',productIds:[],brandIds:[]}],configs:[{projectItemId:3,mode:'ait',parameters:[...catalog().configs[0].parameters,{key:'length',label:'长',type:'number',required:true,unit:'mm',axis:'length'}]}]};
    await act(async()=>{refresh.resolve(next as never);});
    expect(await within(row).findByRole('option',{name:'新 AIT'})).toBeInTheDocument();expect(within(row).getByRole('spinbutton',{name:'长 (mm)'})).toBeVisible();expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(95);
    expect(screen.queryByText('加载任务资料…')).not.toBeInTheDocument();expect(api.packaging.updateItem).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'返回任务记录'}));expect(await screen.findByRole('option',{name:'SKU8 · T80 · SAMKYO'})).toBeInTheDocument();
  });
  it('retains an opened task and dirty settings after a background refresh failure',async()=>{
    const api=fixture();const view=render(<DrawingTasksPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'查看记录'}));const row=await screen.findByRole('region',{name:`${item.fullCode} 铭牌`});fireEvent.click(within(row).getByRole('button',{name:'设置 / 检查'}));fireEvent.change(within(row).getByRole('spinbutton',{name:'宽度 (mm)'}),{target:{value:'95'}});
    view.rerender(<DrawingTasksPage api={api as never} active={false}/>);api.packaging.getCatalog.mockRejectedValueOnce(new Error('任务资料刷新失败'));view.rerender(<DrawingTasksPage api={api as never} active/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('任务资料刷新失败');expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(95);
    fireEvent.click(screen.getByRole('button',{name:'重新加载'}));await waitFor(()=>expect(screen.queryByText('任务资料刷新失败')).not.toBeInTheDocument());expect(screen.getByRole('region',{name:`${item.fullCode} 铭牌`})).toBe(row);expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(95);
  });
  it('does not request inactive pages and retries a failed first task load normally',async()=>{
    const api=fixture();api.packaging.getCatalog.mockRejectedValueOnce(new Error('首次读取失败'));const view=render(<DrawingTasksPage api={api as never} active={false}/>);expect(api.packaging.getCatalog).not.toHaveBeenCalled();
    view.rerender(<DrawingTasksPage api={api as never} active/>);expect(await screen.findByRole('alert')).toHaveTextContent('首次读取失败');expect(screen.queryByRole('region',{name:'制图任务管理'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'重新加载'}));expect(await screen.findByRole('region',{name:'制图任务管理'})).toBeVisible();expect(api.packaging.getCatalog).toHaveBeenCalledTimes(2);
  });
});
