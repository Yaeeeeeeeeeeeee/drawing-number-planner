import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/renderer/App';

const api = new Proxy({}, {
  get: (_target, key) => key === 'checkServiceHealth'
    ? vi.fn(async () => ({ status: 'ok' }))
    : vi.fn(async () => []),
}) as any;

afterEach(() => {
  delete window.plannerDesktop;
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('safe recovery surface', () => {
  it('shows service startup as in progress instead of reporting a healthy system', async () => {
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'starting' as const, activeTask: null })),
    };

    render(<App api={api} />);

    expect(await screen.findByText('正在启动本地服务…')).toBeVisible();
    expect(screen.queryByText('系统正常')).not.toBeInTheDocument();
  });

  it('shows an explicit desktop-only explanation in browser preview', async () => {
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));

    expect(await screen.findByText('安全恢复仅在 Windows 桌面版可用')).toBeVisible();
    expect(screen.getByRole('button', { name: '重启本地服务' })).toBeDisabled();
  });

  it('offers all four recovery actions through the desktop bridge', async () => {
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: null })),
      terminateTask: vi.fn(async () => ({ ok: true, cancelled: false })),
      reloadRenderer: vi.fn(async () => ({ ok: true })),
      restartService: vi.fn(async () => ({ ok: true })),
      relaunchApp: vi.fn(async () => ({ ok: true })),
    };
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));

    expect(screen.getByRole('button', { name: '终止当前任务' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '重新加载界面' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '重启本地服务' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '完整恢复应用' })).toBeEnabled();
  });

  it('warns about a slow action without automatically terminating it', async () => {
    vi.useFakeTimers();
    const terminateTask = vi.fn(async () => ({ ok: true, cancelled: true }));
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: null })),
      terminateTask,
      reloadRenderer: vi.fn(async () => ({ ok: true })),
      restartService: vi.fn(() => new Promise<DesktopRecoveryResult>(() => undefined)),
      relaunchApp: vi.fn(async () => ({ ok: true })),
    };
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '重启本地服务' }));

    await act(async () => { vi.advanceTimersByTime(10_000); });

    expect(screen.getByText('当前操作响应较慢')).toBeVisible();
    expect(screen.getByRole('button', { name: '继续等待' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '终止任务' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '安全恢复应用' })).toBeEnabled();
    expect(terminateTask).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '终止任务' }));
    await act(async () => undefined);
    expect(terminateTask).toHaveBeenCalledOnce();
  });

  it('can request a full safe recovery from the slow-response warning while another action is busy', async () => {
    vi.useFakeTimers();
    const relaunchApp = vi.fn(async () => ({ ok: true }));
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: null })),
      terminateTask: vi.fn(async () => ({ ok: true, cancelled: false })),
      reloadRenderer: vi.fn(async () => ({ ok: true })),
      restartService: vi.fn(() => new Promise<DesktopRecoveryResult>(() => undefined)),
      relaunchApp,
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '重启本地服务' }));
    await act(async () => { vi.advanceTimersByTime(10_000); });

    fireEvent.click(screen.getByRole('button', { name: '安全恢复应用' }));
    await act(async () => undefined);

    expect(relaunchApp).toHaveBeenCalledOnce();
  });
});
