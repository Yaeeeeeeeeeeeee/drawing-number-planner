import { fork } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isStartupPhase, startupPhases, type StartupPhase } from '../service/startup-progress.js';

import type { LocalServiceConfig, ParentToServiceMessage, ServiceRequestMethod, ServiceToParentMessage } from '../service/protocol.js';

export interface ServiceChild {
  pid?: number;
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
  startupDeadlineMs?: number;
  diagnosticsPath?: string;
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
  private readonly options: Required<Pick<ControllerOptions, 'startupDeadlineMs' | 'stopTimeoutMs' | 'maxAutoRestarts' | 'restartBackoffMs'>> & ControllerOptions;
  private child: ServiceChild | undefined;
  private connection: LocalServiceConnection | undefined;
  private state: LocalServiceHealth = { status: 'stopped', restartAttempts: 0 };
  private startup: Deferred<LocalServiceConnection> | undefined;
  private stopping: Deferred<void> | undefined;
  private startupTimer: ReturnType<typeof setTimeout> | undefined;
  private startupDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
  private startupPhase: StartupPhase = 'module-loading';
  private attemptId = '';
  private startedAt = 0;
  private phaseStartedAt = 0;
  private diagnosticsFailed = false;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private intentionalStop = false;
  private requestId = 0;
  private readonly requests = new Map<number, Deferred<unknown>>();
  private readonly failedStarts = new Set<ServiceChild>();

  constructor(options: ControllerOptions) {
    this.options = { startupDeadlineMs: 600_000, stopTimeoutMs: 3_000, maxAutoRestarts: 2,
      restartBackoffMs: 500, ...options };
  }

  health(): LocalServiceHealth { return { ...this.state }; }

  start(): Promise<LocalServiceConnection> {
    if (this.stopping) return this.stopping.promise.then(()=>this.start());
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
    this.clearStartup(new Error('本地服务已停止'));
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
    return this.start();
  }

  request<T>(method: ServiceRequestMethod, args: unknown[] = []): Promise<T> {
    if (!this.child || this.state.status !== 'running') return Promise.reject(new Error('本机文件服务尚未启动'));
    const pending = deferred<unknown>(); const id = ++this.requestId;
    this.requests.set(id, pending);
    try { this.child.send({ type: 'request', id, method, args }); }
    catch (error) { this.requests.delete(id); pending.reject(error instanceof Error ? error : new Error('本地服务请求失败')); }
    return pending.promise as Promise<T>;
  }

  prepareDatabaseSwitch(): Promise<void> { return this.request('prepareDatabaseSwitch'); }

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
    this.attemptId=randomUUID(); this.startedAt=Date.now(); this.phaseStartedAt=this.startedAt;
    this.startupPhase='module-loading';
    this.diagnostic('start');
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
      this.diagnostic('spawn-error',{error:failure.message});
      this.startup = undefined; starting.reject(failure); return starting.promise;
    }
    this.child = child;
    this.diagnostic('spawned');
    child.on('message', (message) => this.handleMessage(child, message));
    child.on('error', (error) => this.handleProcessError(child, error));
    child.on('exit', (code, signal) => this.handleExit(child, code, signal));
    this.armPhaseTimer(child);
    this.startupDeadlineTimer=setTimeout(()=>this.timeout(child,true),this.options.startupDeadlineMs);
    try { child.send({ type: 'start', config: this.options.config }); }
    catch(error) { this.handleProcessError(child,error instanceof Error ? error : new Error('无法向本地服务发送启动请求')); }
    return starting.promise;
  }

  private handleMessage(child: ServiceChild, value: unknown): void {
    if (child !== this.child) return;
    const message = asMessage(value); if (!message) return;
    if (message.type==='startup-progress') {
      if (!this.startup || this.failedStarts.has(child) || this.intentionalStop || !isStartupPhase(message.phase)) return;
      // Repeated messages from the same stalled phase do not extend its deadline.
      if (message.phase!==this.startupPhase) {
        const previousPhaseMs=Date.now()-this.phaseStartedAt;
        this.startupPhase=message.phase; this.phaseStartedAt=Date.now();
        this.diagnostic('phase',{previousPhaseMs}); this.armPhaseTimer(child);
      }
      return;
    }
    if (message.type === 'ready') {
      if (!this.startup || this.failedStarts.has(child) || this.intentionalStop || this.stopping) return;
      this.clearStartupTimers();
      this.diagnostic('ready');
      this.connection = { url: message.url, token: message.token };
      this.state = { status: 'running', url: message.url, restartAttempts: this.state.restartAttempts };
      const starting = this.startup; this.startup = undefined; starting?.resolve({ ...this.connection });
      return;
    }
    if (message.type === 'startup-error') {
      if (!this.startup || this.failedStarts.has(child) || this.intentionalStop) return;
      const error = Object.assign(new Error(message.message), message.code ? { code: message.code } : {});
      this.diagnostic('startup-error',{error:message.message,errorCode:message.code});
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
    this.diagnostic('process-error',{error:error.message});
    this.state = { status: 'failed', restartAttempts: this.state.restartAttempts, error: error.message };
    this.failedStarts.add(child); this.clearStartup(error); this.terminateUnresponsive(child);
  }

  private handleExit(child: ServiceChild, code: number | null, signal: NodeJS.Signals | null): void {
    if (child !== this.child) return;
    this.diagnostic('exit',{exitCode:code,signal});
    this.clearStartupTimers(); this.child = undefined; this.connection = undefined;
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
      const error = new Error(`本地服务在启动完成前退出（退出码：${code ?? '无'}，信号：${signal ?? '无'}）。${this.failureContext()}`);
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
    this.clearStartupTimers();
    const starting = this.startup; this.startup = undefined; starting?.reject(error);
  }

  private clearStartupTimers(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer = undefined;
    if (this.startupDeadlineTimer) clearTimeout(this.startupDeadlineTimer);
    this.startupDeadlineTimer=undefined;
  }

  private armPhaseTimer(child: ServiceChild): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    this.startupTimer=setTimeout(()=>this.timeout(child,false),this.options.startupTimeoutMs ?? startupPhases[this.startupPhase].timeoutMs);
  }

  private timeout(child: ServiceChild, overall: boolean): void {
    if (this.child!==child || !this.startup || this.connection || this.intentionalStop) return;
    const error=new Error(`本地服务启动超时${overall ? '（达到启动总时限）' : ''}。${this.failureContext()}`);
    this.diagnostic('timeout',{overall});
    this.state={status:'failed',restartAttempts:this.state.restartAttempts,error:error.message};
    this.failedStarts.add(child); this.clearStartup(error); this.terminateUnresponsive(child);
  }

  private failureContext(): string {
    return `阶段：${startupPhases[this.startupPhase].label}；已等待 ${Math.round((Date.now()-this.startedAt)/1000)} 秒。数据库：${this.databasePath()}`
      +(this.options.diagnosticsPath ? `；启动日志：${this.options.diagnosticsPath}${this.diagnosticsFailed ? '（写入失败）' : ''}` : '');
  }

  private diagnostic(event: string, details: Record<string,unknown> = {}): void {
    if (!this.options.diagnosticsPath) return;
    try {
      mkdirSync(dirname(this.options.diagnosticsPath),{recursive:true});
      appendFileSync(this.options.diagnosticsPath,JSON.stringify({timestamp:new Date().toISOString(),attemptId:this.attemptId,
        event,phase:this.startupPhase,elapsedMs:Date.now()-this.startedAt,pid:this.child?.pid,
        databasePath:this.databasePath(),port:this.options.config.port ?? 4317,...details})+'\n');
    } catch { this.diagnosticsFailed=true; }
  }

  private databasePath(): string {
    return join(this.options.config.dataDir ?? join(process.cwd(),'work','runtime-data'),'planner.db');
  }

  private terminateUnresponsive(child: ServiceChild): void {
    child.kill('SIGTERM');
    setTimeout(() => { if (this.child === child) child.kill('SIGKILL'); }, this.options.stopTimeoutMs);
  }
}
