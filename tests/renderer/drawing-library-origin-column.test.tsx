import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawingLibraryPage } from '../../src/renderer/pages/DrawingLibraryPage';

describe('drawing library origin column', () => {
  it.each(['default', 'batch', 'recycle'] as const)('separates actual origin from full code in the %s list', async (scope) => {
    const rows = [
      { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'reserved' },
      { id: -2, fullCode: '02.0209.010.0501002', origin: 'historical', status: 'active' },
    ].map(row => ({ ...row, productId: 5, mainCategoryName: '包装', projectItemName: '说明书',
      dictionaryMappingStatus: 'mapped', hasSourceFile: true, hasOutlinedFile: false,
      deletedAt: scope === 'recycle' ? '2026-10-19' : null, deletionMode: scope === 'recycle' ? 'retain_occupied' : null }));
    const api = { searchDrawings: vi.fn().mockResolvedValue({ items: rows, total: rows.length }),
      listDictionaries: vi.fn().mockResolvedValue([]), listMaterialBatches: vi.fn().mockResolvedValue([]),
      listProducts: vi.fn().mockResolvedValue([{ id: 5, sku: 'SKU', model: 'T40', productCategory: '冰柜' }]),
      getDrawingNavigation: vi.fn().mockResolvedValue({ batches: [{ id: 7, productId: 5, name: '01.20261019',
        usageProducts: [{ productId: 5, state: 'current', drawingCount: 2 }] }] }) };
    render(<DrawingLibraryPage api={api as never} />);
    await screen.findByRole('button', { name: rows[0].fullCode });
    if (scope === 'batch') {
      fireEvent.click(await screen.findByText('SKU · T40', { selector: 'summary' }));
      fireEvent.click(screen.getByRole('button', { name: /20261019/ }));
      await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ productId: 5, usageBatchId: 7 })));
    } else if (scope === 'recycle') {
      fireEvent.click(screen.getByRole('button', { name: '回收站' }));
      await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ deletionState: 'deleted-retained' })));
    }
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map(header => header.textContent);
    expect(headers).toEqual(['选择', '完整图号', '来源', '主类别 / 项目', '版本', '图号状态', '文件完整性', '操作']);
    for (const [index, record] of rows.entries()) {
      const cells = within(within(table).getAllByRole('row')[index + 1]).getAllByRole('cell');
      expect(cells).toHaveLength(headers.length);
      expect(cells[1]).toHaveTextContent(record.fullCode);
      expect(cells[1]).not.toHaveTextContent(/历史扫描|正式规划/);
      expect(within(cells[1]).getByRole('button', { name: '复制完整图号' })).toBeVisible();
      expect(cells[2]).toHaveTextContent(record.origin === 'planned' ? '正式规划' : '历史扫描');
    }
  });
});
