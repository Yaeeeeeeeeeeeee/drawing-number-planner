import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { ExcelAuditError, auditWorkbook, includeDatabaseConflicts, type ImportAuditReport } from '../../core/import/excel-audit.js';
import { ExcelImportError, importApprovedRows } from '../../core/import/excel-import.js';
import { DictionaryError } from '../../core/dictionaries/dictionary-service.js';
import type { PlannerDatabase } from '../../db/database.js';
import { ensureMultipart } from '../multipart.js';

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

export async function registerImportRoutes(
  app: FastifyInstance,
  database: PlannerDatabase,
  createPreImportBackup: () => void,
): Promise<void> {
  const audits = new Map<string, { report: ImportAuditReport; createdAt: number }>();
  const auditLifetimeMs = 30 * 60 * 1000;
  ensureMultipart(app);

  app.post('/api/import/excel/audit', async (request, reply) => {
    const upload = await request.file();
    if (!upload) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '请选择 Excel 文件' } });
    }
    try {
      const now = Date.now();
      for (const [id, audit] of audits) if (now - audit.createdAt > auditLifetimeMs) audits.delete(id);
      while (audits.size >= 20) audits.delete(audits.keys().next().value!);
      const report = includeDatabaseConflicts(await auditWorkbook(await upload.toBuffer()), database);
      const auditId = crypto.randomUUID();
      audits.set(auditId, { report, createdAt: now });
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
    const audit = audits.get(parsed.data.auditId);
    if (!audit || Date.now() - audit.createdAt > auditLifetimeMs) {
      audits.delete(parsed.data.auditId);
      return reply.code(404).send({ error: { code: 'AUDIT_NOT_FOUND', message: '迁移检查已失效，请重新上传' } });
    }
    const report = audit.report;
    try {
      try {
        createPreImportBackup();
      } catch {
        return reply.code(503).send({ error: { code: 'BACKUP_FAILED', message: '导入前备份失败，未执行导入' } });
      }
      const result = importApprovedRows(report, parsed.data.selections, database);
      audits.delete(parsed.data.auditId);
      return result;
    } catch (error) {
      return sendImportError(error, reply);
    }
  });
}
