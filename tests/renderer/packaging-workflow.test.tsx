import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PackagingTemplatesPage } from '../../src/renderer/pages/PackagingTemplatesPage';
import { PlanningPage } from '../../src/renderer/pages/PlanningPage';

const product = {id:7,model:'T40',sku:'SKU7',brandId:1,brandName:'品牌',productCategory:'冰柜',status:'active'};
const item = {id:1,taskId:'task1',drawing:{origin:'planned',id:20},fullCode:'02.0404.010.0401001',projectItemId:3,projectName:'铭牌',color:'白',mode:'manual',parameters:{width:80},state:'awaiting_review',sha256:'hash-current',fileName:'铭牌.pdf'};
const task = {id:'task1',productId:7,model:'T40',name:'首批',type:'new',state:'active',productDirectory:'冰柜/T40',taskDirectory:'冰柜/T40/00.临时文件/当前任务_task1',createdAt:'2026-10-30',items:[item],pendingFiles:[]};
function fixture() {
  const catalog = {templates:[],dimensions:[],rules:[],configs:[{projectItemId:3,mode:'manual',parameters:[{key:'width',label:'宽度',type:'number',required:true,unit:'mm'}]}]};
  return {
    listProducts:vi.fn().mockResolvedValue([product]),
    listDictionaries:vi.fn((type:string)=>Promise.resolve(type==='project_item'?[{id:3,name:'铭牌',code:'01',parentId:2,status:'active'}]:type==='main_category'?[{id:2,name:'印刷件',code:'04',status:'active'}]:type==='brand'?[{id:1,name:'品牌',code:'01',status:'active'}]:[])),
    searchDrawings:vi.fn().mockResolvedValue({items:[]}),
    packaging:{getCatalog:vi.fn().mockResolvedValue(catalog),saveDimension:vi.fn().mockResolvedValue({id:8}),
      listTasks:vi.fn().mockResolvedValue([task]),getTask:vi.fn().mockResolvedValue(task),
      getProductDirectories:vi.fn().mockResolvedValue([{productId:7,relativePath:'冰柜/T40',exists:true}]),
      reviewItem:vi.fn().mockResolvedValue({...task,items:[{...item,state:'completed',reviewedSha256:'hash-current'}]}),
      archivePreview:vi.fn().mockResolvedValue({taskId:'task1',ready:false,blockers:['文件有修改，请重新确认'],files:[]}),
      archive:vi.fn(),createTask:vi.fn(),createTemporaryDirectories:vi.fn().mockResolvedValue([]),
    },
  };
}

describe('packaging workflow',()=>{
  it('saves dimension fields with real product IDs and preserves failed drafts',async()=>{
    const api=fixture();api.packaging.saveDimension.mockRejectedValueOnce(new Error('保存失败，请重试'));
    render(<PackagingTemplatesPage api={api as never}/>);
    fireEvent.click(await screen.findByRole('tab',{name:'尺寸档案'}));
    fireEvent.click(screen.getByRole('button',{name:'新增尺寸档案'}));
    fireEvent.change(screen.getByRole('textbox',{name:'规格名称'}),{target:{value:'标准铭牌'}});
    fireEvent.change(screen.getByLabelText('尺寸项目'),{target:{value:'3'}});
    fireEvent.click(within(screen.getByRole('form',{name:'尺寸档案编辑'})).getByLabelText('SKU7 · T40 · 品牌'));
    fireEvent.change(screen.getByLabelText('宽度 (mm)'),{target:{value:'80'}});
    fireEvent.click(screen.getByRole('button',{name:'保存尺寸档案'}));
    expect(await screen.findByText('保存失败，请重试')).toBeVisible();
    expect(screen.getByRole('textbox',{name:'规格名称'})).toHaveValue('标准铭牌');
    expect(api.packaging.saveDimension).toHaveBeenCalledWith(expect.objectContaining({name:'标准铭牌',projectItemId:3,productIds:[7],parameters:{width:80}}));
  });
  it('continues persisted tasks and reviews the exact current hash before archive preview',async()=>{
    const api=fixture();render(<PackagingTemplatesPage api={api as never}/>);
    fireEvent.click(await screen.findByRole('button',{name:'制图任务'}));
    fireEvent.click(await screen.findByRole('button',{name:'继续处理'}));
    const card=await screen.findByRole('region',{name:'02.0404.010.0401001 铭牌'});
    fireEvent.click(within(card).getByLabelText('已检查当前 PDF 内容'));
    fireEvent.click(within(card).getByRole('button',{name:'确认当前文件'}));
    await waitFor(()=>expect(api.packaging.reviewItem).toHaveBeenCalledWith('task1',1,'hash-current'));
    fireEvent.click(screen.getByRole('button',{name:'归档预览'}));
    expect(await screen.findByText('文件有修改，请重新确认')).toBeVisible();
    expect(api.packaging.archive).not.toHaveBeenCalled();
  });
  it('preserves dimension drafts across catalog tabs',async()=>{
    const api=fixture();render(<PackagingTemplatesPage api={api as never}/>);
    fireEvent.click(await screen.findByRole('tab',{name:'尺寸档案'}));fireEvent.click(screen.getByRole('button',{name:'新增尺寸档案'}));
    fireEvent.change(screen.getByRole('textbox',{name:'规格名称'}),{target:{value:'未保存的规格'}});
    fireEvent.click(screen.getByRole('tab',{name:'模板匹配规则'}));fireEvent.click(screen.getByRole('tab',{name:'尺寸档案'}));
    expect(screen.getByRole('textbox',{name:'规格名称'})).toHaveValue('未保存的规格');expect(api.packaging.saveDimension).not.toHaveBeenCalled();
  });
  it('blocks a second task for a product and offers its existing task',async()=>{
    const api=fixture();render(<PackagingTemplatesPage api={api as never} target={{productId:7,drawings:[{origin:'planned',id:20}]}}/>);
    expect(await screen.findByRole('button',{name:'继续现有任务'})).toBeEnabled();
    expect(screen.queryByRole('button',{name:'创建任务'})).not.toBeInTheDocument();
    expect(api.packaging.createTask).not.toHaveBeenCalled();
  });
  it('saves explicit template choices and releases the generation guard after save',async()=>{
    const api=fixture();const template={id:9,name:'标准模板',status:'active',projectItemId:3,productIds:[7],brandIds:[],fields:[]};
    api.packaging.getCatalog.mockResolvedValue({templates:[template],dimensions:[],rules:[],configs:[]});
    const aitItem={...item,mode:'ait',sha256:undefined,fileName:undefined,state:'pending',templateId:undefined,match:{status:'multiple',templateIds:[9],missingParameters:[]}};
    const aitTask={...task,items:[aitItem]};api.packaging.getTask.mockResolvedValue(aitTask);
    const updateItem=vi.fn().mockResolvedValue({...task,items:[{...aitItem,templateId:9,templateName:'标准模板'}]});
    Object.assign(api.packaging,{updateItem});
    render(<PackagingTemplatesPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'制图任务'}));fireEvent.click(await screen.findByRole('button',{name:'继续处理'}));
    const card=await screen.findByRole('region',{name:'02.0404.010.0401001 铭牌'});
    expect(within(card).getByText('有多个匹配模板，请明确选择后保存。')).toBeVisible();
    fireEvent.change(within(card).getByLabelText('本次模板'),{target:{value:'9'}});
    expect(screen.getByRole('button',{name:'批量生成待处理项目'})).toBeDisabled();
    fireEvent.click(within(card).getByRole('button',{name:'保存本次设置'}));
    await waitFor(()=>expect(updateItem).toHaveBeenCalledWith('task1',1,expect.objectContaining({templateId:9})));
    await waitFor(()=>expect(within(card).getByRole('button',{name:'生成此项目'})).toBeEnabled());
    expect(within(card).getByRole('button',{name:'保存本次设置'})).toBeDisabled();
  });
  it('archives only after a ready preview and explicit unified confirmation',async()=>{
    const api=fixture();api.packaging.archivePreview.mockResolvedValue({taskId:'task1',ready:true,blockers:[],files:[{itemId:1,fullCode:item.fullCode,destination:'T40/02.未转曲源文件/铭牌.pdf',replaces:false}]});
    api.packaging.archive.mockResolvedValue({...task,state:'completed'});
    render(<PackagingTemplatesPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'制图任务'}));fireEvent.click(await screen.findByRole('button',{name:'继续处理'}));
    fireEvent.click(await screen.findByRole('button',{name:'归档预览'}));const confirm=await screen.findByRole('button',{name:'确认统一归档'});
    expect(confirm).toBeDisabled();expect(api.packaging.archive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('已核对全部文件和归档位置，确认统一归档'));fireEvent.click(confirm);
    await waitFor(()=>expect(api.packaging.archive).toHaveBeenCalledWith('task1'));
  });
  it('requires an explicit source PDF for a modify task with multiple formal sources',async()=>{
    const api=fixture();api.packaging.listTasks.mockResolvedValue([]);
    api.searchDrawings.mockResolvedValue({items:[{...item,id:20,origin:'planned',productId:7,projectItemName:'铭牌',colorName:'白',status:'active',hasSourceFile:true}],total:1});
    Object.assign(api,{getDrawing:vi.fn().mockResolvedValue({sourceFiles:[{pdfIndexId:81,fileName:'A.pdf',relativePath:'T40/02/A.pdf',isPresent:true},{pdfIndexId:82,fileName:'B.pdf',relativePath:'T40/02/B.pdf',isPresent:true}]})});
    api.packaging.createTask.mockResolvedValue(task);
    render(<PackagingTemplatesPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'制图任务'}));
    await screen.findByRole('option',{name:'SKU7 · T40 · 品牌'});fireEvent.change(screen.getByLabelText('任务产品'),{target:{value:'7'}});
    fireEvent.change(screen.getByRole('textbox',{name:'任务名称'}),{target:{value:'正式修改'}});fireEvent.change(screen.getByLabelText('任务类型'),{target:{value:'modify'}});
    fireEvent.click(await screen.findByRole('checkbox',{name:`${item.fullCode} · 铭牌 · 白`}));
    const select=await screen.findByLabelText(`${item.fullCode} 原始源 PDF`);expect(screen.getByRole('button',{name:'创建任务'})).toBeDisabled();
    fireEvent.change(select,{target:{value:'82'}});await waitFor(()=>expect(screen.getByRole('button',{name:'创建任务'})).toBeEnabled());fireEvent.click(screen.getByRole('button',{name:'创建任务'}));
    await waitFor(()=>expect(api.packaging.createTask).toHaveBeenCalledWith(expect.objectContaining({productId:7,type:'modify',drawings:[{origin:'planned',id:20,sourcePdfFileId:82}]})));
  });
  it('allows retrying the index stage of an interrupted archive despite pending preview readiness',async()=>{
    const api=fixture();api.packaging.getTask.mockResolvedValue({...task,state:'awaiting_index'});
    api.packaging.archivePreview.mockResolvedValue({taskId:'task1',ready:false,blockers:['等待索引重试'],files:[]});api.packaging.archive.mockResolvedValue({...task,state:'completed'});
    render(<PackagingTemplatesPage api={api as never}/>);fireEvent.click(await screen.findByRole('button',{name:'制图任务'}));fireEvent.click(await screen.findByRole('button',{name:'继续处理'}));
    fireEvent.click(await screen.findByRole('button',{name:'归档预览'}));await screen.findByText('等待索引重试');
    fireEvent.click(screen.getByRole('button',{name:'重试归档索引'}));await waitFor(()=>expect(api.packaging.archive).toHaveBeenCalledWith('task1'));
  });
  it('requires saved reservation IDs for the planning generate action',async()=>{
    const api={...fixture(),previewPlan:vi.fn().mockResolvedValue({rows:[]}),reservePlan:vi.fn()};
    render(<PlanningPage api={api as never} onGenerateFiles={vi.fn()}/>);
    expect(screen.getByRole('button',{name:'生成文件'})).toBeDisabled();
    expect(screen.getByRole('button',{name:'生成文件'}).compareDocumentPosition(screen.getByRole('button',{name:'查重并预览'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
