import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanningPage } from '../../src/renderer/pages/PlanningPage';
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
  expect(open).toHaveBeenCalledWith({productId:1,drawingIds:[10],fullCodes:['02.0404.010.0401001'],initialDrawingId:10});
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

it('keeps packaging setup out of planning and never waits for or reads the packaging catalog',async()=>{
  const {api}=dimensionsFixture();api.packaging.getCatalog.mockImplementation(()=>new Promise(()=>{}));
  render(<PlanningPage api={api as never}/>);await completeFirstRow();
  expect(api.packaging.getCatalog).not.toHaveBeenCalled();
  expect(screen.queryByRole('group',{name:'第 1 行本次尺寸'})).toBeNull();
  expect(screen.queryByLabelText('新规格名称')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
  expect(await screen.findByText('02.0404.010.0401001')).toBeVisible();
  expect(screen.getByRole('button',{name:'确认批量占号'})).toBeEnabled();
});

it('shows each preview beneath its own fields and copies the confirmed batch with exact identity navigation',async()=>{
  const api=apiFixture();const onGenerateFiles=vi.fn(),open=vi.fn(),copy=vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:copy}});
  const first={clientId:'row-1',fullCode:'02.0404.010.0401001',displayName:'SAMKYO-ZC200白色-LOGO',sequence:1};
  const second={...first,clientId:'row-2',fullCode:'02.0404.010.0403001',displayName:'SAMKYO-ZC200白色-面板',sequence:2};
  api.previewPlan.mockResolvedValue({productId:1,appearanceId:3,rows:[second,first]} as never);
  api.reservePlan.mockResolvedValue([{id:20,...second},{id:10,...first}] as never);
  const view=render(<PlanningPage api={api as never} onGenerateFiles={onGenerateFiles} onOpenDrawingLibrary={open}/>);await completeFirstRow();
  fireEvent.click(screen.getByRole('button',{name:'添加项目'}));
  for(const [label,value] of [['主类别','5'],['项目明细','8'],['颜色','4']])fireEvent.change(screen.getByLabelText(`第 2 行${label}`),{target:{value}});
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
  const preview1=await screen.findByLabelText('项目 1 预览'),preview2=screen.getByLabelText('项目 2 预览');
  expect(within(preview1).getByText(first.fullCode)).toBeVisible();expect(within(preview2).getByText(second.fullCode)).toBeVisible();
  expect(preview1.previousElementSibling).toHaveClass('pp-fields');
  fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));await screen.findByText('已成功占用 2 个图号 · 正式保存');
  const saved=screen.getByRole('region',{name:'本次占号结果'});
  expect(within(saved).getByText('SAMKYO · ZC200 · 白色 · 面板')).toBeVisible();
  fireEvent.click(within(saved).getByRole('button',{name:`复制图号 ${first.fullCode}`}));
  await waitFor(()=>expect(copy).toHaveBeenCalledWith(first.fullCode));
  view.rerender(<PlanningPage api={{...api} as never} onGenerateFiles={onGenerateFiles} onOpenDrawingLibrary={open}/>);
  expect(screen.getByRole('region',{name:'本次占号结果'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'查看图号库'}));
  expect(open).toHaveBeenCalledWith({productId:1,drawingIds:[20,10],fullCodes:[second.fullCode,first.fullCode],initialDrawingId:20});
  fireEvent.click(screen.getByRole('button',{name:'生成文件'}));
  expect(onGenerateFiles).toHaveBeenCalledWith(expect.objectContaining({productId:1,drawings:[{origin:'planned',id:20},{origin:'planned',id:10}]}));
  expect(onGenerateFiles.mock.calls[0][0]).not.toHaveProperty('itemSettings');
});

it('previews rows independently while keeping the explicit batch approval gate',async()=>{
  const api=apiFixture();
  api.previewPlan.mockImplementation(async input=>({productId:1,appearanceId:3,rows:input.rows.map((row:{clientId:string})=>({clientId:row.clientId,fullCode:row.clientId==='row-1'?'02.0404.010.0401001':'02.0404.010.0403001',displayName:'实时图号',sequence:1,available:true}))}));
  render(<PlanningPage api={api as never}/>);await completeFirstRow();
  await waitFor(()=>expect(screen.getByLabelText('项目 1 预览')).toHaveTextContent('02.0404.010.0401001'));
  expect(screen.getByRole('button',{name:'确认批量占号'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'添加项目'}));
  for(const [label,value] of [['主类别','5'],['项目明细','8'],['颜色','4']])fireEvent.change(screen.getByLabelText(`第 2 行${label}`),{target:{value}});
  await waitFor(()=>expect(screen.getByLabelText('项目 2 预览')).toHaveTextContent('02.0404.010.0403001'));
  expect(screen.getByLabelText('项目 1 预览')).toHaveTextContent('02.0404.010.0401001');
  expect(screen.getByRole('button',{name:'确认批量占号'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
  await waitFor(()=>expect(screen.getByRole('button',{name:'确认批量占号'})).toBeEnabled());
  expect(api.previewPlan).toHaveBeenLastCalledWith(expect.objectContaining({rows:[expect.objectContaining({clientId:'row-1'}),expect.objectContaining({clientId:'row-2'})]}));
  expect(api.reservePlan).not.toHaveBeenCalled();
});

it('discards stale per-row live responses and keeps another row preview after one row fails',async()=>{
  const api=apiFixture();let release!:(value:unknown)=>void;
  api.previewPlan.mockImplementation(input=>input.rows[0].clientId==='row-2'?Promise.resolve({productId:1,appearanceId:3,rows:[{clientId:'row-2',fullCode:'第二行有效',sequence:1,available:true}]} as never):new Promise(resolve=>{release=resolve;}));
  render(<PlanningPage api={api as never}/>);await completeFirstRow();
  await waitFor(()=>expect(release).toBeDefined());
  fireEvent.change(screen.getByLabelText('第 1 行项目明细'),{target:{value:'8'}});
  await act(async()=>{release({productId:1,appearanceId:3,rows:[{clientId:'row-1',fullCode:'过期结果',sequence:1,available:true}]});});
  expect(screen.queryByText('过期结果')).toBeNull();
  api.previewPlan.mockImplementation(input=>input.rows[0].clientId==='row-2'?Promise.resolve({productId:1,appearanceId:3,rows:[{clientId:'row-2',fullCode:'第二行有效',sequence:1,available:true}]} as never):Promise.reject(new Error('第一行占号冲突')));
  fireEvent.click(screen.getByRole('button',{name:'添加项目'}));
  for(const [label,value] of [['主类别','5'],['项目明细','8'],['颜色','4']])fireEvent.change(screen.getByLabelText(`第 2 行${label}`),{target:{value}});
  expect(await screen.findByText('第一行占号冲突')).toBeVisible();
  await waitFor(()=>expect(screen.getByLabelText('项目 2 预览')).toHaveTextContent('第二行有效'));
  expect(api.reservePlan).not.toHaveBeenCalled();
});

it('refreshes newly saved products and dictionary options on reentry while preserving the same planning draft',async()=>{
  const api={...apiFixture(),createProduct:vi.fn(),createDictionary:vi.fn()};const products=await api.listProducts();
  const lookups=new Map<string,unknown[]>();for(const type of ['appearance','color','main_category','project_item'])lookups.set(type,await api.listDictionaries(type as never));
  api.listProducts.mockImplementation(async()=>[...products]);api.listDictionaries.mockImplementation(async type=>[...(lookups.get(type)??[])] as never);
  api.createProduct.mockImplementation(async input=>{const product={...products[0],...input,id:2};products.push(product);return product;});
  api.createDictionary.mockImplementation(async(type,input)=>{const item={...input,id:25,status:'active'};lookups.get(type)!.push(item);return item;});
  const view=render(<PlanningPage api={api as never} active/>);await completeFirstRow();
  const note=screen.getByLabelText('第 1 行备注');fireEvent.change(note,{target:{value:'未完成草稿'}});
  view.rerender(<PlanningPage api={api as never} active={false}/>);
  await api.createProduct({model:'新增型号'});await api.createDictionary('appearance',{code:'25',name:'新增外观'});
  expect(screen.queryByRole('option',{name:'SKU待补录 · 新增型号 · SAMKYO'})).toBeNull();
  view.rerender(<PlanningPage api={api as never} active/>);
  expect(await screen.findByRole('option',{name:'SKU待补录 · 新增型号 · SAMKYO'})).toBeInTheDocument();
  expect(screen.getByRole('option',{name:'25 · 新增外观'})).toBeInTheDocument();
  expect(screen.getByLabelText('第 1 行备注')).toBe(note);expect(note).toHaveValue('未完成草稿');
  expect(screen.getByLabelText('产品型号')).toHaveValue('1');expect(screen.getByLabelText('第 1 行项目明细')).toHaveValue('6');
});

it('retains the successful reserved identities across lookup refresh on reentry',async()=>{
  const api=apiFixture(),open=vi.fn(),generate=vi.fn();const view=render(<PlanningPage api={api as never} onOpenDrawingLibrary={open} onGenerateFiles={generate} active/>);await completeFirstRow();
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));await screen.findByText('02.0404.010.0401001');
  fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));const result=await screen.findByRole('region',{name:'本次占号结果'});
  view.rerender(<PlanningPage api={api as never} onOpenDrawingLibrary={open} onGenerateFiles={generate} active={false}/>);
  const products=await api.listProducts();api.listProducts.mockResolvedValue([...products,{...products[0],id:2,model:'新增型号'}]);
  view.rerender(<PlanningPage api={api as never} onOpenDrawingLibrary={open} onGenerateFiles={generate} active/>);
  await screen.findByRole('option',{name:'SKU待补录 · 新增型号 · SAMKYO'});
  expect(screen.getByRole('region',{name:'本次占号结果'})).toBe(result);expect(result).toHaveTextContent('SAMKYO · ZC200 · 白色 · LOGO');
  fireEvent.click(screen.getByRole('button',{name:'查看图号库'}));expect(open).toHaveBeenCalledWith(expect.objectContaining({productId:1,drawingIds:[10],initialDrawingId:10}));
  fireEvent.click(screen.getByRole('button',{name:'生成文件'}));expect(generate).toHaveBeenCalledWith(expect.objectContaining({productId:1,drawings:[{origin:'planned',id:10}]}));expect(api.reservePlan).toHaveBeenCalledOnce();
});

it('ignores an older activation lookup response after a newer reentry has loaded',async()=>{
  const api=apiFixture();const old=await api.listProducts();let release!:(value:typeof old)=>void;
  api.listProducts.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;})).mockResolvedValue([{...old[0],id:2,model:'新版本型号'}]);
  const view=render(<PlanningPage api={api as never} active/>);
  view.rerender(<PlanningPage api={api as never} active={false}/>);view.rerender(<PlanningPage api={api as never} active/>);
  expect(await screen.findByRole('option',{name:'SKU待补录 · 新版本型号 · SAMKYO'})).toBeInTheDocument();
  await act(async()=>{release(old);});
  expect(screen.getByRole('option',{name:'SKU待补录 · 新版本型号 · SAMKYO'})).toBeInTheDocument();expect(screen.queryByRole('option',{name:'SKU待补录 · ZC200 · SAMKYO'})).toBeNull();
});
