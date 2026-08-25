import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../../src/renderer/data/client';
import { FilesPage } from '../../src/renderer/pages/FilesPage';

const file = { id: 1, relativePath: 'SAMKYO\\冰柜\\ZC100\\02.0404.010.0401001-LOGO.pdf',
  fileName: '02.0404.010.0401001-LOGO.pdf', drawingId: 10, fullCode: '02.0404.010.0401001',
  displayName: 'SAMKYO-ZC100白色-LOGO', model: 'ZC100', brandName: 'SAMKYO', projectItemName: 'LOGO', colorName: '白色',
  matchStatus: 'matched' as const, detectedCodes: ['02.0404.010.0401001'], conversionType: 'source' as const,
  sizeBytes: 1024, modifiedAt: '2026-08-25T00:00:00Z', scannedAt: '2026-08-25T01:00:00Z', isPresent: true };
const outlined = { ...file, id: 2, relativePath: 'SAMKYO\\冰柜\\ZC100\\02.0404.010.0401001-LOGO（转曲）.pdf',
  fileName: '02.0404.010.0401001-LOGO（转曲）.pdf', conversionType: 'outlined' as const, sizeBytes: 2048 };
const unmatched = { ...file, id: 3, relativePath: 'unknown.pdf', fileName: 'unknown.pdf', drawingId: null, fullCode: null,
  displayName: null, model: null, brandName: null, projectItemName: null, colorName: null, matchStatus: 'unmatched' as const,
  detectedCodes: [], conversionType: 'source' as const };

function apiFixture(configured = false) {
  return {
    getWorkspaceSettings: vi.fn().mockResolvedValue(configured
      ? { workspaceRoot: 'X:\\Library', configured: true, available: true }
      : { workspaceRoot: null, configured: false, available: false }),
    updateWorkspaceSettings: vi.fn().mockResolvedValue({ workspaceRoot: 'X:\\Library', configured: true, available: true }),
    scanPdfFiles: vi.fn().mockResolvedValue({ total: 3, matched: 2, unmatched: 1, conflict: 0, source: 2,
      outlined: 1, missing: 0, scannedAt: '2026-08-25T01:00:00Z' }),
    searchPdfFiles: vi.fn().mockResolvedValue({ items: [file, outlined, unmatched], total: 3, page: 1, pageSize: 50 }),
  };
}

describe('FilesPage', () => {
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
    release({ total: 3, matched: 2, unmatched: 1, conflict: 0, source: 2, outlined: 1, missing: 0, scannedAt: '2026-08-25T01:00:00Z' });

    expect(await screen.findByText('3 个 PDF')).toBeVisible();
    expect(screen.getByText('2 已匹配')).toBeVisible();
    expect(screen.getByText('1 未匹配')).toBeVisible();
    expect(screen.getByText('1 转曲后')).toBeVisible();
    expect(screen.getByText(file.fileName)).toBeVisible();
    expect(screen.getByText(outlined.fileName)).toBeVisible();
    expect(screen.getAllByText('转曲前', { selector: '.conversion-label' })).toHaveLength(2);
    expect(screen.getByText('转曲后', { selector: '.conversion-label' })).toBeVisible();
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
});
