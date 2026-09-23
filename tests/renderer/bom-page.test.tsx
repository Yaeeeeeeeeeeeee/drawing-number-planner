import { readFileSync } from 'node:fs';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BomPage, localBusinessDateToday } from '../../src/renderer/pages/BomPage';
import { openBomAssetLocation } from '../../src/renderer/desktop-files';

const product = { id: 1, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
  defaultAppearanceId: 3, defaultAppearanceName: '一号外观', model: 'ZC100', productCategory: '冰柜',
  referenceProductId: null, referenceProductModel: null, status: 'active' as const };
const project = { id: 7, code: '01', name: 'LOGO', parentId: 6, status: 'active' as const };
const mainCategory = { id: 6, code: '04', name: '印刷件类', parentId: null, status: 'active' as const };
const candidate = { origin: 'planned' as const, drawingId: 10, fullCode: '02.0404.010.0401001', displayName: 'SAMKYO-ZC100白色-LOGO',
  projectItemId: 7, projectItemName: 'LOGO', status: 'reserved' as const };
const asset = { id: 31, relativePath: 'BOM/SKU/a.png', originalFileName: '客户示意图.png', mimeType: 'image/png', sizeBytes: 8,
  contentSha256: 'abc', createdAt: '2026-09-01T00:00:00Z' };
const currentWithReferences = { id: 20, productId: 1, model: 'ZC100', versionNumber: 1, previousVersionId: null,
  businessChangeDate: '2026-09-02', businessChangeDateLabel: '2026-09-02', notes: null, createdAt: '2026-09-02T00:00:00Z', items: [{
    bomItemId: 30, origin: 'planned' as const, drawingId: 10, fullCode: candidate.fullCode, displayName: candidate.displayName, projectItemId: 7, projectItemName: 'LOGO',
    status: 'voided' as const, effectiveMaterialBatchId: null, effectiveBatchRelativePath: null, effectiveBatchName: null, material: null,
    dimensions: null, position: null, notes: null, usesWhiteMaterial: false,
    assets: [{ ...asset, assetId: 31, role: 'image' as const, inheritedFromBomItemAssetId: null }],
    qrCodes: [{ id: 9, name: '说明书二维码', purposeDisplayName: '说明书', status: 'inactive' as const }],
  }] };
const activeCurrent = { ...currentWithReferences, items: [{ ...currentWithReferences.items[0], status: 'active' as const, qrCodes: [] }] };
const secondProject = { id: 8, code: '02', name: '说明书', parentId: 6, status: 'active' as const };
const replacementCandidate = { ...candidate, drawingId: 11, fullCode: '02.0404.010.0401002', status: 'active' as const };

function apiFixture() {
  return {
    listProducts: vi.fn().mockResolvedValue([product]),
    listDictionaries: vi.fn().mockImplementation((type: string) => Promise.resolve(type === 'main_category' ? [mainCategory] : [project])),
    listMaterialBatches: vi.fn().mockResolvedValue([{ id: 8, name: '20260901', relativePath: 'X/20260901', productId: 1, isPresent: true }]),
    getCurrentBom: vi.fn().mockResolvedValue(null), listBomVersions: vi.fn().mockResolvedValue([]),
    queryBomVersions: vi.fn().mockResolvedValue([]), listBomCandidates: vi.fn().mockResolvedValue([candidate]),
    listBomQrCandidates: vi.fn().mockResolvedValue([{ id: 9, name: '说明书二维码', purposeDisplayName: '说明书', status: 'active' }]),
    uploadBomAsset: vi.fn().mockResolvedValue(asset), getBomVersion: vi.fn(),
    previewBomVersionDeletion: vi.fn().mockResolvedValue({ versionId: 20, productId: 1, model: 'ZC100', versionNumber: 1,
      isCurrent: true, fallbackVersionId: null, fallbackVersionNumber: null }),
    deleteBomVersion: vi.fn().mockResolvedValue({ deletedVersionId: 20, productId: 1, wasCurrent: true,
      currentVersionId: null, currentVersionNumber: null }),
    deleteProductBom: vi.fn().mockResolvedValue({ productId: 1, deletedCount: 1, currentVersionId: null }),
    saveBomVersion: vi.fn().mockResolvedValue({ version: { id: 20, productId: 1, model: 'ZC100', versionNumber: 1,
      previousVersionId: null, businessChangeDate: '2026-09-02', businessChangeDateLabel: '2026-09-02', notes: null,
      createdAt: '2026-09-02T00:00:00Z', items: [] }, diff: [] }),
  };
}

async function selectProduct(expectEmpty = true) {
  fireEvent.change(await screen.findByLabelText('BOM 产品型号'), { target: { value: '1' } });
  if (expectEmpty) await screen.findByText('尚未建立 BOM');
}

describe('BomPage product-level BOM', () => {
  it('shows the retained missing batch while editing instead of displaying an empty selection', async () => {
    const api = apiFixture();
    api.listMaterialBatches.mockResolvedValue([{ id: 8, name: '01.20260901', relativePath: 'X/01.20260901', productId: 1, isPresent: false }]);
    api.getCurrentBom.mockResolvedValue({ ...activeCurrent, items: [{ ...activeCurrent.items[0], effectiveMaterialBatchId: 8 }] });
    render(<BomPage api={api as never} />); await selectProduct(false);
    expect(await screen.findByRole('option', { name: /01.20260901.*已缺失/ })).toBeInTheDocument();
    expect(screen.getByLabelText('第 1 行生效资料批次')).toHaveValue('8');
  });
  it('shows query details as separate business fields and keeps model-wide deletion collapsed', async () => {
    const api = apiFixture();
    const record = { ...activeCurrent, editRevision: 1, updatedAt: '2026-09-03T10:00:00Z', items: [{
      ...activeCurrent.items[0], material: 'PET', dimensions: '20×10', position: '正面', changeDetails: '改为哑光',
    }] };
    api.queryBomVersions.mockResolvedValue([record]); api.getBomVersion.mockResolvedValue(record);
    render(<BomPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看 BOM 20' }));
    expect(await screen.findByText('改为哑光')).toBeVisible();
    expect(screen.getByText('PET')).toBeVisible();
    expect(screen.getByText('20×10')).toBeVisible();
    expect(screen.getByText('正面')).toBeVisible();
    expect(screen.queryByRole('columnheader', { name: '版本' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('输入型号确认删除整个 BOM')).not.toBeVisible();
  });
  it('edits the selected history in place with its revision and independent change details', async () => {
    const record = { ...activeCurrent, editRevision: 2, updatedAt: activeCurrent.createdAt };
    const api = { ...apiFixture(), updateBomVersion: vi.fn().mockResolvedValue({ version: record, diff: [] }) };
    api.queryBomVersions.mockResolvedValue([record]);
    api.getBomVersion.mockResolvedValue(record);
    render(<BomPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    fireEvent.click(await screen.findByRole('button', { name: '编辑 BOM 20' }));
    expect(await screen.findByLabelText('第 1 行修改明细')).toHaveValue('');
    expect(screen.getByLabelText('业务变更日期')).toHaveValue('2026-09-02');
    expect(screen.getByText('正在编辑所选 BOM · 业务日期 2026-09-02')).toBeVisible();
    expect(screen.queryByText('当前 BOM · 业务日期 2026-09-02')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('第 1 行修改明细'), { target: { value: '商标位置调整' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
    await waitFor(() => expect(api.updateBomVersion).toHaveBeenCalledWith(20, expect.objectContaining({
      businessChangeDate: '2026-09-02', items: [expect.objectContaining({ changeDetails: '商标位置调整' })],
    }), 2));
    expect(api.saveBomVersion).not.toHaveBeenCalled();
    expect(await screen.findByText('BOM 修改已保存')).toBeVisible();
  });
  it('selects an explicit entry mode, filters project items by main category, and marks historical candidate origin and status', async () => {
    const api = apiFixture(); api.listBomCandidates.mockResolvedValue([{ origin: 'historical', historicalDrawingId: 19,
      fullCode: '02.0404.010.0401008', displayName: '02.0404.010.0401008', projectItemId: 7,
      projectItemName: 'LOGO', status: 'inactive' }]);
    render(<BomPage api={api as never} />); await selectProduct();
    fireEvent.change(screen.getByLabelText('BOM 录入类型'), { target: { value: 'historical' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '添加 BOM 项目' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    expect(screen.getByLabelText('第 1 行项目明细')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('第 1 行主类别'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('第 1 行项目明细'), { target: { value: '7' } });
    expect(await screen.findByRole('option', { name: /历史已用.*已停用/ })).toBeVisible();
    expect(api.listBomCandidates).toHaveBeenLastCalledWith({ productId: 1, projectItemId: 7,
      usesWhiteMaterial: false, entryMode: 'historical' });
  });

  it('does not show QR editing in the BOM editor', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />); await selectProduct();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    expect(screen.queryByLabelText('第 1 行二维码 9')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '第 1 行使用二维码' })).not.toBeInTheDocument();
  });

  it('uses main category then project item in the query form', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    expect(screen.getByLabelText('查询 BOM 项目明细')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('查询 BOM 主类别'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('查询 BOM 项目明细'), { target: { value: '7' } });
    expect(screen.getByLabelText('查询 BOM 项目明细')).toHaveValue('7');
  });
  it('defaults the business date from local calendar fields, not a UTC date', () => {
    const localDate = new Date(2026, 8, 2, 0, 30);
    const expected = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    expect(localBusinessDateToday(localDate)).toBe(expected);
  });

  it('uses the product-level form with a required business date, rather than BOM color or quantity', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />); await selectProduct();
    expect(screen.getByLabelText('业务变更日期')).toHaveValue(localBusinessDateToday());
    expect(screen.queryByLabelText('BOM 颜色')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    expect(screen.queryByLabelText('第 1 行数量')).not.toBeInTheDocument();
  });

  it('saves item fields, selected batch and uploaded image without overwriting hidden QR associations', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />); await selectProduct();
    fireEvent.change(screen.getByLabelText('业务变更日期'), { target: { value: '2026-09-02' } });
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行主类别'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('第 1 行项目明细'), { target: { value: '7' } });
    fireEvent.change(await screen.findByLabelText('第 1 行图号'), { target: { value: 'planned:10' } });
    fireEvent.change(screen.getByLabelText('第 1 行生效资料批次'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('第 1 行材质'), { target: { value: 'ABS' } });
    fireEvent.change(screen.getByLabelText('第 1 行尺寸'), { target: { value: '100×20' } });
    fireEvent.change(screen.getByLabelText('第 1 行位置'), { target: { value: '前门' } });
    fireEvent.change(screen.getByLabelText('第 1 行备注'), { target: { value: '按图施工' } });
    const upload = new File([new Uint8Array([137, 80, 78, 71])], '客户示意图.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('第 1 行图片'), { target: { files: [upload] } });
    await waitFor(() => expect(api.uploadBomAsset).toHaveBeenCalledWith(1, upload));
    fireEvent.click(screen.getByRole('button', { name: '保存当前 BOM' }));
    await waitFor(() => expect(api.saveBomVersion).toHaveBeenCalledWith({ productId: 1, entryMode: 'current', businessChangeDate: '2026-09-02',
      expectedCurrentVersionId: null, items: [{ projectItemId: 7, drawingReference: { origin: 'planned', drawingId: 10 }, usesWhiteMaterial: false,
        effectiveMaterialBatchId: 8, material: 'ABS', dimensions: '100×20', position: '前门', notes: '按图施工',
        assets: [{ role: 'image', assetId: 31 }] }] }));
  });

  it('separates add and query, exposes product/date/batch/project/drawing filters and renders legacy dates safely', async () => {
    const api = apiFixture(); api.queryBomVersions.mockResolvedValue([{ id: 20, productId: 1, model: 'ZC100', versionNumber: 1,
      previousVersionId: null, businessChangeDate: null, businessChangeDateLabel: '未补录', notes: null, createdAt: '2026-09-02T00:00:00Z' }]);
    render(<BomPage api={api as never} />); fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    for (const label of ['查询 BOM 型号', '查询 BOM 业务日期', '查询 BOM 生效批次', '查询 BOM 主类别', '查询 BOM 项目明细', '查询 BOM 图号']) expect(screen.getByLabelText(label)).toBeVisible();
    fireEvent.change(screen.getByLabelText('查询 BOM 型号'), { target: { value: 'ZC100' } });
    fireEvent.change(screen.getByLabelText('查询 BOM 业务日期'), { target: { value: '2026-09-02' } });
    expect(screen.getByLabelText('查询 BOM 生效批次')).toHaveAttribute('type', 'text');
    fireEvent.change(screen.getByLabelText('查询 BOM 生效批次'), { target: { value: 'legacy/removed-snapshot' } });
    fireEvent.change(screen.getByLabelText('查询 BOM 主类别'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('查询 BOM 项目明细'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('查询 BOM 图号'), { target: { value: '0401001' } });
    await waitFor(() => expect(screen.getByRole('button', { name: '查询' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    expect(await screen.findByText('业务日期未补录')).toBeVisible();
    await waitFor(() => expect(api.queryBomVersions).toHaveBeenLastCalledWith({ model: 'ZC100', businessChangeDate: '2026-09-02',
      effectiveBatchRelativePath: 'legacy/removed-snapshot', projectItemId: 7, fullCode: '0401001' }));
  });

  it('keeps voided drawings visible for replacement without exposing historical QR editing', async () => {
    const api = apiFixture(); api.getCurrentBom.mockResolvedValue(currentWithReferences); api.listBomCandidates.mockResolvedValue([]);
    render(<BomPage api={api as never} />); await selectProduct(false);
    expect(await screen.findByRole('option', { name: /作废，需替换/ })).toBeDisabled();
    expect(screen.getByText('当前引用图号已作废，请选择可用图号替换后再保存。')).toBeVisible();
    expect(screen.getByRole('button', { name: '保存当前 BOM' })).toBeDisabled();
    expect(screen.queryByLabelText('第 1 行停用二维码 9')).not.toBeInTheDocument();
  });

  it('only offers previous-asset reuse when a source exists and makes a new upload replace it', async () => {
    const api = apiFixture();
    api.getCurrentBom.mockResolvedValue(activeCurrent); render(<BomPage api={api as never} />); await selectProduct(false);
    expect(await screen.findByLabelText('第 1 行沿用图片')).toBeChecked();
    expect(screen.getByText('沿用上一次 BOM：客户示意图.png')).toBeVisible();
    const replacement = new File(['new'], '新版图片.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('第 1 行图片'), { target: { files: [replacement] } });
    await waitFor(() => expect(api.uploadBomAsset).toHaveBeenCalledWith(1, replacement));
    expect(screen.getByLabelText('第 1 行沿用图片')).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    expect(screen.queryByLabelText('第 2 行沿用图片')).not.toBeInTheDocument();
  });

  it('reloads eligible candidates after saving so an item can be replaced immediately', async () => {
    const api = apiFixture(); api.saveBomVersion.mockResolvedValue({ version: activeCurrent, diff: [] });
    api.listBomCandidates.mockResolvedValue([candidate, replacementCandidate]);
    render(<BomPage api={api as never} />); await selectProduct();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行主类别'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('第 1 行项目明细'), { target: { value: '7' } });
    fireEvent.change(await screen.findByLabelText('第 1 行图号'), { target: { value: 'planned:10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存当前 BOM' }));
    await waitFor(() => expect(api.listBomCandidates).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('option', { name: /0401002/ })).toBeVisible());
  });

  it('clears project-scoped assets, reuse state, candidates and QR links when the project changes', async () => {
    const api = apiFixture(); api.listDictionaries.mockResolvedValue([project, secondProject]);
    api.getCurrentBom.mockResolvedValue({ ...activeCurrent, items: [{ ...activeCurrent.items[0], qrCodes: [{ id: 9, name: '说明书二维码', purposeDisplayName: '说明书', status: 'active' as const }] }] });
    render(<BomPage api={api as never} />); await selectProduct(false);
    await screen.findByText('沿用上一次 BOM：客户示意图.png');
    fireEvent.change(screen.getByLabelText('第 1 行项目明细'), { target: { value: '8' } });
    await waitFor(() => expect(api.listBomCandidates).toHaveBeenLastCalledWith({ productId: 1, projectItemId: 8, usesWhiteMaterial: false, entryMode: 'current' }));
    expect(screen.getByLabelText('第 1 行图号')).toHaveValue('');
    expect(screen.queryByText('客户示意图.png')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('第 1 行沿用图片')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('第 1 行二维码 9')).not.toBeInTheDocument();
  });

  it('does not let an older history detail response overwrite the newest selection', async () => {
    let resolveFirst!: (value: typeof activeCurrent) => void; let resolveSecond!: (value: typeof activeCurrent) => void;
    const api = apiFixture(); api.queryBomVersions.mockResolvedValue([activeCurrent, { ...activeCurrent, id: 21, versionNumber: 2 }]);
    api.getBomVersion.mockImplementation((id: number) => new Promise((resolve) => { if (id === 20) resolveFirst = resolve; else resolveSecond = resolve; }));
    render(<BomPage api={api as never} />); fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '查询' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    await screen.findByRole('button', { name: '查看 BOM 20' });
    fireEvent.click(screen.getByRole('button', { name: '查看 BOM 20' })); fireEvent.click(screen.getByRole('button', { name: '查看 BOM 21' }));
    resolveSecond({ ...activeCurrent, id: 21, items: [{ ...activeCurrent.items[0], fullCode: 'NEW-CODE' }] }); await screen.findByText('NEW-CODE');
    resolveFirst({ ...activeCurrent, id: 20, items: [{ ...activeCurrent.items[0], fullCode: 'OLD-CODE' }] });
    await waitFor(() => expect(screen.queryByText('OLD-CODE')).not.toBeInTheDocument());
  });

  it('previews record deletion, explains current rollback, and deletes only the selected change after confirmation', async () => {
    const api = apiFixture(); api.queryBomVersions.mockResolvedValue([activeCurrent]);
    api.previewBomVersionDeletion.mockResolvedValue({ versionId: 20, productId: 1, model: 'ZC100', versionNumber: 1,
      isCurrent: true, fallbackVersionId: 19, fallbackVersionNumber: 3 });
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BomPage api={api as never} />); fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除 BOM 20' }));
    await waitFor(() => expect(confirmation).toHaveBeenCalledWith(expect.stringMatching(/当前 BOM.*V3/)));
    expect(api.deleteBomVersion).toHaveBeenCalledWith(20, true);
    await waitFor(() => expect(api.queryBomVersions).toHaveBeenCalledTimes(2));
    confirmation.mockRestore();
  });

  it('keeps whole-product BOM deletion in a separate model-confirmed danger area', async () => {
    const api = apiFixture(); api.queryBomVersions.mockResolvedValue([activeCurrent]); api.getBomVersion.mockResolvedValue(activeCurrent);
    const confirmation = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<BomPage api={api as never} />); fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看 BOM 20' }));
    fireEvent.change(await screen.findByLabelText('输入型号确认删除整个 BOM'), { target: { value: 'ZC100' } });
    fireEvent.click(screen.getByRole('button', { name: '删除整个型号 BOM' }));
    await waitFor(() => expect(api.deleteProductBom).toHaveBeenCalledWith(1, 'ZC100'));
    expect(confirmation).toHaveBeenCalledWith(expect.stringMatching(/整个型号.*全部.*BOM/));
    confirmation.mockRestore();
  });

  it('shows complete wrapping attachment paths and opens their location through the desktop shell', async () => {
    const api = apiFixture(); const desktopAction = vi.fn().mockResolvedValue({ ok: true });
    window.plannerDesktop = { showBomAssetInFolder: desktopAction } as never;
    api.queryBomVersions.mockResolvedValue([activeCurrent]);
    api.getBomVersion.mockResolvedValue({ ...activeCurrent, items: [{ ...activeCurrent.items[0], assets: [{ ...asset, assetId: 31,
      relativePath: '_图号规划器\\BOM附件\\SKU\\一段非常长但必须完整显示且允许自动换行的文件夹\\客户示意图.png' }] }] });
    render(<BomPage api={api as never} />); fireEvent.click(await screen.findByRole('button', { name: '查询 BOM' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '查询' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: '查询' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看 BOM 20' }));
    const path = await screen.findByText(/一段非常长但必须完整显示/);
    expect(path).toHaveClass('bom-asset-path');
    fireEvent.click(screen.getByRole('button', { name: '打开附件位置 客户示意图.png' }));
    await waitFor(() => expect(desktopAction).toHaveBeenCalledWith(31));
    delete window.plannerDesktop;
  });

  it('overrides the global table nowrap rule for long BOM attachment paths', () => {
    const style = document.createElement('style');
    style.textContent = readFileSync('src/renderer/styles.css', 'utf8');
    document.head.append(style);
    const table = document.createElement('table');
    table.innerHTML = '<tbody><tr><td><small class="bom-asset-path">very/long/path/file.png</small></td></tr></tbody>';
    document.body.append(table);

    expect(getComputedStyle(table.querySelector('.bom-asset-path')!).whiteSpace).toBe('normal');

    table.remove(); style.remove();
  });

  it('reports browser-only BOM attachment actions without issuing a network request', async () => {
    delete window.plannerDesktop;
    const fetchRequest = vi.spyOn(globalThis, 'fetch');

    await expect(openBomAssetLocation(31)).resolves.toEqual({ ok: false,
      error: { code: 'DESKTOP_ONLY', message: '请在 Windows 桌面版打开文件位置' } });
    expect(fetchRequest).not.toHaveBeenCalled();

    fetchRequest.mockRestore();
  });
});
