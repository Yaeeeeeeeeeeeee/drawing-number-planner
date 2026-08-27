import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DictionariesPage } from '../../src/renderer/pages/DictionariesPage';

describe('DictionariesPage', () => {
  const mainCategories = [
    { id: 10, type: 'main_category', code: '04', name: '印刷件类', parentId: null, status: 'active' as const },
    { id: 11, type: 'main_category', code: '05', name: '包装类', parentId: null, status: 'inactive' as const },
  ];
  const projects = [
    { id: 20, type: 'project_item', code: '01', name: 'LOGO', parentId: 10, status: 'active' as const },
    { id: 21, type: 'project_item', code: '02', name: '大外箱', parentId: 11, status: 'active' as const },
  ];
  const layers = [{ id: 30, type: 'layer_count', code: '3', name: '三层', parentId: null, status: 'active' as const }];

  const hierarchyApi = () => ({
    listDictionaries: vi.fn((type: string) => {
      if (type === 'main_category') return Promise.resolve(mainCategories);
      if (type === 'project_item') return Promise.resolve(projects);
      if (type === 'layer_count') return Promise.resolve(layers);
      return Promise.resolve([]);
    }),
    createDictionary: vi.fn().mockImplementation((type: string, input: { code: string; name: string; parentId?: number }) => Promise.resolve({
      id: 99, type, code: input.code, name: input.name, parentId: input.parentId ?? null, status: 'active',
    })),
    deactivateDictionary: vi.fn((id: number) => Promise.resolve({ id, type: 'project_item', code: '01', name: '新 LOGO', parentId: 10, status: 'inactive' })),
    updateDictionaryName: vi.fn((id: number, name: string) => Promise.resolve({ ...projects.find((item) => item.id === id)!, name })),
  });

  it('uses only root encoding dimensions as top-level tabs', async () => {
    const api = hierarchyApi();
    render(<DictionariesPage api={api as never} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['品牌', '品类尺寸', '外观', '颜色', '主类别']);
    expect(screen.queryByRole('tab', { name: '项目明细' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '层数' })).toBeNull();
  });

  it('filters project details by selected main category ID', async () => {
    const api = hierarchyApi();
    render(<DictionariesPage api={api as never} />);
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));

    await screen.findByText('印刷件类');
    fireEvent.click(screen.getByRole('button', { name: '查看 印刷件类 的项目明细' }));

    expect(await screen.findByText('LOGO')).toBeVisible();
    expect(screen.queryByText('大外箱')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '查看 包装类 的项目明细' }));
    expect(await screen.findByText('大外箱')).toBeVisible();
    expect(screen.queryByText('LOGO')).toBeNull();
  });

  it('creates a project item under the selected main category', async () => {
    const api = hierarchyApi();
    render(<DictionariesPage api={api as never} />);
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));
    await screen.findByText('印刷件类');
    fireEvent.click(screen.getByRole('button', { name: '查看 印刷件类 的项目明细' }));

    fireEvent.change(screen.getByLabelText('项目明细编码'), { target: { value: '09' } });
    fireEvent.change(screen.getByLabelText('项目明细名称'), { target: { value: '售后卡' } });
    fireEvent.click(screen.getByRole('button', { name: '新增项目明细' }));

    expect(api.createDictionary).toHaveBeenCalledWith('project_item', { code: '09', name: '售后卡', parentId: 10 });
  });

  it('keeps layer count accessible as an auxiliary main-category dictionary', async () => {
    const api = hierarchyApi();
    render(<DictionariesPage api={api as never} />);
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));

    expect(await screen.findByRole('heading', { name: '层数' })).toBeVisible();
    expect(screen.getByText('三层')).toBeVisible();
    fireEvent.change(screen.getByLabelText('层数编码'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('层数名称'), { target: { value: '五层' } });
    fireEvent.click(screen.getByRole('button', { name: '新增层数' }));

    expect(api.createDictionary).toHaveBeenCalledWith('layer_count', { code: '5', name: '五层' });
  });

  it('renames and deactivates project items inside their selected main category', async () => {
    const api = hierarchyApi();
    render(<DictionariesPage api={api as never} />);
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));
    await screen.findByText('印刷件类');
    fireEvent.click(screen.getByRole('button', { name: '查看 印刷件类 的项目明细' }));

    fireEvent.click(await screen.findByRole('button', { name: '修改 LOGO' }));
    fireEvent.change(screen.getByLabelText('修改名称'), { target: { value: '新 LOGO' } });
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }));
    expect(await screen.findByText('新 LOGO')).toBeVisible();
    expect(api.updateDictionaryName).toHaveBeenCalledWith(20, '新 LOGO');

    fireEvent.click(screen.getByRole('button', { name: '停用 新 LOGO' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: '停用 新 LOGO' })).toBeNull());
    expect(api.deactivateDictionary).toHaveBeenCalledWith(20);
  });

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
