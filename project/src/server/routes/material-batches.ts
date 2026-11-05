import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { FileError } from '../../core/files/file-errors.js';
import type { MaterialBatchService } from '../../core/files/material-batch-service.js';

const querySchema = z.object({
  search: z.string().optional(),
  productId: z.coerce.number().int().positive().optional(),
}).strict();
const paramsSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

export function registerMaterialBatchRoutes(app: FastifyInstance, service: MaterialBatchService): void {
  app.get('/api/material-batches/:id/deletion-preview', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'资料批次编号无效'}});
    return service.previewDeletion(params.data.id) ?? reply.code(404).send({error:{code:'NOT_FOUND',message:'资料批次不存在'}});
  });
  app.delete('/api/material-batches/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = z.object({fingerprint:z.string().regex(/^[a-f0-9]{64}$/),confirmation:z.literal('删除批次')}).strict().safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'请先预检并确认删除批次'}});
    try {
      return service.delete(params.data.id,input.data) ?? reply.code(404).send({error:{code:'NOT_FOUND',message:'资料批次不存在'}});
    } catch (error) {
      if (!(error instanceof FileError)) throw error;
      return reply.code(error.code === 'PDF_PREVIEW_STALE' ? 409 : 422).send({error:{code:error.code,message:error.message}});
    }
  });
  app.get('/api/material-batches/diagnostics', async () => service.diagnostics());
  app.patch('/api/material-batches/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    const input = z.object({displayName:z.string().trim().min(1).max(200), revision:z.number().int().nonnegative().optional()}).strict().safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'批次显示名称无效'}});
    try { const batch = service.rename(params.data.id, input.data.displayName, input.data.revision);
      return batch ?? reply.code(404).send({error:{code:'NOT_FOUND',message:'资料批次不存在'}});
    } catch (error) { if (!(error instanceof FileError)) throw error; return reply.code(422).send({error:{code:error.code,message:error.message}}); }
  });
  app.get('/api/material-batches', async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '资料批次筛选条件无效' } });
    }
    return { items: service.list(query.data) };
  });

  app.get('/api/material-batches/:id/files', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '资料批次编号无效' } });
    }
    const items = service.getFiles(params.data.id);
    if (items === null) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '资料批次不存在' } });
    }
    return { items };
  });

  app.get('/api/material-batches/:id/materials', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '资料批次编号无效' } });
    }
    const items = service.getLogicalMaterials(params.data.id);
    if (items === null) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: '资料批次不存在' } });
    }
    return { items };
  });
}
