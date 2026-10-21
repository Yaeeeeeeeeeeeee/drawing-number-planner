import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PlanningPage } from '../../src/renderer/pages/PlanningPage';

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
  fireEvent.change(await screen.findByLabelText('产品型号'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('外观'), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('第 1 行主类别'), { target: { value: '5' } });
  expect(screen.getByRole('option', { name: '01 · LOGO' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '01 · 纸箱' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('第 1 行项目明细'), { target: { value: '6' } });
  fireEvent.change(screen.getByLabelText('第 1 行颜色'), { target: { value: '4' } });
}

describe('PlanningPage', () => {
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
    fireEvent.change(await screen.findByLabelText('产品型号'), { target: { value: '1' } });
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

it('carries selected appearance through preview and reservation and opens that exact library scope',async()=>{
  const api={...apiFixture(),listAppearanceVersions:vi.fn().mockResolvedValue({productId:1,revision:0,items:[{id:41,productId:1,appearanceId:3,versionNumber:1,label:'一代',status:'historical'},{id:42,productId:1,appearanceId:3,versionNumber:2,label:'二代',status:'current'}]})};
  const open=vi.fn();render(<PlanningPage api={api as never} onOpenDrawingLibrary={open}/>);
  fireEvent.change(await screen.findByLabelText('产品型号'),{target:{value:'1'}});
  await waitFor(()=>expect(screen.getByLabelText('外观版本')).toHaveValue('42'));
  fireEvent.change(screen.getByLabelText('第 1 行主类别'),{target:{value:'5'}});
  fireEvent.change(screen.getByLabelText('第 1 行项目明细'),{target:{value:'6'}});
  fireEvent.change(screen.getByLabelText('第 1 行颜色'),{target:{value:'4'}});
  fireEvent.click(screen.getByRole('button',{name:'查重并预览'}));
  await waitFor(()=>expect(api.previewPlan).toHaveBeenCalledWith(expect.objectContaining({productId:1,appearanceVersionId:42})));
  fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));
  fireEvent.click(await screen.findByRole('button',{name:'查看图号库'}));
  expect(api.reservePlan).toHaveBeenCalledWith(expect.objectContaining({appearanceVersionId:42}));expect(open).toHaveBeenCalledWith({productId:1,appearanceVersionId:42});
});
