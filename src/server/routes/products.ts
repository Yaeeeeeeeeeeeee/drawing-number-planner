import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { ProductError, type ProductService } from '../../core/products/product-service.js';
import { ProductCleanupError, type ProductCleanupService } from '../../core/products/product-cleanup-service.js';

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const inputSchema = z.object({
  sku: z.string().trim().min(1),
  brandId: z.number().int().positive(),
  productSizeId: z.number().int().positive(),
  defaultAppearanceId: z.number().int().positive().nullable().optional(),
  model: z.string().trim().min(1),
  productCategory: z.string().trim().min(1),
  referenceProductId: z.number().int().positive().nullable().optional(),
});
const exactNonBlank = z.string().min(1).refine((value) => value.trim().length > 0);
const historicalCandidateSchema = z.object({
  productCategory: exactNonBlank,
  sku: exactNonBlank,
  model: exactNonBlank,
  brandId: z.number().int().positive(),
  productSizeId: z.number().int().positive(),
  defaultAppearanceId: z.number().int().positive(),
}).strict();

function sendProductError(error: unknown, reply: FastifyReply) {
  if (error instanceof ProductCleanupError) {
    return reply.code(error.code === 'PRODUCT_NOT_FOUND' ? 404 : error.code === 'PRODUCT_CONFIRMATION_MISMATCH' ? 400 : 409)
      .send({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof ProductError) {
    const status = error.code === 'NOT_FOUND' ? 404 : ['DUPLICATE_MODEL', 'DUPLICATE_SKU', 'PRODUCT_REFERENCED'].includes(error.code) ? 409 : 400;
    return reply.code(status).send({ error: { code: error.code, message: error.message, ...(error.referenceSummary ? { referenceSummary: error.referenceSummary } : {}) } });
  }
  throw error;
}

export function registerProductRoutes(app: FastifyInstance, service: ProductService, cleanup?: ProductCleanupService): void {
  if (cleanup) {
    app.get('/api/products/:id/cleanup-preview', async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品编号无效' } });
      try { return cleanup.preview(params.data.id); } catch (error) { return sendProductError(error, reply); }
    });
    app.post('/api/products/:id/cleanup', async (request, reply) => {
      const params = idSchema.safeParse(request.params);
      const input = z.object({ confirmed: z.literal(true), confirmedModel: z.string().min(1), selection:z.object({
        occupancy:z.enum(['retain_occupied','release']),history:z.enum(['retain','purge']),expectedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),
        confirmedCodes:z.array(z.object({signedId:z.number().int().refine(value=>value!==0),confirmedCode:z.string().min(1)}).strict()).optional(),
        confirmedHistory:z.string().optional(),
      }).strict().optional() }).strict().safeParse(request.body);
      if (!params.success || !input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '请确认清理范围并输入产品型号' } });
      try { return cleanup.cleanup(params.data.id, input.data); } catch (error) { return sendProductError(error, reply); }
    });
  }
  app.get('/api/products', async (request, reply) => {
    const query = z.object({
      search: z.string().optional(),
      brandId: z.coerce.number().int().positive().optional(),
      productCategory: z.string().trim().min(1).optional(),
      status: z.enum(['active', 'inactive', 'all']).optional(),
    }).safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品筛选条件无效' } });
    return service.list(query.data);
  });

  app.get('/api/products/historical-candidates', async () => service.listHistoricalCandidates());

  app.post('/api/products/historical-candidates/confirm', async (request, reply) => {
    const input = historicalCandidateSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '历史产品确认信息不完整' } });
    try { return reply.code(201).send(service.confirmHistoricalCandidate(input.data)); }
    catch (error) { return sendProductError(error, reply); }
  });

  app.get('/api/products/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品编号无效' } });
    try { return service.get(params.data.id); }
    catch (error) { return sendProductError(error, reply); }
  });

  app.post('/api/products', async (request, reply) => {
    const input = inputSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品数据不完整' } });
    try { return reply.code(201).send(service.create(input.data)); }
    catch (error) { return sendProductError(error, reply); }
  });

  app.put('/api/products/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    const input = inputSchema.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品数据不完整' } });
    try { return service.update(params.data.id, input.data); }
    catch (error) { return sendProductError(error, reply); }
  });

  app.post('/api/products/:id/deactivate', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品编号无效' } });
    try { return service.deactivate(params.data.id); }
    catch (error) { return sendProductError(error, reply); }
  });

  app.post('/api/products/:id/activate', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品编号无效' } });
    try { return service.activate(params.data.id); }
    catch (error) { return sendProductError(error, reply); }
  });

  app.delete('/api/products/:id', async (request, reply) => {
    if (cleanup) return reply.code(409).send({ error: { code: 'PRODUCT_CLEANUP_REQUIRED', message: '请使用产品删除检查与清理向导，确认影响范围后退出当前业务' } });
    const params = idSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品编号无效' } });
    try { return service.delete(params.data.id); }
    catch (error) { return sendProductError(error, reply); }
  });
}
