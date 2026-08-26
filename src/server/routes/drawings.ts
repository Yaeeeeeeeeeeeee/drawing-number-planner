import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { DrawingQueryError, type DrawingQueryService } from '../../core/drawings/drawing-query-service.js';

const querySchema = z.object({
  drawingNumber: z.string().optional(),
  exactDrawingNumber: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  productCategory: z.string().optional(),
  brandId: z.coerce.number().int().positive().optional(),
  mainCategoryId: z.coerce.number().int().positive().optional(),
  projectItemId: z.coerce.number().int().positive().optional(),
  colorId: z.coerce.number().int().positive().optional(),
  status: z.enum(['reserved', 'active', 'voided', 'historical']).optional(),
  sourcePresence: z.enum(['present', 'missing', 'all']).optional(),
  outlinedPresence: z.enum(['present', 'missing', 'all']).optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
}).strict();
const paramsSchema = z.object({ id: z.coerce.number().int().refine((value) => value !== 0) }).strict();
const confirmedSchema = z.object({ confirmed: z.literal(true) }).strict();
const associationSchema = z.object({
  pdfIndexId: z.number().int().positive(), conversionType: z.enum(['source', 'outlined']),
}).strict();

function sendDrawingError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof DrawingQueryError)) throw error;
  const status = error.code === 'NOT_FOUND' ? 404
    : error.code === 'INVALID_TRANSITION' || error.code === 'HISTORICAL_READ_ONLY' ? 409 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerDrawingRoutes(app: FastifyInstance, service: DrawingQueryService): void {
  app.get('/api/drawings', async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号筛选条件无效' } });
    }
    return service.search(query.data);
  });

  app.get('/api/drawings/:id', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号编号无效' } });
    try { return service.get(params.data.id); }
    catch (error) {
      return sendDrawingError(reply, error);
    }
  });

  const transition = (target: 'active' | 'voided', invalidMessage: string) => async (request: any, reply: FastifyReply) => {
    const params = paramsSchema.safeParse(request.params); const input = confirmedSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: invalidMessage } });
    }
    try { return service.transition(params.data.id, target); }
    catch (error) { return sendDrawingError(reply, error); }
  };
  app.post('/api/drawings/:id/activate', transition('active', '正式使用确认请求无效'));
  app.post('/api/drawings/:id/void', transition('voided', '作废确认请求无效'));

  app.post('/api/drawings/:id/associate-pdf', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params); const input = associationSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'PDF 关联请求无效' } });
    }
    try { return service.associatePdf(params.data.id, input.data.pdfIndexId, input.data.conversionType); }
    catch (error) { return sendDrawingError(reply, error); }
  });
}
