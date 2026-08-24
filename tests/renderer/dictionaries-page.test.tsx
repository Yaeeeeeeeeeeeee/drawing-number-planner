import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DictionariesPage } from '../../src/renderer/pages/DictionariesPage';

describe('DictionariesPage', () => {
  it('deactivates a dictionary item through the API', async () => {
    const item = { id: 3, type: 'brand', code: '02', name: 'SAMKYO', parentId: null, status: 'active' };
    const api = {
      listDictionaries: vi.fn().mockResolvedValue([item]),
      deactivateDictionary: vi.fn().mockResolvedValue({ ...item, status: 'inactive' }),
      updateDictionaryName: vi.fn(),
      createDictionary: vi.fn(),
    };
    render(<DictionariesPage api={api as never} />);

    await screen.findByText('SAMKYO');
    fireEvent.click(screen.getByRole('button', { name: '停用 SAMKYO' }));
    expect(await screen.findByText('已停用')).toBeVisible();
    expect(api.deactivateDictionary).toHaveBeenCalledWith(3);
  });

  it('renames an unreferenced dictionary item through the API', async () => {
    const item = { id: 3, type: 'brand', code: '02', name: 'SAMKYO', parentId: null, status: 'active' };
    const api = {
      listDictionaries: vi.fn().mockResolvedValue([item]), createDictionary: vi.fn(), deactivateDictionary: vi.fn(),
      updateDictionaryName: vi.fn().mockResolvedValue({ ...item, name: 'SAMKYO 新名称' }),
    };
    render(<DictionariesPage api={api as never} />);
    await screen.findByText('SAMKYO');

    fireEvent.click(screen.getByRole('button', { name: '修改 SAMKYO' }));
    fireEvent.change(screen.getByLabelText('修改名称'), { target: { value: 'SAMKYO 新名称' } });
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }));

    expect(await screen.findByText('SAMKYO 新名称')).toBeVisible();
    expect(api.updateDictionaryName).toHaveBeenCalledWith(3, 'SAMKYO 新名称');
  });
});
