import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { FileError } from '../../core/files/file-errors.js';
import type { FileService } from '../../core/files/file-service.js';

const settingsSchema = z.object({ workspaceRoot: z.string().trim().min(1).max(2000) }).strict();
const emptyBodySchema = z.object({}).strict();
const searchSchema = z.object({
  keyword: z.string().max(500).optional(),
  matchStatus: z.enum(['matched', 'pending', 'unmatched', 'conflict']).optional(),
  conversionType: z.enum(['source', 'outlined']).optional(),
  presence: z.enum(['present', 'missing', 'all']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
}).strict();

function sendFileError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof FileError)) throw error;
  const status = error.code === 'SCAN_IN_PROGRESS' ? 409 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerFileRoutes(app: FastifyInstance, service: FileService): void {
  app.get('/api/files/settings', async (_request, reply) => {
    try { return service.getSettings(); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.put('/api/files/settings', async (request, reply) => {
    const input = settingsSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '资料根目录设置无效' } });
    try { return service.updateSettings(input.data); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.post('/api/files/scan', async (request, reply) => {
    const input = emptyBodySchema.safeParse(request.body ?? {});
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '扫描请求不应包含额外参数' } });
    try { return await service.scan(); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.get('/api/files', async (request, reply) => {
    const query = searchSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'PDF 文件筛选条件无效' } });
    try { return service.search(query.data); }
    catch (error) { return sendFileError(reply, error); }
  });
}
