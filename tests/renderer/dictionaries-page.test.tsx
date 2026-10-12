import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DictionariesPage } from '../../src/renderer/pages/DictionariesPage';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => { resolve = resolvePromise; reject = rejectPromise; });
  return { promise, resolve, reject };
}

describe('DictionariesPage', () => {
  it('reveals archived dictionary identities with a restore action', async () => {
    const archived = { id: 1, type: 'brand', code: '02', name: '历史品牌', status: 'inactive', deletedAt: '2026-09-30' };
    const api = { listDictionaries: vi.fn((_type, _inactive, deleted) => Promise.resolve(deleted ? [archived] : [])) };
    render(<DictionariesPage api={api as never} />);
    await screen.findByText('当前字典暂无数据');
    fireEvent.click(screen.getByLabelText('显示已删除字典记录'));
    expect(await screen.findByText('已删除 · 历史保留')).toBeVisible();
    expect(screen.getByRole('button', {name:'恢复 历史品牌'})).toBeVisible();
    expect(screen.queryByRole('button', {name:'删除 历史品牌'})).not.toBeInTheDocument();
  });
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
    deleteDictionary: vi.fn().mockResolvedValue(undefined),
  });

  it('uses only root encoding dimensions as top-level tabs', async () => {
    const api = hierarchyApi();
    render(<DictionariesPage api={api as never} />);

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['品牌', '品类尺寸', '外观', '颜色', '主类别']);
    expect(screen.queryByRole('tab', { name: '项目明细' })).toBeNull();
    expect(screen.queryByRole('tab', { name: '层数' })).toBeNull();
  });

  it('clears prior rows while the current tab is loading and ignores an older successful response', async () => {
    const initialBrand = deferred<never[]>(); const mainLoad = deferred<typeof mainCategories>();
    const projectLoad = deferred<typeof projects>(); const layerLoad = deferred<typeof layers>();
    const api = {
      listDictionaries: vi.fn((type: string) => {
        if (type === 'brand') return initialBrand.promise;
        if (type === 'main_category') return mainLoad.promise;
        if (type === 'project_item') return projectLoad.promise;
        return layerLoad.promise;
      }), createDictionary: vi.fn(), deactivateDictionary: vi.fn(), updateDictionaryName: vi.fn(),
    };
    render(<DictionariesPage api={api as never} />);
    await waitFor(() => expect(api.listDictionaries).toHaveBeenCalledWith('brand', true, false));
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));

    expect(screen.getByRole('status')).toHaveTextContent('正在加载');
    await act(async () => { mainLoad.resolve(mainCategories); projectLoad.resolve(projects); layerLoad.resolve(layers); });
    expect(await screen.findByText('印刷件类')).toBeVisible();
    await act(async () => { initialBrand.resolve([{ id: 3, type: 'brand', code: '02', name: '过期品牌', parentId: null, status: 'active' }] as never[]); });
    await waitFor(() => expect(screen.queryByText('过期品牌')).toBeNull());
    expect(screen.getByText('印刷件类')).toBeVisible();
  });

  it('shows a current loading failure without retaining stale actionable rows', async () => {
    const mainFailure = deferred<never[]>(); const projectsPending = deferred<never[]>(); const layersPending = deferred<never[]>();
    const brand = { id: 3, type: 'brand', code: '02', name: 'SAMKYO', parentId: null, status: 'active' as const };
    const api = {
      listDictionaries: vi.fn((type: string) => {
        if (type === 'brand') return Promise.resolve([brand]);
        if (type === 'main_category') return mainFailure.promise;
        if (type === 'project_item') return projectsPending.promise;
        return layersPending.promise;
      }), createDictionary: vi.fn(), deactivateDictionary: vi.fn(), updateDictionaryName: vi.fn(),
    };
    render(<DictionariesPage api={api as never} />);
    await screen.findByText('SAMKYO');
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));
    expect(screen.queryByRole('button', { name: '停用 SAMKYO' })).toBeNull();
    await act(async () => { mainFailure.reject(new Error('主类别加载失败')); });
    expect(await screen.findByText('主类别加载失败')).toBeVisible();
    expect(screen.queryByText('SAMKYO')).toBeNull();
  });

  it('ignores a superseded loading failure after the current category data is ready', async () => {
    const oldBrandFailure = deferred<never[]>();
    const api = {
      listDictionaries: vi.fn((type: string) => {
        if (type === 'brand') return oldBrandFailure.promise;
        if (type === 'main_category') return Promise.resolve(mainCategories);
        if (type === 'project_item') return Promise.resolve(projects);
        return Promise.resolve(layers);
      }), createDictionary: vi.fn(), deactivateDictionary: vi.fn(), updateDictionaryName: vi.fn(),
    };
    render(<DictionariesPage api={api as never} />);
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));
    expect(await screen.findByText('印刷件类')).toBeVisible();
    await act(async () => { oldBrandFailure.reject(new Error('过期请求失败')); });
    await waitFor(() => expect(screen.queryByText('过期请求失败')).toBeNull());
    expect(screen.getByText('印刷件类')).toBeVisible();
  });

  it('does not append a completed create mutation into a different dictionary tab', async () => {
    const createdBrand = deferred<{ id: number; type: string; code: string; name: string; parentId: null; status: 'active' }>();
    const api = hierarchyApi();
    api.createDictionary.mockReturnValue(createdBrand.promise as never);
    render(<DictionariesPage api={api as never} />);
    await waitFor(() => expect(api.listDictionaries).toHaveBeenCalledWith('brand', true, false));

    fireEvent.click(await screen.findByRole('button', { name: '新增' }));
    expect(screen.queryByLabelText('项目明细编码')).toBeNull();
    fireEvent.change(screen.getByLabelText('编码'), { target: { value: '02' } });
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '延迟品牌' } });
    fireEvent.click(screen.getByRole('button', { name: '新增编码' }));
    fireEvent.click(screen.getByRole('tab', { name: '颜色' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: '颜色' })).toHaveAttribute('aria-selected', 'true'));

    await act(async () => createdBrand.resolve({ id: 88, type: 'brand', code: '02', name: '延迟品牌', parentId: null, status: 'active' }));
    await waitFor(() => expect(screen.queryByText('延迟品牌')).toBeNull());
    expect(screen.getByText('当前字典暂无数据')).toBeVisible();
  });

  it('does not retain a selected main category across an incompatible tab transition', async () => {
    const laterBrand = deferred<never[]>(); let brandCalls = 0;
    const api = hierarchyApi();
    api.listDictionaries.mockImplementation((type: string) => {
      if (type === 'brand') return ++brandCalls === 1 ? Promise.resolve([]) : laterBrand.promise;
      if (type === 'main_category') return Promise.resolve(mainCategories);
      if (type === 'project_item') return Promise.resolve(projects);
      if (type === 'layer_count') return Promise.resolve(layers);
      return Promise.resolve([]);
    });
    render(<DictionariesPage api={api as never} />);
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));
    await screen.findByText('印刷件类');
    fireEvent.click(screen.getByRole('button', { name: '查看 印刷件类 的项目明细' }));
    expect(screen.getByRole('heading', { name: '项目明细 · 印刷件类' })).toBeVisible();
    fireEvent.click(screen.getByRole('tab', { name: '品牌' }));
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: '项目明细 · 印刷件类' })).toBeNull());
    expect(screen.getByText('请在主类别列表中选择一项，查看并维护对应项目明细。')).toBeVisible();
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

    fireEvent.click(screen.getByRole('button', { name: '新增项目明细' }));
    fireEvent.change(screen.getByLabelText('项目明细编码'), { target: { value: '09' } });
    fireEvent.change(screen.getByLabelText('项目明细名称'), { target: { value: '售后卡' } });
    fireEvent.click(screen.getByRole('button', { name: '保存项目明细' }));

    expect(api.createDictionary).toHaveBeenCalledWith('project_item', { code: '09', name: '售后卡', parentId: 10 });
  });

  it('does not load or show the layer-count management entry in the dictionaries page', async () => {
    const api = hierarchyApi();
    render(<DictionariesPage api={api as never} />);
    fireEvent.click(screen.getByRole('tab', { name: '主类别' }));

    await screen.findByText('印刷件类');
    expect(screen.queryByRole('tab', { name: '层数' })).toBeNull();
    expect(api.listDictionaries).not.toHaveBeenCalledWith('layer_count', true);
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
    expect(screen.getByText('编码锁定：02')).toBeVisible();
    fireEvent.change(screen.getByLabelText('修改名称'), { target: { value: 'SAMKYO 新名称' } });
    fireEvent.click(screen.getByRole('button', { name: '保存名称' }));

    expect(await screen.findByText('SAMKYO 新名称')).toBeVisible();
    expect(api.updateDictionaryName).toHaveBeenCalledWith(3, 'SAMKYO 新名称');
  });

  it('reactivates an inactive item in the selected row', async () => {
    const item = { id: 3, type: 'brand', code: '02', name: 'SAMKYO', parentId: null, status: 'inactive' as const };
    const api = {
      listDictionaries: vi.fn().mockResolvedValue([item]), createDictionary: vi.fn(), deactivateDictionary: vi.fn(),
      activateDictionary: vi.fn().mockResolvedValue({ ...item, status: 'active' }), updateDictionaryName: vi.fn(),
    };
    render(<DictionariesPage api={api as never} />);
    await screen.findByText('SAMKYO');

    fireEvent.click(screen.getByRole('button', { name: '启用 SAMKYO' }));

    await waitFor(() => expect(screen.queryByRole('button', { name: '启用 SAMKYO' })).toBeNull());
    expect(api.activateDictionary).toHaveBeenCalledWith(3);
  });

  it('confirms an unused deletion beside the selected row and removes it only after success', async () => {
    const item = { id: 3, type: 'brand', code: '09', name: '临时品牌', parentId: null, status: 'active' as const };
    const deleting = deferred<void>();
    const api = {
      listDictionaries: vi.fn().mockResolvedValue([item]), createDictionary: vi.fn(), deactivateDictionary: vi.fn(),
      updateDictionaryName: vi.fn(), deleteDictionary: vi.fn().mockReturnValue(deleting.promise),
    };
    render(<DictionariesPage api={api as never} />);
    await screen.findByText('临时品牌');

    fireEvent.click(screen.getByRole('button', { name: '删除 临时品牌' }));
    expect(screen.getByText(/09 临时品牌/).closest('.expanded-table-row')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    expect(screen.getByText('临时品牌')).toBeVisible();
    await act(async () => deleting.resolve());
    await waitFor(() => expect(screen.queryByText('临时品牌')).toBeNull());
    expect(api.deleteDictionary).toHaveBeenCalledWith(3);
  });
});
