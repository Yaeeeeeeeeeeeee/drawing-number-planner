import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BomPage } from '../../src/renderer/pages/BomPage';
import { ApiError } from '../../src/renderer/data/client';

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
  it('does not allow an empty BOM draft to be saved', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />); await selectGrayBom();

    expect(screen.getByRole('button', { name: '保存当前 BOM' })).toBeDisabled();
    expect(api.saveBomVersion).not.toHaveBeenCalled();
  });

  it('creates a gray BOM row by explicitly selecting a shared white drawing', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });
    fireEvent.click(screen.getByLabelText('第 1 行引用白色图号'));
    expect(await screen.findByRole('option', { name: /02\.0404\.010\.0401001.*已占号.*白色/ })).toBeVisible();
    expect(screen.getByText('可引用已占号或正式使用的正式规划图号；文件完整性单独提示，已作废图号不会列出。')).toBeVisible();
    fireEvent.change(screen.getByLabelText('第 1 行图号'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存当前 BOM' }));

    await waitFor(() => expect(api.saveBomVersion).toHaveBeenCalledWith({
      productId: 1, colorId: 5, expectedCurrentVersionId: null,
      items: [{ projectItemId: 7, drawingId: 10, quantity: 1, usesWhiteMaterial: true }],
    }));
    expect(await screen.findByText('当前 BOM 已保存')).toBeVisible();
    expect(screen.getByText(`LOGO：新增 ${candidate.fullCode}`)).toBeVisible();
    expect(screen.getByText('当前 BOM')).toBeVisible();
  });

  it('keeps an existing BOM from being saved empty after its last item is removed', async () => {
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
    const savesBeforeRemoval = api.saveBomVersion.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '删除 BOM 项目 1' }));
    expect(screen.getByRole('button', { name: '保存当前 BOM' })).toBeDisabled();
    expect(api.saveBomVersion).toHaveBeenCalledTimes(savesBeforeRemoval);
    expect(screen.getByText('最近变更')).toBeVisible();
    expect(screen.queryByText(/版本 1/)).not.toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: '查看变更' })[0]);
    expect(await screen.findByRole('region', { name: 'BOM 历史明细' })).toBeVisible();
    expect(screen.getByText(candidate.fullCode)).toBeVisible();
  });

  it('explains when no formal planned drawing matches and keeps historical/file states outside candidate eligibility', async () => {
    const api = apiFixture(); api.listBomCandidates.mockResolvedValue([]);
    render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });

    expect(await screen.findByText('没有符合当前产品、项目和颜色规则的正式规划图号。历史已用图号不会自动进入候选；源文件或转曲后文件是否存在不影响候选资格。')).toBeVisible();
  });

  it('keeps the white-reference switch disabled for a white BOM and explains why', async () => {
    const api = apiFixture(); render(<BomPage api={api as never} />);
    fireEvent.change(await screen.findByLabelText('BOM 产品型号'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('BOM 颜色'), { target: { value: '4' } });
    await screen.findByText('尚未建立 BOM');
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));

    expect(screen.getByLabelText('第 1 行引用白色图号')).toBeDisabled();
    expect(screen.getByText('当前 BOM 已是白色，无需引用白色图号')).toBeVisible();
  });

  it('reloads candidates with white material selected', async () => {
    const api = apiFixture();
    render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });
    fireEvent.change(await screen.findByLabelText('第 1 行图号'), { target: { value: '10' } });
    expect(screen.getByLabelText('第 1 行图号')).toHaveValue('10');
    fireEvent.click(screen.getByLabelText('第 1 行引用白色图号'));
    expect(screen.getByLabelText('第 1 行图号')).toHaveValue('');
    await waitFor(() => expect(api.listBomCandidates).toHaveBeenLastCalledWith({
      productId: 1, bomColorId: 5, projectItemId: 7, usesWhiteMaterial: true,
    }));
  });

  it('visibly preserves item notes in the current BOM and history detail', async () => {
    const api = apiFixture(); const saved = (await api.saveBomVersion())!.version;
    const notedItem = { ...saved.items[0], notes: '贴纸位置以最新图纸为准' };
    const notedVersion = { ...saved, items: [notedItem] };
    api.getCurrentBom.mockResolvedValue(notedVersion);
    api.listBomVersions.mockResolvedValue([notedVersion]);
    api.getBomVersion.mockResolvedValue(notedVersion);
    render(<BomPage api={api as never} />); await selectGrayBom(false);
    expect(await screen.findByDisplayValue('贴纸位置以最新图纸为准')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', { name: '查看变更' })[0]);
    expect(await screen.findByRole('region', { name: 'BOM 历史明细' })).toBeVisible();
    expect(screen.getByText('贴纸位置以最新图纸为准')).toBeVisible();
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
    fireEvent.click(screen.getByRole('button', { name: '保存当前 BOM' }));

    await waitFor(() => expect(api.saveBomVersion).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedCurrentVersionId: 20,
      items: [expect.objectContaining({ drawingId: 11 })],
    })));
    expect(screen.getByText(`LOGO：${candidate.fullCode} → ${replacement.fullCode}`)).toBeVisible();
  });

  it('reloads eligible candidates after saving so the new version can be replaced immediately', async () => {
    const api = apiFixture();
    const replacement = { ...candidate, id: 11, fullCode: '02.0404.010.0401002', status: 'active' as const };
    api.listBomCandidates.mockResolvedValue([candidate, replacement]);
    render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });
    fireEvent.click(screen.getByLabelText('第 1 行引用白色图号'));
    fireEvent.change(await screen.findByLabelText('第 1 行图号'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存当前 BOM' }));

    await waitFor(() => expect(api.listBomCandidates).toHaveBeenCalledTimes(3));
    const drawingSelect = screen.getByLabelText('第 1 行图号') as HTMLSelectElement;
    await waitFor(() => expect(Array.from(drawingSelect.options).map((option) => option.value)).toContain('11'));
    fireEvent.change(drawingSelect, { target: { value: '11' } });
    expect(drawingSelect).toHaveValue('11');
  });

  it('keeps the draft and asks for refresh when the base version is stale', async () => {
    const api = apiFixture(); api.saveBomVersion.mockRejectedValueOnce(new ApiError('BOM_STALE', '当前 BOM 已变化，请刷新后重新保存'));
    render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });
    fireEvent.change(await screen.findByLabelText('第 1 行图号'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存当前 BOM' }));

    expect(await screen.findByText('当前 BOM 已变化，请刷新后重新保存')).toBeVisible();
    expect(screen.getByRole('button', { name: '刷新当前 BOM' })).toBeVisible();
    expect(screen.getByLabelText('第 1 行项目')).toHaveValue('7');
  });

  it('keeps a non-stale failed draft without suggesting a destructive refresh', async () => {
    const api = apiFixture(); api.saveBomVersion.mockRejectedValueOnce(new ApiError('DRAWING_NOT_ELIGIBLE', '已作废图号不能加入 BOM'));
    render(<BomPage api={api as never} />); await selectGrayBom();
    fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
    fireEvent.change(screen.getByLabelText('第 1 行项目'), { target: { value: '7' } });
    fireEvent.change(await screen.findByLabelText('第 1 行图号'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: '保存当前 BOM' }));

    expect(await screen.findByText('已作废图号不能加入 BOM')).toBeVisible();
    expect(screen.queryByRole('button', { name: '刷新当前 BOM' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('第 1 行项目')).toHaveValue('7');
  });
});
