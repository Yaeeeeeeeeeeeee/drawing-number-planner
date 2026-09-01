import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { QrError } from '../../core/qr/qr-errors.js';
import type { QrService } from '../../core/qr/qr-service.js';

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const filtersSchema = z.object({
  productId: z.coerce.number().int().positive().optional(),
  purposeId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
}).strict();
const updateSchema = z.object({ name: z.string().trim().min(1).max(500), targetUrl: z.string().trim().max(2000).nullable() }).strict();

function sendQrError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof QrError)) throw error;
  return reply.code(error.code === 'NOT_FOUND' ? 404 : 400).send({ error: { code: error.code, message: error.message } });
}

export function registerQrCodeRoutes(app: FastifyInstance, service: QrService): void {
  app.get('/api/qr-codes', async (request, reply) => {
    const query = filtersSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码筛选条件无效' } });
    try { return service.list(query.data); } catch (error) { return sendQrError(reply, error); }
  });
  app.get('/api/qr-codes/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码编号无效' } });
    try { return service.get(params.data.id); } catch (error) { return sendQrError(reply, error); }
  });
  app.put('/api/qr-codes/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const input = updateSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码数据无效' } });
    try { return service.update(params.data.id, input.data); } catch (error) { return sendQrError(reply, error); }
  });
  for (const status of ['active', 'inactive'] as const) {
    app.post(`/api/qr-codes/:id/${status === 'active' ? 'activate' : 'deactivate'}`, async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码编号无效' } });
      try { return status === 'active' ? service.activate(params.data.id) : service.deactivate(params.data.id); }
      catch (error) { return sendQrError(reply, error); }
    });
  }
}
