import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DrawingLibraryPage } from '../../src/renderer/pages/DrawingLibraryPage';

describe('DrawingLibraryPage', () => {
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
    expect(screen.getByText('当前使用 · 出现于 7 个资料批次')).toBeVisible();
    fireEvent.click(screen.getByText(row.fullCode));
    expect(await screen.findByText('06.20260309 · 当前')).toBeVisible();
    expect(screen.getByText('00.20250101')).toBeVisible();
  });

  it('browses logical batch materials without hiding physical file instances', async () => {
    const batches = [
      { id: 6, productDirectory: '01.洗碗机\\SKU-T40', sku: 'SKU', model: 'T40', name: '06.20260309',
        sequenceNumber: 6, recognitionStatus: 'recognized', currentState: 'current', fileCount: 2, isPresent: true },
      { id: 7, productDirectory: '01.洗碗机\\SKU-T40', sku: 'SKU', model: 'T40', name: '预案',
        sequenceNumber: null, recognitionStatus: 'pending', currentState: 'indeterminate', fileCount: 1, isPresent: true },
    ];
    const materials = [{ fullCode: '02.0209.010.0501001',
      outlinedFiles: [
        { pdfIndexId: 33, fileName: 'outlined-old.pdf', relativePath: 'batch/outlined-old.pdf', isPresent: false, conversionType: 'outlined' },
        { pdfIndexId: 32, fileName: 'outlined.pdf', relativePath: 'batch/outlined.pdf', isPresent: true, conversionType: 'outlined' },
      ],
      sourceFiles: [
        { pdfIndexId: 31, fileName: 'source.pdf', relativePath: 'product/source.pdf', isPresent: true, conversionType: 'source' },
        { pdfIndexId: 34, fileName: 'source-old.pdf', relativePath: 'product/source-old.pdf', isPresent: false, conversionType: 'source' },
      ],
    }];
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      listMaterialBatches: vi.fn().mockResolvedValue(batches),
      getMaterialBatchMaterials: vi.fn().mockResolvedValue(materials),
    };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '按资料批次' }));
    fireEvent.change(screen.getByLabelText('搜索型号或批次'), { target: { value: 'T40' } });
    fireEvent.click(screen.getByRole('button', { name: '查询资料批次' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看批次 06.20260309' }));

    expect(api.listMaterialBatches).toHaveBeenLastCalledWith({ search: 'T40' });
    expect(await screen.findByText('outlined.pdf')).toBeVisible();
    expect(screen.getByText('当前使用')).toBeVisible();
    expect(screen.getByText('待确认')).toBeVisible();
    expect(screen.queryByText('batch/outlined.pdf')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('outlined.pdf'));
    expect(await screen.findByText('batch/outlined.pdf')).toBeVisible();
    expect(screen.getByText('batch/outlined-old.pdf')).toBeVisible();
    expect(screen.getByText('product/source.pdf')).toBeVisible();
    expect(screen.getByText('product/source-old.pdf')).toBeVisible();
    expect(screen.getAllByText('已缺失')).toHaveLength(2);
  });

  it('shows an unrecognized outlined file as a pending standalone batch row', async () => {
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      listMaterialBatches: vi.fn().mockResolvedValue([{ id: 6, productDirectory: '01.洗碗机\\SKU-T40', sku: 'SKU', model: 'T40', name: '06.20260309', sequenceNumber: 6, recognitionStatus: 'recognized', currentState: 'current', fileCount: 1, isPresent: true }]),
      getMaterialBatchMaterials: vi.fn().mockResolvedValue([{ fullCode: null, outlinedFiles: [{ pdfIndexId: 32, fileName: 'unrecognized.pdf', relativePath: 'batch/unrecognized.pdf', isPresent: true, conversionType: 'outlined', matchStatus: 'pending' }], sourceFiles: [] }]),
    };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '按资料批次' }));
    fireEvent.click(screen.getByRole('button', { name: '查询资料批次' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看批次 06.20260309' }));

    expect(await screen.findByRole('button', { name: 'unrecognized.pdf' })).toBeVisible();
    expect(screen.getByText(/未可靠识别 · 待确认/)).toBeVisible();
  });

  it('explains that opening a file location needs the Windows desktop app in browser preview', async () => {
    delete window.plannerDesktop;
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      listMaterialBatches: vi.fn().mockResolvedValue([{ id: 6, productDirectory: '01.洗碗机\\SKU-T40', sku: 'SKU', model: 'T40', name: '06.20260309', sequenceNumber: 6, recognitionStatus: 'recognized', currentState: 'current', fileCount: 1, isPresent: true }]),
      getMaterialBatchMaterials: vi.fn().mockResolvedValue([{ fullCode: '02.0209.010.0501001', outlinedFiles: [{ pdfIndexId: 32, fileName: 'outlined.pdf', relativePath: 'batch/outlined.pdf', isPresent: true, conversionType: 'outlined' }], sourceFiles: [] }]),
    };

    render(<DrawingLibraryPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '按资料批次' }));
    fireEvent.click(screen.getByRole('button', { name: '查询资料批次' }));
    fireEvent.click(await screen.findByRole('button', { name: '查看批次 06.20260309' }));

    expect(await screen.findByText('浏览器预览不支持打开文件位置，请在 Windows 桌面版操作。')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '打开转曲后文件 outlined.pdf 的位置' }));
    expect(await screen.findByText('请在 Windows 桌面版打开文件位置')).toBeVisible();
    expect(screen.queryByText('Failed to fetch')).not.toBeInTheDocument();
  });

  it('shows material-batch request failures in the batch view', async () => {
    const api = {
      searchDrawings: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]),
      listMaterialBatches: vi.fn().mockRejectedValue(new Error('批次服务不可用')),
    };
    render(<DrawingLibraryPage api={api as never} />);

    fireEvent.click(await screen.findByRole('button', { name: '按资料批次' }));
    fireEvent.click(screen.getByRole('button', { name: '查询资料批次' }));

    expect(await screen.findByText('批次服务不可用')).toBeVisible();
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
      listDictionaries: vi.fn().mockResolvedValue([]),
      searchDrawings: vi.fn().mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
        .mockResolvedValueOnce({ items: [drawing], total: 1, page: 1, pageSize: 20 }),
      getDrawing: vi.fn().mockResolvedValue(drawing),
    };
    render(<DrawingLibraryPage api={api as never} />);
    await screen.findByText('图号库尚无记录');

    fireEvent.change(screen.getByLabelText('完整图号'), { target: { value: '02.0209' } });
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: 'ZC220' } });
    fireEvent.change(screen.getByLabelText('关键词'), { target: { value: 'LOGO' } });
    fireEvent.change(screen.getByLabelText('状态'), { target: { value: 'active' } });
    fireEvent.click(screen.getByLabelText('精确图号'));
    fireEvent.change(screen.getByLabelText('产品类别'), { target: { value: '冰柜' } });
    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }));
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
    expect(screen.getByText('正式规划')).toBeVisible();
    expect(screen.getByText(/源文件已有.*转曲后缺失/)).toBeVisible();
    expect(await screen.findByRole('complementary', { name: '图号详情' })).toHaveTextContent('SAMKYO-ZC220白色-LOGO');
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

    expect(await screen.findByText('历史扫描')).toBeVisible();
    expect(screen.getByText(/字典待映射/)).toBeVisible();
    expect(screen.getByText(/源文件缺失.*转曲后已有/)).toBeVisible();
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
    expect(panel).toHaveTextContent('业务状态已占号');
    expect(panel).toHaveTextContent('源文件已有');
    expect(panel).toHaveTextContent('转曲后文件缺失');
    expect(panel).toHaveTextContent('SKU/source.pdf');
    expect(panel).toHaveTextContent('当前 BOM 使用');
    expect(panel).toHaveTextContent('ZC220 · 白色 · BOM v2');
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
    fireEvent.click(await screen.findByRole('button', { name: '正式使用' }));

    await waitFor(() => expect(api.activateDrawing).toHaveBeenCalledWith(10));
    expect(confirm).toHaveBeenCalledWith('确认将该图号变更为正式使用？此操作会记录业务状态。');
    expect(api.getDrawing).toHaveBeenCalledTimes(2);
    expect(screen.getAllByText('正式使用').length).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByRole('button', { name: '作废' }));
    await waitFor(() => expect(api.voidDrawing).toHaveBeenCalledWith(10));
    expect(confirm).toHaveBeenLastCalledWith('确认作废该图号？作废后普通界面无法恢复，但图号仍永久占用。');
    expect(api.getDrawing).toHaveBeenCalledTimes(3);
    expect(screen.getAllByText('作废').length).toBeGreaterThanOrEqual(2);
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
    fireEvent.change(await screen.findByLabelText('搜索现有 PDF'), { target: { value: 'existing' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(api.searchPdfFiles).toHaveBeenLastCalledWith({ keyword: 'existing', presence: 'present', page: 1, pageSize: 100 }));
    fireEvent.change(screen.getByLabelText('现有 PDF 索引'), { target: { value: '81' } });
    fireEvent.click(screen.getByRole('button', { name: '关联为转曲后文件' }));

    await waitFor(() => expect(api.associateDrawingPdf).toHaveBeenCalledWith(10, 81, 'outlined'));
    expect(api.getDrawing).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole('button', { name: '关联为源文件' }));
    expect(await screen.findByText('PDF 已在扫描后缺失')).toBeVisible();
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
    const select = await screen.findByLabelText('现有 PDF 索引');
    await waitFor(() => expect(select).toHaveValue('81'));

    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'replacement' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(select).toHaveValue('82'));
    expect(screen.queryByRole('option', { name: /old\.pdf/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '关联为源文件' }));
    await waitFor(() => expect(api.associateDrawingPdf).toHaveBeenCalledWith(10, 82, 'source'));

    fireEvent.change(screen.getByLabelText('搜索现有 PDF'), { target: { value: 'none' } });
    fireEvent.click(screen.getByRole('button', { name: '搜索 PDF' }));
    await waitFor(() => expect(select).toHaveValue(''));
    expect(screen.getByRole('button', { name: '关联为源文件' })).toBeDisabled();
    expect(api.associateDrawingPdf).toHaveBeenCalledTimes(1);
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
    fireEvent.click(await screen.findByRole('button', { name: '停用' }));

    await waitFor(() => expect(api.deactivateHistoricalDrawing).toHaveBeenCalledWith(-4));
    expect(confirm).toHaveBeenCalledWith('确认停用该历史图号？停用不释放号码，也不会改变文件完整性。');
    expect(await screen.findByText('历史图号的编码和文件关联不可修改；停用不释放号码。')).toBeVisible();
    expect(screen.getAllByText('已停用').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/源文件缺失.*转曲后已有/)).toBeVisible();
    expect(screen.getByText('停用不释放号码')).toBeVisible();
    expect(screen.queryByRole('button', { name: '正式使用' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('搜索现有 PDF')).not.toBeInTheDocument();
  });
});
