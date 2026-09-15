// @vitest-environment node
import { EventEmitter } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LocalServiceController, type ServiceChild } from '../../src/main/local-service-controller';

class FakeChild extends EventEmitter implements ServiceChild {
  connected = true;
  killed = false;
  readonly sent: unknown[] = [];
  readonly killedWith: NodeJS.Signals[] = [];
  send(message: unknown): boolean { this.sent.push(message); return true; }
  kill(signal: NodeJS.Signals = 'SIGTERM'): boolean {
    this.killed = true; this.killedWith.push(signal); return true;
  }
}

const config = { dataDir: 'C:\\planner-data', allowedOrigins: ['http://127.0.0.1:5173'], port: 4317 };

describe('LocalServiceController', () => {
  afterEach(() => vi.useRealTimers());

  it('starts through structured IPC and becomes healthy only after ready', async () => {
    const child = new FakeChild();
    const spawn = vi.fn(() => child);
    const controller = new LocalServiceController({ entryPath: 'service-entry.js', config, spawn });

    const starting = controller.start();
    expect(controller.health()).toEqual({ status: 'starting', restartAttempts: 0 });
    expect(spawn).toHaveBeenCalledWith('service-entry.js');
    expect(child.sent).toEqual([{ type: 'start', config }]);
    child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'secret-one' });

    await expect(starting).resolves.toEqual({ url: 'http://127.0.0.1:4317', token: 'secret-one' });
    expect(controller.health()).toEqual({ status: 'running', url: 'http://127.0.0.1:4317', restartAttempts: 0 });
    expect(JSON.stringify(spawn.mock.calls)).not.toContain('secret-one');
  });

  it.each([
    ['port occupied', { type: 'startup-error', code: 'EADDRINUSE', message: '端口已占用' }],
    ['startup exit', null],
  ])('rejects a %s without reporting ready', async (_name, startupMessage) => {
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child });
    const starting = controller.start();
    if (startupMessage) child.emit('message', startupMessage);
    else child.emit('exit', 1, null);
    await expect(starting).rejects.toThrow(startupMessage ? '端口已占用' : '本地服务在启动完成前退出');
    expect(controller.health().status).toBe('failed');
  });

  it('times out startup and force-terminates a child that does not exit', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child,
      startupTimeoutMs: 50, stopTimeoutMs: 20 });
    const starting = controller.start();
    const rejected = expect(starting).rejects.toThrow('本地服务启动超时');
    await vi.advanceTimersByTimeAsync(50);
    await rejected;
    expect(child.killedWith).toContain('SIGTERM');
    await vi.advanceTimersByTimeAsync(20);
    expect(child.killedWith).toContain('SIGKILL');
  });

  it('limits automatic restarts after unexpected runtime exits', async () => {
    vi.useFakeTimers();
    const children = [new FakeChild(), new FakeChild(), new FakeChild(), new FakeChild()];
    const spawn = vi.fn(() => children[spawn.mock.calls.length - 1]);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn,
      maxAutoRestarts: 2, restartBackoffMs: 10 });
    const started = controller.start(); children[0].emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'a' });
    await started;

    children[0].emit('exit', 1, null); await vi.advanceTimersByTimeAsync(10);
    children[1].emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'b' });
    children[1].emit('exit', 1, null); await vi.advanceTimersByTimeAsync(20);
    children[2].emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'c' });
    children[2].emit('exit', 1, null); await vi.advanceTimersByTimeAsync(100);

    expect(spawn).toHaveBeenCalledTimes(3);
    expect(controller.health()).toEqual({ status: 'failed', restartAttempts: 2, error: '本地服务异常退出，自动恢复次数已用尽' });
  });

  it('does not turn a failed startup into an automatic restart loop when the child exits', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(); const spawn = vi.fn(() => child);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, restartBackoffMs: 10 });
    const starting = controller.start(); const rejected = expect(starting).rejects.toThrow('端口已占用');
    child.emit('message', { type: 'startup-error', code: 'EADDRINUSE', message: '端口已占用' });
    await rejected; child.emit('exit', 1, null); await vi.advanceTimersByTimeAsync(100);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(controller.health()).toMatchObject({ status: 'failed', restartAttempts: 0 });
  });

  it('does not auto-restart after the process itself reports a startup error', async () => {
    vi.useFakeTimers();
    const child = new FakeChild(); const spawn = vi.fn(() => child);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, restartBackoffMs: 10 });
    const starting = controller.start(); const rejected = expect(starting).rejects.toThrow('spawn failed');
    child.emit('error', new Error('spawn failed')); await rejected;
    child.emit('exit', 1, null); await vi.advanceTimersByTimeAsync(100);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(controller.health()).toMatchObject({ status: 'failed', restartAttempts: 0, error: 'spawn failed' });
  });

  it('round-trips private service requests and preserves structured errors', async () => {
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child });
    const started = controller.start(); child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'x' }); await started;

    const resolved = controller.resolvePdfFilePath(42);
    expect(child.sent.at(-1)).toEqual({ type: 'request', id: 1, method: 'resolvePdfFilePath', args: [42] });
    child.emit('message', { type: 'response', id: 1, ok: true, value: 'C:\\library\\drawing.pdf' });
    await expect(resolved).resolves.toBe('C:\\library\\drawing.pdf');

    const missing = controller.resolveOutboundPackagePath(9);
    child.emit('message', { type: 'response', id: 2, ok: false,
      error: { code: 'PACKAGE_MISSING', message: '压缩包当前不可用' } });
    await expect(missing).rejects.toMatchObject({ code: 'PACKAGE_MISSING', message: '压缩包当前不可用' });
  });

  it('manual restart stops gracefully and returns a fresh token', async () => {
    vi.useFakeTimers();
    const first = new FakeChild(); const second = new FakeChild();
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, stopTimeoutMs: 50 });
    const initial = controller.start(); first.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'old' });
    await initial;
    const restarting = controller.restart();
    expect(first.sent.at(-1)).toEqual({ type: 'stop' });
    first.emit('message', { type: 'stopped' }); first.emit('exit', 0, null);
    await vi.advanceTimersByTimeAsync(0);
    second.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'new' });
    await expect(restarting).resolves.toEqual({ url: 'http://127.0.0.1:4317', token: 'new' });
    expect(controller.health()).toMatchObject({ status: 'running', restartAttempts: 0 });
  });

  it('allows a manual restart while a failed-start child is still exiting', async () => {
    vi.useFakeTimers();
    const first = new FakeChild(); const second = new FakeChild();
    const spawn = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn, stopTimeoutMs: 20 });
    const starting = controller.start(); const rejected = expect(starting).rejects.toThrow('端口已占用');
    first.emit('message', { type: 'startup-error', code: 'EADDRINUSE', message: '端口已占用' }); await rejected;

    const restarted = controller.restart(); first.emit('exit', 1, null); await vi.advanceTimersByTimeAsync(0);
    expect(spawn).toHaveBeenCalledTimes(2);
    second.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'fresh' });
    await expect(restarted).resolves.toMatchObject({ token: 'fresh' });
  });

  it('uses a forceful fallback only when graceful stop does not finish', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const controller = new LocalServiceController({ entryPath: 'entry.js', config, spawn: () => child, stopTimeoutMs: 25 });
    const started = controller.start(); child.emit('message', { type: 'ready', url: 'http://127.0.0.1:4317', token: 'x' }); await started;
    const stopping = controller.stop();
    expect(child.sent.at(-1)).toEqual({ type: 'stop' });
    await vi.advanceTimersByTimeAsync(25);
    expect(child.killedWith).toContain('SIGTERM');
    await vi.advanceTimersByTimeAsync(25);
    expect(child.killedWith).toContain('SIGKILL');
    child.emit('exit', null, 'SIGKILL');
    await stopping;
    expect(controller.health()).toEqual({ status: 'stopped', restartAttempts: 0 });
  });
});
