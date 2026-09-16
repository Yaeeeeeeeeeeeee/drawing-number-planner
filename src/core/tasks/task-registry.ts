import { randomUUID } from 'node:crypto';

import type { LocalTaskHandler, LocalTaskProgress, LocalTaskStatus, LocalTaskView, TaskContext } from './task-types.js';

export type TaskRegistryErrorCode = 'TASK_KIND_NOT_FOUND' | 'TASK_NOT_FOUND' | 'TASK_NOT_CANCELLABLE'
  | 'INVALID_TASK_TRANSITION';

export class TaskRegistryError extends Error {
  constructor(readonly code: TaskRegistryErrorCode, message: string) { super(message); this.name = 'TaskRegistryError'; }
}

interface InternalTask extends LocalTaskView {
  controller: AbortController;
  done: Promise<void>;
  resolveDone(): void;
}

const terminal = new Set<LocalTaskStatus>(['completed', 'failed', 'cancelled']);
const initialProgress = (): LocalTaskProgress => ({ processed: 0, total: null, phase: 'queued', message: '等待开始' });

export class TaskRegistry {
  private readonly handlers = new Map<string, LocalTaskHandler>();
  private readonly tasks = new Map<string, InternalTask>();
  private readonly maxRetained: number;

  constructor(options: { maxRetained?: number } = {}) {
    this.maxRetained = Number.isSafeInteger(options.maxRetained) && (options.maxRetained ?? 0) > 0
      ? options.maxRetained! : 100;
  }

  register(kind: string, handler: LocalTaskHandler): void {
    if (!kind.trim()) throw new Error('任务类型不能为空');
    if (this.handlers.has(kind)) throw new Error(`任务类型已经注册：${kind}`);
    this.handlers.set(kind, handler);
  }

  create(kind: string, payload: unknown): LocalTaskView {
    const handler = this.handlers.get(kind);
    if (!handler) throw new TaskRegistryError('TASK_KIND_NOT_FOUND', '不支持该任务类型');
    const id = randomUUID(); const controller = new AbortController();
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => { resolveDone = resolve; });
    const task: InternalTask = { id, kind, status: 'queued', progress: initialProgress(), cancelRequested: false,
      createdAt: new Date().toISOString(), controller, done, resolveDone };
    this.tasks.set(id, task);
    void Promise.resolve().then(() => this.run(task, payload, handler));
    return this.snapshot(task);
  }

  get(id: string): LocalTaskView | null { const task = this.tasks.get(id); return task ? this.snapshot(task) : null; }

  list(): LocalTaskView[] {
    return [...this.tasks.values()].reverse().map((task) => this.snapshot(task));
  }

  cancel(id: string): LocalTaskView {
    const task = this.tasks.get(id);
    if (!task) throw new TaskRegistryError('TASK_NOT_FOUND', '任务不存在或已经过期');
    if (task.status !== 'queued' && task.status !== 'running') {
      throw new TaskRegistryError('TASK_NOT_CANCELLABLE', '任务已经进入提交或终结状态，不能取消');
    }
    task.cancelRequested = true;
    task.controller.abort(new TaskRegistryError('TASK_NOT_CANCELLABLE', '任务已由用户取消'));
    return this.snapshot(task);
  }

  async wait(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (!task) throw new TaskRegistryError('TASK_NOT_FOUND', '任务不存在或已经过期');
    await task.done;
  }

  private async run(task: InternalTask, payload: unknown, handler: LocalTaskHandler): Promise<void> {
    try {
      if (task.controller.signal.aborted) { this.finish(task, 'cancelled'); return; }
      task.status = 'running'; task.startedAt = new Date().toISOString();
      task.progress = { ...task.progress, phase: 'running', message: '正在处理' };
      const context: TaskContext = {
        id: task.id,
        signal: task.controller.signal,
        report: (progress) => {
          if (task.status !== 'running') throw new TaskRegistryError('INVALID_TASK_TRANSITION', '当前任务状态不能更新进度');
          if (!Number.isSafeInteger(progress.processed) || progress.processed < 0
            || (progress.total !== null && (!Number.isSafeInteger(progress.total) || progress.total < progress.processed))) {
            throw new TaskRegistryError('INVALID_TASK_TRANSITION', '任务进度无效');
          }
          task.progress = { ...progress };
        },
        throwIfCancelled: () => {
          if (task.controller.signal.aborted) throw task.controller.signal.reason;
        },
        beginFinalizing: () => {
          if (task.status !== 'running') throw new TaskRegistryError('INVALID_TASK_TRANSITION', '任务不能进入提交阶段');
          if (task.controller.signal.aborted) throw task.controller.signal.reason;
          task.status = 'finalizing';
          task.progress = { ...task.progress, phase: 'finalizing', message: '正在安全提交' };
        },
      };
      const result = await handler(payload, context);
      if (task.status === 'running' && task.controller.signal.aborted) { this.finish(task, 'cancelled'); return; }
      if (task.status !== 'running' && task.status !== 'finalizing') {
        throw new TaskRegistryError('INVALID_TASK_TRANSITION', '任务在无效状态结束');
      }
      task.result = result; this.finish(task, 'completed');
    } catch (error) {
      if (task.controller.signal.aborted && task.status !== 'finalizing') this.finish(task, 'cancelled');
      else {
        const domainCode = typeof error === 'object' && error !== null && 'code' in error
          && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : null;
        task.error = { code: domainCode ?? 'TASK_FAILED',
          message: error instanceof Error ? error.message : '任务执行失败' };
        this.finish(task, 'failed');
      }
    }
  }

  private finish(task: InternalTask, status: Extract<LocalTaskStatus, 'completed' | 'failed' | 'cancelled'>): void {
    task.status = status; task.finishedAt = new Date().toISOString();
    task.progress = { ...task.progress, phase: status,
      message: status === 'completed' ? '已完成' : status === 'cancelled' ? '已取消' : '执行失败' };
    task.resolveDone(); this.prune();
  }

  private prune(): void {
    const completed = [...this.tasks.values()].filter((task) => terminal.has(task.status));
    while (completed.length > this.maxRetained) {
      const oldest = completed.shift(); if (oldest) this.tasks.delete(oldest.id);
    }
  }

  private snapshot(task: InternalTask): LocalTaskView {
    const { controller: _controller, done: _done, resolveDone: _resolveDone, ...view } = task;
    return { ...view, progress: { ...view.progress },
      ...(view.error ? { error: { ...view.error } } : {}) };
  }
}
