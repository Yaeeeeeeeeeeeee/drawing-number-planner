import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { DrawingQueryError, type DrawingQueryService } from '../../core/drawings/drawing-query-service.js';
import { DrawingDeletionError } from '../../core/drawings/drawing-deletion-service.js';

const querySchema = z.object({
  drawingNumber: z.string().optional(),
  exactDrawingNumber: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  productCategory: z.string().optional(),
  brandId: z.coerce.number().int().positive().optional(),
  appearanceId: z.coerce.number().int().positive().optional(),
  mainCategoryId: z.coerce.number().int().positive().optional(),
  projectItemId: z.coerce.number().int().positive().optional(),
  colorId: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive().optional(),
  usageBatchId: z.coerce.number().int().positive().optional(),
  associationState: z.literal('pending').optional(),
  materialBatchId: z.coerce.number().int().positive().optional(),
  status: z.enum(['reserved', 'active', 'voided', 'inactive', 'historical']).optional(),
  sourcePresence: z.enum(['present', 'missing', 'all']).optional(),
  outlinedPresence: z.enum(['present', 'missing', 'all']).optional(),
  keyword: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  deletionState: z.enum(['normal', 'deleted-retained', 'deleted-released', 'all']).optional(),
}).strict();
const paramsSchema = z.object({ id: z.coerce.number().int().refine((value) => value !== 0) }).strict();
const historicalParamsSchema = z.object({ id: z.coerce.number().int().positive() }).strict();
const confirmedSchema = z.object({ confirmed: z.literal(true) }).strict();
const associationSchema = z.object({
  pdfIndexId: z.number().int().positive(), conversionType: z.enum(['source', 'outlined']),
}).strict();
const deleteDrawingSchema = z.object({
  mode: z.enum(['retain_occupied', 'release']), confirmedCode: z.string().min(1), reason: z.string().max(500).optional(),
}).strict();
const scanResolutionSchema = z.object({ resolution: z.enum(['reimport', 'ignore']) }).strict();

function sendDrawingError(reply: FastifyReply, error: unknown) {
  if (error instanceof DrawingDeletionError) {
    const status = error.code === 'DRAWING_NOT_FOUND' ? 404
      : error.code === 'DRAWING_DELETE_BLOCKED' || error.code === 'DRAWING_RESTORE_CONFLICT' ? 409 : 422;
    return reply.code(status).send({ error: { code: error.code, message: error.message, preview: error.preview } });
  }
  if (!(error instanceof DrawingQueryError)) throw error;
  const status = error.code === 'NOT_FOUND' ? 404
    : error.code === 'INVALID_TRANSITION' || error.code === 'HISTORICAL_READ_ONLY' ? 409 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerDrawingRoutes(app: FastifyInstance, service: DrawingQueryService): void {
  app.post('/api/drawings/batch-delete', async (request, reply) => {
    const parsed = z.object({ confirmed: z.literal(true), items: z.array(deleteDrawingSchema.extend({
      signedId: z.number().int().refine((id) => id !== 0),
    })).min(1).max(100) }).strict().safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '批量删除请求无效' } });
    try { return service.deleteDrawings(parsed.data.items); }
    catch (error) { return sendDrawingError(reply, error); }
  });
  app.get('/api/drawings', async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号筛选条件无效' } });
    }
    return service.search(query.data);
  });

  app.get('/api/drawings/navigation', async () => service.navigation());

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

  app.delete('/api/drawings/:id', async (request, reply) => {
    return reply.code(405).send({ error: { code: 'USE_DRAWING_DELETE_WORKFLOW',
      message: '请使用统一图号删除流程，并明确选择保留占号或释放图号' } });
  });

  app.get('/api/drawings/:id/deletion-preview', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号编号无效' } });
    try { return service.previewDeletion(params.data.id); }
    catch (error) { return sendDrawingError(reply, error); }
  });

  app.post('/api/drawings/:id/delete', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params); const input = deleteDrawingSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '删除图号请求无效' } });
    }
    try { return service.deleteDrawing({ signedId: params.data.id, ...input.data }); }
    catch (error) { return sendDrawingError(reply, error); }
  });

  app.post('/api/drawings/:id/restore', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params); const input = confirmedSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '恢复图号请求无效' } });
    }
    try { return service.restoreDrawing(params.data.id); }
    catch (error) { return sendDrawingError(reply, error); }
  });

  app.post('/api/drawings/:id/scan-resolution', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params); const input = scanResolutionSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '扫描处理请求无效' } });
    }
    try { return service.resolveDeletedScan(params.data.id, input.data.resolution); }
    catch (error) { return sendDrawingError(reply, error); }
  });

  const historicalTransition = (target: 'active' | 'inactive', invalidMessage: string) => async (request: any, reply: FastifyReply) => {
    const params = paramsSchema.safeParse(request.params); const input = confirmedSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: invalidMessage } });
    }
    try { return service.updateHistoricalStatus(params.data.id, target); }
    catch (error) { return sendDrawingError(reply, error); }
  };
  app.post('/api/historical-drawings/:id/activate', historicalTransition('active', '历史图号启用确认请求无效'));
  app.post('/api/historical-drawings/:id/deactivate', historicalTransition('inactive', '历史图号停用确认请求无效'));
  app.delete('/api/historical-drawings/:id', async (request, reply) => {
    const params = historicalParamsSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '历史图号编号无效' } });
    return reply.code(405).send({ error: { code: 'USE_DRAWING_DELETE_WORKFLOW',
      message: '请使用统一图号删除流程，并明确选择保留占号或释放图号' } });
  });

  app.post('/api/drawings/:id/associate-pdf', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params); const input = associationSchema.safeParse(request.body);
    if (!params.success || !input.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'PDF 关联请求无效' } });
    }
    try { return service.associatePdf(params.data.id, input.data.pdfIndexId, input.data.conversionType); }
    catch (error) { return sendDrawingError(reply, error); }
  });
}
