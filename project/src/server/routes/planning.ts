import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { PlanningError } from '../../core/planning/planning-errors.js';
import type { PlanningService } from '../../core/planning/planning-service.js';

const rowSchema = z.object({
  clientId: z.string().trim().min(1).max(100),
  colorId: z.number().int().positive(),
  mainCategoryId: z.number().int().positive(),
  projectItemId: z.number().int().positive(),
  notes: z.string().max(1000).optional(),
});
const previewSchema = z.object({
  productId: z.number().int().positive(),
  appearanceId: z.number().int().positive().optional(),
  appearanceVersionId: z.number().int().positive().optional(),
  rows: z.array(rowSchema).min(1).max(100),
});
const reserveSchema = z.object({
  productId: z.number().int().positive(),
  appearanceId: z.number().int().positive().optional(),
  appearanceVersionId: z.number().int().positive().optional(),
  rows: z.array(rowSchema.extend({ expectedFullCode: z.string().trim().min(1).max(200) })).min(1).max(100),
});

function sendPlanningError(error: unknown, reply: FastifyReply) {
  if (error instanceof PlanningError) {
    const conflict = ['PLAN_STALE', 'DRAWING_CODE_CONFLICT', 'SEQUENCE_EXHAUSTED'].includes(error.code);
    return reply.code(conflict ? 409 : 422).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export function registerPlanningRoutes(app: FastifyInstance, service: PlanningService): void {
  app.post('/api/planning/preview', async (request, reply) => {
    const input = previewSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号规划数据不完整' } });
    try { return service.preview(input.data); }
    catch (error) { return sendPlanningError(error, reply); }
  });

  app.post('/api/planning/reserve', async (request, reply) => {
    const input = reserveSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号规划数据不完整' } });
    try { return reply.code(201).send({ items: service.reserve(input.data) }); }
    catch (error) { return sendPlanningError(error, reply); }
  });
}
