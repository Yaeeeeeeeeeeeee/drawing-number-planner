import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BomPage } from '../../src/renderer/pages/BomPage';

const product = { id: 1, brandId: 1, brandName: 'SAMKYO', productSizeId: 2, productSizeName: '冰柜',
  defaultAppearanceId: 3, defaultAppearanceName: '一号外观', model: 'ZC100', productCategory: '冰柜',
  referenceProductId: null, referenceProductModel: null, status: 'active' as const };
const colors = [{ id: 4, code: '0', name: '白色', status: 'active' as const },
  { id: 5, code: '1', name: '灰色', status: 'active' as const }];
const projects = [{ id: 7, code: '01', name: 'LOGO', parentId: 6, status: 'active' as const }];
const candidate = { id: 10, fullCode: '02.0404.010.0401001', displayName: 'SAMKYO-ZC100白色-LOGO',
  colorId: 4, colorName: '白色', projectItemId: 7, projectItemName: 'LOGO', status: 'reserved' as const };

function apiFixture() {
  return {
    listProducts: vi.fn().mockResolvedValue([product]),
    listDictionaries: vi.fn((type: string) => Promise.resolve(type === 'color' ? colors : type === 'project_item' ? projects : [])),
    getCurrentBom: vi.fn().mockResolvedValue(null),
    listBomVersions: vi.fn().mockResolvedValue([]),
    listBomCandidates: vi.fn().mockResolvedValue([candidate]),
    getBomVersion: vi.fn(),
    saveBomVersion: vi.fn().mockResolvedValue({
      version: { id: 20, productId: 1, model: 'ZC100', colorId: 5, colorName: '灰色', versionNumber: 1,
        previousVersionId: null, notes: null, createdAt: '2026-08-25T00:00:00Z', items: [{
          bomItemId: 30, drawingId: 10, fullCode: candidate.fullCode, displayName: candidate.displayName,
          colorId: 4, colorName: '白色', projectItemId: 7, projectItemName: 'LOGO', status: 'active',
          quantity: 1, notes: null, usesWhiteMaterial: true,
        }] },
      diff: [{ type: 'added', projectItemId: 7, projectItemName: 'LOGO', previousDrawingId: null,
        previousFullCode: null, drawingId: 10, fullCode: candidate.fullCode }],
    }),
  };
}

async function selectGrayBom(expectEmpty = true) {
  fireEvent.change(await screen.findByLabelText('BOM 产品型号'), { target: { value: '1' } });
  fireEvent.change(screen.getByLabelText('BOM 颜色'), { target: { value: '5' } });
  if (expectEmpty) await screen.findByText('尚未建立 BOM');
}

describe('BomPage', () => {
  it('creates a gray BOM row by explicitly selecting a shared white drawing', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });
    fireEvent.click(screen.getByLabelText('第 1 行引用白色图号'));
    expect(await screen.findByRole('option', { name: /02\.0404\.010\.0401001/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText('第 1 行图号'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为新版本' }));

    await waitFor(() => expect(api.saveBomVersion).toHaveBeenCalledWith({
      productId: 1, colorId: 5, expectedCurrentVersionId: null,
      items: [{ projectItemId: 7, drawingId: 10, quantity: 1, usesWhiteMaterial: true }],
    }));
    expect(await screen.findByText('版本 1 已保存')).toBeVisible();
    expect(screen.getByText('新增 · LOGO')).toBeVisible();
  });

  it('loads an existing immutable version and saves removal against its exact id', async () => {
    const api = apiFixture();
    const current = (await api.saveBomVersion())!.version;
    api.getCurrentBom.mockResolvedValue(current);
    api.listBomVersions.mockResolvedValue([current]);
    api.getBomVersion.mockResolvedValue(current);
    api.saveBomVersion.mockResolvedValue({ ...await api.saveBomVersion(), version: { ...current, id: 21, versionNumber: 2,
      previousVersionId: 20, items: [] }, diff: [{ type: 'removed', projectItemId: 7, projectItemName: 'LOGO',
      previousDrawingId: 10, previousFullCode: candidate.fullCode, drawingId: null, fullCode: null }] });
    render(<BomPage api={api as never} />); await selectGrayBom(false);
    expect(await screen.findByRole('option', { name: /02\.0404\.010\.0401001/ })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '删除 BOM 项目 1' }));
    fireEvent.click(screen.getByRole('button', { name: '保存为新版本' }));

    await waitFor(() => expect(api.saveBomVersion).toHaveBeenLastCalledWith({
      productId: 1, colorId: 5, expectedCurrentVersionId: 20, items: [],
    }));
    expect(await screen.findByText('移除 · LOGO')).toBeVisible();
    expect(screen.getByText('版本 1')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '查看版本 1' }));
    expect(await screen.findByText('版本 1 只读明细')).toBeVisible();
    expect(screen.getByText(candidate.fullCode)).toBeVisible();
  });

  it('loads all eligible candidates for an existing row so its drawing can be replaced', async () => {
    const api = apiFixture(); const current = (await api.saveBomVersion())!.version;
    const replacement = { ...candidate, id: 11, fullCode: '02.0404.010.0401002', status: 'active' as const };
    api.getCurrentBom.mockResolvedValue(current); api.listBomVersions.mockResolvedValue([current]);
    api.listBomCandidates.mockResolvedValue([candidate, replacement]);
    api.saveBomVersion.mockResolvedValue({ version: { ...current, id: 21, versionNumber: 2, previousVersionId: 20,
      items: [{ ...current.items[0], drawingId: 11, fullCode: replacement.fullCode }] }, diff: [{
      type: 'replaced', projectItemId: 7, projectItemName: 'LOGO', previousDrawingId: 10,
      previousFullCode: candidate.fullCode, drawingId: 11, fullCode: replacement.fullCode,
    }] });
    render(<BomPage api={api as never} />); await selectGrayBom(false);

    expect(await screen.findByRole('option', { name: /02\.0404\.010\.0401002/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText('第 1 行图号'), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为新版本' }));

    await waitFor(() => expect(api.saveBomVersion).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedCurrentVersionId: 20,
      items: [expect.objectContaining({ drawingId: 11 })],
    })));
  });

  it('keeps the draft and asks for refresh when the base version is stale', async () => {
    const api = apiFixture(); api.saveBomVersion.mockRejectedValueOnce(new Error('当前 BOM 已变化，请刷新后重新保存'));
    render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });
    fireEvent.change(await screen.findByLabelText('第 1 行图号'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存为新版本' }));

    expect(await screen.findByText('当前 BOM 已变化，请刷新后重新保存')).toBeVisible();
    expect(screen.getByRole('button', { name: '刷新当前 BOM' })).toBeVisible();
    expect(screen.getByLabelText('第 1 行项目')).toHaveValue('7');
  });
});
