import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DrawingLibraryPage } from '../../src/renderer/pages/DrawingLibraryPage';

describe('DrawingLibraryPage', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '更多筛选' }));
    fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'SKDZC220JP' } });
    fireEvent.change(screen.getByLabelText('产品类别'), { target: { value: '冰柜' } });
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
      status: 'historical', origin: 'historical', hasSourceFile: false, hasOutlinedFile: true,
      dictionaryMappingStatus: 'unmapped' };
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: [historical], total: 1, page: 1, pageSize: 20 }),
      listDictionaries: vi.fn().mockResolvedValue([]), getDrawing: vi.fn().mockResolvedValue(historical) };

    render(<DrawingLibraryPage api={api as never} />);

    expect(await screen.findByText('历史扫描')).toBeVisible();
    expect(screen.getByText(/字典待映射/)).toBeVisible();
    expect(screen.getByText(/源文件缺失.*转曲后已有/)).toBeVisible();
  });
});
