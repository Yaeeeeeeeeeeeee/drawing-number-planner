import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
afterEach(()=>vi.restoreAllMocks());
import { PackagingTemplatesPage } from '../../src/renderer/pages/PackagingTemplatesPage';
import { ConfigEditor, RuleEditor, TemplateEditor } from '../../src/renderer/pages/packaging/PackagingEditors';
import type { PackagingCatalog, PackagingParameter, PackagingTemplate } from '../../src/core/packaging/packaging-types';

const project={id:3,name:'铭牌',code:'01',parentId:2,status:'active'};
const lookups={products:[],projects:[project],mains:[{id:2,name:'印刷件',code:'04',status:'active'}],brands:[]};
const template={id:9,name:'标准模板',mainCategoryId:2,projectItemId:3,brandIds:[],productIds:[],fields:[{objectName:'图号文字',sourceKey:'DRAWING_NO',required:true},{objectName:'品牌文字',sourceKey:'BRAND',required:false}],requiredFonts:['ExistingFont'],status:'active',fileName:'标准.ait',revision:1,assetRelativePath:'templates/标准.ait',sha256:'hash',createdAt:'2026-11-02',updatedAt:'2026-11-02'} as PackagingTemplate;
const parameters:PackagingParameter[]=[{key:'side_a',label:'旧长',type:'number',axis:'length',required:true,unit:'mm'},{key:'side_b',label:'旧宽',type:'number',axis:'width',required:true,unit:'mm'},{key:'legacy_note',label:'历史规格说明',type:'text',required:true}];
function catalog():PackagingCatalog{return {templates:[template],dimensions:[],rules:[],configs:[{projectItemId:3,mode:'ait',parameters}]};}
function packagingApi(){return {getCatalog:vi.fn().mockResolvedValue(catalog()),saveConfig:vi.fn().mockImplementation(async config=>config),updateTemplate:vi.fn().mockResolvedValue(template),replaceTemplateFile:vi.fn().mockResolvedValue(template),createTemplate:vi.fn().mockResolvedValue(template),saveRule:vi.fn().mockResolvedValue({}),inspectTemplate:vi.fn().mockResolvedValue({fields:[],textObjects:[{objectName:'图号文字',editable:true},{objectName:'其他文字',editable:true}],fonts:['DetectedFont'],issues:[]}),selectTemplateReference:vi.fn().mockResolvedValue({token:'cap',fileName:'新模板.ait',displayPath:'/original/新模板.ait'}),saveTemplateReference:vi.fn().mockResolvedValue(template),inspectTemplateReference:vi.fn().mockResolvedValue({fields:[],textObjects:[{objectName:'上传图号',editable:true}],fonts:['UploadFont'],issues:[]})};}
const saved=()=>Promise.resolve();

describe('packaging catalog simplification',()=>{
  it('shows only three configuration tabs and performs no implicit writes or task reads',async()=>{
    const packaging=packagingApi();const listTasks=vi.fn();
    render(<PackagingTemplatesPage api={{packaging:{...packaging,listTasks},listProducts:async()=>[],listDictionaries:async(type:string)=>type==='project_item'?lookups.projects:type==='main_category'?lookups.mains:[]} as never}/>);
    await screen.findByRole('tab',{name:'项目生成设置'});
    expect(screen.getAllByRole('tab').map(tab=>tab.textContent)).toEqual(['AIT 模板管理','模板匹配规则','项目生成设置']);
    expect(screen.queryByRole('button',{name:'制图任务'})).not.toBeInTheDocument();
    expect(screen.queryByText('尺寸档案')).not.toBeInTheDocument();
    expect(screen.queryByText('批量创建临时文件夹')).not.toBeInTheDocument();
    expect(packaging.saveConfig).not.toHaveBeenCalled();expect(listTasks).not.toHaveBeenCalled();
  });
  it('edits only drawing number mappings with Chinese content choices and preserves other stored mappings',async()=>{
    const api=packagingApi();render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
    const content=screen.getByRole('combobox',{name:'填入内容 1'});
    expect(within(content).getAllByRole('option').map(option=>option.textContent)).toEqual(['完整图号']);
    expect(screen.queryByDisplayValue('BRAND')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'读取对象与字体'}));
    fireEvent.click(await screen.findByRole('button',{name:'应用读取结果'}));
    fireEvent.change(screen.getByRole('combobox',{name:'AIT 对象名称 1'}),{target:{value:'其他文字'}});
    fireEvent.click(screen.getByRole('checkbox',{name:'必填 1'}));
    fireEvent.click(screen.getByRole('button',{name:'保存模板'}));
    await waitFor(()=>expect(api.updateTemplate).toHaveBeenCalledWith(9,expect.objectContaining({fields:[{objectName:'其他文字',sourceKey:'DRAWING_NO',required:false},template.fields[1]]})));
  });
  it('reads selected AIT objects and fonts without saving the immutable asset',async()=>{
    const api=packagingApi();render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'重新定位 AIT'}));
    fireEvent.click(await screen.findByRole('button',{name:'应用读取结果'}));
    expect(within(screen.getByRole('combobox',{name:'AIT 对象名称 1'})).getByRole('option',{name:'上传图号'})).toBeInTheDocument();
    expect(api.inspectTemplateReference).toHaveBeenCalledWith('cap',template.fields,template.requiredFonts);
    expect(screen.getByLabelText('所需字体')).toHaveValue('ExistingFont, UploadFont');
    expect(api.replaceTemplateFile).not.toHaveBeenCalled();
  });
  it('keeps draft and manual controls when automatic AIT inspection fails',async()=>{
    const api=packagingApi();api.inspectTemplateReference.mockRejectedValue(new Error('Illustrator 未启动'));
    render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'未保存模板'}});
    fireEvent.click(screen.getByRole('button',{name:'重新定位 AIT'}));
    expect(await screen.findByText(/Illustrator 未启动/)).toBeVisible();
    expect(screen.getByLabelText('模板名称')).toHaveValue('未保存模板');
    expect(screen.getByLabelText('AIT 对象名称 1')).toHaveValue('图号文字');
    expect(screen.getByLabelText('所需字体')).toHaveValue('ExistingFont');
    expect(screen.getByRole('button',{name:'保存模板'})).toBeEnabled();
  });
  it('offers saved AIT object inspection and retains manual names',async()=>{
    const api=packagingApi();render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'读取对象与字体'}));
    fireEvent.click(await screen.findByRole('button',{name:'应用读取结果'}));
    expect(within(screen.getByRole('combobox',{name:'AIT 对象名称 1'})).getByRole('option',{name:'其他文字'})).toBeInTheDocument();
    expect(screen.getByLabelText('AIT 对象名称 1')).toHaveValue('图号文字');
    expect(api.inspectTemplate).toHaveBeenCalledWith(9);
  });
  it('retains exact historical parameter definitions when changing only generation mode',async()=>{
    const api=packagingApi();render(<ConfigEditor api={api as never} catalog={catalog()} projects={lookups.projects as never} onSaved={saved}/>);
    fireEvent.change(screen.getByLabelText('配置项目'),{target:{value:'3'}});
    expect(screen.getByLabelText('模板匹配依据')).toHaveValue('2');
    expect(screen.queryByRole('textbox',{name:/参数键/})).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('生成方式'),{target:{value:'manual'}});fireEvent.click(screen.getByRole('button',{name:'保存项目配置'}));
    await waitFor(()=>expect(api.saveConfig).toHaveBeenCalledWith({projectItemId:3,mode:'manual',parameters}));
  });
  it('reuses old dimension keys and preserves legacy text when explicitly adding height',async()=>{
    const api=packagingApi();render(<ConfigEditor api={api as never} catalog={catalog()} projects={lookups.projects as never} onSaved={saved}/>);
    fireEvent.change(screen.getByLabelText('配置项目'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('模板匹配依据'),{target:{value:'3'}});fireEvent.click(screen.getByRole('button',{name:'保存项目配置'}));
    await waitFor(()=>expect(api.saveConfig).toHaveBeenCalledWith(expect.objectContaining({parameters:expect.arrayContaining([...parameters,{key:'height',label:'高',type:'number',axis:'height',required:true,unit:'mm'}])})));
  });
  it('preserves rule-bound legacy axes when a simpler basis would break existing matching',async()=>{
    const api=packagingApi();const value=catalog();value.rules=[{id:6,name:'旧规则',templateId:9,conditions:[{key:'side_a',operator:'lte',value:100}],allowLengthWidthSwap:false,status:'active'}];
    render(<ConfigEditor api={api as never} catalog={value} projects={lookups.projects as never} onSaved={saved}/>);
    fireEvent.change(screen.getByLabelText('配置项目'),{target:{value:'3'}});fireEvent.change(screen.getByLabelText('模板匹配依据'),{target:{value:'0'}});
    expect(await screen.findByText(/现有匹配规则仍使用长/)).toBeVisible();
    expect(screen.getByLabelText('模板匹配依据')).toHaveValue('2');
    fireEvent.click(screen.getByRole('button',{name:'保存项目配置'}));
    await waitFor(()=>expect(api.saveConfig).toHaveBeenCalledWith(expect.objectContaining({parameters})));
  });
  it('uses Chinese dimensions for rules and saves ranges and length-width swap',async()=>{
    const api=packagingApi();render(<RuleEditor api={api as never} catalog={catalog()} onSaved={saved} onCancel={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('规则名称'),{target:{value:'标准范围'}});fireEvent.change(screen.getByLabelText('目标模板'),{target:{value:'9'}});
    fireEvent.click(screen.getByRole('button',{name:'添加尺寸条件'}));
    expect(within(screen.getByLabelText('条件尺寸 1')).getAllByRole('option').map(option=>option.textContent)).toEqual(['长','宽']);
    fireEvent.change(screen.getByLabelText('比较方式 1'),{target:{value:'between'}});fireEvent.change(screen.getByLabelText('最小值 1'),{target:{value:'50'}});fireEvent.change(screen.getByLabelText('最大值 1'),{target:{value:'100'}});
    expect(screen.getByLabelText('允许长宽互换（高度不参与）')).toBeChecked();fireEvent.click(screen.getByRole('button',{name:'保存匹配规则'}));
    await waitFor(()=>expect(api.saveRule).toHaveBeenCalledWith(expect.objectContaining({conditions:[{key:'side_a',operator:'between',value:50,max:100}],allowLengthWidthSwap:true})));
  });
  it('saves a fixed template rule without technical parameter entry',async()=>{
    const api=packagingApi();const value=catalog();value.configs[0].parameters=[];
    render(<RuleEditor api={api as never} catalog={value} onSaved={saved} onCancel={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('规则名称'),{target:{value:'固定模板'}});fireEvent.change(screen.getByLabelText('目标模板'),{target:{value:'9'}});
    expect(screen.getByText('固定模板（无需尺寸）')).toBeVisible();expect(screen.getByRole('button',{name:'添加尺寸条件'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'保存匹配规则'}));
    await waitFor(()=>expect(api.saveRule).toHaveBeenCalledWith(expect.objectContaining({conditions:[]})));
  });
  it('retains unsupported historical rule conditions on an ordinary name edit',async()=>{
    const api=packagingApi();const value=catalog();const initial={id:4,name:'旧规格',templateId:9,conditions:[{key:'legacy_note',operator:'eq' as const,value:'出口版'},{key:'unlisted_old_key',operator:'eq' as const,value:'保留'}],allowLengthWidthSwap:false,status:'active' as const};
    render(<RuleEditor api={api as never} initial={initial} catalog={value} onSaved={saved} onCancel={()=>{}}/>);
    expect(screen.queryByText('legacy_note')).not.toBeInTheDocument();expect(screen.queryByText('unlisted_old_key')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('规则名称'),{target:{value:'出口版规则'}});fireEvent.click(screen.getByRole('button',{name:'保存匹配规则'}));
    await waitFor(()=>expect(api.saveRule).toHaveBeenCalledWith({...initial,name:'出口版规则'}));
  });
  it('keeps a template draft when switching catalog tabs',async()=>{
    const packaging=packagingApi();
    render(<PackagingTemplatesPage api={{packaging,listProducts:async()=>[],listDictionaries:async(type:string)=>type==='project_item'?lookups.projects:type==='main_category'?lookups.mains:[]} as never}/>);
    fireEvent.click(await screen.findByRole('button',{name:'编辑 / 替换 AIT'}));
    fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'尚未保存'}});
    fireEvent.click(screen.getByRole('tab',{name:'模板匹配规则'}));fireEvent.click(screen.getByRole('tab',{name:'AIT 模板管理'}));
    expect(screen.getByLabelText('模板名称')).toHaveValue('尚未保存');expect(packaging.updateTemplate).not.toHaveBeenCalled();
  });
});
it('reads a newly selected AIT before the user knows its drawing text object name',async()=>{const api=packagingApi();render(<TemplateEditor api={api as never} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'选择 AIT 原始文件'}));await waitFor(()=>expect(api.inspectTemplateReference).toHaveBeenCalledWith('cap',[],[]));expect(api.createTemplate).not.toHaveBeenCalled();fireEvent.click(await waitFor(()=>{const button=screen.getByRole('button',{name:'添加图号映射'});expect(button).toBeEnabled();return button;}));expect(within(screen.getByRole('combobox',{name:'AIT 对象名称 1'})).getByRole('option',{name:'上传图号'})).toBeInTheDocument();});


describe('confirmed AIT overlay editor',()=>{
 it('uses a right dialog and confirms unsaved close only once while preserving input on rejection',()=>{
  const onCancel=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  render(<TemplateEditor api={packagingApi() as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={onCancel}/>);
  const dialog=screen.getByRole('dialog',{name:'编辑 AIT 模板'});
  expect(dialog).toHaveAttribute('aria-modal','true');expect(dialog).toHaveClass('pkg-template-drawer');
  fireEvent.change(within(dialog).getByLabelText('模板名称'),{target:{value:'未保存模板'}});
  fireEvent.keyDown(dialog,{key:'Escape'});expect(confirm).toHaveBeenCalledTimes(1);expect(onCancel).not.toHaveBeenCalled();
  expect(screen.getByLabelText('模板名称')).toHaveValue('未保存模板');
  confirm.mockReturnValue(true);fireEvent.click(within(dialog).getByRole('button',{name:'取消'}));expect(confirm).toHaveBeenCalledTimes(2);expect(onCancel).toHaveBeenCalledTimes(1);
 });
 it('closes an unchanged editor without a save warning',()=>{
  const onCancel=vi.fn(),confirm=vi.spyOn(window,'confirm');
  render(<TemplateEditor api={packagingApi() as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={onCancel}/>);
  fireEvent.click(screen.getByRole('button',{name:'取消'}));expect(onCancel).toHaveBeenCalledOnce();expect(confirm).not.toHaveBeenCalled();
 });
 it('clears dirty after a successful save even when refreshing the list then fails',async()=>{
  const api=packagingApi(),onCancel=vi.fn(),confirm=vi.spyOn(window,'confirm');
  render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={async()=>{throw Error('列表刷新失败');}} onCancel={onCancel}/>);
  fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'已保存名称'}});
  fireEvent.submit(screen.getByRole('form',{name:'AIT 模板编辑'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('列表刷新失败');
  expect(api.updateTemplate).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole('button',{name:'取消'}));
  expect(confirm).not.toHaveBeenCalled();expect(onCancel).toHaveBeenCalledOnce();
 });
 it('preserves dirty changes after a failed save',async()=>{
  const api=packagingApi(),onCancel=vi.fn(),confirm=vi.spyOn(window,'confirm').mockReturnValue(false);api.updateTemplate.mockRejectedValueOnce(Error('模板保存失败'));
  render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={onCancel}/>);
  fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'失败也保留'}});fireEvent.submit(screen.getByRole('form',{name:'AIT 模板编辑'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('模板保存失败');fireEvent.click(screen.getByRole('button',{name:'取消'}));
  expect(confirm).toHaveBeenCalledOnce();expect(onCancel).not.toHaveBeenCalled();expect(screen.getByLabelText('模板名称')).toHaveValue('失败也保留');
 });
});
it('uses the desktop chooser capability to relocate a template',async()=>{const api=packagingApi() as any;api.selectTemplateReference=vi.fn().mockResolvedValue({token:'cap',fileName:'new.ait',displayPath:'/original/new.ait'});api.inspectTemplateReference=vi.fn().mockResolvedValue({fields:[],textObjects:[],fonts:[],issues:[]});api.saveTemplateReference=vi.fn().mockResolvedValue(template);render(<TemplateEditor api={api} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'重新定位 AIT'}));await waitFor(()=>expect(api.inspectTemplateReference).toHaveBeenCalledWith('cap',template.fields,template.requiredFonts));fireEvent.click(screen.getByRole('button',{name:'保存模板'}));await waitFor(()=>expect(api.saveTemplateReference).toHaveBeenCalledWith(template,'cap',template.id));});
it('shows a missing original while retaining relocation',async()=>{const api=packagingApi() as any;api.templateStatus=vi.fn().mockResolvedValue({available:false,message:'模板文件不存在或无法读取'});render(<TemplateEditor api={api} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);expect(await screen.findByText(/模板文件不存在或无法读取/)).toBeVisible();expect(screen.getByRole('button',{name:'重新定位 AIT'})).toBeEnabled();});

it('previews automatic full-code detection and saves a new template without forcing an object name',async()=>{
 const api=packagingApi();api.inspectTemplateReference.mockResolvedValue({fields:[],textObjects:[],fonts:[],issues:[],drawingNumber:{originalText:'02.0305.010.0201001',matches:2}} as never);
 render(<TemplateEditor api={api as never} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'自动识别模板'}});
 fireEvent.change(screen.getByLabelText('资料类别'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('项目明细'),{target:{value:'3'}});
 fireEvent.click(screen.getByRole('button',{name:'选择 AIT 原始文件'}));
 expect(await screen.findByText(/原完整图号：02.0305.010.0201001/)).toHaveTextContent('2 处');
 expect(screen.queryByLabelText('AIT 对象名称 1')).not.toBeInTheDocument();
 fireEvent.submit(screen.getByRole('form',{name:'AIT 模板编辑'}));
 await waitFor(()=>expect(api.saveTemplateReference).toHaveBeenCalledWith(expect.objectContaining({name:'自动识别模板',fields:[]}),'cap'));
});

it('keeps length-width swapping enabled when choosing a template for a new rule',()=>{
 render(<RuleEditor api={packagingApi() as never} catalog={catalog()} onSaved={saved} onCancel={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('目标模板'),{target:{value:'9'}});
 expect(screen.getByLabelText('允许长宽互换（高度不参与）')).toBeChecked();
});

it('shows template range and unavailable original without dropping the record',async()=>{
 const packaging=packagingApi() as any;const value=catalog();value.rules=[{id:4,name:'范围',templateId:9,conditions:[{key:'side_a',operator:'between',value:50,max:100}],allowLengthWidthSwap:true,status:'active'}];packaging.getCatalog.mockResolvedValue(value);packaging.templateStatus=vi.fn().mockResolvedValue({available:false,message:'原始文件不存在'});
 render(<PackagingTemplatesPage api={{packaging,listProducts:async()=>[],listDictionaries:async(type:string)=>type==='project_item'?lookups.projects:type==='main_category'?lookups.mains:[]} as never}/>);
 expect(await screen.findByText('原始文件不存在')).toBeVisible();expect(within(screen.getByRole('tabpanel',{name:'AIT 模板管理'})).getByText(/长 介于 50 至 100/)).toBeVisible();expect(within(screen.getByRole('tabpanel',{name:'AIT 模板管理'})).getByText('标准模板')).toBeVisible();
});

it('saves template metadata and configured dimensions in one reference request',async()=>{
 const api=packagingApi();const value=catalog();render(<TemplateEditor api={api as never} catalog={value} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
 fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'尺寸模板'}});fireEvent.change(screen.getByLabelText('资料类别'),{target:{value:'2'}});fireEvent.change(screen.getByLabelText('项目明细'),{target:{value:'3'}});fireEvent.click(screen.getByLabelText('设置模板尺寸范围'));fireEvent.change(screen.getByLabelText('长最小值'),{target:{value:'50'}});fireEvent.change(screen.getByLabelText('长最大值'),{target:{value:'100'}});fireEvent.click(screen.getByRole('button',{name:'选择 AIT 原始文件'}));await waitFor(()=>expect(api.inspectTemplateReference).toHaveBeenCalled());fireEvent.submit(screen.getByRole('form',{name:'AIT 模板编辑'}));
 await waitFor(()=>expect(api.saveTemplateReference).toHaveBeenCalledWith(expect.objectContaining({name:'尺寸模板'}),'cap',undefined,expect.objectContaining({conditions:[{key:'side_a',operator:'between',value:50,max:100}]})));expect(api.saveRule).not.toHaveBeenCalled();
});
it('preserves multiple legacy rules and directs editing to the rules tab',()=>{
 const api=packagingApi();const value=catalog();value.rules=[{id:1,name:'规则一',templateId:9,conditions:[],allowLengthWidthSwap:true,status:'active'},{id:2,name:'规则二',templateId:9,conditions:[],allowLengthWidthSwap:true,status:'active'}];render(<TemplateEditor api={api as never} initial={template} catalog={value} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
 expect(screen.getByText(/存在多条启用规则/)).toBeVisible();expect(screen.getByText(/规则一/)).toBeVisible();expect(screen.getByText(/规则二/)).toBeVisible();expect(screen.queryByLabelText('设置模板尺寸范围')).not.toBeInTheDocument();
});

it('updates one existing range together with template metadata using its rule ID',async()=>{
 const api=packagingApi();const value=catalog();value.rules=[{id:41,name:'现有范围',templateId:9,conditions:[{key:'side_a',operator:'between',value:10,max:20}],allowLengthWidthSwap:true,status:'active'}];render(<TemplateEditor api={api as never} initial={template} catalog={value} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
 fireEvent.click(screen.getByLabelText('设置模板尺寸范围'));expect(screen.getByLabelText('长最小值')).toHaveValue(10);fireEvent.change(screen.getByLabelText('长最大值'),{target:{value:'30'}});fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'新名称'}});fireEvent.submit(screen.getByRole('form',{name:'AIT 模板编辑'}));
 await waitFor(()=>expect(api.updateTemplate).toHaveBeenCalledWith(9,expect.objectContaining({name:'新名称'}),expect.objectContaining({id:41,name:'现有范围',conditions:[{key:'side_a',operator:'between',value:10,max:30}]})));expect(api.saveRule).not.toHaveBeenCalled();
});

it('shows only saved generation details and updates the summary after changing projects',async()=>{
 const api=packagingApi();
 const second={...project,id:7,name:'外箱'};
 const value=catalog();
 value.configs.push({projectItemId:7,mode:'existing',parameters:[]});
 api.saveConfig.mockImplementation(async config=>config);
 render(<ConfigEditor api={api as never} catalog={value} projects={[project,second] as never} onSaved={saved}/>);
 const summary=screen.getByRole('region',{name:'当前配置摘要'});
 fireEvent.change(screen.getByLabelText('配置项目'),{target:{value:'3'}});
 expect(summary).toHaveTextContent('已保存');
 expect(summary).toHaveTextContent('AIT 自动生成');
 expect(summary).toHaveTextContent('二维尺寸');
 fireEvent.change(screen.getByLabelText('生成方式'),{target:{value:'manual'}});
 expect(summary).toHaveTextContent('有未保存更改');
 expect(summary).toHaveTextContent('AIT 自动生成');
 expect(summary).not.toHaveTextContent('人工制作');
 fireEvent.click(screen.getByRole('button',{name:'保存项目配置'}));
 await waitFor(()=>expect(summary).toHaveTextContent('人工制作'));
 expect(summary).toHaveTextContent('已保存');
 fireEvent.change(screen.getByLabelText('配置项目'),{target:{value:'7'}});
 expect(summary).toHaveTextContent('外箱');
 expect(summary).toHaveTextContent('使用现成文件');
 expect(summary).not.toHaveTextContent('二维尺寸');
});

it('keeps saved object mappings and asks before applying newly read fonts',async()=>{
 const api=packagingApi();
 render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'重新定位 AIT'}));
 expect(await screen.findByText(/新增字体：UploadFont/)).toBeVisible();
 expect(screen.getByLabelText('AIT 对象名称 1')).toHaveValue('图号文字');
 expect(screen.getByLabelText('所需字体')).toHaveValue('ExistingFont');
 fireEvent.click(screen.getByRole('button',{name:'应用读取结果'}));
 expect(screen.getByLabelText('所需字体')).toHaveValue('ExistingFont, UploadFont');
 expect(screen.getByLabelText('AIT 对象名称 1')).toHaveValue('图号文字');
});

it('opens the selected project settings from a template with no dimension configuration',async()=>{
 const packaging=packagingApi();
 const value=catalog();
 value.configs=[];
 packaging.getCatalog.mockResolvedValue(value);
 render(<PackagingTemplatesPage api={{packaging,listProducts:async()=>[],listDictionaries:async(type:string)=>type==='project_item'?lookups.projects:type==='main_category'?lookups.mains:[]} as never}/>);
 fireEvent.click(await screen.findByRole('button',{name:'编辑 / 替换 AIT'}));
 fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'保留我'}});
 fireEvent.click(screen.getByRole('button',{name:'前往项目生成设置'}));
 expect(screen.getByRole('tab',{name:'项目生成设置'})).toHaveAttribute('aria-selected','true');
 expect(screen.getByLabelText('配置项目')).toHaveValue('3');
 expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('tab',{name:'AIT 模板管理'}));
 expect(screen.getByLabelText('模板名称')).toHaveValue('保留我');
});

it('filters available models by selected brands and preserves cross-brand choices',()=>{
 const brands=[
  {id:1,code:'01',name:'SAMKYO',status:'active'},
  {id:2,code:'02',name:'AVAKYO',status:'active'},
 ];
 const products=[
  {id:31,model:'S40',sku:'SAM-40',brandId:1,brandName:'SAMKYO',productCategory:'冰柜',status:'active'},
  {id:32,model:'A80',sku:'AVA-80',brandId:2,brandName:'AVAKYO',productCategory:'冰柜',status:'active'},
 ];
 render(<TemplateEditor api={packagingApi() as never} lookups={{...lookups,brands,products} as never} onSaved={saved} onCancel={()=>{}}/>);
 fireEvent.click(screen.getByLabelText('01 · SAMKYO'));
 expect(screen.queryByRole('checkbox',{name:/A80/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('checkbox',{name:/S40/}));
 fireEvent.click(screen.getByLabelText('显示全部品牌型号'));
 fireEvent.click(screen.getByRole('checkbox',{name:/A80/}));
 fireEvent.click(screen.getByLabelText('显示全部品牌型号'));
 expect(screen.getByText('已选 2 个型号')).toBeVisible();
 expect(screen.getByText('已选型号：S40、A80')).toBeVisible();
 expect(screen.queryByRole('checkbox',{name:/A80/})).not.toBeInTheDocument();
});

it('reads a dropped AIT through the desktop reference and displays real font evidence',async()=>{
 const api=packagingApi();
 const dropTemplateReference=vi.fn().mockResolvedValue({token:'drop',fileName:'dropped.ait',displayPath:'/original/dropped.ait'});
 api.inspectTemplateReference.mockResolvedValue({
  documentRead:true,fontValidation:'declared-and-observed-only',fields:[],textObjects:[],fonts:['Installed','Missing','Unknown'],
  fontStatuses:[{name:'Installed',status:'installed'},{name:'Missing',status:'missing'}],issues:[],
 });
 render(<TemplateEditor api={{...api,dropTemplateReference} as never} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
 const file=new File(['original'],'dropped.ait');
 const zone=screen.getByRole('region',{name:'AIT 原始文件'}).querySelector('.pkg-file-inspection')!;
 fireEvent.drop(zone,{dataTransfer:{files:[file]}});
 expect(await screen.findByText('/original/dropped.ait')).toBeVisible();
 expect(dropTemplateReference).toHaveBeenCalledWith(file);
 expect(api.inspectTemplateReference).toHaveBeenCalledWith('drop',[],[]);
 const tags=within(screen.getByRole('list',{name:'字体检测状态'})).getAllByRole('listitem');
 expect(tags.map(tag=>tag.textContent)).toEqual(['Installed 已安装','Missing 缺失','Unknown 无法检测']);
});

it('shows newly saved template under a list that was previously filtered to nothing',async()=>{
 const packaging=packagingApi();
 const value=catalog();
 const created={...template,id:11,name:'新制图模板',status:'inactive'};
 packaging.saveTemplateReference.mockResolvedValue(created);
 packaging.getCatalog.mockResolvedValueOnce(value).mockResolvedValue({...value,templates:[template,created]});
 render(<PackagingTemplatesPage api={{packaging,listProducts:async()=>[],listDictionaries:async(type:string)=>type==='project_item'?lookups.projects:type==='main_category'?lookups.mains:[]} as never}/>);
 fireEvent.change(await screen.findByLabelText('搜索'),{target:{value:'无匹配'}});
 fireEvent.click(screen.getByRole('button',{name:'新增 AIT 模板'}));
 fireEvent.click(screen.getByRole('button',{name:'选择 AIT 原始文件'}));
 await screen.findByText(/已读取 1 个可编辑文字对象/);
 fireEvent.submit(screen.getByRole('form',{name:'AIT 模板编辑'}));
 expect(await screen.findByText('新制图模板')).toBeVisible();
 expect(screen.getByLabelText('搜索')).toHaveValue('');
 expect(screen.getByText('AIT 模板已保存')).toBeVisible();
});

it('does not promote Windows support to detected Illustrator availability',async()=>{
 const packaging={
  ...packagingApi(),
  getAutomation:vi.fn().mockResolvedValue({platform:'win32',available:true,message:'可尝试'}),
 };
 packaging.inspectTemplate.mockResolvedValue({documentRead:true,fontValidation:'declared-and-observed-only',fields:[],fonts:[],issues:[]});
 render(<PackagingTemplatesPage api={{packaging,listProducts:async()=>[],listDictionaries:async()=>[]} as never}/>);
 expect(await screen.findByText('Illustrator · 未检测')).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'本机检查'}));
 expect(await screen.findByText('Illustrator · 本次读取可用')).toBeVisible();
 packaging.inspectTemplate.mockRejectedValueOnce(new Error('Illustrator 无法连接'));
 fireEvent.click(screen.getByRole('button',{name:'本机检查'}));
 expect(await screen.findByText('Illustrator · 无法确认')).toBeVisible();
});

it('identifies a duplicate original before attempting to inspect or save it',async()=>{
 const api=packagingApi();
 const value=catalog();
 value.templates=[{...template,assetRelativePath:'/original/新模板.ait'}];
 render(<TemplateEditor api={api as never} catalog={value} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
 fireEvent.click(screen.getByRole('button',{name:'选择 AIT 原始文件'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('原始 AIT 路径已由模板“标准模板”引用');
 expect(api.inspectTemplateReference).not.toHaveBeenCalled();
 expect(api.saveTemplateReference).not.toHaveBeenCalled();
});

it('retains the last saved generation mode when a save fails',async()=>{
 const api=packagingApi();
 api.saveConfig.mockRejectedValueOnce(new Error('写入失败'));
 render(<ConfigEditor api={api as never} catalog={catalog()} projects={lookups.projects as never} onSaved={saved}/>);
 fireEvent.change(screen.getByLabelText('配置项目'),{target:{value:'3'}});
 fireEvent.change(screen.getByLabelText('生成方式'),{target:{value:'existing'}});
 fireEvent.click(screen.getByRole('button',{name:'保存项目配置'}));
 expect(await screen.findByRole('alert')).toHaveTextContent('写入失败');
 const summary=screen.getByRole('region',{name:'当前配置摘要'});
 expect(summary).toHaveTextContent('AIT 自动生成');
 expect(summary).toHaveTextContent('有未保存更改');
 expect(summary).not.toHaveTextContent('使用现成文件');
 expect(screen.getByLabelText('生成方式')).toHaveValue('existing');
});
