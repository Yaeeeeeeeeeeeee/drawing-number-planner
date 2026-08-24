import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DrawingLibraryPage } from '../../src/renderer/pages/DrawingLibraryPage';

describe('DrawingLibraryPage', () => {
  it('runs real filters and opens the selected drawing detail', async () => {
    const drawing = { id: 1, fullCode: '02.0209.10.0401001', displayName: 'SAMKYO-ZC220白色-LOGO',
      model: 'ZC220', brandName: 'SAMKYO', colorName: '白色', mainCategoryName: '印刷件类',
      projectItemName: 'LOGO', status: 'active' };
    const api = {
      searchDrawings: vi.fn().mockResolvedValueOnce({ items: [], total: 0, page: 1, pageSize: 20 })
        .mockResolvedValueOnce({ items: [drawing], total: 1, page: 1, pageSize: 20 }),
      getDrawing: vi.fn().mockResolvedValue(drawing),
    };
    render(<DrawingLibraryPage api={api as never} />);
    await screen.findByText('图号库尚无记录');

    fireEvent.change(screen.getByLabelText('图号或关键词'), { target: { value: 'ZC220' } });
    fireEvent.click(screen.getByRole('button', { name: '检索' }));
    const code = await screen.findByText('02.0209.10.0401001');
    fireEvent.click(code);

    await waitFor(() => expect(api.searchDrawings).toHaveBeenLastCalledWith(expect.objectContaining({ keyword: 'ZC220' })));
    expect(await screen.findByRole('complementary', { name: '图号详情' })).toHaveTextContent('SAMKYO-ZC220白色-LOGO');
  });
});
