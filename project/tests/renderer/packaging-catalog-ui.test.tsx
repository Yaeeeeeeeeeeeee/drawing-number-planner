import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PackagingTemplatesPage } from '../../src/renderer/pages/PackagingTemplatesPage';
import { ConfigEditor, RuleEditor, TemplateEditor } from '../../src/renderer/pages/packaging/PackagingEditors';
import type { PackagingCatalog, PackagingParameter, PackagingTemplate } from '../../src/core/packaging/packaging-types';

const project={id:3,name:'铭牌',code:'01',parentId:2,status:'active'};
const lookups={products:[],projects:[project],mains:[{id:2,name:'印刷件',code:'04',status:'active'}],brands:[]};
const template={id:9,name:'标准模板',mainCategoryId:2,projectItemId:3,brandIds:[],productIds:[],fields:[{objectName:'图号文字',sourceKey:'DRAWING_NO',required:true},{objectName:'品牌文字',sourceKey:'BRAND',required:false}],requiredFonts:['ExistingFont'],status:'active',fileName:'标准.ait',revision:1,assetRelativePath:'templates/标准.ait',sha256:'hash',createdAt:'2026-11-02',updatedAt:'2026-11-02'} as PackagingTemplate;
const parameters:PackagingParameter[]=[{key:'side_a',label:'旧长',type:'number',axis:'length',required:true,unit:'mm'},{key:'side_b',label:'旧宽',type:'number',axis:'width',required:true,unit:'mm'},{key:'legacy_note',label:'历史规格说明',type:'text',required:true}];
function catalog():PackagingCatalog{return {templates:[template],dimensions:[],rules:[],configs:[{projectItemId:3,mode:'ait',parameters}]};}
function packagingApi(){return {getCatalog:vi.fn().mockResolvedValue(catalog()),saveConfig:vi.fn().mockResolvedValue({}),updateTemplate:vi.fn().mockResolvedValue(template),replaceTemplateFile:vi.fn().mockResolvedValue(template),createTemplate:vi.fn().mockResolvedValue(template),saveRule:vi.fn().mockResolvedValue({}),inspectTemplate:vi.fn().mockResolvedValue({fields:[],textObjects:[{objectName:'图号文字',editable:true},{objectName:'其他文字',editable:true}],fonts:['DetectedFont'],issues:[]}),inspectTemplateFile:vi.fn().mockResolvedValue({fields:[],textObjects:[{objectName:'上传图号',editable:true}],fonts:['UploadFont'],issues:[]})};}
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
    fireEvent.change(screen.getByLabelText('AIT 对象名称 1'),{target:{value:'新的图号文字'}});
    fireEvent.click(screen.getByRole('checkbox',{name:'必填 1'}));
    fireEvent.click(screen.getByRole('button',{name:'保存模板'}));
    await waitFor(()=>expect(api.updateTemplate).toHaveBeenCalledWith(9,expect.objectContaining({fields:[{objectName:'新的图号文字',sourceKey:'DRAWING_NO',required:false},template.fields[1]]})));
  });
  it('reads selected AIT objects and fonts without saving the immutable asset',async()=>{
    const api=packagingApi();render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
    const file=new File(['ait'],'新模板.ait');fireEvent.change(screen.getByLabelText(/AIT 原始文件/),{target:{files:[file]}});
    await waitFor(()=>expect(document.querySelector('#packaging-ait-objects option[value="上传图号"]')).toBeInTheDocument());
    expect(api.inspectTemplateFile).toHaveBeenCalledWith(file,template.fields,template.requiredFonts);
    expect(screen.getByLabelText('所需字体')).toHaveValue('ExistingFont, UploadFont');
    expect(api.replaceTemplateFile).not.toHaveBeenCalled();
  });
  it('keeps draft and manual controls when automatic AIT inspection fails',async()=>{
    const api=packagingApi();api.inspectTemplateFile.mockRejectedValue(new Error('Illustrator 未启动'));
    render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
    fireEvent.change(screen.getByLabelText('模板名称'),{target:{value:'未保存模板'}});
    fireEvent.change(screen.getByLabelText(/AIT 原始文件/),{target:{files:[new File(['ait'],'新模板.ait')]}});
    expect(await screen.findByText(/Illustrator 未启动/)).toBeVisible();
    expect(screen.getByLabelText('模板名称')).toHaveValue('未保存模板');
    expect(screen.getByLabelText('AIT 对象名称 1')).toHaveValue('图号文字');
    expect(screen.getByLabelText('所需字体')).toHaveValue('ExistingFont');
    expect(screen.getByRole('button',{name:'保存模板'})).toBeEnabled();
  });
  it('offers saved AIT object inspection and retains manual names',async()=>{
    const api=packagingApi();render(<TemplateEditor api={api as never} initial={template} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'读取对象与字体'}));
    await waitFor(()=>expect(document.querySelector('#packaging-ait-objects option[value="其他文字"]')).toBeInTheDocument());
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
    fireEvent.click(screen.getByLabelText('允许长宽互换（高度不参与）'));fireEvent.click(screen.getByRole('button',{name:'保存匹配规则'}));
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
it('reads a newly selected AIT before the user knows its drawing text object name',async()=>{const api=packagingApi();render(<TemplateEditor api={api as never} lookups={lookups as never} onSaved={saved} onCancel={()=>{}}/>);const file=new File(['new AIT'],'新文件.ait');fireEvent.change(screen.getByLabelText(/AIT 原始文件/),{target:{files:[file]}});await waitFor(()=>expect(api.inspectTemplateFile).toHaveBeenCalledWith(file,[],[]));expect(api.createTemplate).not.toHaveBeenCalled();expect(document.querySelector('#packaging-ait-objects option[value="上传图号"]')).not.toBeNull();});
