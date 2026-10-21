import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { FileError } from '../../core/files/file-errors.js';
import { FILE_INDEX_CLEAR_CONFIRMATION, type FileService } from '../../core/files/file-service.js';
import type { TaskRegistry } from '../../core/tasks/task-registry.js';

const settingsSchema = z.object({ workspaceRoot: z.string().trim().min(1).max(2000) }).strict();
const emptyBodySchema = z.object({}).strict();
const cleanupSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(500)
    .refine((ids) => new Set(ids).size === ids.length),
}).strict();
const searchSchema = z.object({
  managementState: z.enum(['included', 'ignored', 'needs_review', 'all']).optional(),
  keyword: z.string().max(500).optional(),
  productId: z.coerce.number().int().positive().optional(),
  appearanceVersionId: z.coerce.number().int().positive().optional(),
  materialBatchId: z.coerce.number().int().positive().optional(),
  productCategory: z.string().min(1).max(500).optional(),
  unassociatedProduct: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  matchStatus: z.enum(['matched', 'pending', 'unmatched', 'conflict']).optional(),
  conversionType: z.enum(['source', 'outlined']).optional(),
  presence: z.enum(['present', 'missing', 'all']).optional(),
  page: z.coerce.number().int().positive().optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
}).strict();
const navigationSchema = searchSchema.pick({ managementState: true, keyword: true, matchStatus: true, conversionType: true, presence: true }).strict();
const clearIndexSchema = z.object({ confirmation: z.string() }).strict();
const scanIdSchema = z.object({ id: z.coerce.number().int().positive() }).strict();

function sendFileError(reply: FastifyReply, error: unknown) {
  if (!(error instanceof FileError)) throw error;
  const status = error.code === 'SCAN_IN_PROGRESS' ? 409 : 422;
  return reply.code(status).send({ error: { code: error.code, message: error.message } });
}

export function registerFileRoutes(app: FastifyInstance, service: FileService, tasks?: TaskRegistry): void {
  tasks?.register('workspace_scan', (payload, context) => {
    const input = emptyBodySchema.safeParse(payload ?? {});
    if (!input.success) throw Object.assign(new Error('扫描请求不应包含额外参数'), { code: 'INVALID_REQUEST' });
    return service.scan(context);
  });
  tasks?.register('index_clear', async (payload, context) => {
    const input = clearIndexSchema.safeParse(payload);
    if (!input.success) throw Object.assign(new Error('清空资料库索引请求无效'), { code: 'INVALID_REQUEST' });
    if (input.data.confirmation !== FILE_INDEX_CLEAR_CONFIRMATION) {
      throw new FileError('INVALID_CLEAR_INDEX_CONFIRMATION', '请准确输入“清空资料库索引”后再执行');
    }
    context.report({ processed: 0, total: 1, phase: 'preparing', message: '正在核对清理范围' });
    // Yield a short cooperative window so a cancel request can arrive before the destructive transaction starts.
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    context.throwIfCancelled(); context.beginFinalizing();
    return service.clearIndex(input.data.confirmation);
  });
  app.get('/api/files/settings', async (_request, reply) => {
    try { return service.getSettings(); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.put('/api/files/settings', async (request, reply) => {
    const input = settingsSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '资料根目录设置无效' } });
    try { return service.updateSettings(input.data); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.post('/api/files/scan', async (request, reply) => {
    const input = emptyBodySchema.safeParse(request.body ?? {});
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '扫描请求不应包含额外参数' } });
    try { return await service.scan(); }
    catch (error) { return sendFileError(reply, error); }
  });

  const managementSchema = cleanupSchema.extend({ action: z.enum(['clear', 'ignore', 'restore']) });
  app.post('/api/files/management/preview', async (request, reply) => {
    const input = managementSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: {code: 'INVALID_REQUEST', message: 'PDF 管理预览参数无效'} });
    try { return service.previewManagement(input.data); } catch (error) { return sendFileError(reply, error); }
  });
  app.post('/api/files/management/apply', async (request, reply) => {
    const input = managementSchema.extend({fingerprint: z.string().length(64), confirmation: z.string()}).safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: {code: 'INVALID_REQUEST', message: 'PDF 管理确认参数无效'} });
    try { return service.applyManagement(input.data); } catch (error) { return sendFileError(reply, error); }
  });

  app.post('/api/files/cleanup', async (request, reply) => {
    const input = cleanupSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'PDF 索引清理请求无效' } });
    try { return service.cleanup(input.data.ids); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.get('/api/files/index/clear-preview', async (_request, reply) => {
    try { return service.clearIndexPreview(); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.post('/api/files/index/clear', async (request, reply) => {
    const input = clearIndexSchema.safeParse(request.body);
    if (!input.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '清空资料库索引请求无效' } });
    try { return service.clearIndex(input.data.confirmation); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.get('/api/files/scans/latest', async (_request, reply) => {
    try { return service.latestScan(); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.get('/api/files/scans/:id/changes', async (request, reply) => {
    const params = scanIdSchema.safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '扫描记录编号无效' } });
    try {
      const result = service.scanChanges(params.data.id);
      return result ?? reply.code(404).send({ error: { code: 'SCAN_NOT_FOUND', message: '扫描记录不存在' } });
    } catch (error) { return sendFileError(reply, error); }
  });

  app.get('/api/files/navigation', async (request, reply) => {
    const query = navigationSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'PDF 导航筛选条件无效' } });
    try { return service.navigation(query.data); }
    catch (error) { return sendFileError(reply, error); }
  });

  app.get('/api/files', async (request, reply) => {
    const query = searchSchema.safeParse(request.query);
    if (!query.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'PDF 文件筛选条件无效' } });
    try { return service.search(query.data); }
    catch (error) { return sendFileError(reply, error); }
  });
}
