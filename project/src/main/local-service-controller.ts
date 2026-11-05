import { fork } from 'node:child_process';

import type { LocalServiceConfig, ParentToServiceMessage, ServiceRequestMethod, ServiceToParentMessage } from '../service/protocol.js';

export interface ServiceChild {
  connected: boolean;
  killed: boolean;
  send(message: ParentToServiceMessage): boolean;
  kill(signal?: NodeJS.Signals): boolean;
  on(event: 'message', listener: (message: unknown) => void): this;
  on(event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
}

export interface LocalServiceConnection { url: string; token: string }
export type LocalServiceHealth =
  | { status: 'stopped' | 'starting'; restartAttempts: number }
  | { status: 'running'; url: string; restartAttempts: number }
  | { status: 'failed'; restartAttempts: number; error: string };

interface ControllerOptions {
  entryPath: string;
  config: LocalServiceConfig;
  spawn?: (entryPath: string) => ServiceChild;
  startupTimeoutMs?: number;
  stopTimeoutMs?: number;
  maxAutoRestarts?: number;
  restartBackoffMs?: number;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function asMessage(value: unknown): ServiceToParentMessage | null {
  return typeof value === 'object' && value !== null && 'type' in value
    ? value as ServiceToParentMessage : null;
}

export class LocalServiceController {
  private readonly options: Required<Pick<ControllerOptions, 'startupTimeoutMs' | 'stopTimeoutMs' | 'maxAutoRestarts' | 'restartBackoffMs'>> & ControllerOptions;
  private child: ServiceChild | undefined;
  private connection: LocalServiceConnection | undefined;
  private state: LocalServiceHealth = { status: 'stopped', restartAttempts: 0 };
  private startup: Deferred<LocalServiceConnection> | undefined;
  private stopping: Deferred<void> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private intentionalStop = false;
  private requestId = 0;
  private readonly requests = new Map<number, Deferred<unknown>>();
  private readonly failedStarts = new Set<ServiceChild>();

  constructor(options: ControllerOptions) {
    this.options = { startupTimeoutMs: 15_000, stopTimeoutMs: 3_000, maxAutoRestarts: 2,
      restartBackoffMs: 500, ...options };
  }

  health(): LocalServiceHealth { return { ...this.state }; }

  start(): Promise<LocalServiceConnection> {
    if (this.connection && this.state.status === 'running') return Promise.resolve({ ...this.connection });
    if (this.startup) return this.startup.promise;
    this.intentionalStop = false;
    this.state = { status: 'starting', restartAttempts: 0 };
    return this.spawnService(true);
  }

  async stop(): Promise<void> {
    this.intentionalStop = true;
    if (this.restartTimer) { clearTimeout(this.restartTimer); this.restartTimer = undefined; }
    const child = this.child;
    if (!child) {
      this.clearStartup(new Error('本地服务已停止'));
      this.connection = undefined; this.state = { status: 'stopped', restartAttempts: 0 }; return;
    }
    if (this.stopping) return this.stopping.promise;
    const stopping = deferred<void>(); this.stopping = stopping;
    try { if (child.connected) child.send({ type: 'stop' }); else child.kill('SIGTERM'); }
    catch { child.kill('SIGTERM'); }
    const terminateTimer = setTimeout(() => {
      if (this.child === child) child.kill('SIGTERM');
      setTimeout(() => { if (this.child === child) child.kill('SIGKILL'); }, this.options.stopTimeoutMs);
    }, this.options.stopTimeoutMs);
    return stopping.promise.finally(() => clearTimeout(terminateTimer));
  }

  async restart(): Promise<LocalServiceConnection> {
    await this.stop();
    this.intentionalStop = false;
    this.state = { status: 'starting', restartAttempts: 0 };
    return this.spawnService(true);
  }

  request<T>(method: ServiceRequestMethod, args: unknown[] = []): Promise<T> {
    if (!this.child || this.state.status !== 'running') return Promise.reject(new Error('本机文件服务尚未启动'));
    const pending = deferred<unknown>(); const id = ++this.requestId;
    this.requests.set(id, pending);
    try { this.child.send({ type: 'request', id, method, args }); }
    catch (error) { this.requests.delete(id); pending.reject(error instanceof Error ? error : new Error('本地服务请求失败')); }
    return pending.promise as Promise<T>;
  }

  resolvePdfFilePath(id: unknown): Promise<string> { return this.request('resolvePdfFilePath', [id]); }
  resolveBomAssetPath(id: unknown): Promise<string> { return this.request('resolveBomAssetPath', [id]); }
  qrManualAction(action: string, input: unknown): Promise<unknown> { return this.request('qrManualAction', [action, input]); }
  resolveQrFilePath(relativePath: string): Promise<{ path: string; mimeType: string }> { return this.request('resolveQrFilePath', [relativePath]); }
  setOutboundOutputRoot(path: string): Promise<string> { return this.request('setOutboundOutputRoot', [path]); }
  resolveOutboundPackagePath(id: unknown, partNumber?: unknown): Promise<string> { return this.request('resolveOutboundPackagePath', partNumber === undefined ? [id] : [id, partNumber]); }

  private spawnService(resetAttempts: boolean, scheduled?: Deferred<LocalServiceConnection>): Promise<LocalServiceConnection> {
    if (resetAttempts) this.state = { status: 'starting', restartAttempts: 0 };
    else this.state = { status: 'starting', restartAttempts: this.state.restartAttempts };
    const starting = scheduled ?? deferred<LocalServiceConnection>(); this.startup = starting;
    const spawn = this.options.spawn ?? ((entryPath: string) => fork(entryPath, [], {
      stdio: ['ignore', 'inherit', 'inherit', 'ipc'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      execArgv: [],
    }) as ServiceChild);
    let child: ServiceChild;
    try { child = spawn(this.options.entryPath); }
    catch (error) {
      const failure = error instanceof Error ? error : new Error('无法启动本地服务');
      this.state = { status: 'failed', restartAttempts: this.state.restartAttempts, error: failure.message };
      this.startup = undefined; starting.reject(failure); return starting.promise;
    }
    this.child = child;
    child.on('message', (message) => this.handleMessage(child, message));
    child.on('error', (error) => this.handleProcessError(child, error));
    child.on('exit', (code, signal) => this.handleExit(child, code, signal));
    child.send({ type: 'start', config: this.options.config });
    this.startupTimer = setTimeout(() => {
      if (this.child !== child || this.connection) return;
      const error = new Error('本地服务启动超时');
      this.state = { status: 'failed', restartAttempts: this.state.restartAttempts, error: error.message };
      this.failedStarts.add(child); this.clearStartup(error); this.terminateUnresponsive(child);
    }, this.options.startupTimeoutMs);
    return starting.promise;
  }

  private handleMessage(child: ServiceChild, value: unknown): void {
    if (child !== this.child) return;
    const message = asMessage(value); if (!message) return;
    if (message.type === 'ready') {
      if (this.startupTimer) clearTimeout(this.startupTimer);
      this.startupTimer = undefined;
      this.connection = { url: message.url, token: message.token };
      this.state = { status: 'running', url: message.url, restartAttempts: this.state.restartAttempts };
      const starting = this.startup; this.startup = undefined; starting?.resolve({ ...this.connection });
      return;
    }
    if (message.type === 'startup-error') {
      const error = Object.assign(new Error(message.message), message.code ? { code: message.code } : {});
      this.state = { status: 'failed', restartAttempts: this.state.restartAttempts, error: error.message };
      this.failedStarts.add(child); this.clearStartup(error); this.terminateUnresponsive(child); return;
    }
    if (message.type === 'response') {
      const pending = this.requests.get(message.id); if (!pending) return;
      this.requests.delete(message.id);
      if (message.ok) pending.resolve(message.value);
      else pending.reject(Object.assign(new Error(message.error.message), message.error.code ? { code: message.error.code } : {}));
    }
  }

  private handleProcessError(child: ServiceChild, error: Error): void {
    if (child !== this.child || this.connection) return;
    this.state = { status: 'failed', restartAttempts: this.state.restartAttempts, error: error.message };
    this.failedStarts.add(child); this.clearStartup(error); this.terminateUnresponsive(child);
  }

  private handleExit(child: ServiceChild, _code: number | null, _signal: NodeJS.Signals | null): void {
    if (child !== this.child) return;
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = undefined; this.child = undefined; this.connection = undefined;
    const requestError = new Error('本地服务连接已中断');
    for (const pending of this.requests.values()) pending.reject(requestError);
    this.requests.clear();
    if (this.stopping) {
      this.failedStarts.delete(child);
      const stopping = this.stopping; this.stopping = undefined;
      this.clearStartup(new Error('本地服务已停止'));
      this.state = { status: 'stopped', restartAttempts: 0 }; stopping.resolve(); return;
    }
    if (this.failedStarts.delete(child)) return;
    if (this.startup) {
      const error = new Error('本地服务在启动完成前退出');
      this.state = { status: 'failed', restartAttempts: this.state.restartAttempts, error: error.message };
      this.clearStartup(error); return;
    }
    if (this.intentionalStop) { this.state = { status: 'stopped', restartAttempts: 0 }; return; }
    const attempts = this.state.restartAttempts;
    if (attempts >= this.options.maxAutoRestarts) {
      this.state = { status: 'failed', restartAttempts: attempts, error: '本地服务异常退出，自动恢复次数已用尽' }; return;
    }
    const nextAttempt = attempts + 1;
    this.state = { status: 'starting', restartAttempts: nextAttempt };
    const scheduled = deferred<LocalServiceConnection>();
    this.startup = scheduled;
    void scheduled.promise.catch(() => undefined);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      void this.spawnService(false, scheduled).catch(() => undefined);
    }, this.options.restartBackoffMs * nextAttempt);
  }

  private clearStartup(error: Error): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
    const starting = this.startup; this.startup = undefined; starting?.reject(error);
  }

  private terminateUnresponsive(child: ServiceChild): void {
    child.kill('SIGTERM');
    setTimeout(() => { if (this.child === child) child.kill('SIGKILL'); }, this.options.stopTimeoutMs);
  }
}
