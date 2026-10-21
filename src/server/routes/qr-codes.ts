import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import type { QrManualService } from '../../core/qr/qr-manual-service.js';
import { QrManualError } from '../../core/qr/qr-manual-validation.js';
import { QrError } from '../../core/qr/qr-errors.js';
import type { QrService } from '../../core/qr/qr-service.js';

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const filtersSchema = z.object({
  appearanceVersionId: z.coerce.number().int().positive().optional(),
  productId: z.coerce.number().int().positive().optional(),
  purposeId: z.coerce.number().int().positive().optional(),
  status: z.enum(['active', 'inactive', 'all']).optional(),
  search: z.string().trim().max(500).optional(),
  productCategory: z.string().trim().max(200).optional(),
  fileStatus: z.enum(['present', 'missing', 'none', 'all']).optional(),
}).strict();
const updateSchema = z.object({ name: z.string().trim().min(1).max(500), targetUrl: z.string().trim().max(2000).nullable() }).strict();
const createSchema = updateSchema.extend({ appearanceVersionId: z.number().int().positive().nullable().optional(), productId: z.number().int().positive(), purposeId: z.number().int().positive(),
  status: z.enum(['active', 'inactive']), qrFileId: z.number().int().positive().nullable().optional() }).strict();
const createPurposeSchema = z.object({ key: z.string().trim().min(1).max(100), englishName: z.string().trim().min(1).max(200),
  displayName: z.string().trim().min(1).max(200), defaultForAll: z.boolean(),
  productCategories: z.array(z.string().trim().min(1).max(200)).max(100) }).strict();
const associateFileSchema = z.object({ qrFileId: z.coerce.number().int().positive() }).strict();

function sendQrError(reply: FastifyReply, error: unknown) {
  if (error instanceof QrManualError) return reply.code(['RECORD_CHANGED','FILE_CHANGED'].includes(error.code) ? 409 : 400).send({error:{code:error.code,message:error.message}});
  if (!(error instanceof QrError)) throw error;
  const status = ['NOT_FOUND', 'PURPOSE_NOT_FOUND'].includes(error.code) ? 404
    : ['DUPLICATE_PURPOSE', 'DUPLICATE_PRODUCT_PURPOSE', 'QR_CODE_REFERENCED'].includes(error.code) ? 409 : 400;
  return reply.code(status).send({ error: { code: error.code, message: error.message,
    ...(error.referenceSummary ? { referenceSummary: error.referenceSummary } : {}) } });
}

export function registerQrCodeRoutes(app: FastifyInstance, service: QrService, manual?: QrManualService): void {
  if (manual) {
    app.get('/api/qr-codes/:id/manual-history', async (request, reply) => {
      const params=idSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'二维码编号无效'}});
      try { return manual.history(params.data.id); } catch(error) { return sendQrError(reply,error); }
    });
    app.delete('/api/qr-codes/:id/manual-link', async (request, reply) => {
      const params=idSchema.safeParse(request.params);const body=z.object({revision:z.string().min(1)}).strict().safeParse(request.body);
      if (!params.success||!body.success) return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'解除关联参数无效'}});
      try { return manual.unlink(params.data.id,body.data.revision); } catch(error) { return sendQrError(reply,error); }
    });
  }
  app.get('/api/qr-purposes', async () => service.listPurposes());
  app.post('/api/qr-purposes', async (request, reply) => {
    const input = createPurposeSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码用途数据无效' } });
    try { return reply.code(201).send(service.createPurpose(input.data)); } catch (error) { return sendQrError(reply, error); }
  });
  app.get('/api/qr-files/pending', async (request, reply) => {
    const query = z.object({ productId: z.coerce.number().int().positive(), purposeId: z.coerce.number().int().positive() })
      .strict().safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '待确认文件筛选条件无效' } });
    try { return service.listPendingFiles(query.data.productId, query.data.purposeId); }
    catch (error) { return sendQrError(reply, error); }
  });
  app.post('/api/qr-codes', async (request, reply) => {
    const input = createSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码数据无效' } });
    try { return reply.code(201).send(service.create(input.data)); } catch (error) { return sendQrError(reply, error); }
  });
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
  app.delete('/api/qr-codes/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码编号无效' } });
    try { return service.delete(params.data.id); } catch (error) { return sendQrError(reply, error); }
  });
  app.post('/api/qr-codes/:id/associate-file', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const input = associateFileSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码文件关联数据无效' } });
    try { return service.associateFile(params.data.id, input.data.qrFileId); } catch (error) { return sendQrError(reply, error); }
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
