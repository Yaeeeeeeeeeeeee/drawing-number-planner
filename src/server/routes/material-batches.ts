import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import type { MaterialBatchService } from '../../core/files/material-batch-service.js';

const querySchema = z.object({
  search: z.string().optional(),
  productId: z.coerce.number().int().positive().optional(),
}).strict();
const paramsSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

export function registerMaterialBatchRoutes(app: FastifyInstance, service: MaterialBatchService): void {
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
