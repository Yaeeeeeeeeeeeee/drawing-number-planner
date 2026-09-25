import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { OutboundPackageError, type OutboundPackageService } from '../../core/outbound/outbound-package-service.js';
import { FileError } from '../../core/files/file-errors.js';
import type { TaskRegistry } from '../../core/tasks/task-registry.js';

const previewSchema = z.object({
  productId: z.number().int().positive(),
  selectedMaterialBatchId: z.number().int().positive(),
  materialType: z.enum(['initial', 'update']),
  packageMode: z.enum(['change_only', 'current_complete']),
  bomSelections: z.record(z.string().regex(/^[1-9]\d*$/), z.number().int().positive()).optional(),
}).strict();
const createSchema = previewSchema.extend({
  previewToken: z.string().min(1).max(200),
  selectedPdfFileIds: z.array(z.number().int().positive()).max(10_000),
}).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '外发打包条件不完整' } });
}

function sendError(error: unknown, reply: FastifyReply) {
  if (error instanceof FileError) {
    return reply.code(400).send({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof OutboundPackageError) {
    const status = error.code === 'PRODUCT_NOT_FOUND' ? 404
      : ['PREVIEW_STALE', 'PACKAGE_HAS_BLOCKERS', 'DUPLICATE_ACTUAL_PATH', 'OUTPUT_ALREADY_EXISTS',
        'ARCHIVE_NAME_CONFLICT'].includes(error.code) ? 409 : 400;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export function registerOutboundPackageRoutes(app: FastifyInstance, service: OutboundPackageService, tasks?: TaskRegistry): void {
  app.get('/api/outbound-packages', async (request, reply) => {
    const query = z.object({ productId: z.coerce.number().int().positive() }).strict().safeParse(request.query);
    if (!query.success) return invalid(reply);
    return service.listCompleted(query.data.productId);
  });
  tasks?.register('outbound_package', (payload, context) => {
    const body = createSchema.safeParse(payload);
    if (!body.success) throw new OutboundPackageError('INVALID_SELECTION', '外发打包条件不完整');
    return service.createPackage(body.data, { signal: context.signal, taskId: context.id,
      onProgress: (processed, total, message) => context.report({ processed, total, phase: 'archiving', message }),
      onFinalizing: () => context.beginFinalizing() });
  });
  app.post('/api/outbound-packages/preview', async (request, reply) => {
    const body = previewSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    try { return service.previewPackage(body.data); }
    catch (error) { return sendError(error, reply); }
  });

  app.post('/api/outbound-packages', async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    try { return reply.code(201).send(await service.createPackage(body.data)); }
    catch (error) { return sendError(error, reply); }
  });
}
