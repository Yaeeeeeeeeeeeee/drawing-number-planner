import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { BomError } from '../../core/bom/bom-errors.js';
import type { BomService } from '../../core/bom/bom-service.js';

const productQuery = z.object({ productId: z.coerce.number().int().positive() }).strict();
const candidateQuery = z.object({
  productId: z.coerce.number().int().positive(), projectItemId: z.coerce.number().int().positive(),
  usesWhiteMaterial: z.enum(['true', 'false']).transform((value) => value === 'true'),
}).strict();
const bomQuery = z.object({
  model: z.string().trim().optional(), businessChangeDate: z.string().trim().optional(),
  effectiveBatchRelativePath: z.string().trim().optional(), projectItemId: z.coerce.number().int().positive().optional(),
  fullCode: z.string().trim().optional(),
}).strict();
const itemSchema = z.object({
  projectItemId: z.number().int().positive(), drawingId: z.number().int().positive(), usesWhiteMaterial: z.boolean(),
  effectiveBatchRelativePath: z.string().max(1000).optional(), effectiveBatchName: z.string().max(500).optional(),
  effectiveMaterialBatchId: z.number().int().positive().nullable().optional(), material: z.string().max(1000).optional(),
  dimensions: z.string().max(1000).optional(), position: z.string().max(1000).optional(), notes: z.string().max(1000).optional(),
  assets: z.array(z.object({ role: z.enum(['image', 'diagram']), assetId: z.number().int().positive().optional(),
    reusePrevious: z.boolean().optional() }).strict()).max(2).optional(),
  qrCodeIds: z.array(z.number().int().positive()).max(100).optional(),
}).strict();
const saveSchema = z.object({
  productId: z.number().int().positive(), businessChangeDate: z.string().trim(),
  expectedCurrentVersionId: z.number().int().positive().nullable(), notes: z.string().max(1000).optional(),
  items: z.array(itemSchema).max(500),
}).strict().refine((value) => new Set(value.items.map((item) => item.projectItemId)).size === value.items.length);

function sendBomError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof BomError)) throw error;
  const status = error.code === 'BOM_STALE' ? 409
    : error.code === 'BOM_NOT_FOUND' || error.code === 'DRAWING_NOT_FOUND' || error.code === 'ASSET_NOT_FOUND' ? 404 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerBomRoutes(app: FastifyInstance, service: BomService): void {
  app.get('/api/boms/query', async (request, reply) => {
    const query = bomQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 查询条件无效' } });
    return { items: service.queryVersions(query.data) };
  });
  app.get('/api/boms/current', async (request, reply) => {
    const query = productQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 查询条件无效' } });
    return { version: service.getCurrent(query.data.productId) };
  });
  app.get('/api/boms/versions', async (request, reply) => {
    const query = productQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 查询条件无效' } });
    return { items: service.listVersions(query.data.productId) };
  });
  app.get('/api/boms/versions/:id', async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).strict().safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 版本编号无效' } });
    try { return service.getVersion(params.data.id); } catch (error) { return sendBomError(reply, error); }
  });
  app.get('/api/boms/candidates', async (request, reply) => {
    const query = candidateQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '候选图号查询条件无效' } });
    try { return { items: service.listCandidates(query.data) }; } catch (error) { return sendBomError(reply, error); }
  });
  app.get('/api/boms/qr-candidates', async (request, reply) => {
    const query = productQuery.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '二维码查询条件无效' } });
    try { return { items: service.listActiveQrCandidates(query.data.productId) }; } catch (error) { return sendBomError(reply, error); }
  });
  app.post('/api/boms/versions', async (request, reply) => {
    const input = saveSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 数据不完整或格式无效' } });
    try { return reply.code(201).send(service.saveVersion(input.data)); } catch (error) { return sendBomError(reply, error); }
  });
}
