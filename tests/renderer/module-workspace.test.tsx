import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ModuleWorkspace } from '../../src/renderer/components/ModuleWorkspace';

afterEach(() => vi.unstubAllGlobals());
it('supports keyboard panel sizing and reset without changing the detail input', () => {
  vi.stubGlobal('innerWidth', 1920);
  render(<ModuleWorkspace resizable fileOverlay navigation={<button>产品A</button>} detail={<input aria-label="详情输入" defaultValue="保留输入" />} detailLabel="文件详情" detailIdentity={1} onCloseDetail={() => {}}><p>列表</p></ModuleWorkspace>);
  const handle = screen.getByRole('separator', { name: '调整产品导航宽度' });
  const before = Number(handle.getAttribute('aria-valuenow'));
  fireEvent.keyDown(handle, { key: 'ArrowRight' });
  expect(Number(handle.getAttribute('aria-valuenow'))).toBeGreaterThan(before);
  expect(screen.getByLabelText('详情输入')).toHaveValue('保留输入');
  fireEvent.click(screen.getByRole('button', { name: '恢复默认宽度' }));
  expect(Number(handle.getAttribute('aria-valuenow'))).toBe(before);
  act(() => { vi.stubGlobal('innerWidth', 720); window.dispatchEvent(new Event('resize')); });
  expect(screen.getByRole('dialog', { name: '文件详情窗口' })).toBeVisible();
  expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  expect(screen.getByLabelText('详情输入')).toHaveValue('保留输入');
});
