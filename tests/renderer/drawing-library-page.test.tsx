import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DrawingLibraryPage } from '../../src/renderer/pages/DrawingLibraryPage';

it('requests enough initial drawing records for a tall workspace without truncating the result', async () => {
  const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0 }), listDictionaries: vi.fn().mockResolvedValue([]) };
  render(<DrawingLibraryPage api={api as never} />);
  await waitFor(() => expect(api.searchDrawings).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 50 })));
});

describe('DrawingLibraryPage', () => {
  it('does not replace a new drawings PDF candidates with an old manual search response', async () => {
    const first = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active', model: 'T40', displayName: '第一记录', readOnly: false, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const second = { ...first, id: 2, fullCode: '02.0209.010.0501002', displayName: '第二记录' };
    let resolveSearch!: (value: unknown) => void;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [first, second], total: 2 }), listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockImplementation((id: number) => Promise.resolve(id === 1 ? first : second)),
      searchPdfFiles: vi.fn().mockResolvedValueOnce({ items: [{ id: 10, fileName: 'A.pdf', relativePath: 'A.pdf' }] })
        .mockImplementationOnce(() => new Promise(resolve => { resolveSearch = resolve; }))
        .mockResolvedValue({ items: [{ id: 20, fileName: 'B.pdf', relativePath: 'B.pdf' }] }) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: first.fullCode }));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '现有 PDF 索引' })).toHaveValue('10'));
    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'old-search' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    fireEvent.click(screen.getByRole('button', { name: second.fullCode }));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    await waitFor(() => expect(screen.getByRole('combobox', { name: '现有 PDF 索引' })).toHaveValue('20'));
    await act(async () => resolveSearch({ items: [{ id: 11, fileName: 'late-A.pdf', relativePath: 'A.pdf' }] }));
    expect(screen.getByRole('combobox', { name: '现有 PDF 索引' })).toHaveValue('20');
    expect(screen.queryByRole('option', { name: /late-A/ })).not.toBeInTheDocument();
  });
  it('does not apply an earlier deletion preflight to a newly selected drawing', async () => {
    const first = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active', model: 'T40', displayName: '第一记录', readOnly: true, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const second = { ...first, id: 2, fullCode: '02.0209.010.0501002', displayName: '第二记录' };
    let resolvePreview!: (value: unknown) => void;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [first, second], total: 2 }), listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockImplementation((id: number) => Promise.resolve(id === 1 ? first : second)),
      getDrawingDeletionPreview: vi.fn().mockImplementation(() => new Promise(resolve => { resolvePreview = resolve; })) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: first.fullCode }));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除图号' }));
    fireEvent.click(screen.getByRole('button', { name: second.fullCode }));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    await screen.findByText('第二记录');
    await act(async () => resolvePreview({ fullCode: first.fullCode, origin: 'planned', deletable: true, references: {}, blockers: [] }));
    expect(within(screen.getByRole('complementary', { name: '图号详情' })).queryByText(first.fullCode)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认删除' })).not.toBeInTheDocument();
  });
  it('ignores a late response for an earlier drawing selection', async () => {
    const first = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active', model: 'T40', displayName: '旧详情', readOnly: true, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const second = { ...first, id: 2, fullCode: '02.0209.010.0501002', displayName: '最新详情' };
    let resolveFirst!: (value: unknown) => void;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [first, second], total: 2 }), listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockImplementation((id: number) => id === 1 ? new Promise(resolve => { resolveFirst = resolve; }) : Promise.resolve(second)) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: first.fullCode }));
    fireEvent.click(screen.getByRole('button', { name: second.fullCode }));
    expect(await screen.findByText('最新详情')).toBeVisible();
    await act(async () => resolveFirst(first));
    await waitFor(() => expect(within(screen.getByRole('complementary', { name: '图号详情' })).getByText('最新详情')).toBeVisible());
    expect(within(screen.getByRole('complementary', { name: '图号详情' })).queryByText('旧详情')).not.toBeInTheDocument();
  });
  it('opens details outside the table without selecting batch checkboxes', async () => {
    window.history.replaceState({}, '', '/?mock=drawing-library');
    render(<DrawingLibraryPage api={{} as never} />);
    const trigger = await screen.findByRole('button', { name: '02.0209.010.0501001' });
    const checkbox = screen.getByRole('checkbox', { name: '选择图号 02.0209.010.0501001' });
    fireEvent.click(checkbox);
    expect(screen.queryByRole('complementary', { name: '图号详情' })).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const detail = await screen.findByRole('complementary', { name: '图号详情' });
    expect(detail.closest('table')).toBeNull();
    expect(checkbox).toBeChecked();
    expect(within(detail).getByRole('button', { name: '复制完整图号' })).toBeVisible();
  });
  afterEach(() => window.history.replaceState({}, '', '/'));
  it('keeps detail attributes, state actions and file maintenance grouped without losing information', async () => {
    window.history.replaceState({}, '', '/?mock=drawing-library');
    const realCall = vi.fn();
    render(<DrawingLibraryPage api={new Proxy({}, { get: () => realCall }) as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '02.0209.010.0501001' }));
    const detail = await screen.findByRole('complementary', { name: '图号详情' });
    expect(within(detail).getAllByRole('term').map((term) => term.textContent)).toEqual(['SKU', '品牌', '型号', '产品类别', '主类别', '项目']);
    expect(within(detail).getByText('正式使用')).toBeVisible();
    expect(within(detail).getByRole('button', { name: '管理图号' })).toBeDisabled();
    expect(within(detail).queryByRole('region', { name: '文件维护 / 索引维护' })).not.toBeInTheDocument();
    expect(within(detail).queryByRole('button', { name: '删除图号' })).not.toBeInTheDocument();
    fireEvent.keyDown(detail, { key: 'Escape' });
    expect(screen.queryByRole('complementary', { name: '图号详情' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '02.0209.010.0501001' })).toHaveFocus();
    expect(realCall).not.toHaveBeenCalled();
  });
  it('exposes the detail disclosure and returns focus to the drawing on close', async () => {
    const row = { id: 77, fullCode: '02.0209.010.0501077', origin: 'planned', status: 'active',
      model: 'T40', displayName: '说明书', readOnly: true, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    const trigger = await screen.findByRole('button', { name: row.fullCode });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    const detail = await screen.findByRole('complementary', { name: '图号详情' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(trigger.getAttribute('aria-controls')).toBe(detail.id);
    fireEvent.click(screen.getByRole('button', { name: '关闭图号详情' }));
    expect(trigger).toHaveFocus();
  });

  it('keeps all Mock maintenance and disk buttons disabled even with colliding real IDs', async () => {
    window.history.replaceState({}, '', '/?mock=drawing-library');
    const realCall = vi.fn();
    const api = new Proxy({}, { get: () => realCall });
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '02.0209.010.0501001' }));
    expect(await screen.findByRole('button', { name: '管理图号' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /^删除图号$/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /打开源文件.*的位置/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: '全选当前页' }));
    expect(screen.getByRole('button', { name: /批量删除/ })).toBeDisabled();
    expect(realCall).not.toHaveBeenCalled();
    window.history.replaceState({}, '', '/');
  });
  it('opens the recycle bin directly and offers release for retained deleted records', async () => {
    const row = { id: -1, fullCode: '02.0209.010.0401001', origin: 'historical', status: 'active', model: 'T40',
      displayName: '历史资料', deletedAt: '2026-09-30', deletionMode: 'retain_occupied', readOnly: true,
      sourceFiles: [], outlinedFiles: [], currentBomUsage: [] };
    const api = { searchDrawings: vi.fn().mockImplementation((filters) => Promise.resolve({ items: filters.deletionState === 'deleted-retained' ? [row] : [], total: filters.deletionState === 'deleted-retained' ? 1 : 0 })),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row),
      getDrawingDeletionPreview: vi.fn().mockResolvedValue({ fullCode: row.fullCode, origin: 'historical', references: {}, blockers: [], deletable: true }) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '回收站' }));
    fireEvent.click(await screen.findByText(row.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    fireEvent.click(await screen.findByRole('button', { name: '检查引用并释放占号' }));
    expect(await screen.findByLabelText('输入完整图号确认释放')).toBeVisible();
    expect(screen.getByText('释放后，该号码未来可能被重新规划使用。')).toBeVisible();
  });
  it('requires a directory choice when one product has current files in multiple directories', async () => {
    const files = ['A', 'B'].map((directory, index) => ({ pdfIndexId: index + 1, fileName: `${directory}.pdf`,
      relativePath: `${directory}/00/${directory}.pdf`, isPresent: true, conversionType: 'outlined' }));
    const row = { id: 1, productId: 10, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active',
      model: 'T40', displayName: '外箱', sourceFiles: [], outlinedFiles: files, currentBomUsage: [], readOnly: true,
      batchUsage: { state: 'current', occurrences: files.map((file, index) => ({ batchId: index + 1, productId: 10,
        productDirectory: index === 0 ? 'A' : 'B', batchName: '00.首批大货', usageState: 'current', files: [file] })) } };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));
    const directory = await screen.findByLabelText('当前文件所属资料目录');
    expect(screen.queryByText('A.pdf')).not.toBeVisible();
    expect(screen.queryByText('B.pdf')).not.toBeVisible();
    fireEvent.change(directory, { target: { value: 'A' } });
    expect(screen.getByText('A.pdf')).toBeVisible();
    expect(screen.queryByText('B.pdf')).not.toBeVisible();
  });
  it('does not present another product current file as the selected product current material', async () => {
    const own = { pdfIndexId: 1, fileName: 'own-old.pdf', relativePath: 'A/00/own-old.pdf', isPresent: true, conversionType: 'outlined' };
    const other = { ...own, pdfIndexId: 2, fileName: 'other-current.pdf', relativePath: 'B/01/other-current.pdf' };
    const row = { id: 1, productId: 10, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active',
      model: 'T40', displayName: '外箱', sourceFiles: [], outlinedFiles: [own, other], currentBomUsage: [], readOnly: true,
      batchUsage: { state: 'current', occurrences: [
        { batchId: 1, productId: 10, productDirectory: 'A', batchName: '00.首批大货', usageState: 'historical', files: [own] },
        { batchId: 2, productId: 20, productDirectory: 'B', batchName: '01.20260929', usageState: 'current', files: [other] },
      ] } };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));
    expect(await screen.findByText(/未找到当前有效批次的转曲后文件/)).toBeVisible();
    expect(screen.queryByText('other-current.pdf')).not.toBeVisible();
    fireEvent.click(screen.getByText('查看历史文件'));
    expect(screen.getByText('other-current.pdf')).toBeVisible();
  });
  it.each([true, false])('shows only the current batch outlined file (present=%s) until history is expanded', async (isPresent) => {
    const oldFile = { pdfIndexId: 1, fileName: 'old.pdf', relativePath: '00/old.pdf', isPresent: true, conversionType: 'outlined' };
    const currentFile = { ...oldFile, pdfIndexId: 2, fileName: 'current.pdf', relativePath: '06/current.pdf', isPresent };
    const row = { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'active',
      model: 'T40', displayName: '外箱', sourceFiles: [], outlinedFiles: [oldFile, currentFile],
      hasSourceFile: false, hasOutlinedFile: true, currentBomUsage: [], readOnly: true,
      batchUsage: { state: 'current', occurrences: [
        { batchId: 1, batchName: '00.首批大货', usageState: 'historical', files: [oldFile] },
        { batchId: 2, batchName: '06.20260309', usageState: 'current', files: [currentFile] },
      ] } };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(row) };
    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));
    expect(await screen.findByText('current.pdf')).toBeVisible();
    if (!isPresent) expect(screen.getByRole('button', { name: '打开转曲后文件 current.pdf 的位置' })).toBeDisabled();
    expect(screen.queryByText('old.pdf')).not.toBeVisible();
    fireEvent.click(screen.getByText('查看历史文件'));
    expect(screen.getByText('old.pdf')).toBeVisible();
  });
  it('aggregates one logical drawing and expands all of its material batch occurrences', async () => {
    const occurrences = Array.from({ length: 7 }, (_, index) => ({
      batchId: index + 1,
      productDirectory: '01.洗碗机\\SKU-T40',
      batchName: index === 6 ? '06.20260309' : `0${index}.20250${index + 1}01`,
      sequenceNumber: index,
      recognitionStatus: 'recognized',
      usageState: index === 6 ? 'current' : 'historical',
      files: [],
    }));
    const row = {
      id: -1, fullCode: '02.0209.010.0501001', displayName: '大外箱', sku: 'SKU', model: 'T40',
      brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '包装类', projectItemName: '大外箱',
      status: 'active', origin: 'historical', hasSourceFile: true, hasOutlinedFile: true,
      dictionaryMappingStatus: 'mapped',
      batchUsage: { state: 'current', occurrenceCount: 7, currentProductCount: 1, historicalProductCount: 0,
        conflictWithBusinessStatus: false, occurrences },
    } as const;
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      getDrawing: vi.fn().mockResolvedValue({ ...row, readOnly: true, readOnlyMessage: '永久占用的历史数据，不可修改',
        sourceFiles: [], outlinedFiles: [], currentBomUsage: [] }),
    };

    render(<DrawingLibraryPage api={api as never} />);

    expect(await screen.findAllByText(row.fullCode)).toHaveLength(1);
    expect(screen.queryByText('资料使用')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText(row.fullCode));
    fireEvent.click(await screen.findByText('PDF 出现位置（7）'));
    expect(await screen.findByText(/20260309/)).toBeVisible();
    expect(screen.getByText(/20250101/)).toBeVisible();
  });

  it('offers a separate open-location action for each present source/outlined file and disables missing rows', async () => {
    const row = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'active', origin: 'planned', hasSourceFile: true, hasOutlinedFile: true,
      dictionaryMappingStatus: 'mapped' } as const;
    const detail = { ...row, readOnly: false, readOnlyMessage: null,
      sourceFiles: [{ pdfIndexId: 21, fileName: 'source.pdf', relativePath: 'SKU/source.pdf', isPresent: true, conversionType: 'source' }],
      outlinedFiles: [
        { pdfIndexId: 22, fileName: 'outlined.pdf', relativePath: 'SKU/outlined.pdf', isPresent: true, conversionType: 'outlined' },
        { pdfIndexId: 23, fileName: 'missing.pdf', relativePath: 'SKU/missing.pdf', isPresent: false, conversionType: 'outlined' },
      ], currentBomUsage: [] } as const;
    const showFileInFolder = vi.fn().mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce({ ok: false,
      error: { code: 'PDF_FILE_UNAVAILABLE', message: '文件已不存在，请重新扫描资料库' } });
    window.plannerDesktop = { showFileInFolder };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }) };

    render(<DrawingLibraryPage api={api as never} />); fireEvent.click(await screen.findByText(row.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '打开源文件 source.pdf 的位置' }));
    fireEvent.click(screen.getByText('查看历史文件'));
    fireEvent.click(screen.getByRole('button', { name: '打开转曲后文件 outlined.pdf 的位置' }));

    await waitFor(() => expect(showFileInFolder).toHaveBeenNthCalledWith(1, 21));
    expect(showFileInFolder).toHaveBeenNthCalledWith(2, 22);
    expect(await screen.findByText('文件已不存在，请重新扫描资料库')).toBeVisible();
    expect(screen.getByRole('button', { name: '打开转曲后文件 missing.pdf 的位置' })).toBeDisabled();
    expect(screen.getByText('文件缺失')).toBeVisible();
  });

  it('runs real filters and opens the selected drawing detail', async () => {
    const drawing = { id: 1, fullCode: '02.0209.010.0401001', displayName: 'SAMKYO-ZC220白色-LOGO', sku: 'SKDZC220JP',
      model: 'ZC220', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'active', origin: 'planned', hasSourceFile: true,
      hasOutlinedFile: false, dictionaryMappingStatus: 'mapped' };
    const api = {
      listDictionaries: vi.fn().mockResolvedValue([]), listProducts: vi.fn().mockResolvedValue([{ productCategory: '冰柜' }]),
      searchDrawings: vi.fn().mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
        .mockResolvedValueOnce({ items: [drawing], total: 1, page: 1, pageSize: 20 }),
      getDrawing: vi.fn().mockResolvedValue(drawing),
    };
    render(<DrawingLibraryPage api={api as never} />);
    await screen.findByText('图号库尚无记录');

    fireEvent.click(screen.getByRole('button', {name:'更多筛选'}));
    fireEvent.change(screen.getByLabelText('完整图号'), { target: { value: '02.0209' } });
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: 'ZC220' } });
    fireEvent.change(screen.getByLabelText('关键词'), { target: { value: 'LOGO' } });
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'active' } });
    fireEvent.click(screen.getByLabelText('精确图号'));
    fireEvent.change(screen.getByLabelText('产品类别'), { target: { value: '冰柜' } });
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'SKDZC220JP' } });
    fireEvent.change(screen.getByLabelText('源文件'), { target: { value: 'present' } });
    fireEvent.change(screen.getByLabelText('转曲后文件'), { target: { value: 'missing' } });
    fireEvent.click(screen.getByRole('button', { name: '检索' }));
    const code = await screen.findByText('02.0209.010.0401001');
    fireEvent.click(code);

    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({
      drawingNumber: '02.0209', exactDrawingNumber: true, model: 'ZC220', status: 'active',
      keyword: 'LOGO',
      sku: 'SKDZC220JP', productCategory: '冰柜', sourcePresence: 'present', outlinedPresence: 'missing',
    })));
    expect(screen.getAllByText('正式规划').length).toBeGreaterThan(0);
    expect(screen.getByText((_, element) => element?.className === 'file-integrity-summary' && /源文件已有.*转曲后缺失/.test(element.textContent ?? ''))).toBeVisible();
    expect(await screen.findByRole('complementary', { name: '图号详情' })).toHaveTextContent('SAMKYO-ZC220白色-LOGO');
  });

  it('includes inactive product categories in the drawing filter dropdown', async () => {
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      listProducts: vi.fn().mockResolvedValue([{ productCategory: '在售冰柜', status: 'active' }, { productCategory: '停用酒柜', status: 'inactive' }]),
    };

    render(<DrawingLibraryPage api={api as never} />);
    await waitFor(() => expect(api.listProducts).toHaveBeenCalledWith({ status: 'all' }));
    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }));

    expect(await screen.findByRole('option', { name: '停用酒柜' })).toBeVisible();
  });

  it('shows dictionary filter loading failures instead of silently empty options', async () => {
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }), listDictionaries: vi.fn().mockRejectedValue(new Error('筛选项加载失败')) };
    render(<DrawingLibraryPage api={api as never} />);
    expect(await screen.findByText('筛选项加载失败')).toBeVisible();
  });

  it('marks historical codes whose dictionary segments are not mapped', async () => {
    const historical = { id: -1, fullCode: '99.9999.999.9999001', displayName: '99.9999.999.9999001',
      sku: null, model: '待识别', brandName: '99', colorName: '9', mainCategoryName: '99', projectItemName: '99',
      status: 'active', origin: 'historical', hasSourceFile: false, hasOutlinedFile: true,
      dictionaryMappingStatus: 'unmapped' };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [historical], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(historical) };

    render(<DrawingLibraryPage api={api as never} />);

    expect(await screen.findByText(/历史扫描/)).toBeVisible();
    expect(screen.getByText(/字典待映射/)).toBeVisible();
    expect(screen.getByText((_, element) => element?.className === 'file-integrity-summary' && /源文件缺失.*转曲后已有/.test(element.textContent ?? ''))).toBeVisible();
  });

  it('separates business status, file completeness, and current BOM usage in planned maintenance detail', async () => {
    const row = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'SAMKYO-ZC220白色-LOGO', sku: 'SKU-220',
      productId: 5, model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色',
      mainCategoryName: '印刷件类', projectItemName: 'LOGO', status: 'reserved', origin: 'planned',
      hasSourceFile: true, hasOutlinedFile: false, dictionaryMappingStatus: 'mapped' } as const;
    const detail = { ...row, readOnly: false, readOnlyMessage: null,
      sourceFiles: [{ pdfIndexId: 21, fileName: 'source.pdf', relativePath: 'SKU/source.pdf', isPresent: true, conversionType: 'source' }],
      outlinedFiles: [], currentBomUsage: [{ bomVersionId: 31, productId: 5, model: 'ZC220', colorId: 4,
        colorName: '白色', versionNumber: 2, projectItemId: 7, projectItemName: 'LOGO', quantity: 1, usesWhiteMaterial: false }] };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [row], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }) };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(row.fullCode));

    const panel = await screen.findByRole('complementary', { name: '图号详情' });
    expect(panel).toHaveTextContent('已占号');
    expect(panel).toHaveTextContent('源文件已有');
    expect(panel).toHaveTextContent('转曲后文件缺失');
    expect(panel).toHaveTextContent('SKU/source.pdf');
    expect(panel).toHaveTextContent('当前 BOM 使用');
    expect(panel).toHaveTextContent('ZC220 · 白色 · 当前 BOM');
    expect(panel).not.toHaveTextContent('BOM v2');
  });

  it('confirms lifecycle actions and refreshes both detail and its visible row', async () => {
    const reserved = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const active = { ...reserved, status: 'active' as const };
    const voided = { ...reserved, status: 'voided' as const };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [reserved], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValueOnce(reserved).mockResolvedValueOnce(active).mockResolvedValueOnce(voided),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
      activateDrawing: vi.fn().mockResolvedValue(active), voidDrawing: vi.fn().mockResolvedValue(voided) };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(reserved.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    fireEvent.click(await screen.findByRole('button', { name: '正式使用' }));

    await waitFor(() => expect(api.activateDrawing).toHaveBeenCalledWith(10));
    expect(confirm).toHaveBeenCalledWith('确认将该图号变更为正式使用？此操作会记录业务状态。');
    expect(api.getDrawing).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('正式使用').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: '作废' }));
    await waitFor(() => expect(api.voidDrawing).toHaveBeenCalledWith(10));
    expect(confirm).toHaveBeenLastCalledWith('确认作废该图号？之后可以恢复使用，作废期间号码继续占用。');
    expect(api.getDrawing).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText('作废').length).toBeGreaterThanOrEqual(2);
  });

  it('deletes a drawing from the danger zone with explicit lifecycle mode and reference preview', async () => {
    const reserved = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [reserved], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(reserved),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 }),
      getDrawingDeletionPreview: vi.fn().mockResolvedValue({ signedId: 10, origin: 'planned', fullCode: reserved.fullCode,
        status: 'reserved', deletable: true, blockers: [], references: { presentPdf: 1, missingPdf: 0,
          currentBom: 0, historicalBom: 2, currentMaterial: 0, historicalMaterial: 3, lineage: 0, outboundSnapshot: 1 } }),
      deleteDrawing: vi.fn().mockResolvedValue({ outcome: 'deleted_retained', fullCode: reserved.fullCode, occupied: true }) };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    confirm.mockClear();

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(reserved.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除图号' }));
    expect(await screen.findByText('当前 PDF：1')).toBeVisible();
    expect(screen.getByText('历史 BOM：2')).toBeVisible();
    expect(screen.getByText('历史批次：3')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => expect(api.deleteDrawing).toHaveBeenCalledWith(10, {
      mode: 'retain_occupied', confirmedCode: reserved.fullCode,
    }));
    expect(api.getDrawingDeletionPreview).toHaveBeenCalledWith(10);
    expect(confirm).toHaveBeenCalledWith('确认删除 02.0209.010.0401001 的正常记录并继续保留占号？');
  });

  it('associates a searched current PDF and refreshes detail and row while surfacing failures', async () => {
    const detail = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const candidate = { id: 81, relativePath: 'old/existing.pdf', fileName: 'existing.pdf', drawingId: null,
      historicalDrawingId: null, historicalFullCode: null, fullCode: null, displayName: null, model: null, brandName: null,
      projectItemName: null, colorName: null, matchStatus: 'unmatched', detectedCodes: [], classificationWarning: null,
      conversionType: 'source', sizeBytes: 1, modifiedAt: '', scannedAt: '', isPresent: true } as const;
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [detail], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn().mockResolvedValue({ items: [candidate], total: 1, page: 1, pageSize: 100 }),
      associateDrawingPdf: vi.fn().mockResolvedValueOnce(detail).mockRejectedValueOnce(new Error('PDF 已在扫描后缺失')) };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(detail.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    fireEvent.change(await screen.findByLabelText('搜索现有 PDF'), { target: { value: 'existing' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith({ keyword: 'existing', presence: 'present', page: 1, pageSize: 100 }));
    fireEvent.change(screen.getByLabelText('现有 PDF 索引'), { target: { value: '81' } });
    fireEvent.click(screen.getByRole('button', { name: '关联为转曲后文件' }));

    expect(api.associateDrawingPdf).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '保存并返回详情' }));
    await waitFor(() => expect(api.associateDrawingPdf).toHaveBeenCalledWith(10, 81, 'outlined'));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    expect(api.getDrawing).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: '关联为源文件' }));
    fireEvent.click(screen.getByRole('button', { name: '保存并返回详情' }));
    expect(await screen.findByText(/1 项失败/)).toBeVisible();
  });

  it('replaces or clears the selected PDF whenever candidate search results change', async () => {
    const detail = { id: 10, fullCode: '02.0209.010.0401001', displayName: 'Drawing', sku: 'SKU', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'reserved', origin: 'planned', hasSourceFile: false, hasOutlinedFile: false,
      dictionaryMappingStatus: 'mapped', readOnly: false, readOnlyMessage: null, sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const candidate = { id: 81, relativePath: 'old.pdf', fileName: 'old.pdf', drawingId: null,
      historicalDrawingId: null, historicalFullCode: null, fullCode: null, displayName: null, model: null, brandName: null,
      projectItemName: null, colorName: null, matchStatus: 'unmatched', detectedCodes: [], classificationWarning: null,
      conversionType: 'source', sizeBytes: 1, modifiedAt: '', scannedAt: '', isPresent: true } as const;
    const replacement = { ...candidate, id: 82, relativePath: 'replacement.pdf', fileName: 'replacement.pdf' };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [detail], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(detail),
      searchPdfFiles: vi.fn()
        .mockResolvedValueOnce({ items: [candidate], total: 1, page: 1, pageSize: 100 })
        .mockResolvedValueOnce({ items: [replacement], total: 1, page: 1, pageSize: 100 })
        .mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 100 }),
      associateDrawingPdf: vi.fn().mockResolvedValue(detail) };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(detail.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    const select = await screen.findByLabelText('现有 PDF 索引');
    await waitFor(() => expect(select).toHaveValue('81'));

    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'replacement' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(select).toHaveValue('82'));
    expect(screen.queryByRole('option', { name: /old\.pdf/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关联为源文件' }));
    expect(api.associateDrawingPdf).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(select).toHaveValue(''));
    expect(screen.getByRole('button', { name: '关联为源文件' })).toBeDisabled();
    expect(api.associateDrawingPdf).not.toHaveBeenCalled();
  });

  it('toggles historical business status while keeping file completeness and permanent occupancy visible', async () => {
    const historical = { id: -4, fullCode: '02.0209.010.0401004', displayName: '02.0209.010.0401004', sku: 'OLD',
      productId: null, model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色',
      mainCategoryName: '印刷件类', projectItemName: 'LOGO', status: 'active', origin: 'historical',
      hasSourceFile: false, hasOutlinedFile: true, dictionaryMappingStatus: 'mapped', readOnly: true,
      readOnlyMessage: '历史图号的编码和文件关联不可修改；停用不释放号码。', sourceFiles: [], outlinedFiles: [], currentBomUsage: [] } as const;
    const inactive = { ...historical, status: 'inactive' as const };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [historical], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValueOnce(historical).mockResolvedValueOnce(inactive),
      deactivateHistoricalDrawing: vi.fn().mockResolvedValue(inactive), activateHistoricalDrawing: vi.fn().mockResolvedValue(historical) };
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByText(historical.fullCode));
    fireEvent.click(await screen.findByRole('button', { name: '管理图号' }));
    fireEvent.click(await screen.findByRole('button', { name: '停用' }));

    await waitFor(() => expect(api.deactivateHistoricalDrawing).toHaveBeenCalledWith(-4));
    expect(confirm).toHaveBeenCalledWith('确认停用该历史图号？停用不释放号码，也不会改变文件完整性。');
    expect(await screen.findByText('历史扫描来源；编码不可直接修改。')).toBeVisible();
    expect(screen.getAllByText('已停用').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText((_, element) => element?.className === 'file-integrity-summary' && /源文件缺失.*转曲后已有/.test(element.textContent ?? ''))).toBeVisible();
    expect(screen.getByText('停用不释放号码')).toBeVisible();
    expect(screen.queryByRole('button', { name: '正式使用' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('搜索现有 PDF')).not.toBeInTheDocument();
  });

  it('passes explicit pagination and resets it when selectable drawing filters or views change', async () => {
    const drawing = { id: 1, fullCode: '02.0209.010.0401001', displayName: '长路径图号', sku: 'SKU-220', productId: 5,
      model: 'ZC220', productCategory: '冰柜', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'active', origin: 'planned', hasSourceFile: true, hasOutlinedFile: true,
      dictionaryMappingStatus: 'mapped' } as const;
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [drawing], total: 128, page: 1, pageSize: 20 }),
      listProducts: vi.fn().mockResolvedValue([{ productCategory: '冰柜' }]),
      listMaterialBatches: vi.fn().mockResolvedValue([{ id: 44, name: '01.20260827', sku: 'SKU-220', model: 'ZC220' }]),
      listDictionaries: vi.fn((type: string) => Promise.resolve(type === 'main_category'
        ? [{ id: 12, code: '04', name: '印刷件类', status: 'active' }]
        : type === 'project_item'
          ? [{ id: 21, code: '01', name: 'LOGO', parentId: 12, status: 'active' }, { id: 22, code: '02', name: '说明书', parentId: 13, status: 'active' }]
          : type === 'appearance' ? [{ id: 31, code: '01', name: '一号外观', status: 'active' }] : [])),
      getDrawing: vi.fn().mockResolvedValue(drawing),
    };

    render(<DrawingLibraryPage api={api as never} />);
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 50 })));
    fireEvent.change(screen.getByRole('combobox', { name: '每页条数' }), { target: { value: '20' } });
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 })));
    fireEvent.click(screen.getByRole('button', { name: '下一页' }));
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize: 20 })));
    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }));
    fireEvent.change(await screen.findByRole('combobox', { name: '产品类别' }), { target: { value: '冰柜' } });
    fireEvent.change(screen.getByLabelText('主类别'), { target: { value: '12' } });
    expect(screen.getByRole('option', { name: 'LOGO' })).toBeVisible();
    expect(screen.queryByRole('option', { name: '说明书' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('项目明细'), { target: { value: '21' } });
    fireEvent.change(screen.getByLabelText('外观'), { target: { value: '31' } });
    fireEvent.change(screen.getByLabelText('资料批次'), { target: { value: '44' } });
    fireEvent.click(screen.getByRole('button', { name: '检索' }));
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({
      productCategory: '冰柜', mainCategoryId: 12, projectItemId: 21, appearanceId: 31, materialBatchId: 44,
      page: 1, pageSize: 20,
    })));
    fireEvent.click(screen.getByRole('button', { name: '全部图号' }));
    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, pageSize: 20 })));
  });
});

it('scopes navigation by actual product/batch usage and keeps scope when searching', async () => {
  const api = { searchDrawings: vi.fn().mockResolvedValue({items:[],total:0}), listDictionaries:vi.fn().mockResolvedValue([]),
    listProducts:vi.fn().mockResolvedValue([{id:5,sku:'SKU',model:'T40',productCategory:'冰柜'}]),
    listMaterialBatches:vi.fn().mockResolvedValue([]), getDrawingNavigation:vi.fn().mockResolvedValue({batches:[{id:7,name:'01.20261017',productId:5,usageProducts:[{productId:5,state:'current',drawingCount:1}]}]}) };
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByText('SKU · T40', {selector:'summary'}));
  fireEvent.click(screen.getByRole('button',{name:/20261017/}));
  await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({productId:5,usageBatchId:7,materialBatchId:''})));
  fireEvent.change(screen.getByLabelText('关键词'),{target:{value:'LOGO'}});
  fireEvent.click(screen.getByRole('button',{name:'检索'}));
  await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({productId:5,usageBatchId:7,keyword:'LOGO'})));
  fireEvent.click(screen.getByRole('button',{name:'待关联 / 未归批次'}));
  await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({associationState:'pending',productId:'',usageBatchId:''})));
  expect(screen.queryByRole('button',{name:'按图号'})).not.toBeInTheDocument();
});

it('stages PDF associations, rejects two roles for one PDF, and cancels without mutation', async () => {
  const row={id:1,fullCode:'CODE',origin:'planned',status:'active',displayName:'D',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:false};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockResolvedValue(row),searchPdfFiles:vi.fn().mockResolvedValue({items:[{id:8,fileName:'test.pdf'}]}),associateDrawingPdf:vi.fn()};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  expect(screen.queryByRole('button',{name:'关联为源文件'})).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button',{name:'管理图号'}));
  await waitFor(() => expect(screen.getByLabelText('现有 PDF 索引')).toHaveValue('8'));
  fireEvent.click(screen.getByRole('button',{name:'关联为源文件'}));
  fireEvent.click(screen.getByRole('button',{name:'关联为转曲后文件'}));
  expect(screen.getByRole('alert')).toHaveTextContent('同一个 PDF');
  fireEvent.click(screen.getByRole('button',{name:'取消编辑'}));
  expect(api.associateDrawingPdf).not.toHaveBeenCalled();
});

it('closes a hidden detail modal and ignores an outstanding detail request', async () => {
  let resolve!: (v:unknown)=>void;
  const row={id:1,fullCode:'CODE',origin:'planned',status:'active'};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockImplementation(()=>new Promise(r=>{resolve=r;}))};
  const {rerender}=render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  rerender(<DrawingLibraryPage api={api as never} active={false}/>);
  await act(async()=>resolve({...row,sourceFiles:[],outlinedFiles:[],currentBomUsage:[]}));
  expect(screen.queryByRole('complementary',{name:'图号详情'})).not.toBeInTheDocument();
  expect(document.querySelector('[inert]')).toBeNull();
});

it('shows selected historical batch files and folds files from other batches', async () => {
  const old={pdfIndexId:1,fileName:'old.pdf',relativePath:'old/old.pdf',isPresent:true,conversionType:'outlined'};
  const current={...old,pdfIndexId:2,fileName:'current.pdf'};
  const row={id:1,productId:5,fullCode:'CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[old,current],currentBomUsage:[],batchUsage:{effectiveCurrentFileIds:[2],occurrences:[{batchId:7,productId:5,productDirectory:'T40',batchName:'旧批次',files:[old]},{batchId:8,productId:5,productDirectory:'T40',batchName:'新批次',files:[current]}]}};
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),listProducts:vi.fn().mockResolvedValue([{id:5,model:'T40',productCategory:'冰柜'}]),listMaterialBatches:vi.fn().mockResolvedValue([]),getDrawingNavigation:vi.fn().mockResolvedValue({batches:[{id:7,productId:5,name:'旧批次',usageProducts:[{productId:5,state:'historical'}]}]}),getDrawing:vi.fn().mockResolvedValue(row)};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByText('待补录 · T40',{selector:'summary'}));
  fireEvent.click(screen.getByRole('button',{name:/旧批次/}));
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  expect(await screen.findByText('old.pdf')).toBeVisible();
  expect(screen.getByText('current.pdf')).not.toBeVisible();
});

it('reports partial association saves and retries failed associations while guarding busy Escape', async () => {
  const row={id:1,fullCode:'CODE',origin:'planned',status:'active',sourceFiles:[],outlinedFiles:[],currentBomUsage:[],readOnly:false};
  let resolve!:()=>void;
  const api={searchDrawings:vi.fn().mockResolvedValue({items:[row],total:1}),listDictionaries:vi.fn().mockResolvedValue([]),getDrawing:vi.fn().mockResolvedValue(row),searchPdfFiles:vi.fn().mockResolvedValue({items:[{id:8,fileName:'source.pdf'},{id:9,fileName:'outlined.pdf'}]}),associateDrawingPdf:vi.fn().mockImplementationOnce(()=>new Promise<void>(r=>{resolve=r;})).mockRejectedValueOnce(new Error('failed')).mockResolvedValue(row)};
  render(<DrawingLibraryPage api={api as never}/>);
  fireEvent.click(await screen.findByRole('button',{name:'CODE'}));
  fireEvent.click(await screen.findByRole('button',{name:'管理图号'}));
  await waitFor(()=>expect(screen.getByLabelText('现有 PDF 索引')).toHaveValue('8'));
  fireEvent.click(screen.getByRole('button',{name:'关联为源文件'}));
  fireEvent.change(screen.getByLabelText('现有 PDF 索引'),{target:{value:'9'}});
  fireEvent.click(screen.getByRole('button',{name:'关联为转曲后文件'}));
  fireEvent.click(screen.getByRole('button',{name:'保存并返回详情'}));
  fireEvent.keyDown(screen.getByRole('complementary',{name:'图号详情'}),{key:'Escape'});
  expect(screen.getByRole('complementary',{name:'图号详情'})).toBeVisible();
  await act(async()=>resolve());
  expect(await screen.findByRole('alert')).toHaveTextContent('已保存 1 项，1 项失败');
  fireEvent.click(screen.getByRole('button',{name:'保存并返回详情'}));
  await waitFor(()=>expect(api.associateDrawingPdf).toHaveBeenCalledTimes(3));
  expect(api.associateDrawingPdf.mock.calls).toEqual([[1,8,'source'],[1,9,'outlined'],[1,9,'outlined']]);
});
