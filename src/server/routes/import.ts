import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { ExcelAuditError, auditWorkbook, type ImportAuditReport } from '../../core/import/excel-audit.js';
import { ExcelImportError, importApprovedRows } from '../../core/import/excel-import.js';
import { DictionaryError } from '../../core/dictionaries/dictionary-service.js';
import type { PlannerDatabase } from '../../db/database.js';

const confirmSchema = z.object({
  auditId: z.string().uuid(),
  selections: z.array(z.string().min(1)),
});

function sendImportError(error: unknown, reply: FastifyReply) {
  if (error instanceof ExcelAuditError) {
    const status = error.code === 'UNSUPPORTED_LEGACY_XLS' ? 415 : 400;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof ExcelImportError || error instanceof DictionaryError) {
    return reply.code(409).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export async function registerImportRoutes(app: FastifyInstance, database: PlannerDatabase): Promise<void> {
  const audits = new Map<string, ImportAuditReport>();
  await app.register(multipart, { limits: { files: 1, fileSize: 20 * 1024 * 1024 } });

  app.post('/api/import/excel/audit', async (request, reply) => {
    const upload = await request.file();
    if (!upload) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '请选择 Excel 文件' } });
    }
    try {
      const report = await auditWorkbook(await upload.toBuffer());
      const auditId = crypto.randomUUID();
      audits.set(auditId, report);
      return { auditId, report };
    } catch (error) {
      return sendImportError(error, reply);
    }
  });

  app.post('/api/import/excel/confirm', async (request, reply) => {
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '确认数据不完整' } });
    }
    const report = audits.get(parsed.data.auditId);
    if (!report) {
      return reply.code(404).send({ error: { code: 'AUDIT_NOT_FOUND', message: '迁移检查已失效，请重新上传' } });
    }
    try {
      const result = importApprovedRows(report, parsed.data.selections, database);
      audits.delete(parsed.data.auditId);
      return result;
    } catch (error) {
      return sendImportError(error, reply);
    }
  });
}
