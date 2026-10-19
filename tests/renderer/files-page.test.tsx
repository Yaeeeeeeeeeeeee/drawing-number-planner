import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      unmatched: 1, conflict: 0, source: 3, outlined: 1, missing: 0, scanId: 11, currentTotal: 4,
      comparison: { added: 1, missing: 1, moved: 1, changed: 1, unchanged: 0 }, scannedAt: '2026-08-25T01:00:00Z' }),
    getLatestFileScan: vi.fn().mockResolvedValue(null),
    getFileScanChanges: vi.fn().mockResolvedValue({ scan: { id: 11, currentTotal: 4, completedAt: '2026-08-25T01:00:00Z', added: 1, missing: 1, moved: 1, changed: 1, unchanged: 0 },
      changes: { added: [{ id: 1, type: 'added', indexKind: 'qr', relativePath: 'new.png', previousRelativePath: null, fileName: 'new.png', fullCode: null }],
        missing: [{ id: 2, type: 'missing', indexKind: 'pdf', relativePath: 'gone.pdf', previousRelativePath: null, fileName: 'gone.pdf', fullCode: null }],
        changed: [{ id: 3, type: 'changed', indexKind: 'pdf', relativePath: 'edited.pdf', previousRelativePath: null, fileName: 'edited.pdf', fullCode: null }] } }),
    cleanupPdfFiles: vi.fn().mockResolvedValue({ cleaned: 1 }),
    getFileIndexClearPreview: vi.fn().mockResolvedValue({ workspaceRoot: 'X:\\Library',
      counts: { pdfFiles: 4, qrCodeFiles: 2, materialBatches: 1, scanChanges: 4, scanRuns: 2 } }),
    clearFileIndex: vi.fn().mockResolvedValue({ pdfFiles: 4, qrCodeFiles: 2, materialBatches: 1, scanChanges: 4, scanRuns: 2 }),
    searchPdfFiles: vi.fn().mockResolvedValue({ items: [file, outlined, unmatched, pending], total: 4, page: 1, pageSize: 50 }),
    listProducts: vi.fn().mockResolvedValue([{ id: 9, sku: 'SKDZC100JP', model: 'ZC100', productCategory: '冰柜', status: 'active' }]),
    listMaterialBatches: vi.fn().mockResolvedValue([{ id: 2, sku: 'SKDZC100JP', model: 'ZC100', productId: 9, name: '06.20260309' }]),
  };
}

describe('FilesPage', () => {
  beforeEach(() => { Object.defineProperty(window, 'innerWidth', {configurable:true,value:1600}); });
  it('keeps manual file filters when all files clears only navigation scope', async () => {
    const api = apiFixture(true); render(<FilesPage api={api as never} />);
    await screen.findByRole('button', { name: '全部文件' });
    fireEvent.click(screen.getByText('文件筛选'));
    fireEvent.change(screen.getByLabelText('文件关键词'), { target: { value: 'manual' } });
    fireEvent.change(screen.getByLabelText('匹配状态'), { target: { value: 'pending' } });
    fireEvent.click(screen.getByRole('button', { name: '待关联产品' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'manual', matchStatus: 'pending', unassociatedProduct: 'true' })));
    fireEvent.click(screen.getByRole('button', { name: '全部文件' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith({ keyword: 'manual', matchStatus: 'pending', conversionType: '', presence: 'all', page: 1, pageSize: 50 }));
    expect(screen.getAllByLabelText('文件关键词')).toHaveLength(1);
    expect(screen.getByLabelText('文件关键词').closest('nav')).toHaveAttribute('aria-label', '资料导航');
    expect(screen.queryByRole('button', { name: '待确认文件' })).not.toBeInTheDocument();
    expect(screen.queryByText('回收站')).not.toBeInTheDocument();
  });

  it('finishes workspace metadata loading when navigation changes before the first query resolves', async () => {
    const api = apiFixture(true);
    let release!: (value: {workspaceRoot:string;configured:boolean;available:boolean}) => void;
    api.getWorkspaceSettings.mockImplementationOnce(() => new Promise(resolve => {release=resolve;}));
    render(<FilesPage api={api as never} />);
    fireEvent.click(screen.getByRole('button',{name:'待关联产品'}));
    await screen.findAllByText('冰柜 · ZC100',{selector:'.file-product strong'});
    release({workspaceRoot:'X:\\Library',configured:true,available:true});
    expect(await screen.findByDisplayValue('X:\\Library')).toBeVisible();
    expect(await screen.findByRole('button',{name:'产品 SKDZC100JP · ZC100'})).toBeVisible();
  });

  it('opens the exact product and batch supplied by drawing navigation without scanning or mutation', async () => {
    const api = apiFixture(true);
    render(<FilesPage api={api as never} initialTarget={{productId:9,materialBatchId:2,fullCode:file.fullCode}} />);
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenCalledWith(expect.objectContaining({keyword:file.fullCode,productId:9,materialBatchId:2,presence:'all'})));
    expect(api.scanPdfFiles).not.toHaveBeenCalled();
    expect(api.cleanupPdfFiles).not.toHaveBeenCalled();
    expect(api.updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it('keeps a file-location failure visible inside the file detail drawer', async () => {
    delete window.plannerDesktop;
    render(<FilesPage api={apiFixture(true) as never} />);
    fireEvent.click(await screen.findByRole('button', { name: `文件详情 ${file.fileName}` }));
    const detail = await screen.findByRole('complementary', { name: '文件详情' });
    fireEvent.click(within(detail).getByRole('button', { name: '打开文件位置' }));
    expect(await within(detail).findByRole('alert')).toHaveTextContent('请在 Windows 桌面版打开文件位置');
  });
  it('navigates with real product IDs and shows indexed file details separately from cleanup selection', async () => {
    const api = apiFixture(true);
    render(<FilesPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '产品 SKDZC100JP · ZC100' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({ productId: 9, page: 1 })));
    fireEvent.click(screen.getByRole('button', { name: `文件详情 ${file.fileName}` }));
    const detail = await screen.findByRole('complementary', { name: '文件详情' });
    expect(detail.closest('table')).toBeNull();
    expect(detail.textContent).toContain(file.relativePath);
    expect(detail.textContent).toContain('1024 B');
    expect(screen.getByRole('checkbox', { name: `选择 ${file.fileName}` })).not.toBeChecked();
    expect(api.scanPdfFiles).not.toHaveBeenCalled();
    expect(api.cleanupPdfFiles).not.toHaveBeenCalled();
  });
  it('keeps legal cross-batch instances visible and explains that they are not scan duplicates', async () => {
    const first = { ...file, id: 71, relativePath: 'T40\\00.首批大货\\same.pdf',
      materialBatchId: 1, materialBatchName: '00.首批大货', materialBatchStatus: 'recognized' };
    const current = { ...file, id: 72, relativePath: 'T40\\06.20260309\\same.pdf',
      materialBatchId: 2, materialBatchName: '06.20260309', materialBatchStatus: 'recognized' };
    const api = apiFixture(true);
    api.searchPdfFiles.mockResolvedValue({ items: [first, current], total: 2, page: 1, pageSize: 50 });

    render(<FilesPage api={api as never} />);

    expect(await screen.findAllByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' })).toHaveLength(2);
    expect(screen.getByText('首批大货', { selector: '.files-batch-code' })).toBeVisible();
    expect(screen.getByText('20260309', { selector: '.files-batch-code' })).toBeVisible();
    expect(screen.getByText(/同一图号出现在不同资料批次属于正常历史快照/)).toBeVisible();
    expect(screen.queryByText('扫描重复')).not.toBeInTheDocument();
  });

  it('shows canonical product identity, uses product IDs to filter, and labels unlinked files', async () => {
    const api = apiFixture(true);
    render(<FilesPage api={api as never} />);

    expect(await screen.findAllByText('冰柜 · ZC100', { selector: '.file-product strong' })).toHaveLength(2);
    expect(screen.getAllByText('SKU：SKDZC100JP', { selector: '.file-product small' })).toHaveLength(2);
    expect(screen.getAllByText('待关联').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '产品 SKDZC100JP · ZC100' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({ productId: 9 })));
  });
  it('opens a present file by PDF index ID and disables missing file locations', async () => {
    const showFileInFolder = vi.fn().mockResolvedValue({ ok: true }); window.plannerDesktop = { showFileInFolder };
    const api = apiFixture(true); api.searchPdfFiles.mockResolvedValue({ items: [file, missing], total: 2, page: 1, pageSize: 50 });
    render(<FilesPage api={api as never} />); await screen.findByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });

    fireEvent.click(screen.getByRole('button', { name: `打开 ${file.fileName} 的位置` }));
    await waitFor(() => expect(showFileInFolder).toHaveBeenCalledWith(file.id));
    expect(screen.getByRole('button', { name: `打开 ${missing.fileName} 的位置` })).toBeDisabled();
    expect(screen.getByText('文件缺失')).toBeVisible();
  });

  it('shows the desktop-only browser message without calling the API', async () => {
    delete window.plannerDesktop; const api = apiFixture(true);
    render(<FilesPage api={api as never} />); await screen.findByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });

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
      source: 3, outlined: 1, missing: 0, scanId: 11, currentTotal: 4,
      comparison: { added: 1, missing: 1, moved: 0, changed: 0, unchanged: 2 }, scannedAt: '2026-08-25T01:00:00Z' });

    expect(await screen.findByText('4 个索引文件（PDF / 二维码）')).toBeVisible();
    expect(screen.getByText('2 已匹配')).toBeVisible();
    expect(screen.getByText('1 未匹配')).toBeVisible();
    expect(screen.getByText('1 待确认')).toBeVisible();
    expect(screen.getByText('1 个历史图号已登记')).toBeVisible();
    expect(screen.getByText('1 转曲后')).toBeVisible();
    expect(screen.getByText(file.fileName.replace(/\.pdf$/i, ''))).toBeVisible();
    expect(screen.getByText(outlined.fileName.replace(/\.pdf$/i, ''))).toBeVisible();
    expect(screen.getAllByText('转曲前', { selector: '.conversion-label' })).toHaveLength(3);
    expect(screen.getByText('转曲后', { selector: '.conversion-label' })).toBeVisible();
  });

  it('refreshes the latest selected scope when a scan finishes after navigation changes', async () => {
    const api = apiFixture(true);
    const summary = await api.scanPdfFiles();
    let finishScan!: (value: typeof summary) => void;
    api.scanPdfFiles.mockImplementationOnce(() => new Promise(resolve => { finishScan = resolve; }));
    api.searchPdfFiles.mockImplementation(async (filters: Record<string, unknown>) => ({items: filters.unassociatedProduct ? [unmatched] : [file], total:1,page:1,pageSize:50}));
    render(<FilesPage api={api as never} initialTarget={{productId:9,fullCode:''}} />);
    await screen.findByDisplayValue('X:\\Library');
    fireEvent.click(screen.getByRole('button',{name:'扫描资料库'}));
    fireEvent.click(screen.getByRole('button',{name:'待关联产品'}));
    await screen.findByText('unknown',{selector:'.file-primary'});
    finishScan(summary);
    await waitFor(() => expect(screen.getByRole('button',{name:'扫描资料库'})).toBeEnabled());
    expect(screen.getByRole('button',{name:'待关联产品'})).toHaveAttribute('aria-current','page');
    expect(screen.getByText('unknown',{selector:'.file-primary'})).toBeVisible();
    expect(screen.queryByText(file.fileName.replace(/\.pdf$/i,''),{selector:'.file-primary'})).not.toBeInTheDocument();
  });

  it('separates current library state from this scan changes and expands grouped details in place', async () => {
    const api = apiFixture(true); render(<FilesPage api={api as never} />);
    await screen.findByDisplayValue('X:\\Library');
    fireEvent.click(screen.getByRole('button', { name: '扫描资料库' }));

    expect(await screen.findByText('当前索引统计')).toBeVisible();
    expect(screen.getByText('本次扫描变化（PDF / 二维码）')).toBeVisible();
    expect(screen.getByText('1 新增')).toBeVisible();
    expect(screen.getByText('1 删除/缺失')).toBeVisible();
    expect(screen.getByText('1 路径变化')).toBeVisible();
    expect(screen.getByText('1 内容变化')).toBeVisible();
    const viewChanges = screen.getByRole('button', { name: '查看本次变化' });
    expect(viewChanges).toHaveAttribute('aria-expanded', 'false');
    expect(viewChanges).toHaveAttribute('aria-controls', 'scan-change-details');
    fireEvent.click(viewChanges);

    expect(await screen.findByText('新增')).toBeVisible();
    expect(screen.getByText('删除/缺失')).toBeVisible();
    expect(screen.getByText('变化')).toBeVisible();
    expect(screen.getByText('二维码 · new.png', { selector: '.scan-change-group span' })).toBeVisible();
    expect(screen.getByText('PDF · gone.pdf', { selector: '.scan-change-group span' })).toBeVisible();
    expect(screen.getByText('PDF · edited.pdf', { selector: '.scan-change-group span' })).toBeVisible();
    expect(api.getFileScanChanges).toHaveBeenCalledWith(11);
    const collapseChanges = screen.getByRole('button', { name: '收起本次变化' });
    expect(collapseChanges).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(collapseChanges);
    expect(screen.queryByLabelText('本次扫描变化详情')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '查看本次变化' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('refreshes material-batch filter options after a successful scan', async () => {
    const api = apiFixture(true);
    api.listMaterialBatches.mockResolvedValueOnce([]).mockResolvedValueOnce([
      { id: 12, sku: 'SKDWT040JP', model: 'T40', productId: 9, name: '06.20260309' },
    ]);
    render(<FilesPage api={api as never} />);
    await screen.findByDisplayValue('X:\\Library');

    fireEvent.click(screen.getByRole('button', { name: '扫描资料库' }));

    fireEvent.click(screen.getByRole('button',{name:'展开产品 SKDZC100JP · ZC100'}));
    expect(await screen.findByRole('button', { name: '批次 20260309' })).toBeVisible();
    expect(api.listMaterialBatches).toHaveBeenCalledTimes(2);
  });

  it('shows pending candidates and their reason without presenting them as occupied', async () => {
    const api = apiFixture(true); render(<FilesPage api={api as never} />);

    expect(await screen.findByText(pending.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' })).toBeVisible();
    expect(screen.getByText('待确认', { selector: '.files-match-badge' })).toBeVisible();
    expect(screen.getByText('02.0404.010.0401000', { selector: '.code-cell' })).toBeVisible();
    expect(screen.getByText('invalid-format', { selector: '.files-match-reason' })).toBeVisible();
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
    await screen.findByText(unmatched.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });
    fireEvent.click(screen.getByText('文件筛选'));
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
    await screen.findByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });

    expect(screen.getByText('第 1 / 2 页')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(await screen.findByText(outlined.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' })).toBeVisible();
    expect(api.searchPdfFiles).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 50 }));
    expect(screen.getByRole('button', { name: '上一页' })).toBeEnabled();
  });

  it('confirms a single missing-index cleanup and refreshes the displayed count', async () => {
    const api = apiFixture(true);
    api.searchPdfFiles.mockResolvedValue({ items: [missing], total: 1, page: 1, pageSize: 50 });
    render(<FilesPage api={api as never} />);
    await screen.findByText(missing.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });

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
    await screen.findByText(missing.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });

    expect(screen.getByRole('checkbox', { name: `选择 ${file.fileName}` })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '全选本页缺失记录' }));
    expect(screen.getByRole('checkbox', { name: `选择 ${missing.fileName}` })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: '清理已选索引记录 (1)' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认清理索引记录' }));

    await waitFor(() => expect(api.cleanupPdfFiles).toHaveBeenCalledWith([missing.id]));
    expect(screen.getByRole('button', { name: '清理已选索引记录 (0)' })).toBeDisabled();
  });

  it('uses a configured-root two-step phrase confirmation before clearing the library index', async () => {
    const api = apiFixture(true);
    render(<FilesPage api={api as never} />);
    await screen.findByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });

    fireEvent.click(screen.getByRole('button', { name: '清空资料库索引' }));
    expect(await screen.findByText('资料根目录：X:\\Library')).toBeVisible();
    expect(screen.getByText('不会删除 X:\\Library 中的任何实际文件。')).toBeVisible();
    expect(screen.getByText('PDF 索引：4')).toBeVisible();
    expect(screen.getByText('二维码索引：2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '继续' }));

    const confirmation = screen.getByLabelText('确认短语');
    fireEvent.change(confirmation, { target: { value: '清空资料库' } });
    expect(screen.getByRole('button', { name: '确认清空资料库索引' })).toBeDisabled();
    fireEvent.change(confirmation, { target: { value: '清空资料库索引' } });
    fireEvent.click(screen.getByRole('button', { name: '确认清空资料库索引' }));

    await waitFor(() => expect(api.clearFileIndex).toHaveBeenCalledWith('清空资料库索引'));
    expect(await screen.findByText('已清空 4 条 PDF 索引、2 条二维码索引、1 个资料批次、4 条扫描变化和 2 次扫描记录')).toBeVisible();
  });

  it('clears a selected deleted batch filter so the next scan shows rebuilt batches and files', async () => {
    const rebuilt = { ...file, id: 12, fileName: 'rebuilt.pdf', relativePath: 'rebuilt.pdf' };
    const api = apiFixture(true);
    api.searchPdfFiles.mockResolvedValueOnce({ items: [file], total: 1, page: 1, pageSize: 50 })
      .mockResolvedValueOnce({ items: [file], total: 1, page: 1, pageSize: 50 })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 50 })
      .mockResolvedValueOnce({ items: [rebuilt], total: 1, page: 1, pageSize: 50 });
    api.listMaterialBatches.mockResolvedValueOnce([{ id: 2, productId:9, sku: 'SKDZC100JP', model: 'ZC100', name: '旧批次' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 12, productId:9, sku: 'SKDWT040JP', model: 'T40', name: '重扫批次' }]);
    render(<FilesPage api={api as never} />);
    await screen.findByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });
    fireEvent.click(screen.getByRole('button',{name:'展开产品 SKDZC100JP · ZC100'}));
    fireEvent.click(screen.getByRole('button',{name:'批次 旧批次'}));

    fireEvent.click(screen.getByRole('button', { name: '清空资料库索引' }));
    fireEvent.click(await screen.findByRole('button', { name: '继续' }));
    fireEvent.change(screen.getByLabelText('确认短语'), { target: { value: '清空资料库索引' } });
    fireEvent.click(screen.getByRole('button', { name: '确认清空资料库索引' }));

    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenNthCalledWith(3, expect.not.objectContaining({ materialBatchId: 2 })));
    expect(screen.getByRole('button',{name:'全部文件'})).toHaveAttribute('aria-current','page');
    fireEvent.click(screen.getByRole('button', { name: '扫描资料库' }));
    expect(await screen.findByRole('button', { name: '批次 重扫批次' })).toBeVisible();
    expect(screen.getByText('rebuilt', { selector: '.file-primary' })).toBeVisible();
  });

  it('closes a pending missing-index cleanup confirmation after a full index clear', async () => {
    const api = apiFixture(true); api.searchPdfFiles.mockResolvedValue({ items: [missing], total: 1, page: 1, pageSize: 50 });
    render(<FilesPage api={api as never} />);
    await screen.findByText(missing.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });
    fireEvent.click(screen.getByRole('button', { name: `清理 ${missing.fileName} 的索引记录` }));
    expect(await screen.findByRole('dialog', { name: '确认清理 PDF 索引记录' })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '清空资料库索引' }));
    fireEvent.click(await screen.findByRole('button', { name: '继续' }));
    fireEvent.change(screen.getByLabelText('确认短语'), { target: { value: '清空资料库索引' } });
    fireEvent.click(screen.getByRole('button', { name: '确认清空资料库索引' }));

    await waitFor(() => expect(api.clearFileIndex).toHaveBeenCalledWith('清空资料库索引'));
    expect(screen.queryByRole('dialog', { name: '确认清理 PDF 索引记录' })).not.toBeInTheDocument();
  });

  it('keeps a completed index clear successful when the post-clear refresh fails', async () => {
    const api = apiFixture(true);
    api.searchPdfFiles.mockResolvedValueOnce({ items: [file], total: 1, page: 1, pageSize: 50 })
      .mockRejectedValueOnce(new Error('列表刷新失败'));
    render(<FilesPage api={api as never} />);
    await screen.findByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' });

    fireEvent.click(screen.getByRole('button', { name: '清空资料库索引' }));
    fireEvent.click(await screen.findByRole('button', { name: '继续' }));
    fireEvent.change(screen.getByLabelText('确认短语'), { target: { value: '清空资料库索引' } });
    fireEvent.click(screen.getByRole('button', { name: '确认清空资料库索引' }));

    expect(await screen.findByText('已清空 4 条 PDF 索引、2 条二维码索引、1 个资料批次、4 条扫描变化和 2 次扫描记录')).toBeVisible();
    expect(await screen.findByText('索引已清空，但列表刷新失败：列表刷新失败')).toBeVisible();
    expect(screen.queryByText('清空资料库索引失败')).not.toBeInTheDocument();
    expect(screen.queryByText(file.fileName.replace(/\.pdf$/i, ''), { selector: '.file-primary' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'SKDZC100JP · ZC100 · 06.20260309' })).not.toBeInTheDocument();
  });
});
