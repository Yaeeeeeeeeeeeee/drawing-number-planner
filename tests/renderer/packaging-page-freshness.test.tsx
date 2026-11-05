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

describe('task history and metadata feedback',()=>{
  it('refreshes actual completed history on reactivation and ignores a late old history request',async()=>{
    const api=fixture();const late=pending<typeof task[]>();api.packaging.listTasks.mockReturnValueOnce(late.promise);
    const view=render(<DrawingTasksPage api={api as never}/>);
    await screen.findByRole('region',{name:'制图任务管理'});
    view.rerender(<DrawingTasksPage api={api as never} active={false}/>);
    api.packaging.listTasks.mockResolvedValue([{...task,state:'completed',model:'最新历史'}]);
    view.rerender(<DrawingTasksPage api={api as never} active/>);
    expect(await screen.findByText('最新历史')).toBeVisible();
    await act(async()=>late.resolve([task]));expect(screen.queryByText('T40',{selector:'strong'})).not.toBeInTheDocument();
  });
  it('refreshes an opened completed task while preserving its expanded dirty draft and scroll',async()=>{
    const api=fixture();const view=render(<DrawingTasksPage api={api as never}/>);
    fireEvent.click(await screen.findByRole('button',{name:'查看记录'}));const row=await screen.findByRole('region',{name:`${item.fullCode} 铭牌`});
    fireEvent.click(within(row).getByRole('button',{name:'设置 / 检查'}));fireEvent.change(within(row).getByRole('spinbutton'),{target:{value:'95'}});row.scrollTop=42;
    view.rerender(<DrawingTasksPage api={api as never} active={false}/>);
    api.packaging.getTask.mockResolvedValue({...task,state:'completed',items:[{...item,parameters:{width:81}}]});
    view.rerender(<DrawingTasksPage api={api as never} active/>);
    expect(await screen.findByText('已完成',{selector:'.pkg-task-counters span'})).toBeVisible();
    expect(screen.getByRole('region',{name:`${item.fullCode} 铭牌`})).toBe(row);expect(row.scrollTop).toBe(42);expect(within(row).getByRole('spinbutton')).toHaveValue(95);
  });
  it('shows successful catalog with failed filters, keeps successful lookups and retries',async()=>{
    const api=fixture();api.listDictionaries.mockImplementation(async(type:string)=>{if(type==='project_item')throw new Error('项目资料离线');return [];});
    render(<PackagingTemplatesPage api={api as never}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('项目资料离线');
    fireEvent.click(screen.getByRole('button',{name:'新增 AIT 模板'}));expect(screen.getByLabelText('SKU7 · T40 · SAMKYO')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'保留输入'}});
    api.listDictionaries.mockResolvedValue([]);fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
    await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument());expect(screen.getByLabelText('模板名称')).toHaveValue('保留输入');
  });
  it('distinguishes catalog filter no-results from true empty',async()=>{
    const api=fixture();api.packaging.getCatalog.mockResolvedValue({...catalog(),templates:[{id:9,name:'已存模板',fileName:'a.ait',status:'active',projectItemId:3,mainCategoryId:2,productIds:[],brandIds:[],fields:[]}] } as never);
    render(<PackagingTemplatesPage api={api as never}/>);await screen.findByText('已存模板');fireEvent.change(screen.getByLabelText('搜索'),{target:{value:'不存在'}});
    expect(screen.getByText('没有符合筛选条件的 AIT 模板。')).toBeVisible();expect(screen.queryByText(/暂无 AIT 模板/)).not.toBeInTheDocument();
  });
  it('makes failed history retryable without claiming an empty history',async()=>{
    const api=fixture();api.packaging.listTasks.mockRejectedValueOnce(new Error('历史离线'));render(<DrawingTasksPage api={api as never}/>);
    expect(await screen.findByRole('alert')).toHaveTextContent('历史离线');expect(screen.queryByText('暂无制图任务记录。')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'重试任务记录'}));expect(await screen.findByRole('button',{name:'查看记录'})).toBeVisible();
  });
});

it('retains initial successful task lookups when catalog fails and a retry loses the products resource',async()=>{
 const api=fixture();api.packaging.getCatalog.mockRejectedValueOnce(new Error('模板离线'));render(<DrawingTasksPage api={api as never}/>);
 expect(await screen.findByRole('alert')).toHaveTextContent('模板离线');api.listProducts.mockRejectedValueOnce(new Error('产品离线'));fireEvent.click(screen.getByRole('button',{name:'重新加载'}));
 expect(await screen.findByRole('option',{name:'SKU7 · T40 · SAMKYO'})).toBeInTheDocument();expect(screen.getByRole('alert')).toHaveTextContent('产品离线');
});

it('keeps a newer open detail while still accepting other history rows from the activation refresh',async()=>{
 const api=fixture();const view=render(<DrawingTasksPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'查看记录'}));await screen.findByRole('region',{name:'当前制图任务'});
 view.rerender(<DrawingTasksPage api={api as never} active={false}/>);const history=pending<typeof task[]>();api.packaging.listTasks.mockReturnValueOnce(history.promise);api.packaging.getTask.mockResolvedValue({...task,model:'最新详情'});
 view.rerender(<DrawingTasksPage api={api as never}/>);await screen.findByRole('heading',{name:'SAMKYO · 最新详情'});
 await act(async()=>history.resolve([{...task,model:'过期详情'},{...task,id:'other',model:'其他新历史',state:'completed'}]));
 // Go back starts another refresh; keep it pending so this assertion observes the activation result.
 api.packaging.listTasks.mockReturnValueOnce(new Promise(()=>{}));fireEvent.click(screen.getByRole('button',{name:'返回任务记录'}));
 expect(screen.getByText('其他新历史',{selector:'strong'})).toBeVisible();expect(screen.getByText('最新详情',{selector:'strong'})).toBeVisible();expect(screen.queryByText('过期详情',{selector:'strong'})).not.toBeInTheDocument();
});

it('keeps last good history on manual refresh failure without reporting refresh success',async()=>{
 const api=fixture();render(<DrawingTasksPage api={api as never}/>);await screen.findByRole('button',{name:'查看记录'});api.packaging.listTasks.mockRejectedValueOnce(new Error('手动刷新失败'));
 fireEvent.click(screen.getByRole('button',{name:'刷新任务记录'}));expect(await screen.findByRole('alert')).toHaveTextContent('手动刷新失败');expect(screen.getByRole('button',{name:'查看记录'})).toBeVisible();expect(screen.queryByText('任务记录已刷新')).not.toBeInTheDocument();
});
