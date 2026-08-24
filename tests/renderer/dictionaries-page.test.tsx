import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DictionariesPage } from '../../src/renderer/pages/DictionariesPage';

describe('DictionariesPage', () => {
  it('deactivates a dictionary item through the API', async () => {
    const item = { id: 3, type: 'brand', code: '02', name: 'SAMKYO', parentId: null, status: 'active' };
    const api = {
      listDictionaries: vi.fn().mockResolvedValue([item]),
      deactivateDictionary: vi.fn().mockResolvedValue({ ...item, status: 'inactive' }),
      createDictionary: vi.fn(),
    };
    render(<DictionariesPage api={api as never} />);

    await screen.findByText('SAMKYO');
    fireEvent.click(screen.getByRole('button', { name: '停用 SAMKYO' }));
    expect(await screen.findByText('已停用')).toBeVisible();
    expect(api.deactivateDictionary).toHaveBeenCalledWith(3);
  });
});
