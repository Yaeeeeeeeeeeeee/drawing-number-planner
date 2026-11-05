import { describe, expect, it } from 'vitest';

import { TaskRegistry, TaskRegistryError } from '../../src/core/tasks/task-registry';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('TaskRegistry', () => {
  it('reports progress and retains a completed result', async () => {
    const registry = new TaskRegistry({ maxRetained: 3 });
    registry.register('workspace_scan', async (_payload, context) => {
      context.report({ processed: 2, total: 5, phase: 'scanning', message: '正在扫描' });
      return { total: 5 };
    });

    const created = registry.create('workspace_scan', {});
    await registry.wait(created.id);

    expect(registry.get(created.id)).toMatchObject({
      status: 'completed',
      progress: { processed: 2, total: 5, phase: 'completed', message: '已完成' },
      result: { total: 5 },
    });
  });

  it('cancels a running task cooperatively and never completes it', async () => {
    const registry = new TaskRegistry();
    let release!: () => void;
    registry.register('workspace_scan', async (_payload, context) => {
      await new Promise<void>((resolve) => { release = resolve; });
      context.throwIfCancelled();
      return 'should-not-complete';
    });
    const created = registry.create('workspace_scan', {});
    await tick();
    expect(registry.cancel(created.id)).toMatchObject({ status: 'running', cancelRequested: true });
    release();
    await registry.wait(created.id);
    expect(registry.get(created.id)).toMatchObject({ status: 'cancelled', cancelRequested: true });
    expect(registry.get(created.id)?.result).toBeUndefined();
  });

  it.each(['finalizing', 'completed', 'failed', 'cancelled'] as const)(
    'rejects cancellation after a task reaches %s', async (terminal) => {
      const registry = new TaskRegistry();
      let release!: () => void;
      registry.register('workspace_scan', async (_payload, context) => {
        if (terminal === 'finalizing') {
          context.beginFinalizing();
          await new Promise<void>((resolve) => { release = resolve; });
          return null;
        }
        if (terminal === 'failed') throw new Error('boom');
        if (terminal === 'cancelled') {
          await new Promise<void>((resolve) => { release = resolve; });
          context.throwIfCancelled();
        }
        return null;
      });
      const task = registry.create('workspace_scan', {});
      await tick();
      if (terminal === 'cancelled') { registry.cancel(task.id); release(); await registry.wait(task.id); }
      else if (terminal === 'finalizing') { /* still in progress */ }
      else await registry.wait(task.id);

      expect(() => registry.cancel(task.id)).toThrowError(TaskRegistryError);
      expect(() => registry.cancel(task.id)).toThrowError(expect.objectContaining({ code: 'TASK_NOT_CANCELLABLE' }));
      if (terminal === 'finalizing') { release(); await registry.wait(task.id); }
    },
  );

  it('rejects illegal progress and finalizing transitions', async () => {
    const registry = new TaskRegistry();
    registry.register('workspace_scan', async (_payload, context) => {
      context.beginFinalizing();
      expect(() => context.report({ processed: 1, total: 1, phase: 'late', message: 'late' }))
        .toThrowError(expect.objectContaining({ code: 'INVALID_TASK_TRANSITION' }));
      expect(() => context.beginFinalizing()).toThrowError(expect.objectContaining({ code: 'INVALID_TASK_TRANSITION' }));
      return null;
    });
    const task = registry.create('workspace_scan', {});
    await registry.wait(task.id);
    expect(registry.get(task.id)?.status).toBe('completed');
  });

  it('keeps a bounded number of finished tasks without evicting active work', async () => {
    const registry = new TaskRegistry({ maxRetained: 2 });
    registry.register('workspace_scan', async (payload) => payload);
    const first = registry.create('workspace_scan', { n: 1 }); await registry.wait(first.id);
    const second = registry.create('workspace_scan', { n: 2 }); await registry.wait(second.id);
    const third = registry.create('workspace_scan', { n: 3 }); await registry.wait(third.id);

    expect(registry.get(first.id)).toBeNull();
    expect(registry.list().map((task) => task.id)).toEqual([third.id, second.id]);
  });

  it('preserves a domain error code in a failed task', async () => {
    const registry = new TaskRegistry();
    registry.register('workspace_scan', () => { throw Object.assign(new Error('bad input'), { code: 'INVALID_REQUEST' }); });
    const task = registry.create('workspace_scan', {}); await registry.wait(task.id);
    expect(registry.get(task.id)).toMatchObject({ status: 'failed',
      error: { code: 'INVALID_REQUEST', message: 'bad input' } });
  });
});
