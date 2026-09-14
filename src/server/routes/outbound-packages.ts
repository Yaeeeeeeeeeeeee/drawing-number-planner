import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { OutboundPackageError, type OutboundPackageService } from '../../core/outbound/outbound-package-service.js';
import { FileError } from '../../core/files/file-errors.js';

const previewSchema = z.object({
  productId: z.number().int().positive(),
  selectedMaterialBatchId: z.number().int().positive(),
  materialType: z.enum(['initial', 'update']),
  packageMode: z.enum(['change_only', 'current_complete']),
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

export function registerOutboundPackageRoutes(app: FastifyInstance, service: OutboundPackageService): void {
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
