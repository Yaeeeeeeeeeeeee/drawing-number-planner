import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { BomPage } from '../../src/renderer/pages/BomPage';
import { BomAssetPreview } from '../../src/renderer/pages/bom/BomAssetPreview';
import { AppShell } from '../../src/renderer/layout/AppShell';
import { createBomMockApi, isBomMockEnabled } from '../../src/renderer/pages/bom/bom-mock';

afterEach(() => { window.history.replaceState(null, '', '/'); delete window.plannerDesktop; vi.unstubAllEnvs(); });
it('isolates BOM preview from every real API, including initial reads', async () => {
  window.history.replaceState(null, '', '/?mock=bom');
  const access = vi.fn();
  const real = new Proxy({}, { get: (_, key) => { access(key); return vi.fn().mockResolvedValue([]); } });
  render(<BomPage api={real as never} />);
  expect(access).not.toHaveBeenCalled();
  expect(await screen.findByLabelText('第 1 行图号')).toBeInTheDocument();
  expect(screen.getByLabelText('第 1 行图片')).toBeDisabled();
  expect(screen.getByRole('button', { name: '保存当前 BOM' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('第 1 行图片'), { target: { files: [new File(['not real'], 'test.png')] } });
  fireEvent.click(screen.getByRole('button', { name: '查询 BOM' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看 BOM -201' }));
  expect(await screen.findByLabelText('所选 BOM 记录')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '删除 BOM -201' })).toBeDisabled();
  const desktop = vi.fn(); window.plannerDesktop = { showBomAssetInFolder: desktop } as never;
  const locations = screen.getAllByRole('button', { name: '打开附件位置 说明书-图片.png' });
  for (const location of locations) { expect(location).toBeDisabled(); fireEvent.click(location); }
  fireEvent.change(screen.getByLabelText('输入型号确认删除整个 BOM'), { target: { value: 'MOCK-T40' } });
  expect(screen.getByRole('button', { name: '删除整个型号 BOM' })).toBeDisabled();
  expect(screen.getByRole('button', { name: '检查旧附件归档', hidden: true })).toBeDisabled();
  expect(desktop).not.toHaveBeenCalled();
  expect(access).not.toHaveBeenCalled();
});
it.each(['uploadBomAsset', 'previewBomAssetArchive', 'archiveBomAssetLink', 'previewBomVersionDeletion', 'deleteBomVersion', 'deleteProductBom', 'saveBomVersion', 'updateBomVersion', 'futureUnmockedMethod'])('fails closed for %s without a fallback', async (method) => {
  const api = createBomMockApi('normal') as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>;
  await expect(api[method](1, {})).rejects.toThrow('Mock 已隔离');
});
it('defaults off and cannot be enabled in production', () => {
  expect(isBomMockEnabled()).toBe(false);
  window.history.replaceState(null, '', '/?mock=bom');
  vi.stubEnv('DEV', false);
  expect(isBomMockEnabled()).toBe(false);
});
it('isolates navigation and recovery tools at the application entry', async () => {
  window.history.replaceState(null, '', '/?mock=bom');
  const access = vi.fn();
  render(<AppShell api={new Proxy({}, { get: (_, key) => { access(key); return vi.fn(); } }) as never} />);
  await screen.findByLabelText('第 1 行图号');
  expect(screen.getByRole('button', { name: /PDF 文件中心/ })).toBeDisabled();
  expect(screen.queryByRole('button', { name: /安全恢复/ })).not.toBeInTheDocument();
  expect(access).not.toHaveBeenCalled();
});
it('uses the existing conflict feedback without calling the real save API', async () => {
  window.history.replaceState(null, '', '/?mock=bom&bom-scenario=conflict');
  const access = vi.fn();
  render(<BomPage api={new Proxy({}, { get: (_, key) => { access(key); return vi.fn(); } }) as never} />);
  await screen.findByLabelText('第 1 行图号');
  fireEvent.click(screen.getByRole('button', { name: '模拟保存冲突' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('保存冲突');
  expect(screen.getByRole('button', { name: '刷新当前 BOM' })).toBeEnabled();
  expect(access).not.toHaveBeenCalled();
});
it('retains old-record editing and distinguishes historical drawing references', async () => {
  window.history.replaceState(null, '', '/?mock=bom');
  render(<BomPage api={{} as never} />);
  await screen.findByLabelText('第 1 行图号');
  fireEvent.click(screen.getByRole('button', { name: '查询 BOM' }));
  fireEvent.click(await screen.findByRole('button', { name: '查看 BOM -202' }));
  expect(await screen.findByRole('button', { name: '复制图号 02.0209.010.0501002' })).toBeVisible();
  expect(screen.queryByText('历史图号 · 已停用')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '编辑 BOM -202' }));
  expect(await screen.findByLabelText('第 2 行图号')).toHaveValue('historical:-602');
  expect(screen.getByLabelText('第 2 行材质')).toBeEnabled();
  expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled();
});
it('shows field-specific blockers without requiring optional material or batch fields', async () => {
  window.history.replaceState(null, '', '/?mock=bom');
  render(<BomPage api={{} as never} />);
  await screen.findByLabelText('第 1 行图号');
  fireEvent.click(screen.getByRole('button', { name: '添加 BOM 项目' }));
  expect(screen.getByText('暂不能保存')).toBeInTheDocument();
  expect(screen.getAllByText('项目 9 · 图号：请选择')).toHaveLength(2);
  fireEvent.change(screen.getByLabelText('第 9 行主类别'), { target: { value: '-10' } });
  fireEvent.change(screen.getByLabelText('第 9 行项目明细'), { target: { value: '-28' } });
  expect(await screen.findByText('没有符合条件的图号。')).toBeInTheDocument();
});
it.each([
  ['unselected', '请选择产品型号，查看或维护 BOM。'], ['empty', '尚未建立 BOM'], ['error', 'Mock：BOM 加载失败，可切换场景重试。'], ['loading', '正在加载 BOM…'],
])('renders %s safely', async (scenario, text) => {
  window.history.replaceState(null, '', `/?mock=bom&bom-scenario=${scenario}`);
  render(<BomPage api={{} as never} />);
  expect(await screen.findByText(text)).toBeInTheDocument();
});
it('covers both attachment roles, missing roles, inheritance and preview failure', async () => {
  const record = await createBomMockApi('attachments').getCurrentBom(-101);
  expect(record?.items[0].assets.map((asset) => asset.role)).toEqual(['image', 'diagram']);
  expect(record?.items[1].assets.map((asset) => asset.role)).toEqual(['image']);
  expect(record?.items[2].assets.map((asset) => asset.role)).toEqual(['diagram']);
  expect(record?.items[3].assets).toEqual([]);
  expect(record?.items[4].assets[0].inherited).toBe(true);
  window.history.replaceState(null, '', '/?mock=bom');
  render(<BomAssetPreview assetId={-409} name="失败样例" />);
  expect(screen.getByText(/预览失败/)).toBeInTheDocument();
});
it('never requests the real attachment preview endpoint in Mock', () => {
  window.history.replaceState(null, '', '/?mock=bom');
  const { container } = render(<BomAssetPreview assetId={31} name="碰撞 ID" />);
  expect(container.querySelector('img')?.getAttribute('src') ?? '').not.toContain('/api/');
});
