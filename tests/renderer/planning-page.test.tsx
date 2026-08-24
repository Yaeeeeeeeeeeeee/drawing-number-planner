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
  expect(screen.getByRole('option', { name: 'LOGO' })).toBeVisible();
  expect(screen.queryByRole('option', { name: '纸箱' })).not.toBeInTheDocument();
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
    expect(await screen.findByText('已成功占用 1 个图号')).toBeVisible();
  });

  it('adds and removes batch rows without allowing an incomplete preview', async () => {
    const api = apiFixture(); render(<PlanningPage api={api as never} />);
    expect(await screen.findAllByText('项目 1')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '查重并预览' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '添加项目' }));
    expect(screen.getByText('项目 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '删除项目 2' }));
    expect(screen.queryByText('项目 2')).not.toBeInTheDocument();
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
    expect(screen.queryByRole('button', { name: '确认批量占号' })).not.toBeInTheDocument();
  });
});
