import type { FastifyInstance, FastifyReply } from 'fastify';
import { createWriteStream, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';

import { BomError } from '../../core/bom/bom-errors.js';
import type { BomItemInput, SaveBomInput } from '../../core/bom/bom-types.js';
import { FileError } from '../../core/files/file-errors.js';
import type { BomService } from '../../core/bom/bom-service.js';
import { ensureMultipart } from '../multipart.js';

const productQuery = z.object({ productId: z.coerce.number().int().positive() }).strict();
const candidateQuery = z.object({
  productId: z.coerce.number().int().positive(), projectItemId: z.coerce.number().int().positive(),
  usesWhiteMaterial: z.enum(['true', 'false']).transform((value) => value === 'true'),
  entryMode: z.enum(['current', 'historical']).default('current'),
}).strict();
const bomQuery = z.object({
  model: z.string().trim().optional(), businessChangeDate: z.string().trim().optional(),
  effectiveBatchRelativePath: z.string().trim().optional(), projectItemId: z.coerce.number().int().positive().optional(),
  fullCode: z.string().trim().optional(),
}).strict();
const itemSchema = z.object({
  projectItemId: z.number().int().positive(),
  drawingReference: z.discriminatedUnion('origin', [
    z.object({ origin: z.literal('planned'), drawingId: z.number().int().positive() }).strict(),
    z.object({ origin: z.literal('historical'), historicalDrawingId: z.number().int().positive() }).strict(),
  ]).optional(),
  drawingId: z.number().int().positive().optional(), usesWhiteMaterial: z.boolean(),
  effectiveBatchRelativePath: z.string().max(1000).optional(), effectiveBatchName: z.string().max(500).optional(),
  effectiveMaterialBatchId: z.number().int().positive().nullable().optional(), material: z.string().max(1000).optional(),
  dimensions: z.string().max(1000).optional(), position: z.string().max(1000).optional(), notes: z.string().max(1000).optional(),
  changeDetails: z.string().max(10000).optional(),
  assets: z.array(z.object({ role: z.enum(['image', 'diagram']), assetId: z.number().int().positive().optional(),
    reusePrevious: z.boolean().optional() }).strict()).max(2).optional(),
  qrCodeIds: z.array(z.number().int().positive()).max(100).optional(),
}).strict().refine((value) => Boolean(value.drawingReference) !== Boolean(value.drawingId));
const saveSchema = z.object({
  productId: z.number().int().positive(), businessChangeDate: z.string().trim(),
  entryMode: z.enum(['current', 'historical']).default('current'),
  expectedCurrentVersionId: z.number().int().positive().nullable(), notes: z.string().max(1000).optional(),
  items: z.array(itemSchema).max(500),
}).strict().refine((value) => new Set(value.items.map((item) => item.projectItemId)).size === value.items.length);
const versionParams = z.object({ id: z.coerce.number().int().positive() }).strict();
const deleteVersionSchema = z.object({ confirmed: z.boolean() }).strict();
const deleteProductSchema = z.object({ modelConfirmation: z.string() }).strict();

function sendBomError(reply: FastifyReply, error: unknown) {
  if (error instanceof FileError) return reply.code(422).send({ error: { code: 'ASSET_PATH_INVALID', message: error.message } });
  if (!(error instanceof BomError)) throw error;
  const status = error.code === 'BOM_STALE' ? 409
    : error.code === 'BOM_NOT_FOUND' || error.code === 'DRAWING_NOT_FOUND' || error.code === 'ASSET_NOT_FOUND' ? 404 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerBomRoutes(app: FastifyInstance, service: BomService): void {
  ensureMultipart(app);
  app.put('/api/boms/versions/:id', async (request, reply) => {
    const params = versionParams.safeParse(request.params);
    const body = z.object({ input: saveSchema, expectedRevision: z.number().int().nonnegative() }).strict().safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 编辑内容无效' } });
    const input: SaveBomInput = { ...body.data.input, items: body.data.input.items.map((item): BomItemInput => {
      const { drawingReference, drawingId, ...fields } = item;
      return drawingReference ? { ...fields, drawingReference } : { ...fields, drawingId: drawingId! };
    }) };
    try { return service.updateVersion(params.data.id, input, body.data.expectedRevision); }
    catch (error) { return sendBomError(reply, error); }
  });
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
  app.get('/api/boms/versions/:id/delete-preview', async (request, reply) => {
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 版本编号无效' } });
    try { return service.previewBomVersionDeletion(params.data.id); } catch (error) { return sendBomError(reply, error); }
  });
  app.get('/api/boms/versions/:id', async (request, reply) => {
    const params = versionParams.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 版本编号无效' } });
    try { return service.getVersion(params.data.id); } catch (error) { return sendBomError(reply, error); }
  });
  app.delete('/api/boms/versions/:id', async (request, reply) => {
    const params = versionParams.safeParse(request.params); const body = deleteVersionSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 删除确认无效' } });
    try { return service.deleteBomVersion(params.data.id, body.data.confirmed); } catch (error) { return sendBomError(reply, error); }
  });
  app.delete('/api/boms/products/:productId', async (request, reply) => {
    const params = productQuery.safeParse(request.params); const body = deleteProductSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '整型号 BOM 删除确认无效' } });
    try { return service.deleteProductBom(params.data.productId, body.data.modelConfirmation); } catch (error) { return sendBomError(reply, error); }
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
  app.post('/api/boms/material-batches/:id/relink', async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).strict().safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '资料批次编号无效' } });
    try { return service.relinkMaterialBatch(params.data.id); } catch (error) { return sendBomError(reply, error); }
  });
  app.post('/api/boms/assets', async (request, reply) => {
    let staging: string | null = null;
    try {
      const upload = await request.file();
      if (!upload) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '缺少 BOM 图片文件' } });
      const productField = upload.fields.productId;
      const productValue = !productField || Array.isArray(productField) || productField.type !== 'field' ? undefined : productField.value;
      const productId = z.coerce.number().int().positive().safeParse(productValue);
      if (!productId.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '产品编号无效' } });
      staging = mkdtempSync(join(tmpdir(), 'planner-bom-upload-'));
      const originalName = upload.filename || 'upload';
      const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
      const sourcePath = join(staging, `upload${extension}`);
      await pipeline(upload.file, createWriteStream(sourcePath, { flags: 'wx' }));
      if (upload.file.truncated) return reply.code(422).send({ error: { code: 'ASSET_TOO_LARGE', message: 'BOM 图片不能超过 10485760 字节' } });
      const size = (await import('node:fs')).statSync(sourcePath).size;
      if (size > 10 * 1024 * 1024) return reply.code(422).send({ error: { code: 'ASSET_TOO_LARGE', message: 'BOM 图片不能超过 10485760 字节' } });
      const asset = service.importAsset(productId.data, sourcePath, originalName);
      return reply.code(201).send({ asset });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT') {
        return reply.code(422).send({ error: { code: 'ASSET_TOO_LARGE', message: 'BOM 图片不能超过 10485760 字节' } });
      }
      return sendBomError(reply, error);
    } finally { if (staging) rmSync(staging, { recursive: true, force: true }); }
  });
  app.post('/api/boms/versions', async (request, reply) => {
    const input = saveSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'BOM 数据不完整或格式无效' } });
    const normalized: SaveBomInput = { ...input.data, items: input.data.items.map((item): BomItemInput => {
      const { drawingReference, drawingId, ...fields } = item;
      return drawingReference ? { ...fields, drawingReference } : { ...fields, drawingId: drawingId! };
    }) };
    try { return reply.code(201).send(service.saveVersion(normalized)); } catch (error) { return sendBomError(reply, error); }
  });
}
