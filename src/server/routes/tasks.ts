import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { TaskRegistry, TaskRegistryError } from '../../core/tasks/task-registry.js';

const kindSchema = z.object({ kind: z.string().min(1).max(100) }).strict();
const idSchema = z.object({ id: z.string().uuid() }).strict();
const emptySchema = z.object({}).strict();

function sendError(error: unknown, reply: FastifyReply) {
  if (!(error instanceof TaskRegistryError)) throw error;
  const status = error.code === 'TASK_NOT_FOUND' ? 404 : error.code === 'TASK_KIND_NOT_FOUND' ? 404 : 409;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerTaskRoutes(app: FastifyInstance, registry: TaskRegistry): void {
  app.get('/api/tasks', async () => ({ tasks: registry.list() }));
  app.post('/api/tasks/:kind', async (request, reply) => {
    const params = kindSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '任务类型无效' } });
    try { return reply.code(202).send(registry.create(params.data.kind, request.body ?? {})); }
    catch (error) { return sendError(error, reply); }
  });
  app.get('/api/tasks/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(404).send({ error: { code: 'TASK_NOT_FOUND', message: '任务不存在或已经过期' } });
    const task = registry.get(params.data.id);
    return task ?? reply.code(404).send({ error: { code: 'TASK_NOT_FOUND', message: '任务不存在或已经过期' } });
  });
  app.post('/api/tasks/:id/cancel', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const body = emptySchema.safeParse(request.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '取消任务请求无效' } });
    try { return reply.code(202).send(registry.cancel(params.data.id)); }
    catch (error) { return sendError(error, reply); }
  });
}
