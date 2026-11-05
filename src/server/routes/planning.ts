import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { PlanningDraftError, PlanningDraftStore, planningDraftInputSchema } from '../../core/planning/planning-draft-store.js';
import type { BatchPlanningRow } from '../../core/planning/planning-types.js';
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

const whiteBaseSchema = z.object({ origin: z.enum(['planned', 'historical']), id: z.number().int().positive() });
const checkedBatchRowSchema = rowSchema.extend({ shareWhite: z.boolean().optional(), whiteBase: whiteBaseSchema.optional(),
  expectedFullCode: z.string().max(200).optional(), fingerprint: z.string().max(200).optional() });
// Row errors belong to their row. Keep structural request validation at the envelope.
const batchRowSchema = z.unknown().transform((value): BatchPlanningRow & { expectedFullCode?: string; fingerprint?: string } => {
  const parsed = checkedBatchRowSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return { clientId: typeof source.clientId === 'string' ? source.clientId.slice(0, 100) : '',
    colorId: 0, mainCategoryId: 0, projectItemId: 0 };
});
const batchSchema = z.object({ groups: z.array(z.object({ productId: z.number().int().catch(0),
  appearanceId: z.number().int().optional().catch(0), appearanceVersionId: z.number().int().optional().catch(0),
  rows: z.array(batchRowSchema).min(1).max(100) })).min(1).max(100) });
const batchReserveSchema = batchSchema.extend({ confirmed: z.literal(true) });
const draftModeSchema = z.enum(['new', 'batch']);
const expectedRevisionSchema = z.number().int().nonnegative().optional();

function sendPlanningError(error: unknown, reply: FastifyReply) {
  if (error instanceof PlanningDraftError) {
    return reply.code(error.code === 'DRAFT_STALE' ? 409 : error.code === 'INVALID_DRAFT' ? 400 : 500)
      .send({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof PlanningError) {
    const conflict = ['PLAN_STALE', 'DRAWING_CODE_CONFLICT', 'SEQUENCE_EXHAUSTED'].includes(error.code);
    return reply.code(conflict ? 409 : 422).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export function registerPlanningRoutes(app: FastifyInstance, service: PlanningService, draftStore?: PlanningDraftStore): void {
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

  app.post('/api/planning/batch-preview', async (request, reply) => {
    const input = batchSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '图号批量规划数据不完整' } });
    try { return service.previewBatch(input.data); }
    catch (error) { return sendPlanningError(error, reply); }
  });
  app.post('/api/planning/batch-reserve', async (request, reply) => {
    const input = batchReserveSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '请检查并明确确认规划项目' } });
    try { return service.reserveBatch({ confirmed: true, groups: input.data.groups.map(group => ({ ...group,
      rows: group.rows.map(row => ({ ...row, expectedFullCode: row.expectedFullCode ?? '', fingerprint: row.fingerprint ?? '' })) })) }); }
    catch (error) { return sendPlanningError(error, reply); }
  });
  app.get('/api/planning/white-bases', async (request, reply) => {
    const id = z.coerce.number().int().positive();
    const input = z.object({ productId: id, projectItemId: id, appearanceId: id.optional(),
      mainCategoryId: id.optional(), appearanceVersionId: id.optional() }).safeParse(request.query);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '请选择产品及项目' } });
    try { return { items: service.listWhiteBases(input.data) }; }
    catch (error) { return sendPlanningError(error, reply); }
  });
  if (draftStore) {
    app.get('/api/planning/drafts/:mode', async (request, reply) => {
      const mode = draftModeSchema.safeParse((request.params as {mode:string}).mode);
      if (!mode.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '草稿模式无效' } });
      try { return draftStore.state(mode.data); }
      catch (error) { return sendPlanningError(error, reply); }
    });
    app.put('/api/planning/drafts/:mode', async (request, reply) => {
      const mode = draftModeSchema.safeParse((request.params as {mode:string}).mode);
      const input = z.object({ input: planningDraftInputSchema, expectedRevision: expectedRevisionSchema }).safeParse(request.body);
      if (!mode.success || !input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '草稿数据无效' } });
      try { return { draft: draftStore.save(mode.data, input.data.input, input.data.expectedRevision) }; }
      catch (error) { return sendPlanningError(error, reply); }
    });
    app.delete('/api/planning/drafts/:mode', async (request, reply) => {
      const mode = draftModeSchema.safeParse((request.params as {mode:string}).mode);
      const input = z.object({ expectedRevision: expectedRevisionSchema }).safeParse(request.body ?? {});
      if (!mode.success || !input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '草稿数据无效' } });
      try { return { deleted: true, revision: draftStore.delete(mode.data, input.data.expectedRevision) }; }
      catch (error) { return sendPlanningError(error, reply); }
    });
  }

}
