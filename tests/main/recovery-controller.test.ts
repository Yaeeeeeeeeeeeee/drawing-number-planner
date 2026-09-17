// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { RecoveryController, RecoveryError, createNativeRecoveryActions, parseRecoveryServiceResponse } from '../../src/main/recovery-controller';

function fixture(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const dependencies = {
    serviceHealth: vi.fn(() => ({ status: 'running' as const, url: 'http://127.0.0.1:4317', restartAttempts: 0 })),
    restartService: vi.fn(async () => { calls.push('restart'); return { url: 'http://127.0.0.1:4317', token: 'fresh-token' }; }),
    listTasks: vi.fn(async () => []),
    cancelTask: vi.fn(async () => { calls.push('cancel'); }),
    waitForTask: vi.fn(async () => { calls.push('wait'); return true; }),
    reloadRenderer: vi.fn(() => { calls.push('reload'); }),
    notifyServiceRestarted: vi.fn((_url: string) => { calls.push('notify'); }),
    relaunch: vi.fn(() => { calls.push('relaunch'); }),
    exit: vi.fn(() => { calls.push('exit'); }),
    ...overrides,
  };
  return { controller: new RecoveryController(dependencies), dependencies, calls };
}

describe('desktop recovery controller', () => {
  it('turns a non-JSON service failure into a structured recovery error', () => {
    expect(() => parseRecoveryServiceResponse({ ok: false, status: 502 }, 'Bad Gateway'))
      .toThrow(expect.objectContaining({ code: 'RECOVERY_REQUEST_FAILED', message: '本地服务请求失败（502）' }));
  });

  it('reports a stopped service without starting it while polling status', async () => {
    const { controller, dependencies } = fixture({
      serviceHealth: vi.fn(() => ({ status: 'stopped' as const, restartAttempts: 0 })),
    });

    await expect(controller.status()).resolves.toEqual({ service: 'stopped', activeTask: null });

    expect(dependencies.listTasks).not.toHaveBeenCalled();
    expect(dependencies.restartService).not.toHaveBeenCalled();
  });

  it('reloads only the renderer and never calls service or task mutation paths', async () => {
    const { controller, dependencies } = fixture();

    await controller.reloadRenderer();

    expect(dependencies.reloadRenderer).toHaveBeenCalledOnce();
    expect(dependencies.restartService).not.toHaveBeenCalled();
    expect(dependencies.cancelTask).not.toHaveBeenCalled();
  });

  it('restarts the service and publishes the fresh connection before returning', async () => {
    const { controller, dependencies, calls } = fixture();

    await expect(controller.restartService()).resolves.toEqual({ ok: true, url: 'http://127.0.0.1:4317' });

    expect(dependencies.notifyServiceRestarted).toHaveBeenCalledWith('http://127.0.0.1:4317');
    expect(calls).toEqual(['restart', 'notify']);
  });

  it('cancels and waits for current work before restart and relaunch', async () => {
    const { controller, dependencies, calls } = fixture({
      listTasks: vi.fn(async () => [{ id: 'task-1', status: 'running', createdAt: '2026-09-16T01:00:00Z' }]),
    });

    await controller.relaunchApp();

    expect(dependencies.cancelTask).toHaveBeenCalledWith('task-1');
    expect(dependencies.waitForTask).toHaveBeenCalledWith('task-1', 5_000);
    expect(calls).toEqual(['cancel', 'wait', 'restart', 'notify', 'relaunch', 'exit']);
  });

  it('recovers a failed service without trying to query tasks through it first', async () => {
    const { controller, dependencies, calls } = fixture({
      serviceHealth: vi.fn(() => ({ status: 'failed' as const, restartAttempts: 2, error: 'service exited' })),
    });

    await controller.relaunchApp();

    expect(dependencies.listTasks).not.toHaveBeenCalled();
    expect(calls).toEqual(['restart', 'notify', 'relaunch', 'exit']);
  });

  it('refuses to cancel finalizing work', async () => {
    const { controller, dependencies } = fixture({
      listTasks: vi.fn(async () => [{ id: 'task-final', status: 'finalizing', createdAt: '2026-09-16T01:00:00Z' }]),
    });

    await expect(controller.terminateTask()).rejects.toMatchObject({ code: 'TASK_NOT_CANCELLABLE' } satisfies Partial<RecoveryError>);
    expect(dependencies.cancelTask).not.toHaveBeenCalled();
  });

  it('waits for finalizing work without cancelling it before a full recovery', async () => {
    const { controller, dependencies, calls } = fixture({
      listTasks: vi.fn(async () => [{ id: 'task-final', status: 'finalizing', createdAt: '2026-09-16T01:00:00Z' }]),
    });

    await controller.relaunchApp();

    expect(dependencies.cancelTask).not.toHaveBeenCalled();
    expect(dependencies.waitForTask).toHaveBeenCalledWith('task-final', 5_000);
    expect(calls).toEqual(['wait', 'restart', 'notify', 'relaunch', 'exit']);
  });

  it('does not restart or relaunch while finalizing work is still inside the bounded wait', async () => {
    const { controller, dependencies } = fixture({
      listTasks: vi.fn(async () => [{ id: 'task-final', status: 'finalizing', createdAt: '2026-09-16T01:00:00Z' }]),
      waitForTask: vi.fn(async () => false),
    });

    await expect(controller.relaunchApp()).rejects.toMatchObject({ code: 'TASK_CANCEL_TIMEOUT' } satisfies Partial<RecoveryError>);

    expect(dependencies.cancelTask).not.toHaveBeenCalled();
    expect(dependencies.restartService).not.toHaveBeenCalled();
    expect(dependencies.relaunch).not.toHaveBeenCalled();
  });

  it('exposes native menu actions that call Main directly without a renderer callback', async () => {
    const { controller, dependencies } = fixture();
    const actions = createNativeRecoveryActions(controller);

    await actions.reloadRenderer();
    await actions.restartService();

    expect(dependencies.reloadRenderer).toHaveBeenCalledOnce();
    expect(dependencies.restartService).toHaveBeenCalledOnce();
  });
});
