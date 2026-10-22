import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { DrawingLibraryPage } from '../../src/renderer/pages/DrawingLibraryPage';

beforeEach(() => vi.stubGlobal('innerWidth', 1920));
afterEach(() => vi.unstubAllGlobals());

describe('drawing library origin column', () => {
  it.each(['default', 'product', 'recycle'] as const)('separates actual origin from full code in the %s list', async (scope) => {
    const rows = [
      { id: 1, fullCode: '02.0209.010.0501001', origin: 'planned', status: 'reserved' },
      { id: -2, fullCode: '02.0209.010.0501002', origin: 'historical', status: 'active' },
    ].map(row => ({ ...row, productId: 5, mainCategoryName: '包装', projectItemName: '说明书',
      dictionaryMappingStatus: 'mapped', hasSourceFile: true, hasOutlinedFile: false,
      deletedAt: scope === 'recycle' ? '2026-10-19' : null, deletionMode: scope === 'recycle' ? 'retain_occupied' : null }));
    const api = {listAppearanceVersions:vi.fn().mockResolvedValue({items:[{id:71,productId:5,label:'一代',status:'current'}]}), searchDrawings: vi.fn().mockResolvedValue({ items: rows, total: rows.length }),
      listDictionaries: vi.fn().mockResolvedValue([]), listMaterialBatches: vi.fn().mockResolvedValue([]),
      listProducts: vi.fn().mockResolvedValue([{ id: 5, sku: 'SKU', model: 'T40', productCategory: '冰柜' }]),
      getDrawingNavigation: vi.fn().mockResolvedValue({ batches: [{ id: 7, productId: 5, name: '01.20261019',
        usageProducts: [{ productId: 5, state: 'current', drawingCount: 2 }] }] }) };
    render(<DrawingLibraryPage api={api as never} />);
    await screen.findByRole('button', { name: rows[0].fullCode });
    if (scope === 'product') {
      fireEvent.click(await screen.findByRole('button', { name: '产品 T40' }));
      await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ productId: 5, appearanceVersionId: '' })));
    } else if (scope === 'recycle') {
      fireEvent.click(screen.getByRole('button', { name: '回收站' }));
      await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ deletionState: 'deleted' })));
    }
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map(header => header.textContent);
    expect(headers).toEqual(['选择', '完整图号', '主类别 / 项目', '来源', '关联产品', '版本', '图号状态', '操作']);
    for (const [index, record] of rows.entries()) {
      const cells = within(within(table).getAllByRole('row')[index + 1]).getAllByRole('cell');
      expect(cells).toHaveLength(headers.length);
      expect(cells[1]).toHaveTextContent(record.fullCode);
      expect(cells[1]).not.toHaveTextContent(/历史扫描|正式规划/);
      expect(within(cells[1]).getByRole('button', { name: '复制完整图号' })).toBeVisible();
      expect(cells[3]).toHaveTextContent(record.origin === 'planned' ? '正式规划' : '历史扫描');
    }
  });
});

it('shows an available recorded version without making up a default version', async () => {
  const rows = [{id:1,fullCode:'02.0209.010.0501002',origin:'planned',status:'active',appearanceVersionLabel:'旧外观',version:'R2'}, {id:2,fullCode:'UNVERSIONED',origin:'historical',status:'active'}];
  render(<DrawingLibraryPage api={{searchDrawings:vi.fn().mockResolvedValue({items:rows,total:2}),listDictionaries:vi.fn().mockResolvedValue([])} as never} />);
  const table=await screen.findByRole('table');
  expect(within(within(table).getAllByRole('row')[1]).getAllByRole('cell')[5]).toHaveTextContent('R2');
  expect(within(within(table).getAllByRole('row')[2]).getAllByRole('cell')[5]).toHaveTextContent('未记录');
});
