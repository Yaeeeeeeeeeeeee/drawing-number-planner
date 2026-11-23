import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingTasksPage } from '../../src/renderer/pages/DrawingTasksPage';
import type { PackagingNavigationTarget } from '../../src/renderer/pages/packaging/PackagingTaskPanel';

function expandItem(row:HTMLElement){
  const button=within(row).getByRole('button',{name:/^展开或收起/});
  if(button.getAttribute('aria-expanded')==='false')fireEvent.click(button);
}

const product={id:7,model:'T40',sku:'SKU7',brandId:1,brandName:'SAMKYO',productCategory:'冰柜',status:'active'};
const item={id:1,taskId:'persisted-task-uuid',drawing:{origin:'planned',id:20},fullCode:'02.0404.010.0401001',projectItemId:3,projectName:'铭牌',color:'白',mode:'ait',parameters:{width:80},state:'pending'};
const task={id:'persisted-task-uuid',productId:7,model:'T40',name:'原任务名称',type:'new',state:'active',productDirectory:'冰柜/T40',taskDirectory:'冰柜/T40/00.临时文件/旧任务目录',createdAt:'2026-11-02T03:34:53.572Z',items:[item],pendingFiles:[]};
function fixture(){
  const packaging={
    getCatalog:vi.fn().mockResolvedValue({templates:[],dimensions:[],rules:[],configs:[{projectItemId:3,mode:'ait',parameters:[{key:'width',label:'宽度',type:'number',required:true,unit:'mm'}]}]}),
    listTasks:vi.fn().mockResolvedValue([task]),getTask:vi.fn().mockResolvedValue(task),getProductDirectories:vi.fn().mockResolvedValue([{productId:7,relativePath:'冰柜/T40',exists:true}]),
    createTask:vi.fn().mockResolvedValue(task),updateItem:vi.fn(),generate:vi.fn(),archive:vi.fn(),archivePreview:vi.fn().mockResolvedValue({taskId:task.id,ready:true,blockers:[],files:[]}),
    discover:vi.fn(),linkFile:vi.fn(),reviewItem:vi.fn(),itemFileUrl:vi.fn().mockReturnValue('/preview.pdf'),itemBackupUrl:vi.fn().mockReturnValue('/backup.pdf'),openItem:vi.fn(),
    createTemporaryDirectories:vi.fn().mockResolvedValue({items:[]}),
    deletionPreview:vi.fn().mockResolvedValue({taskId:task.id,productId:7,model:'T40',state:'active',createdAt:task.createdAt,token:'preview-token',canDelete:true,fileCount:1,releasesLock:true}),
    deleteTask:vi.fn().mockResolvedValue({id:task.id,deleted:true}),
  };
  return {listProducts:vi.fn().mockResolvedValue([product]),listDictionaries:vi.fn().mockResolvedValue([]),searchDrawings:vi.fn().mockResolvedValue({items:[{...item,id:20,origin:'planned',productId:7,projectItemName:'铭牌',colorName:'白',status:'active'}],total:1}),packaging};
}
async function openDelete(){
  fireEvent.click(await screen.findByText('更多操作'));
  fireEvent.click(screen.getByRole('button',{name:'删除任务记录'}));
}
async function open(api:ReturnType<typeof fixture>){
  render(<DrawingTasksPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:/^(继续任务|查看记录)$/}));
  return screen.findByRole('region',{name:`${item.fullCode} 铭牌`});
}
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();});

describe('independent drawing task page',()=>{
  it('creates from reserved references without names, directory prompts or reselecting drawings',async()=>{
    const api=fixture();api.packaging.listTasks.mockResolvedValue([]);
    const target:PackagingNavigationTarget={productId:7,drawings:[{origin:'planned',id:20}],revision:1};
    const view=render(<DrawingTasksPage api={api as never} target={target}/>);
    const create=await screen.findByRole('button',{name:'创建任务'});
    await waitFor(()=>expect(create).toBeEnabled());
    expect(screen.queryByLabelText('任务名称')).not.toBeInTheDocument();expect(screen.queryByLabelText('实际产品目录')).not.toBeInTheDocument();
    expect(within(screen.getByRole('group',{name:'本次已占号图号'})).queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'检查 0 个产品并创建临时文件夹',hidden:true})).not.toBeVisible();
    fireEvent.click(create);await waitFor(()=>expect(api.packaging.createTask).toHaveBeenCalledWith({productId:7,type:'new',productDirectory:'冰柜/T40',drawings:target.drawings}));
    expect(api.packaging.createTemporaryDirectories).not.toHaveBeenCalled();
    await screen.findByRole('region',{name:'当前制图任务'});
    view.rerender(<DrawingTasksPage api={api as never} target={{...target,drawings:[...target.drawings]}}/>);
    expect(screen.getByRole('region',{name:'当前制图任务'})).toBeVisible();
  });
  it('continues an unfinished task with compact rows and preserves its historical directory',async()=>{
    const api=fixture();render(<DrawingTasksPage api={api as never} target={{productId:7,drawings:[{origin:'planned',id:20}]}}/>);
    fireEvent.click(await screen.findByRole('button',{name:'继续任务'}));
    const row=await screen.findByRole('region',{name:`${item.fullCode} 铭牌`});
    expect(screen.getByRole('heading',{name:'SAMKYO · T40'})).toBeVisible();
    expect(screen.getByText('任务标识：persisted-task-uuid')).not.toBeVisible();expect(screen.getByText(`任务目录：${task.taskDirectory}`)).not.toBeVisible();
    expect(within(row).getByRole('button',{name:/^展开或收起/})).toHaveAttribute('aria-expanded','true');
    expandItem(row);
    expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(80);
    expect(api.packaging.createTask).not.toHaveBeenCalled();expect(api.packaging.createTemporaryDirectories).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button',{name:'人工制作'}));
    expect(within(row).queryByRole('spinbutton')).not.toBeInTheDocument();
  });
  it('preserves unsaved dimensions through polling and blocks batch generation and archive',async()=>{
    let poll=()=>{};const interval=window.setInterval.bind(window);vi.spyOn(window,'setInterval').mockImplementation((callback,delay,...args)=>{if(delay===3000){poll=callback as ()=>void;return interval(()=>{},999999) as unknown as ReturnType<typeof window.setInterval>;}return interval(callback,delay,...args) as unknown as ReturnType<typeof window.setInterval>;});
    const api=fixture();const row=await open(api);expandItem(row);
    fireEvent.change(within(row).getByRole('spinbutton',{name:'宽度 (mm)'}),{target:{value:'95'}});
    api.packaging.getTask.mockResolvedValue({...task,items:[{...item,parameters:{width:85}}]});
    await act(async()=>{poll();});expect(api.packaging.getTask).toHaveBeenCalledTimes(2);
    expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(95);
    expect(screen.getByRole('button',{name:'批量生成待处理项目'})).toBeDisabled();expect(screen.getByRole('button',{name:'归档预览'})).toBeDisabled();
    fireEvent.click(within(row).getByRole('button',{name:/^展开或收起/}));expandItem(row);
    expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(95);
  });
  it('automatically rematches changed dimensions while retaining an explicit template choice',async()=>{
    const api=fixture();const templates=[{id:9,name:'模板 A',status:'active',projectItemId:3,productIds:[7]},{id:10,name:'模板 B',status:'active',projectItemId:3,productIds:[7]}];
    api.packaging.getCatalog.mockResolvedValue({templates,dimensions:[],rules:[],configs:[{projectItemId:3,mode:'ait',parameters:[{key:'width',label:'宽度',type:'number',required:true,unit:'mm'}]}]});
    const matched={...item,templateId:9,templateName:'模板 A',match:{status:'unique',templateIds:[9],missingParameters:[]}};
    api.packaging.getTask.mockResolvedValue({...task,items:[matched]});
    api.packaging.updateItem.mockImplementation(async(_task:string,_item:number,input:object)=>({...task,items:[{...matched,...input}]}));
    const row=await open(api);expandItem(row);
    fireEvent.change(within(row).getByRole('spinbutton',{name:'宽度 (mm)'}),{target:{value:'90'}});fireEvent.click(within(row).getByRole('button',{name:'保存本次设置'}));
    await waitFor(()=>expect(api.packaging.updateItem).toHaveBeenLastCalledWith(task.id,1,expect.objectContaining({parameters:{width:90},templateId:undefined})));
    await waitFor(()=>expect(within(row).getByRole('button',{name:'保存本次设置'})).toBeDisabled());
    fireEvent.change(within(row).getByLabelText('本次模板'),{target:{value:'10'}});fireEvent.change(within(row).getByRole('spinbutton',{name:'宽度 (mm)'}),{target:{value:'100'}});
    fireEvent.click(within(row).getByRole('button',{name:'保存本次设置'}));
    await waitFor(()=>expect(api.packaging.updateItem).toHaveBeenLastCalledWith(task.id,1,expect.objectContaining({parameters:{width:100},templateId:10})));
  });
  it('links ambiguous manual files and reviews only the associated current hash',async()=>{
    const api=fixture();const manual={...item,mode:'manual',state:'awaiting_upload'};api.packaging.getTask.mockResolvedValue({...task,items:[manual]});
    const pending={id:31,fileName:'待关联.pdf',relativePath:'T40/00.临时文件/待关联.pdf',status:'pending',reason:'存在多个候选项目'};
    api.packaging.discover.mockResolvedValue({...task,items:[manual],pendingFiles:[pending]});
    const linked={...manual,state:'awaiting_review',sha256:'linked-current-hash',fileName:pending.fileName};
    Object.assign(api.packaging,{linkFile:vi.fn().mockResolvedValue({...task,items:[linked],pendingFiles:[{...pending,status:'linked'}]})});
    api.packaging.reviewItem.mockResolvedValue({...task,items:[{...linked,state:'completed',reviewedSha256:linked.sha256}],pendingFiles:[]});
    const row=await open(api);fireEvent.click(screen.getByRole('button',{name:'识别人工文件'}));
    fireEvent.change(await screen.findByLabelText('待关联.pdf 关联项目'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'确认关联'}));
    await waitFor(()=>expect(api.packaging.linkFile).toHaveBeenCalledWith(task.id,31,1));
    expandItem(row);
    fireEvent.click(within(row).getByLabelText('已检查当前 PDF 内容'));fireEvent.click(within(row).getByRole('button',{name:'确认当前文件'}));
    await waitFor(()=>expect(api.packaging.reviewItem).toHaveBeenCalledWith(task.id,1,'linked-current-hash'));
  });
  it('requires explicit regeneration and invalidates archive confirmation when the file changes',async()=>{
    let poll=()=>{};const interval=window.setInterval.bind(window);vi.spyOn(window,'setInterval').mockImplementation((callback,delay,...args)=>{if(delay===3000){poll=callback as ()=>void;return interval(()=>{},999999) as unknown as ReturnType<typeof window.setInterval>;}return interval(callback,delay,...args) as unknown as ReturnType<typeof window.setInterval>;});
    const api=fixture();const generated={...item,state:'completed',sha256:'first-hash',reviewedSha256:'first-hash',fileName:'铭牌.pdf'};api.packaging.getTask.mockResolvedValue({...task,items:[generated]});
    api.packaging.generate.mockResolvedValue({...task,items:[generated]});
    const row=await open(api);expandItem(row);
    const regenerate=within(row).getByRole('button',{name:'重新生成此项目'});expect(regenerate).toBeDisabled();
    fireEvent.click(within(row).getByLabelText('明确重新生成本项目（可能已有人工修改）'));fireEvent.click(regenerate);
    await waitFor(()=>expect(api.packaging.generate).toHaveBeenCalledWith(task.id,{itemIds:[1],regenerate:true}));
    fireEvent.click(screen.getByRole('button',{name:'归档预览'}));fireEvent.click(await screen.findByLabelText('已核对全部文件和归档位置，确认统一归档'));
    expect(screen.getByRole('button',{name:'确认统一归档'})).toBeEnabled();
    api.packaging.getTask.mockResolvedValue({...task,items:[{...generated,sha256:'changed-hash',reviewedSha256:undefined,state:'awaiting_review'}]});
    await act(async()=>{poll();});expect(api.packaging.getTask).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('button',{name:'确认统一归档'})).not.toBeInTheDocument();expect(api.packaging.archive).not.toHaveBeenCalled();
    expect(within(row).getByLabelText('已检查当前 PDF 内容')).not.toBeChecked();expect(within(row).getByRole('button',{name:'重新生成此项目'})).toBeDisabled();
  });
  it('requires unfinished acknowledgement, preserves failed deletion and removes the task after retry',async()=>{
    const api=fixture();api.packaging.deleteTask.mockRejectedValueOnce(new Error('记录删除失败，请重试'));
    render(<DrawingTasksPage api={api as never} target={{productId:7,drawings:[{origin:'planned',id:20}]}}/>);
    await openDelete();const dialog=await screen.findByRole('dialog',{name:'删除制图任务记录'});
    expect(within(dialog).getByText(/SAMKYO · T40/)).toBeVisible();expect(within(dialog).getByText(/创建于 \d{4}-\d{2}-\d{2} \d{2}:\d{2}/)).toBeVisible();
    expect(within(dialog).getByText(/实际 PDF、原始 AIT、正式文件均保留/)).toBeVisible();
    const confirm=within(dialog).getByRole('button',{name:'确认删除记录'});expect(confirm).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox'));fireEvent.click(confirm);
    expect(await within(dialog).findByText('记录删除失败，请重试')).toBeVisible();expect(within(dialog).getByRole('checkbox')).toBeChecked();
    expect(api.packaging.deleteTask).toHaveBeenCalledWith(task.id,{confirmed:true,token:'preview-token',acknowledgeUnfinished:true});
    fireEvent.click(confirm);await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.queryByRole('button',{name:/^(继续任务|查看记录)$/})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'创建任务'})).toBeEnabled();
  });
  it('honors a server deletion blocker and keeps its record',async()=>{
    const api=fixture();api.packaging.deletionPreview.mockResolvedValue({taskId:task.id,productId:7,model:'T40',state:'archiving',createdAt:task.createdAt,token:'blocked',canDelete:false,reason:'归档处理中，请稍后再删除',fileCount:1,releasesLock:false});
    render(<DrawingTasksPage api={api as never}/>);await openDelete();
    const dialog=await screen.findByRole('dialog');expect(within(dialog).getByRole('alert')).toHaveTextContent('归档处理中，请稍后再删除');expect(within(dialog).getByRole('button',{name:'确认删除记录'})).toBeDisabled();expect(api.packaging.deleteTask).not.toHaveBeenCalled();
  });
  it('refreshes a stale deletion preview inside the existing dialog and requires renewed acknowledgement',async()=>{
    const api=fixture();api.packaging.deleteTask.mockRejectedValueOnce(Object.assign(new Error('任务状态已变化，请重新核对删除信息'),{code:'TASK_DELETE_CHANGED'}));
    render(<DrawingTasksPage api={api as never}/>);await openDelete();
    const dialog=await screen.findByRole('dialog');fireEvent.click(within(dialog).getByRole('checkbox'));
    api.packaging.deletionPreview.mockResolvedValueOnce({taskId:task.id,productId:7,model:'T40',state:'active',createdAt:task.createdAt,token:'fresh-preview',canDelete:true,fileCount:2,releasesLock:true});
    fireEvent.click(within(dialog).getByRole('button',{name:'确认删除记录'}));
    await waitFor(()=>expect(api.packaging.deletionPreview).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('dialog')).toBe(dialog);expect(within(dialog).getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole('checkbox'));fireEvent.click(within(dialog).getByRole('button',{name:'确认删除记录'}));
    await waitFor(()=>expect(api.packaging.deleteTask).toHaveBeenLastCalledWith(task.id,{confirmed:true,token:'fresh-preview',acknowledgeUnfinished:true}));
  });
  it('renders completed history read only and deletes without unfinished acknowledgement',async()=>{
    const api=fixture();const completed={...task,state:'completed',completedAt:'2026-11-02T04:10:00Z',items:[{...item,state:'completed',sha256:'current',fileName:'铭牌.pdf'}]};api.packaging.listTasks.mockResolvedValue([completed]);api.packaging.getTask.mockResolvedValue(completed);
    api.packaging.deletionPreview.mockResolvedValue({taskId:task.id,productId:7,model:'T40',state:'completed',createdAt:task.createdAt,token:'completed-token',canDelete:true,fileCount:1,releasesLock:false});
    const row=await open(api);expandItem(row);
    expect(within(row).queryByLabelText('本次生成方式')).not.toBeInTheDocument();expect(within(row).getByRole('button',{name:'预览 PDF'})).toBeEnabled();expect(screen.queryByRole('button',{name:'归档预览'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'返回制图任务'}));await openDelete();const dialog=await screen.findByRole('dialog');expect(within(dialog).queryByRole('checkbox')).not.toBeInTheDocument();fireEvent.click(within(dialog).getByRole('button',{name:'确认删除记录'}));
    await waitFor(()=>expect(api.packaging.deleteTask).toHaveBeenCalledWith(task.id,{confirmed:true,token:'completed-token'}));
  });
});

it('stops hidden polling and rejects an interval response that predates a saved mutation',async()=>{
  let poll=()=>{};vi.spyOn(window,'setInterval').mockImplementation((callback)=>{poll=callback as ()=>void;return 123 as never;});
  const api=fixture();const view=render(<DrawingTasksPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:/^(继续任务|查看记录)$/}));
  const row=await screen.findByRole('region',{name:`${item.fullCode} 铭牌`});expandItem(row);
  let resolve!:(value:typeof task)=>void;api.packaging.getTask.mockImplementationOnce(()=>new Promise(yes=>{resolve=yes;}));await act(async()=>poll());
  fireEvent.change(within(row).getByRole('spinbutton'),{target:{value:'99'}});api.packaging.updateItem.mockResolvedValue({...task,items:[{...item,parameters:{width:99}}]});
  fireEvent.click(within(row).getByRole('button',{name:'保存本次设置'}));await waitFor(()=>expect(within(row).getByRole('button',{name:'保存本次设置'})).toBeDisabled());
  await act(async()=>resolve(task));expect(within(row).getByRole('spinbutton')).toHaveValue(99);
  const clear=vi.spyOn(window,'clearInterval');view.rerender(<DrawingTasksPage api={api as never} active={false}/>);expect(clear).toHaveBeenCalledWith(123);
  const calls=api.packaging.getTask.mock.calls.length;await act(async()=>poll());expect(api.packaging.getTask).toHaveBeenCalledTimes(calls);
});

it('accepts a successful save across hiding and reactivation without losing the draft or leaving it dirty',async()=>{
 const api=fixture();const view=render(<DrawingTasksPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:/^(继续任务|查看记录)$/}));const row=await screen.findByRole('region',{name:`${item.fullCode} 铭牌`});expandItem(row);fireEvent.change(within(row).getByRole('spinbutton'),{target:{value:'99'}});
 let resolve!:(value:typeof task)=>void;api.packaging.updateItem.mockImplementationOnce(()=>new Promise(yes=>{resolve=yes;}));fireEvent.click(within(row).getByRole('button',{name:'保存本次设置'}));await waitFor(()=>expect(api.packaging.updateItem).toHaveBeenCalled());
 view.rerender(<DrawingTasksPage api={api as never} active={false}/>);view.rerender(<DrawingTasksPage api={api as never}/>);
 await act(async()=>resolve({...task,items:[{...item,parameters:{width:99}}]}));expect(within(row).getByRole('spinbutton')).toHaveValue(99);expect(within(row).getByRole('button',{name:'保存本次设置'})).toBeDisabled();expect(screen.getByRole('button',{name:'批量生成待处理项目'})).toBeEnabled();
});

it('does not restore a deleted task from a history request started during deletion',async()=>{
 const api=fixture();const view=render(<DrawingTasksPage api={api as never}/>);await openDelete();const dialog=await screen.findByRole('dialog');fireEvent.click(within(dialog).getByRole('checkbox'));
 let finishDelete!:(value:{id:string;deleted:boolean})=>void;api.packaging.deleteTask.mockImplementationOnce(()=>new Promise(yes=>{finishDelete=yes;}));fireEvent.click(within(dialog).getByRole('button',{name:'确认删除记录'}));
 let finishHistory!:(value:typeof task[])=>void;view.rerender(<DrawingTasksPage api={api as never} active={false}/>);api.packaging.listTasks.mockImplementationOnce(()=>new Promise(yes=>{finishHistory=yes;}));view.rerender(<DrawingTasksPage api={api as never}/>);await waitFor(()=>expect(api.packaging.listTasks).toHaveBeenCalledTimes(2));
 await act(async()=>finishDelete({id:task.id,deleted:true}));expect(screen.queryByRole('button',{name:/^(继续任务|查看记录)$/})).not.toBeInTheDocument();await act(async()=>finishHistory([task]));expect(screen.queryByRole('button',{name:/^(继续任务|查看记录)$/})).not.toBeInTheDocument();
});

it('filters history independently of task creation and puts record deletion behind the row menu',async()=>{
  const api=fixture();
  api.packaging.listTasks.mockResolvedValue([task,{...task,id:'archived',model:'B80',state:'completed'}]);
  render(<DrawingTasksPage api={api as never}/>);
  expect(await screen.findByRole('button',{name:'继续任务'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:/^进行中$/}));
  expect(screen.queryByText('B80')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'全部历史'}));
  fireEvent.change(screen.getByRole('searchbox',{name:'搜索任务型号'}),{target:{value:'b80'}});
  expect(screen.getByText('B80')).toBeVisible();
  expect(screen.queryByRole('button',{name:'继续任务'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'删除任务记录',hidden:true})).not.toBeVisible();
  fireEvent.click(screen.getByText('更多操作'));
  fireEvent.click(screen.getByRole('button',{name:'删除任务记录'}));
  expect(await screen.findByRole('dialog',{name:'删除制图任务记录'})).toBeVisible();
});

it('expands the first pending PDF and advances after explicit confirmation',async()=>{
  const api=fixture();
  const first={...item,state:'awaiting_review',sha256:'first-hash',fileName:'第一份.pdf'};
  const second={...item,id:2,fullCode:'02.0404.010.0401002',state:'awaiting_review',sha256:'second-hash',fileName:'第二份.pdf'};
  api.packaging.getTask.mockResolvedValue({...task,items:[first,second]});
  api.packaging.reviewItem.mockResolvedValue({...task,items:[{...first,state:'completed',reviewedSha256:'first-hash'},second]});
  render(<DrawingTasksPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'继续任务'}));
  const firstRow=await screen.findByRole('region',{name:`${first.fullCode} 铭牌`});
  const secondRow=screen.getByRole('region',{name:`${second.fullCode} 铭牌`});
  fireEvent.click(within(firstRow).getByRole('button',{name:'预览 PDF'}));
  expect(screen.getByTitle('当前 PDF 文件预览')).toBeVisible();
  expect(api.packaging.reviewItem).not.toHaveBeenCalled();
  fireEvent.click(within(firstRow).getByLabelText('已检查当前 PDF 内容'));
  fireEvent.click(within(firstRow).getByRole('button',{name:'确认当前文件'}));
  await waitFor(()=>expect(within(secondRow).getByRole('button',{name:'预览 PDF'})).toBeVisible());
  expect(within(firstRow).queryByRole('button',{name:'预览 PDF'})).not.toBeInTheDocument();
  expect(screen.queryByTitle('当前 PDF 文件预览')).not.toBeInTheDocument();
});

it('retains list filters and an unsaved source draft after returning to history',async()=>{
  const api=fixture();
  const current={...item,mode:'ait',state:'awaiting_review',templateId:9,sha256:'file-hash',fileName:'铭牌.pdf',relativePath:'冰柜/T40/00.临时文件/铭牌.pdf'};
  api.packaging.getCatalog.mockResolvedValue({templates:[{id:9,name:'铭牌模板',status:'active',projectItemId:3,productIds:[7]}],dimensions:[],rules:[],configs:[{projectItemId:3,mode:'ait',parameters:[{key:'width',label:'宽度',type:'number',required:true,unit:'mm'}]}]});
  api.packaging.getTask.mockResolvedValue({...task,items:[current]});
  render(<DrawingTasksPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:/^进行中$/}));
  fireEvent.change(screen.getByRole('searchbox',{name:'搜索任务型号'}),{target:{value:'t40'}});
  fireEvent.click(await screen.findByRole('button',{name:'继续任务'}));
  const row=await screen.findByRole('region',{name:`${item.fullCode} 铭牌`});
  fireEvent.change(within(row).getByRole('spinbutton',{name:'宽度 (mm)'}),{target:{value:'99'}});
  fireEvent.click(within(row).getByRole('button',{name:'人工制作'}));
  expect(within(row).getByText('铭牌.pdf')).toBeVisible();
  fireEvent.click(within(row).getByRole('button',{name:'使用现成文件'}));
  expect(within(row).getByRole('button',{name:'查找现成文件'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'返回制图任务'}));
  expect(screen.getByRole('searchbox',{name:'搜索任务型号'})).toHaveValue('t40');
  expect(screen.getByRole('button',{name:/^进行中$/})).toHaveAttribute('aria-pressed','true');
  await waitFor(()=>expect(api.packaging.listTasks).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole('button',{name:'继续任务'}));
  expect(await screen.findByRole('region',{name:`${item.fullCode} 铭牌`})).toBe(row);
  fireEvent.click(within(row).getByRole('button',{name:'AIT 自动生成'}));
  expect(within(row).getByRole('spinbutton',{name:'宽度 (mm)'})).toHaveValue(99);
  expect(within(row).getByRole('combobox',{name:'本次模板'})).toHaveValue('9');
  expect(api.packaging.updateItem).not.toHaveBeenCalled();
});

it('counts and checks selected products only after opening the auxiliary controls',async()=>{
  const api=fixture();
  render(<DrawingTasksPage api={api as never}/>);
  const summary=await screen.findByText('辅助操作');
  expect(screen.getByText('待检查产品')).not.toBeVisible();
  fireEvent.click(summary);
  expect(screen.getByRole('button',{name:'检查 0 个产品并创建临时文件夹'})).toBeDisabled();
  expect(screen.getByText('请先选择产品。')).toBeVisible();
  const picker=screen.getByRole('group',{name:'待检查产品'});
  fireEvent.click(within(picker).getByRole('button',{name:'全选当前结果'}));
  fireEvent.click(screen.getByRole('button',{name:'检查 1 个产品并创建临时文件夹'}));
  expect(await screen.findByText('所选产品的临时文件夹检查完成')).toBeVisible();
  expect(api.packaging.createTemporaryDirectories).toHaveBeenCalledWith([7]);
});

it('uses only a matching archive execution as the task’s indexing progress',async()=>{
  const api=fixture();
  const execution={id:'archive-scan',source:'archive',packagingTaskId:task.id,scope:{kind:'products',productDirectories:['冰柜/T40']},status:'running',
    startedAt:task.createdAt,lastProgressAt:task.createdAt,progress:{phase:'reading',processed:3,total:5}};
  const getPdfScanStatus=vi.fn().mockResolvedValue({active:execution,recent:null});
  api.packaging.getTask.mockResolvedValue({...task,state:'awaiting_index'});
  render(<DrawingTasksPage api={{...api,getPdfScanStatus} as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'继续任务'}));
  expect(await screen.findByText(/资料库索引：制图归档索引：进行中.*3 \/ 5/)).toBeVisible();
  expect(screen.getByText('发起来源：制图归档')).toBeVisible();
  expect(screen.getByText('扫描范围：冰柜/T40')).toBeVisible();

  getPdfScanStatus.mockResolvedValue({active:{...execution,packagingTaskId:'another-task'},recent:null});
  fireEvent.click(screen.getByRole('button',{name:'刷新当前任务'}));
  expect(await screen.findByText('资料库索引：等待当前扫描结束')).toBeVisible();
  expect(screen.queryByText('扫描范围：冰柜/T40')).not.toBeInTheDocument();
});

it('shows Illustrator as undetected when Windows availability is only inferred',async()=>{
  const api=fixture();
  Object.assign(api.packaging,{getAutomation:vi.fn().mockResolvedValue({platform:'win32',available:true,message:'将在本机调用 Illustrator'})});
  render(<DrawingTasksPage api={api as never}/>);
  expect(await screen.findByText('将在本机调用 Illustrator')).toBeVisible();
  expect(screen.getByText('Illustrator：未检测')).toBeVisible();
});
