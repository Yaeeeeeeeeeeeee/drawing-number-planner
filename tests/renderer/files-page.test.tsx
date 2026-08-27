import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../src/renderer/data/client';
import { FilesPage } from '../../src/renderer/pages/FilesPage';

const file = { id: 1, relativePath: 'SAMKYO\\冰柜\\ZC100\\02.0404.010.0401001-LOGO.pdf',
  fileName: '02.0404.010.0401001-LOGO.pdf', drawingId: 10, fullCode: '02.0404.010.0401001',
  displayName: 'SAMKYO-ZC100白色-LOGO', productId: 9, sku: 'SKDZC100JP', model: 'ZC100', productCategory: '冰柜', brandName: 'SAMKYO', projectItemName: 'LOGO', colorName: '白色',
  matchStatus: 'matched' as const, detectedCodes: ['02.0404.010.0401001'], conversionType: 'source' as const,
  sizeBytes: 1024, modifiedAt: '2026-08-25T00:00:00Z', scannedAt: '2026-08-25T01:00:00Z', isPresent: true };
const outlined = { ...file, id: 2, relativePath: 'SAMKYO\\冰柜\\ZC100\\02.0404.010.0401001-LOGO（转曲）.pdf',
  fileName: '02.0404.010.0401001-LOGO（转曲）.pdf', conversionType: 'outlined' as const, sizeBytes: 2048 };
const unmatched = { ...file, id: 3, relativePath: 'unknown.pdf', fileName: 'unknown.pdf', drawingId: null, fullCode: null,
  displayName: null, productId: null, sku: null, model: null, productCategory: null, brandName: null, projectItemName: null, colorName: null, matchStatus: 'unmatched' as const,
  detectedCodes: [], conversionType: 'source' as const };
const pending = { ...unmatched, id: 4, relativePath: '02.0404.010.0401000-invalid.pdf',
  fileName: '02.0404.010.0401000-invalid.pdf', matchStatus: 'pending' as const,
  detectedCodes: ['02.0404.010.0401000'], classificationWarning: 'invalid-format' };
const conversionConflict = { ...file, id: 5, classificationWarning: 'conversion-conflict' };
const missing = { ...unmatched, id: 6, relativePath: 'stale.pdf', fileName: 'stale.pdf', isPresent: false };

function apiFixture(configured = false) {
  return {
    getWorkspaceSettings: vi.fn().mockResolvedValue(configured
      ? { workspaceRoot: 'X:\\Library', configured: true, available: true }
      : { workspaceRoot: null, configured: false, available: false }),
    updateWorkspaceSettings: vi.fn().mockResolvedValue({ workspaceRoot: 'X:\\Library', configured: true, available: true }),
    scanPdfFiles: vi.fn().mockResolvedValue({ total: 4, matched: 2, pending: 1, historicalRegistered: 1,
      unmatched: 1, conflict: 0, source: 3, outlined: 1, missing: 0, scannedAt: '2026-08-25T01:00:00Z' }),
    cleanupPdfFiles: vi.fn().mockResolvedValue({ cleaned: 1 }),
    searchPdfFiles: vi.fn().mockResolvedValue({ items: [file, outlined, unmatched, pending], total: 4, page: 1, pageSize: 50 }),
    listProducts: vi.fn().mockResolvedValue([{ id: 9, sku: 'SKDZC100JP', model: 'ZC100', productCategory: '冰柜', status: 'active' }]),
  };
}

describe('FilesPage', () => {
  it('shows canonical product identity, uses product IDs to filter, and labels unlinked files', async () => {
    const api = apiFixture(true);
    render(<FilesPage api={api as never} />);

    expect((await screen.findAllByText('SKDZC100JP · ZC100')).some((item) => item.tagName === 'STRONG')).toBe(true);
    expect(screen.getAllByText('待关联').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('产品档案'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选 PDF' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({ productId: 9 })));
  });
  it('opens a present file by PDF index ID and disables missing file locations', async () => {
    const showFileInFolder = vi.fn().mockResolvedValue({ ok: true }); window.plannerDesktop = { showFileInFolder };
    const api = apiFixture(true); api.searchPdfFiles.mockResolvedValue({ items: [file, missing], total: 2, page: 1, pageSize: 50 });
    render(<FilesPage api={api as never} />); await screen.findByText(file.fileName, { selector: '.file-primary' });

    fireEvent.click(screen.getByRole('button', { name: `打开 ${file.fileName} 的位置` }));
    await waitFor(() => expect(showFileInFolder).toHaveBeenCalledWith(file.id));
    expect(screen.getByRole('button', { name: `打开 ${missing.fileName} 的位置` })).toBeDisabled();
    expect(screen.getByText('文件缺失')).toBeVisible();
  });

  it('shows the desktop-only browser message without calling the API', async () => {
    delete window.plannerDesktop; const api = apiFixture(true);
    render(<FilesPage api={api as never} />); await screen.findByText(file.fileName, { selector: '.file-primary' });

    fireEvent.click(screen.getByRole('button', { name: `打开 ${file.fileName} 的位置` }));

    expect(await screen.findByText('请在 Windows 桌面版打开文件位置')).toBeVisible();
    expect(api.searchPdfFiles).toHaveBeenCalledTimes(1);
  });

  it('shows an unconfigured workspace and enables scanning only after a valid root is saved', async () => {
    const api = apiFixture(); render(<FilesPage api={api as never} />);
    expect(await screen.findByText('尚未设置资料根目录')).toBeVisible();
    expect(screen.getByRole('button', { name: '扫描资料库' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('资料根目录'), { target: { value: 'X:\\Library' } });
    fireEvent.click(screen.getByRole('button', { name: '保存根目录' }));

    expect(await screen.findByText('资料根目录已保存')).toBeVisible();
    expect(screen.getByRole('button', { name: '扫描资料库' })).toBeEnabled();
  });

  it('retains the typed path and does not suggest success when saving fails', async () => {
    const api = apiFixture(); api.updateWorkspaceSettings.mockRejectedValueOnce(new ApiError('WORKSPACE_INVALID', '目录不存在'));
    render(<FilesPage api={api as never} />); await screen.findByText('尚未设置资料根目录');
    fireEvent.change(screen.getByLabelText('资料根目录'), { target: { value: 'X:\\Missing' } });
    fireEvent.click(screen.getByRole('button', { name: '保存根目录' }));

    expect(await screen.findByText('目录不存在')).toBeVisible();
    expect(screen.getByLabelText('资料根目录')).toHaveValue('X:\\Missing');
    expect(screen.queryByText('资料根目录已保存')).not.toBeInTheDocument();
  });

  it('scans the configured root and renders operational statistics plus source and outlined files', async () => {
    let release!: (value: Awaited<ReturnType<ReturnType<typeof apiFixture>['scanPdfFiles']>>) => void;
    const api = apiFixture(true); api.scanPdfFiles.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    render(<FilesPage api={api as never} />); await screen.findByDisplayValue('X:\\Library');
    fireEvent.click(screen.getByRole('button', { name: '扫描资料库' }));
    expect(screen.getByRole('button', { name: '扫描中…' })).toBeDisabled();
    release({ total: 4, matched: 2, pending: 1, historicalRegistered: 1, unmatched: 1, conflict: 0,
      source: 3, outlined: 1, missing: 0, scannedAt: '2026-08-25T01:00:00Z' });

    expect(await screen.findByText('4 个 PDF')).toBeVisible();
    expect(screen.getByText('2 已匹配')).toBeVisible();
    expect(screen.getByText('1 未匹配')).toBeVisible();
    expect(screen.getByText('1 待确认')).toBeVisible();
    expect(screen.getByText('1 个历史图号已登记')).toBeVisible();
    expect(screen.getByText('1 转曲后')).toBeVisible();
    expect(screen.getByText(file.fileName)).toBeVisible();
    expect(screen.getByText(outlined.fileName)).toBeVisible();
    expect(screen.getAllByText('转曲前', { selector: '.conversion-label' })).toHaveLength(3);
    expect(screen.getByText('转曲后', { selector: '.conversion-label' })).toBeVisible();
  });

  it('shows pending candidates and their reason without presenting them as occupied', async () => {
    const api = apiFixture(true); render(<FilesPage api={api as never} />);

    expect(await screen.findByText(pending.fileName, { selector: '.file-primary' })).toBeVisible();
    expect(screen.getByText(/待确认.*02\.0404\.010\.0401000.*invalid-format/)).toBeVisible();
    expect(screen.queryByText('历史已占号')).not.toBeInTheDocument();
  });

  it('shows directory and filename conversion conflicts for reliably matched files', async () => {
    const api = apiFixture(true);
    api.searchPdfFiles.mockResolvedValueOnce({ items: [conversionConflict], total: 1, page: 1, pageSize: 50 });
    render(<FilesPage api={api as never} />);

    expect(await screen.findByText('目录与文件名的转曲标记冲突')).toBeVisible();
    expect(screen.getByText(conversionConflict.fullCode)).toBeVisible();
  });

  it('submits combined filters and shows unmatched or missing states without stale requests winning', async () => {
    const api = apiFixture(true); render(<FilesPage api={api as never} />);
    await screen.findByText(unmatched.fileName, { selector: '.file-primary' });
    fireEvent.change(screen.getByLabelText('文件关键词'), { target: { value: 'unknown' } });
    fireEvent.change(screen.getByLabelText('匹配状态'), { target: { value: 'unmatched' } });
    fireEvent.change(screen.getByLabelText('存在状态'), { target: { value: 'missing' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选 PDF' }));

    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith({ keyword: 'unknown', matchStatus: 'unmatched',
      conversionType: '', presence: 'missing', page: 1, pageSize: 50 }));
  });

  it('pages through more than fifty matching PDF records', async () => {
    const api = apiFixture(true);
    api.searchPdfFiles.mockImplementation(async (filters?: Record<string, unknown>) => ({
      items: filters?.page === 2 ? [outlined] : [file], total: 51, page: Number(filters?.page ?? 1), pageSize: 50,
    }));
    render(<FilesPage api={api as never} />);
    await screen.findByText(file.fileName, { selector: '.file-primary' });

    expect(screen.getByText('第 1 / 2 页')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText(outlined.fileName, { selector: '.file-primary' })).toBeVisible();
    expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 50 }));
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
  });

  it('confirms a single missing-index cleanup and refreshes the displayed count', async () => {
    const api = apiFixture(true);
    api.searchPdfFiles.mockResolvedValue({ items: [missing], total: 1, page: 1, pageSize: 50 });
    render(<FilesPage api={api as never} />);
    await screen.findByText(missing.fileName, { selector: '.file-primary' });

    fireEvent.click(screen.getByRole('button', { name: `清理 ${missing.fileName} 的索引记录` }));
    expect(await screen.findByText('此操作只清理数据库索引记录，不会删除磁盘文件，也不会释放历史图号。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认清理索引记录' }));

    await waitFor(() => expect(api.cleanupPdfFiles).toHaveBeenCalledWith([missing.id]));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenCalledTimes(2));
    expect(screen.getByText('1 个索引文件')).toBeVisible();
  });

  it('selects only missing rows on the current page for a confirmed batch cleanup', async () => {
    const api = apiFixture(true);
    api.searchPdfFiles.mockResolvedValue({ items: [file, missing], total: 2, page: 1, pageSize: 50 });
    render(<FilesPage api={api as never} />);
    await screen.findByText(missing.fileName, { selector: '.file-primary' });

    expect(screen.queryByRole('checkbox', { name: `选择 ${file.fileName}` })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '全选本页缺失记录' }));
    expect(screen.getByRole('checkbox', { name: `选择 ${missing.fileName}` })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '清理已选索引记录 (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认清理索引记录' }));

    await waitFor(() => expect(api.cleanupPdfFiles).toHaveBeenCalledWith([missing.id]));
    expect(screen.getByRole('button', { name: '清理已选索引记录 (0)' })).toBeDisabled();
  });
});
