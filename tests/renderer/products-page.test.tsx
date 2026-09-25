import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductsPage } from '../../src/renderer/pages/ProductsPage';

describe('ProductsPage', () => {
  it('summarizes only existing applicable QR records and opens the selected QR detail', async () => {
    const normal = { id: 1, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
      defaultAppearanceId: 3, defaultAppearanceName: '外观', sku: 'SKU-N', model: 'N100', productCategory: '冰柜', referenceProductId: null, referenceProductModel: null, status: 'active' };
    const fryer = { ...normal, id: 2, sku: 'SKU-A', model: 'A100', productCategory: '空气炸锅' };
    const qrCodes = [
      { id: 11, productId: 1, key: 'user_manual', displayName: '说明书二维码', status: 'active' },
      { id: 12, productId: 1, key: 'warranty', displayName: '售后二维码', status: 'inactive' },
      { id: 21, productId: 2, key: 'recipe', displayName: '菜谱二维码', status: 'inactive' },
    ];
    const api = { listProducts: vi.fn().mockResolvedValue([normal, fryer]), listQrCodes: vi.fn().mockResolvedValue({ items: qrCodes }),
      listHistoricalProductCandidates: vi.fn().mockResolvedValue([]), listDictionaries: vi.fn().mockResolvedValue([]),
      createProduct: vi.fn(), updateProduct: vi.fn(), deactivateProduct: vi.fn() };
    const onOpenQr = vi.fn();
    render(<ProductsPage api={api as never} onOpenQr={onOpenQr} />);

    expect(await screen.findByRole('button', { name: '说明书 · 启用中' })).toBeVisible();
    expect(screen.getByRole('button', { name: '售后 · 已停用' })).toBeVisible();
    expect(screen.getByRole('button', { name: '菜谱 · 已停用' })).toBeVisible();
    expect(screen.queryByText('Quick Start')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '菜谱 · 已停用' }));
    expect(onOpenQr).toHaveBeenCalledWith(21);
  });

  it('creates a product archive record with active dictionary selections', async () => {
    const dictionaries = {
      brand: [{ id: 1, code: '02', name: 'SAMKYO', status: 'active' }],
      product_size: [{ id: 2, code: '0209', name: 'ZC220冰柜', status: 'active' }],
      appearance: [{ id: 3, code: '1', name: '1号外观', status: 'active' }],
    };
    const created = { id: 9, brandId: 1, brandName: 'SAMKYO', productSizeId: 2,
      productSizeName: 'ZC220冰柜', defaultAppearanceId: 3, defaultAppearanceName: '1号外观',
      sku: 'SKDZC220JP', model: 'ZC220', productCategory: '冰柜', referenceProductId: null, referenceProductModel: null, status: 'active' };
    const inactiveManual = { id: 71, productId: 9, key: 'user_manual', displayName: '说明书二维码', status: 'inactive' };
    const api = {
      listProducts: vi.fn().mockResolvedValue([]),
      listQrCodes: vi.fn().mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [inactiveManual] }),
      listHistoricalProductCandidates: vi.fn().mockResolvedValue([]),
      listDictionaries: vi.fn((type: keyof typeof dictionaries) => Promise.resolve(dictionaries[type])),
      createProduct: vi.fn().mockResolvedValue(created),
      updateProduct: vi.fn(), deactivateProduct: vi.fn(),
    };
    render(<ProductsPage api={api as never} />);
    await screen.findByText('还没有产品档案');
    expect(screen.getByText('产品档案是图号、BOM 与 PDF 记录共用的产品身份来源。')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'SKDZC220JP' } });
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: 'ZC220' } });
    fireEvent.change(screen.getByLabelText('产品类别'), { target: { value: '冰柜' } });
    fireEvent.change(screen.getByRole('combobox', { name: /^品牌$/ }), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('品类尺寸'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('默认外观'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '保存产品' }));

    expect(await screen.findByText('ZC220')).toBeVisible();
    expect(api.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sku: 'SKDZC220JP', model: 'ZC220', brandId: 1 }));
    expect(await screen.findByRole('button', { name: '说明书 · 已停用' })).toBeVisible();
    expect(api.listQrCodes).toHaveBeenLastCalledWith({ productId: created.id });
  });

  it('searches, edits, deactivates and stores a reference product', async () => {
    const source = { id: 1, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
      defaultAppearanceId: 3, defaultAppearanceName: '1号外观', sku: 'SKDZC200JP', model: 'ZC200', productCategory: '冰柜',
      referenceProductId: null, referenceProductModel: null, status: 'active' };
    const target = { ...source, id: 2, model: 'ZC220' };
    const dictionaries = {
      brand: [{ id: 1, code: '02', name: 'SAMKYO', status: 'active' }],
      product_size: [{ id: 2, code: '0209', name: '冰柜', status: 'active' }],
      appearance: [{ id: 3, code: '1', name: '1号外观', status: 'active' }],
    };
    const api = {
      listProducts: vi.fn().mockResolvedValueOnce([source, target]).mockResolvedValueOnce([target]),
      listHistoricalProductCandidates: vi.fn().mockResolvedValue([]),
      listDictionaries: vi.fn((type: keyof typeof dictionaries) => Promise.resolve(dictionaries[type])),
      createProduct: vi.fn(),
      updateProduct: vi.fn().mockResolvedValue({ ...target, model: 'ZC220A', referenceProductId: 1, referenceProductModel: 'ZC200' }),
      deactivateProduct: vi.fn().mockResolvedValue({ ...target, status: 'inactive' }),
    };
    render(<ProductsPage api={api as never} />);
    await screen.findByText('ZC220');

    fireEvent.change(screen.getByLabelText('搜索产品'), { target: { value: 'ZC22' } });
    fireEvent.change(screen.getByLabelText('筛选品牌'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选' }));
    await waitFor(() => expect(api.listProducts).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'ZC22', brandId: 1 })));
    await waitFor(() => expect(screen.queryByText('ZC200', { exact: true })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '编辑 ZC220' }));
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: 'ZC220A' } });
    fireEvent.change(screen.getByLabelText('参考来源型号'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    expect(api.updateProduct).toHaveBeenCalledWith(2, expect.objectContaining({ model: 'ZC220A', referenceProductId: 1 }));

    fireEvent.click(await screen.findByRole('button', { name: '停用 ZC220A' }));
    expect(api.deactivateProduct).toHaveBeenCalledWith(2);
  });

  it('offers activation and central cleanup only after impact preview, exact model and confirmation', async () => {
    const inactive = { id: 2, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
      defaultAppearanceId: 3, defaultAppearanceName: '外观', sku: 'SKU-INACTIVE', model: 'ZC220', productCategory: '冰柜',
      referenceProductId: null, referenceProductModel: null, status: 'inactive' as const };
    const api = {
      listProducts: vi.fn().mockResolvedValue([inactive]), listQrCodes: vi.fn().mockResolvedValue({ items: [] }),
      listHistoricalProductCandidates: vi.fn().mockResolvedValue([]), listDictionaries: vi.fn().mockResolvedValue([]),
      createProduct: vi.fn(), updateProduct: vi.fn(), deactivateProduct: vi.fn(),
      activateProduct: vi.fn().mockResolvedValue({ ...inactive, status: 'active' }),
      previewProductCleanup: vi.fn().mockResolvedValue({ productId: 2, model: 'ZC220', sku: 'SKU-INACTIVE', blockers: [],
        owned: { drawings: 2, historicalDrawings: 3, bomRecords: 1, qrCodes: 2, batches: 4 }, preservedSnapshots: 1 }),
      cleanupProduct: vi.fn().mockResolvedValue({}),
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProductsPage api={api as never} />);
    await screen.findByText('ZC220');

    fireEvent.click(screen.getByRole('button', { name: '启用 ZC220' }));
    await waitFor(() => expect(api.activateProduct).toHaveBeenCalledWith(2));
    fireEvent.click(await screen.findByRole('button', { name: '删除 ZC220' }));

    const submit = await screen.findByRole('button', { name: '确认退出当前业务' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText('输入型号确认'), { target: { value: 'ZC220' } });
    fireEvent.click(submit);
    await waitFor(() => expect(api.cleanupProduct).toHaveBeenCalledWith(2, 'ZC220'));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('ZC220')).not.toBeInTheDocument();
    confirm.mockRestore();
  });

  it('shows cross-product blockers and disables central cleanup', async () => {
    const product = { id: 2, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
      defaultAppearanceId: 3, defaultAppearanceName: '外观', sku: 'SKU-PROTECTED', model: 'ZC220', productCategory: '冰柜',
      referenceProductId: null, referenceProductModel: null, status: 'active' as const };
    const api = {
      listProducts: vi.fn().mockResolvedValue([product]), listQrCodes: vi.fn().mockResolvedValue({ items: [] }),
      listHistoricalProductCandidates: vi.fn().mockResolvedValue([]), listDictionaries: vi.fn().mockResolvedValue([]),
      createProduct: vi.fn(), updateProduct: vi.fn(), deactivateProduct: vi.fn(), activateProduct: vi.fn(),
      previewProductCleanup: vi.fn().mockResolvedValue({ productId: 2, model: 'ZC220', sku: 'SKU-PROTECTED',
        blockers: ['其他产品 T40 的 BOM #7 仍引用本产品资料'],
        owned: { drawings: 2, historicalDrawings: 0, bomRecords: 0, qrCodes: 1, batches: 0 }, preservedSnapshots: 0 }),
      cleanupProduct: vi.fn(),
    };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ProductsPage api={api as never} />);
    await screen.findByText('ZC220');
    fireEvent.click(screen.getByRole('button', { name: '删除 ZC220' }));

    expect(await screen.findByText('其他产品 T40 的 BOM #7 仍引用本产品资料')).toBeVisible();
    expect(screen.getByRole('button', { name: '确认退出当前业务' })).toBeDisabled();
    expect(api.cleanupProduct).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('keeps historical product recognition secondary and requires explicit dictionary-backed confirmation', async () => {
    const candidate = { productCategory: '03.冰柜', sku: 'SKDZU070JP', model: 'ZU70SD', historicalDrawingCount: 4, ambiguous: false };
    const dictionaries = {
      brand: [{ id: 1, code: '02', name: 'SAMKYO', status: 'active' }],
      product_size: [{ id: 2, code: '0209', name: '冰柜', status: 'active' }],
      appearance: [{ id: 3, code: '01', name: '1号外观', status: 'active' }],
    };
    const created = { id: 12, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
      defaultAppearanceId: 3, defaultAppearanceName: '1号外观', sku: candidate.sku, model: candidate.model,
      productCategory: candidate.productCategory, referenceProductId: null, referenceProductModel: null, status: 'active' };
    const inactiveManual = { id: 72, productId: 12, key: 'user_manual', displayName: '说明书二维码', status: 'inactive' };
    const api = {
      listProducts: vi.fn().mockResolvedValue([]),
      listQrCodes: vi.fn().mockResolvedValueOnce({ items: [] }).mockResolvedValueOnce({ items: [inactiveManual] }),
      listHistoricalProductCandidates: vi.fn().mockResolvedValue([candidate]),
      confirmHistoricalProductCandidate: vi.fn().mockResolvedValue({ product: created, linkedHistoricalCount: 4 }),
      listDictionaries: vi.fn((type: keyof typeof dictionaries) => Promise.resolve(dictionaries[type])),
      createProduct: vi.fn(), updateProduct: vi.fn(), deactivateProduct: vi.fn(),
    };
    render(<ProductsPage api={api as never} />);
    await screen.findByText('还没有产品档案');
    expect(screen.queryByText('SKDZU070JP')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '从资料库识别历史产品' }));
    expect(await screen.findByText('SKDZU070JP')).toBeVisible();
    expect(screen.getByText('4 个历史图号')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认建立 ZU70SD' }));
    expect(screen.getByRole('button', { name: '确认建立产品档案' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('历史产品品牌'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('历史产品品类尺寸'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('历史产品默认外观'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '确认建立产品档案' }));

    await waitFor(() => expect(api.confirmHistoricalProductCandidate).toHaveBeenCalledWith({
      productCategory: candidate.productCategory, sku: candidate.sku, model: candidate.model,
      brandId: 1, productSizeId: 2, defaultAppearanceId: 3,
    }));
    expect(await screen.findByText('已建立 ZU70SD，并关联 4 个历史图号。')).toBeVisible();
    expect(screen.getByText('ZU70SD')).toBeVisible();
    expect(await screen.findByRole('button', { name: '说明书 · 已停用' })).toBeVisible();
    expect(api.listQrCodes).toHaveBeenLastCalledWith({ productId: created.id });
  });

  it('labels ambiguous historical candidates and does not offer confirmation', async () => {
    const api = {
      listProducts: vi.fn().mockResolvedValue([]),
      listHistoricalProductCandidates: vi.fn().mockResolvedValue([
        { productCategory: '03.冰柜', sku: 'DUP-SKU', model: 'A', historicalDrawingCount: 1, ambiguous: true },
      ]),
      confirmHistoricalProductCandidate: vi.fn(),
      listDictionaries: vi.fn().mockResolvedValue([]), createProduct: vi.fn(), updateProduct: vi.fn(), deactivateProduct: vi.fn(),
    };
    render(<ProductsPage api={api as never} />);
    await screen.findByText('还没有产品档案');
    fireEvent.click(screen.getByRole('button', { name: '从资料库识别历史产品' }));
    expect(await screen.findByText('目录信息有歧义，请先人工整理或补充确认')).toBeVisible();
    expect(screen.queryByRole('button', { name: '确认建立 A' })).not.toBeInTheDocument();
  });
});
