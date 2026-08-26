import type { FastifyInstance } from 'fastify';
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
});

export function registerDrawingRoutes(app: FastifyInstance, service: DrawingQueryService): void {
  app.get('/api/drawings', async (request, reply) => {
    const query = querySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号筛选条件无效' } });
    }
    return service.search(query.data);
  });

  app.get('/api/drawings/:id', async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().refine((value) => value !== 0) }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号编号无效' } });
    try { return service.get(params.data.id); }
    catch (error) {
      if (error instanceof DrawingQueryError) {
        return reply.code(404).send({ error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  });
}
