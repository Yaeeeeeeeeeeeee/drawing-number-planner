import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/renderer/App';

const api = new Proxy({}, {
  get: (_target, key) => key === 'packaging' ? undefined : key === 'checkServiceHealth'
    ? vi.fn(async () => ({ status: 'ok' }))
    : vi.fn(async () => []),
}) as any;

const runningTask = (processed = 1) => ({
  id: 'task-1', kind: 'workspace_scan', status: 'running' as const, cancelRequested: false,
  createdAt: '2026-09-17T01:00:00Z',
  progress: { processed, total: 100, phase: 'scanning', message: '扫描资料' },
});

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

  it('warns when an active business task makes no progress without automatically terminating it', async () => {
    vi.useFakeTimers();
    const terminateTask = vi.fn(async () => ({ ok: true, cancelled: true }));
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: runningTask() })),
      terminateTask,
      reloadRenderer: vi.fn(async () => ({ ok: true })),
      restartService: vi.fn(async () => ({ ok: true })),
      relaunchApp: vi.fn(async () => ({ ok: true })),
    };
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    await act(async () => undefined);
    expect(screen.getByText('正在扫描资料…')).toBeVisible();

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

  it('does not describe a pending recovery action itself as a slow business task', async () => {
    vi.useFakeTimers();
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: null })),
      terminateTask: vi.fn(async () => ({ ok: true, cancelled: false })),
      reloadRenderer: vi.fn(async () => ({ ok: true })),
      restartService: vi.fn(() => new Promise<DesktopRecoveryResult>(() => undefined)),
      relaunchApp: vi.fn(async () => ({ ok: true })),
    };
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    fireEvent.click(screen.getByRole('button', { name: '重启本地服务' }));

    await act(async () => { vi.advanceTimersByTime(30_000); });

    expect(screen.queryByText('当前操作响应较慢')).not.toBeInTheDocument();
  });

  it('resets the slow-task threshold when progress changes and when the user continues waiting', async () => {
    vi.useFakeTimers();
    let processed = 1;
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: runningTask(processed) })),
      terminateTask: vi.fn(async () => ({ ok: true, cancelled: true })),
      reloadRenderer: vi.fn(async () => ({ ok: true })),
      restartService: vi.fn(async () => ({ ok: true })),
      relaunchApp: vi.fn(async () => ({ ok: true })),
    };
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    await act(async () => { vi.advanceTimersByTime(6_000); });
    processed = 2;
    await act(async () => { vi.advanceTimersByTime(3_000); });
    await act(async () => { vi.advanceTimersByTime(9_999); });
    expect(screen.queryByText('当前操作响应较慢')).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.getByText('当前操作响应较慢')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '继续等待' }));
    expect(screen.queryByText('当前操作响应较慢')).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(9_999); });
    expect(screen.queryByText('当前操作响应较慢')).not.toBeInTheDocument();
    await act(async () => { vi.advanceTimersByTime(1); });
    expect(screen.getByText('当前操作响应较慢')).toBeVisible();
  });

  it('can request a full recovery from a stalled business task without a recovery action holding the lock', async () => {
    vi.useFakeTimers();
    const relaunchApp = vi.fn(async () => ({ ok: true }));
    const restartService = vi.fn(async () => ({ ok: true }));
    window.plannerDesktop = {
      showFileInFolder: vi.fn(),
      getRecoveryStatus: vi.fn(async () => ({ service: 'running' as const, activeTask: runningTask() })),
      terminateTask: vi.fn(async () => ({ ok: true, cancelled: false })),
      reloadRenderer: vi.fn(async () => ({ ok: true })),
      restartService,
      relaunchApp,
    };
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<App api={api} />);
    fireEvent.click(screen.getByRole('button', { name: '安全恢复' }));
    await act(async () => undefined);
    expect(screen.getByText('正在扫描资料…')).toBeVisible();
    await act(async () => { vi.advanceTimersByTime(10_000); });

    fireEvent.click(screen.getByRole('button', { name: '安全恢复应用' }));
    await act(async () => undefined);

    expect(relaunchApp).toHaveBeenCalledOnce();
    expect(restartService).not.toHaveBeenCalled();
  });
});
