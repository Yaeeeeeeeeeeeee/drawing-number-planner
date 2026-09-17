import type { LocalServiceConnection, LocalServiceHealth } from './local-service-controller.js';

type RecoverableTaskStatus = 'queued' | 'running' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
export interface RecoverableTask { id: string; status: RecoverableTaskStatus; createdAt: string; kind?: string; progress?: { message?: string } }

export class RecoveryError extends Error {
  constructor(readonly code: 'TASK_NOT_CANCELLABLE' | 'TASK_CANCEL_TIMEOUT' | 'RECOVERY_BUSY' | 'RECOVERY_FAILED', message: string) {
    super(message); this.name = 'RecoveryError';
  }
}

interface RecoveryDependencies {
  serviceHealth(): LocalServiceHealth;
  restartService(): Promise<LocalServiceConnection>;
  listTasks(): Promise<RecoverableTask[]>;
  cancelTask(id: string): Promise<void>;
  waitForTask(id: string, timeoutMs: number): Promise<boolean>;
  reloadRenderer(): void;
  notifyServiceRestarted(url: string): void;
  relaunch(): void;
  exit(code: number): void;
}

export interface RecoveryStatus {
  service: LocalServiceHealth['status'];
  activeTask: RecoverableTask | null;
}

export function parseRecoveryServiceResponse<T>(response: Pick<Response, 'ok' | 'status'>, body: string): T {
  let parsed: any;
  try { parsed = body ? JSON.parse(body) : undefined; }
  catch {
    if (response.ok) throw Object.assign(new Error('本地服务返回了无法识别的数据'), { code: 'RECOVERY_INVALID_RESPONSE' });
  }
  if (!response.ok) throw Object.assign(new Error(parsed?.error?.message ?? `本地服务请求失败（${response.status}）`),
    { code: parsed?.error?.code ?? 'RECOVERY_REQUEST_FAILED' });
  return parsed as T;
}

function currentTask(tasks: RecoverableTask[]): RecoverableTask | null {
  return activeTasks(tasks)[0] ?? null;
}

function activeTasks(tasks: RecoverableTask[]): RecoverableTask[] {
  return tasks.filter((task) => task.status === 'queued' || task.status === 'running' || task.status === 'finalizing');
}

export class RecoveryController {
  constructor(private readonly dependencies: RecoveryDependencies) {}

  async status(): Promise<RecoveryStatus> {
    const service = this.dependencies.serviceHealth().status;
    if (service !== 'running') return { service, activeTask: null };
    let activeTask: RecoverableTask | null = null;
    try { activeTask = currentTask(await this.dependencies.listTasks()); } catch { /* service status is authoritative */ }
    return { service, activeTask };
  }

  async terminateTask(): Promise<{ ok: true; cancelled: boolean; taskId?: string }> {
    const task = currentTask(await this.dependencies.listTasks());
    if (!task) return { ok: true, cancelled: false };
    if (task.status === 'finalizing') {
      throw new RecoveryError('TASK_NOT_CANCELLABLE', '当前任务正在安全提交，不能中途终止');
    }
    await this.dependencies.cancelTask(task.id);
    return { ok: true, cancelled: true, taskId: task.id };
  }

  async reloadRenderer(): Promise<{ ok: true }> {
    this.dependencies.reloadRenderer();
    return { ok: true };
  }

  async restartService(): Promise<{ ok: true; url: string }> {
    const connection = await this.dependencies.restartService();
    this.dependencies.notifyServiceRestarted(connection.url);
    return { ok: true, url: connection.url };
  }

  async relaunchApp(): Promise<{ ok: true }> {
    const tasks = this.dependencies.serviceHealth().status === 'running'
      ? activeTasks(await this.dependencies.listTasks()) : [];
    if (tasks.length > 0) {
      await Promise.all(tasks.filter((task) => task.status !== 'finalizing')
        .map((task) => this.dependencies.cancelTask(task.id)));
      const stopped = await Promise.all(tasks.map((task) => this.dependencies.waitForTask(task.id, 5_000)));
      if (stopped.some((done) => !done)) {
        throw new RecoveryError('TASK_CANCEL_TIMEOUT', '仍有任务尚未安全停止，请继续等待后再恢复');
      }
    }
    await this.restartService();
    this.dependencies.relaunch();
    this.dependencies.exit(0);
    return { ok: true };
  }
}

export function createNativeRecoveryActions(controller: RecoveryController) {
  type ActionName = 'terminateTask' | 'reloadRenderer' | 'restartService' | 'relaunchApp';
  let inFlight: { name: ActionName; promise: Promise<unknown> } | null = null;
  const run = <T>(name: ActionName, action: () => Promise<T>): Promise<T> => {
    if (inFlight) {
      if (inFlight.name === name) return inFlight.promise as Promise<T>;
      return Promise.reject(new RecoveryError('RECOVERY_BUSY', '另一项安全恢复操作正在进行，请等待完成后重试'));
    }
    const promise = action().finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
    });
    inFlight = { name, promise };
    return promise;
  };
  return {
    terminateTask: () => run('terminateTask', () => controller.terminateTask()),
    reloadRenderer: () => run('reloadRenderer', () => controller.reloadRenderer()),
    restartService: () => run('restartService', () => controller.restartService()),
    relaunchApp: () => run('relaunchApp', () => controller.relaunchApp()),
  };
}
