import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { TaskRegistry } from '../../src/core/tasks/task-registry';
import { registerTaskRoutes } from '../../src/server/routes/tasks';

describe('task API', () => {
  const apps: Array<ReturnType<typeof Fastify>> = [];
  afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

  it('creates, lists, queries and cancels registered local work', async () => {
    const registry = new TaskRegistry();
    let release!: () => void;
    registry.register('workspace_scan', async (_payload, context) => {
      context.report({ processed: 1, total: 10, phase: 'scanning', message: '读取文件' });
      await new Promise<void>((resolve) => { release = resolve; });
      context.throwIfCancelled();
    });
    const app = Fastify(); apps.push(app); registerTaskRoutes(app, registry);

    const started = await app.inject({ method: 'POST', url: '/api/tasks/workspace_scan', payload: {} });
    expect(started.statusCode).toBe(202);
    const id = started.json().id as string;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${id}` })).json()).toMatchObject({
      id, status: 'running', progress: { processed: 1, total: 10 },
    });
    expect((await app.inject({ method: 'GET', url: '/api/tasks' })).json().tasks).toHaveLength(1);
    expect((await app.inject({ method: 'POST', url: `/api/tasks/${id}/cancel`, payload: {} })).statusCode).toBe(202);
    release(); await registry.wait(id);
    expect(registry.get(id)?.status).toBe('cancelled');
  });

  it('returns structured JSON for unknown task kinds, IDs and non-cancellable states', async () => {
    const registry = new TaskRegistry();
    registry.register('workspace_scan', async () => 'done');
    const app = Fastify(); apps.push(app); registerTaskRoutes(app, registry);

    expect((await app.inject({ method: 'POST', url: '/api/tasks/nope', payload: {} })).json().error.code)
      .toBe('TASK_KIND_NOT_FOUND');
    expect((await app.inject({ method: 'GET', url: '/api/tasks/missing' })).json().error.code)
      .toBe('TASK_NOT_FOUND');
    const started = await app.inject({ method: 'POST', url: '/api/tasks/workspace_scan', payload: {} });
    const id = started.json().id; await registry.wait(id);
    expect((await app.inject({ method: 'GET', url: `/api/tasks/${id}` })).json()).toMatchObject({
      id, status: 'completed', result: 'done',
    });
    const cancelled = await app.inject({ method: 'POST', url: `/api/tasks/${id}/cancel`, payload: {} });
    expect(cancelled.statusCode).toBe(409);
    expect(cancelled.json().error.code).toBe('TASK_NOT_CANCELLABLE');
  });
});
