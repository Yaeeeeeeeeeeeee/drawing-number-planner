import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanningPage } from '../../src/renderer/pages/PlanningPage';
import { PackagingTasks } from '../../src/renderer/pages/packaging/PackagingTaskPanel';
import type { PackagingCatalog } from '../../src/core/packaging/packaging-types';

function apiFixture() {
  const product = { id: 1, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
    defaultAppearanceId: 3, defaultAppearanceName: '一号外观', model: 'ZC200', productCategory: '冰柜',
    referenceProductId: null, referenceProductModel: null, status: 'active' as const };
  const dictionaries = {
    appearance: [{ id: 3, code: '01', name: '一号外观', status: 'active' }],
    color: [{ id: 4, code: '0', name: '白色', status: 'active' }],
    main_category: [{ id: 5, code: '04', name: '印刷件类', status: 'active' }],
    project_item: [
      { id: 6, code: '01', name: 'LOGO', parentId: 5, status: 'active' },
      { id: 8, code: '03', name: '面板', parentId: 5, status: 'active' },
      { id: 9, code: '04', name: '顶部贴纸', parentId: 5, status: 'active' },
      { id: 10, code: '05', name: '压缩机标签', parentId: 5, status: 'active' },
      { id: 11, code: '06', name: '大外箱', parentId: 5, status: 'active' },
      { id: 7, code: '01', name: '纸箱', parentId: 99, status: 'active' },
    ],
  };
  return {
    listProducts: vi.fn().mockResolvedValue([product]),
    listDictionaries: vi.fn((type: keyof typeof dictionaries) => Promise.resolve(dictionaries[type] ?? [])),
    previewPlan: vi.fn().mockResolvedValue({ productId: 1, appearanceId: 3, rows: [{
      clientId: 'row-1', fullCode: '02.0404.010.0401001', displayName: 'SAMKYO-ZC200白色-LOGO',
      prefix: '02.0404.010.0401', sequence: 1, available: true,
    }] }),
    reservePlan: vi.fn().mockResolvedValue([{ id: 10, fullCode: '02.0404.010.0401001',
      displayName: 'SAMKYO-ZC200白色-LOGO', status: 'reserved' }]),
  };
}

async function completeFirstRow() {
  await screen.findByRole('option', { name: 'SKU待补录 · ZC200 · SAMKYO' });
  fireEvent.change(screen.getByLabelText('产品型号'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('外观'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('第 1 行主类别'), { target: { value: '5' } });
  expect(screen.getByRole('option', { name: '01 · LOGO' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '01 · 纸箱' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('第 1 行项目明细'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('第 1 行颜色'), { target: { value: '4' } });
  expect(screen.getByRole('button', { name: '查重并预览' })).toBeEnabled();
}

describe('PlanningPage', () => {
  it('links product category to actual product IDs and clears incompatible selection and appearance', async () => {
    const api = apiFixture();
    const products = await api.listProducts();
    api.listProducts.mockResolvedValue([...products, {...products[0],id:2,model:'F20',productCategory:'空气炸锅'}]);
    render(<PlanningPage api={api as never}/>);
    await screen.findByRole('option',{name:'SKU待补录 · ZC200 · SAMKYO'});
    fireEvent.change(screen.getByLabelText('产品类别'),{target:{value:'冰柜'}});
    expect(screen.queryByRole('option',{name:'SKU待补录 · F20 · SAMKYO'})).toBeNull();
    fireEvent.change(screen.getByLabelText('产品型号'),{target:{value:'1'}});
    expect(screen.getByLabelText('外观')).toHaveValue('3');
    fireEvent.change(screen.getByLabelText('产品类别'),{target:{value:'空气炸锅'}});
    expect(screen.getByLabelText('产品型号')).toHaveValue('');expect(screen.getByLabelText('外观')).toHaveValue('');
  });
  it('previews a complete row and reserves only after explicit confirmation', async () => {
    const api = apiFixture(); render(<PlanningPage api={api as never} />);
    await completeFirstRow();
    fireEvent.click(screen.getByRole('button', { name: '查重并预览' }));

    expect(await screen.findByText('02.0404.010.0401001')).toBeVisible();
    expect(screen.getByText('可占用')).toBeVisible();
    expect(api.reservePlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认批量占号' }));

    await waitFor(() => expect(api.reservePlan).toHaveBeenCalledWith(expect.objectContaining({
      productId: 1, appearanceId: 3,
      rows: [expect.objectContaining({ clientId: 'row-1', expectedFullCode: '02.0404.010.0401001' })],
    })));
    expect(await screen.findByText('已成功占用 1 个图号 · 正式保存')).toBeVisible();
  });

  it('adds and removes batch rows without allowing an incomplete preview', async () => {
    const api = apiFixture(); render(<PlanningPage api={api as never} />);
    expect(await screen.findAllByText('项目 1')).toHaveLength(1);
    expect(screen.getByText('项目 1').closest('.pp-fields')).toBeNull();
    expect(screen.getByText('项目 1').closest('.pp-row')).toBeNull();
    expect(screen.getByRole('button', { name: '查重并预览' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '添加项目' }));
    expect(screen.getByText('项目 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '删除项目 2' }));
    expect(screen.queryByText('项目 2')).not.toBeInTheDocument();
  });

  it('allows any active packaging items supplied by the dictionary in one batch', async () => {
    const api = apiFixture(); render(<PlanningPage api={api as never} />);
    await screen.findByRole('option', { name: 'SKU待补录 · ZC200 · SAMKYO' });
    fireEvent.change(screen.getByLabelText('产品型号'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('外观'), { target: { value: '3' } });
    for (let index = 2; index <= 4; index += 1) fireEvent.click(screen.getByRole('button', { name: '添加项目' }));
    const projectIds = ['8', '9', '10', '11'];
    projectIds.forEach((projectId, index) => {
      const row = index + 1;
      fireEvent.change(screen.getByLabelText(`第 ${row} 行主类别`), { target: { value: '5' } });
      fireEvent.change(screen.getByLabelText(`第 ${row} 行项目明细`), { target: { value: projectId } });
      fireEvent.change(screen.getByLabelText(`第 ${row} 行颜色`), { target: { value: '4' } });
    });

    fireEvent.click(screen.getByRole('button', { name: '查重并预览' }));

    await waitFor(() => expect(api.previewPlan).toHaveBeenCalledWith(expect.objectContaining({
      rows: projectIds.map((projectItemId, index) => expect.objectContaining({
        clientId: `row-${index + 1}`, projectItemId: Number(projectItemId),
      })),
    })));
  });

  it('keeps the draft and asks for a fresh check when approval is stale', async () => {
    const api = apiFixture(); api.reservePlan.mockRejectedValueOnce(new Error('推荐图号已变化，请重新查重后再占号'));
    render(<PlanningPage api={api as never} />); await completeFirstRow();
    fireEvent.click(screen.getByRole('button', { name: '查重并预览' }));
    await screen.findByText('02.0404.010.0401001');
    fireEvent.click(screen.getByRole('button', { name: '确认批量占号' }));
    expect(await screen.findByText('推荐图号已变化，请重新查重后再占号')).toBeVisible();
    expect(screen.getByRole('button', { name: '重新查重' })).toBeVisible();
    expect(screen.getByLabelText('第 1 行颜色')).toHaveValue('4');
  });

  it('discards a preview response when the draft changes while the request is pending', async () => {
    const api = apiFixture();
    api.listProducts.mockResolvedValue([
      { id: 1, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
        defaultAppearanceId: 3, defaultAppearanceName: '一号外观', model: 'ZC200', productCategory: '冰柜',
        referenceProductId: null, referenceProductModel: null, status: 'active' },
      { id: 2, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
        defaultAppearanceId: 3, defaultAppearanceName: '一号外观', model: 'ZC220', productCategory: '冰柜',
        referenceProductId: null, referenceProductModel: null, status: 'active' },
    ]);
    let resolvePreview!: (value: Awaited<ReturnType<typeof api.previewPlan>>) => void;
    api.previewPlan.mockImplementationOnce(() => new Promise((resolve) => { resolvePreview = resolve; }));
    render(<PlanningPage api={api as never} />); await completeFirstRow();
    fireEvent.click(screen.getByRole('button', { name: '查重并预览' }));
    expect(screen.getByLabelText('产品型号')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('产品型号'), { target: { value: '2' } });
    resolvePreview({ productId: 1, appearanceId: 3, rows: [{ clientId: 'row-1',
      fullCode: '02.0404.010.0401001', displayName: 'SAMKYO-ZC200白色-LOGO',
      prefix: '02.0404.010.0401', sequence: 1, available: true }] });

    await waitFor(() => expect(screen.queryByText('SAMKYO-ZC200白色-LOGO')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: '确认批量占号' })).toBeDisabled();
  });
});

it('uses the original appearance dictionary and reserves a product-only library scope',async()=>{
  const api={...apiFixture(),listAppearanceVersions:vi.fn().mockResolvedValue({items:[]})};
  const open=vi.fn();render(<PlanningPage api={api as never} onOpenDrawingLibrary={open}/>);
  await completeFirstRow();
  expect(screen.getByLabelText('外观')).toHaveValue('3');
  expect(screen.queryByLabelText('外观版本')).toBeNull();
  expect(api.listAppearanceVersions).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
  await waitFor(()=>expect(api.previewPlan).toHaveBeenCalled());
  expect(api.previewPlan.mock.calls[0][0]).not.toHaveProperty('appearanceVersionId');
  fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));
  fireEvent.click(await screen.findByRole('button',{name:'查看图号库'}));
  expect(api.reservePlan.mock.calls[0][0]).not.toHaveProperty('appearanceVersionId');
  expect(open).toHaveBeenCalledWith({productId:1});
});

it('allows choosing a different dictionary appearance without editing the product default',async()=>{
 const api=apiFixture();
 const original=api.listDictionaries.getMockImplementation()!;
 api.listDictionaries.mockImplementation(type=>type==='appearance'?Promise.resolve([{id:3,code:'01',name:'一号外观',status:'active'},{id:12,code:'02',name:'二号外观',status:'active'}]):original(type));
 render(<PlanningPage api={api as never}/>);await completeFirstRow();
 fireEvent.change(screen.getByLabelText('外观'),{target:{value:'12'}});
 fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
 await waitFor(()=>expect(api.previewPlan).toHaveBeenCalledWith(expect.objectContaining({productId:1,appearanceId:12})));
 expect(api.previewPlan.mock.calls[0][0]).not.toHaveProperty('appearanceVersionId');
});

it('opens packaging with only the IDs returned by the successful current reservation',async()=>{
  const api=apiFixture();const onGenerateFiles=vi.fn();render(<PlanningPage api={api as never} onGenerateFiles={onGenerateFiles}/>);
  await completeFirstRow();expect(screen.getByRole('button',{name:'生成文件'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));await screen.findByText('02.0404.010.0401001');
  expect(screen.getByRole('button',{name:'生成文件'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));await screen.findByText('已成功占用 1 个图号 · 正式保存');
  fireEvent.click(screen.getByRole('button',{name:'生成文件'}));
  expect(onGenerateFiles).toHaveBeenCalledWith(expect.objectContaining({productId:1,drawings:[{origin:'planned',id:10}]}));
  fireEvent.change(screen.getByLabelText('第 1 行主类别'),{target:{value:'5'}});
  expect(screen.getByRole('button',{name:'生成文件'})).toBeDisabled();
});

function dimensionsFixture() {
  const shared = {id:1,revision:1,name:'通用 LOGO',projectItemId:6,scope:'shared' as const,productIds:[1],parameters:{width:100,height:50},isDefault:true,status:'active' as const,ratioKeys:['width','height'] as [string,string],ratio:2};
  const catalog:PackagingCatalog={templates:[],rules:[],dimensions:[shared,{...shared,id:2,scope:'specific',name:'型号 LOGO',parameters:{width:80,height:40}},{...shared,id:3,scope:'specific',name:'备用 LOGO',isDefault:false,parameters:{width:60,height:30}}],configs:[{projectItemId:6,mode:'ait',parameters:[{key:'width',label:'宽度',type:'number',required:true,unit:'mm'},{key:'height',label:'高度',type:'number',required:true,unit:'mm'}]}]};
  const api={...apiFixture(),packaging:{getCatalog:vi.fn().mockResolvedValue(catalog),saveDimension:vi.fn().mockImplementation(async input=>({...input,id:4,revision:1}))}};
  return {api,catalog};
}

it('loads the specific default before preview, allows other profiles and keeps temporary ratio edits isolated',async()=>{
  const {api,catalog}=dimensionsFixture();render(<PlanningPage api={api as never}/>);await completeFirstRow();
  const dimensions=await screen.findByRole('group',{name:'第 1 行本次尺寸'});
  expect(within(dimensions).getByLabelText('尺寸规格')).toHaveValue('2');
  expect(within(dimensions).getByLabelText('宽度 (mm)')).toHaveValue(80);
  fireEvent.change(within(dimensions).getByLabelText('尺寸规格'),{target:{value:'3'}});
  expect(within(dimensions).getByLabelText('高度 (mm)')).toHaveValue(30);
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));await screen.findByText('02.0404.010.0401001');
  fireEvent.change(within(dimensions).getByLabelText('宽度 (mm)'),{target:{value:'120'}});
  expect(within(dimensions).getByLabelText('高度 (mm)')).toHaveValue(60);
  expect(screen.getByRole('button',{name:'确认批量占号'})).toBeEnabled();
  expect(screen.getByRole('button',{name:'生成文件'})).toBeDisabled();
  fireEvent.click(within(dimensions).getByLabelText(/锁定比例/));
  fireEvent.change(within(dimensions).getByLabelText('宽度 (mm)'),{target:{value:'140'}});
  expect(within(dimensions).getByLabelText('高度 (mm)')).toHaveValue(60);
  expect(catalog.dimensions[2].parameters).toEqual({width:60,height:30});
  expect(api.packaging.saveDimension).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('第 1 行项目明细'),{target:{value:'8'}});
  fireEvent.change(screen.getByLabelText('第 1 行项目明细'),{target:{value:'6'}});
  expect(screen.getByLabelText('宽度 (mm)')).toHaveValue(80);
});

it('saves a new dimension profile and changes the default only on explicit request',async()=>{
  const {api}=dimensionsFixture();render(<PlanningPage api={api as never}/>);await completeFirstRow();
  await screen.findByLabelText('宽度 (mm)');
  fireEvent.change(screen.getByLabelText('宽度 (mm)'),{target:{value:'90'}});
  fireEvent.change(screen.getByLabelText('新规格名称'),{target:{value:'本次 LOGO'}});
  fireEvent.click(screen.getByRole('button',{name:'另存尺寸规格'}));
  await waitFor(()=>expect(api.packaging.saveDimension).toHaveBeenCalledWith(expect.objectContaining({name:'本次 LOGO',projectItemId:6,scope:'specific',productIds:[1],parameters:{width:90,height:45},isDefault:false})));
  await screen.findByText('已另存尺寸档案；本次参数保持不变');
  fireEvent.click(screen.getByLabelText('设为此产品默认'));
  fireEvent.click(screen.getByRole('button',{name:'另存尺寸规格'}));
  await waitFor(()=>expect(api.packaging.saveDimension).toHaveBeenLastCalledWith(expect.objectContaining({isDefault:true})));
  expect(screen.getByLabelText('宽度 (mm)')).toHaveValue(90);
});

it('freezes each reserved dimension setting by the returned formal drawing identity despite reordered results',async()=>{
  const {api}=dimensionsFixture();const onGenerateFiles=vi.fn();
  const first={clientId:'row-1',fullCode:'02.0404.010.0401001',displayName:'LOGO 1',sequence:1};
  const second={...first,clientId:'row-2',fullCode:'02.0404.010.0401002',displayName:'LOGO 2',sequence:2};
  api.previewPlan.mockResolvedValue({productId:1,appearanceId:3,rows:[second,first]} as never);
  api.reservePlan.mockResolvedValue([{id:20,...second},{id:10,...first}] as never);
  render(<PlanningPage api={api as never} onGenerateFiles={onGenerateFiles}/>);await completeFirstRow();
  fireEvent.change(await screen.findByLabelText('宽度 (mm)'),{target:{value:'120'}});
  fireEvent.click(screen.getByRole('button',{name:'添加项目'}));
  for(const [label,value] of [['主类别','5'],['项目明细','6'],['颜色','4']])fireEvent.change(screen.getByLabelText(`第 2 行${label}`),{target:{value}});
  fireEvent.change(within(screen.getByRole('group',{name:'第 2 行本次尺寸'})).getByLabelText('宽度 (mm)'),{target:{value:'160'}});
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));await screen.findByText(first.fullCode);
  fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));await screen.findByText('已成功占用 2 个图号 · 正式保存');
  fireEvent.click(screen.getByRole('button',{name:'生成文件'}));
  expect(onGenerateFiles).toHaveBeenCalledWith(expect.objectContaining({itemSettings:[
    {origin:'planned',id:20,input:{mode:'ait',dimensionProfileId:2,parameters:{width:160,height:80},ratioLocked:true}},
    {origin:'planned',id:10,input:{mode:'ait',dimensionProfileId:2,parameters:{width:120,height:60},ratioLocked:true}},
  ]}));
  expect(api.reservePlan.mock.calls[0][0].rows.map((r:{clientId:string})=>r.clientId)).toEqual(['row-1','row-2']);
  expect(api.reservePlan.mock.calls[0][0].rows[0]).not.toHaveProperty('parameters');
});

it('applies planning settings once by drawing identity on creation and never overwrites an existing task on continue',async()=>{
  const {api,catalog}=dimensionsFixture();
  const task={id:'task',productId:1,model:'ZC200',name:'首批',type:'new',state:'active',productDirectory:'ZC200',taskDirectory:'ZC200/00.临时文件/当前任务',createdAt:'2026-10-30',pendingFiles:[],items:[{id:55,taskId:'task',drawing:{origin:'planned',id:10},fullCode:'02.0404.010.0401001',projectItemId:6,projectName:'LOGO',color:'白',mode:'ait',parameters:{width:80,height:40},state:'pending'}]};
  const settings={mode:'ait' as const,dimensionProfileId:2,parameters:{width:120,height:60},ratioLocked:true};
  const packaging={...api.packaging,listTasks:vi.fn().mockResolvedValue([]),getProductDirectories:vi.fn().mockResolvedValue([{relativePath:'ZC200',exists:true}]),createTask:vi.fn().mockResolvedValue(task),updateItem:vi.fn().mockResolvedValue({...task,items:[{...task.items[0],...settings}]}),getTask:vi.fn().mockResolvedValue(task)};
  const target={productId:1,drawings:[{origin:'planned' as const,id:10}],itemSettings:[{origin:'planned' as const,id:10,input:settings}]};
  const props={api:{...api,packaging,searchDrawings:vi.fn().mockResolvedValue({items:[],total:0})} as never,catalog,lookups:{products:[],projects:[],mains:[],brands:[]},target,onCatalogChanged:async()=>{}};
  const view=render(<PackagingTasks {...props}/>);
  fireEvent.change(screen.getByLabelText('任务名称'),{target:{value:'首批'}});
  await waitFor(()=>expect(screen.getByLabelText('实际产品目录')).toHaveValue('ZC200'));
  fireEvent.click(screen.getByRole('button',{name:'创建任务'}));
  await screen.findByRole('region',{name:'02.0404.010.0401001 LOGO'});
  expect(packaging.updateItem).toHaveBeenCalledExactlyOnceWith('task',55,settings);
  view.unmount();packaging.listTasks.mockResolvedValue([task] as never);packaging.updateItem.mockClear();
  render(<PackagingTasks {...props}/>);
  fireEvent.click(await screen.findByRole('button',{name:'继续现有任务'}));
  await screen.findByRole('region',{name:'02.0404.010.0401001 LOGO'});
  expect(packaging.updateItem).not.toHaveBeenCalled();
});

it('waits for the optional dimension catalog before preview while preserving planning if its read fails',async()=>{
  const {api}=dimensionsFixture();let rejectCatalog!:(reason:Error)=>void;
  api.packaging.getCatalog.mockImplementationOnce(()=>new Promise((_resolve,reject)=>{rejectCatalog=reject;}));
  render(<PlanningPage api={api as never}/>);
  await screen.findByRole('option',{name:'SKU待补录 · ZC200 · SAMKYO'});
  fireEvent.change(screen.getByLabelText('产品型号'),{target:{value:'1'}});
  for(const [label,value] of [['主类别','5'],['项目明细','6'],['颜色','4']])fireEvent.change(screen.getByLabelText(`第 1 行${label}`),{target:{value}});
  expect(screen.getByRole('button',{name:'查重并预览'})).toBeDisabled();
  expect(api.previewPlan).not.toHaveBeenCalled();
  rejectCatalog(new Error('尺寸接口暂不可用'));
  await screen.findByText(/尺寸档案未读取：尺寸接口暂不可用/);
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
  expect(await screen.findByText('02.0404.010.0401001')).toBeVisible();
});

it('keeps an unconfigured project on the existing manual-generation default',async()=>{
  const {api,catalog}=dimensionsFixture();api.packaging.getCatalog.mockResolvedValue({...catalog,configs:[]});
  const onGenerateFiles=vi.fn();render(<PlanningPage api={api as never} onGenerateFiles={onGenerateFiles}/>);await completeFirstRow();
  expect(await screen.findByText('本次尺寸 · 人工提供文件')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));await screen.findByText('02.0404.010.0401001');
  fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));await screen.findByText('已成功占用 1 个图号 · 正式保存');
  fireEvent.click(screen.getByRole('button',{name:'生成文件'}));
  expect(onGenerateFiles.mock.calls[0][0].itemSettings[0].input.mode).toBe('manual');
});

it('shows the created task and explicit handoff error if saving the frozen dimensions fails',async()=>{
  const {api,catalog}=dimensionsFixture();
  const task={id:'created',productId:1,model:'ZC200',name:'首批',type:'new',state:'active',productDirectory:'ZC200',taskDirectory:'ZC200/00.临时文件/当前任务',createdAt:'2026-10-30',pendingFiles:[],items:[{id:55,taskId:'created',drawing:{origin:'planned',id:10},fullCode:'02.0404.010.0401001',projectItemId:6,projectName:'LOGO',color:'白',mode:'ait',parameters:{width:80,height:40},state:'pending'}]};
  const packaging={...api.packaging,listTasks:vi.fn().mockResolvedValue([]),getProductDirectories:vi.fn().mockResolvedValue([{relativePath:'ZC200',exists:true}]),createTask:vi.fn().mockResolvedValue(task),updateItem:vi.fn().mockRejectedValue(new Error('尺寸规格已停用')),getTask:vi.fn().mockResolvedValue(task)};
  render(<PackagingTasks api={{...api,packaging,searchDrawings:vi.fn().mockResolvedValue({items:[],total:0})} as never} catalog={catalog} lookups={{products:[],projects:[],mains:[],brands:[]}} target={{productId:1,drawings:[{origin:'planned',id:10}],itemSettings:[{origin:'planned',id:10,input:{dimensionProfileId:2,parameters:{width:120,height:60}}}]}} onCatalogChanged={async()=>{}}/>);
  fireEvent.change(screen.getByLabelText('任务名称'),{target:{value:'首批'}});
  await waitFor(()=>expect(screen.getByLabelText('实际产品目录')).toHaveValue('ZC200'));
  fireEvent.click(screen.getByRole('button',{name:'创建任务'}));
  expect(await screen.findByRole('region',{name:'02.0404.010.0401001 LOGO'})).toBeVisible();
  expect(await screen.findByRole('alert')).toHaveTextContent('任务已创建，但本次尺寸未全部保存：尺寸规格已停用');
  expect(packaging.createTask).toHaveBeenCalledTimes(1);expect(packaging.updateItem).toHaveBeenCalledTimes(1);
});
