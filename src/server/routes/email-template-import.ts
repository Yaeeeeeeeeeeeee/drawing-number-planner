import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { PlannerDatabase } from '../../db/database.js';
import { confirmEmailTemplates, EmailTemplateImportError, parseEmailTemplateWorkbook, previewEmailTemplates } from '../../core/import/email-template-import.js';
import type { EmailTemplateImportReport, EmailTemplateImportSelection } from '../../core/import/email-template-import-types.js';
import { OutboundReferenceError } from '../../core/outbound/outbound-reference-service.js';
import { ensureMultipart } from '../multipart.js';

const text = z.string().max(200000);
const rowSchema = z.object({ id: text, action: z.enum(['create', 'update', 'skip']), confirmed: z.boolean(),
  contactsConfirmed: z.boolean(), historyReviewed: z.boolean(), manufacturer: text, materialType: z.enum(['initial', 'update']),
  scenario: text, name: text, subjectTemplate: text, bodyTemplate: text, expectedFingerprint: z.string().optional(),
  contacts: z.array(z.object({ company: text, contactName: text, email: text, defaultRecipientType: z.enum(['to', 'cc']),
    resolution: z.enum(['import', 'reuse', 'skip']).optional(), existingId: z.number().int().positive().optional(), expectedFingerprint: z.string().optional() })).max(200) });
const signatureSchema = z.object({ id: text, action: z.enum(['reuse', 'create', 'skip']), confirmed: z.boolean(), existingId: z.number().int().positive().optional(), expectedFingerprint: z.string().optional(), name: text.optional(), content: text.optional() });
const confirmSchema = z.object({ previewId: z.string().uuid(), rows: z.array(rowSchema).max(1000), signatures: z.array(signatureSchema).max(100).optional() });

export async function registerEmailTemplateImportRoutes(app: FastifyInstance, database: PlannerDatabase): Promise<void> {
  ensureMultipart(app);
  const previews = new Map<string, { report: EmailTemplateImportReport; created: number }>();
  const lifetime = 30 * 60 * 1000;
  const sendError = (error: unknown, reply: FastifyReply) => {
    if (error instanceof EmailTemplateImportError || error instanceof OutboundReferenceError) {
      const status = error.code === 'BACKUP_FAILED' ? 503 : error.code === 'UNSUPPORTED_LEGACY_XLS' ? 415 : error.code === 'INVALID_WORKBOOK' ? 400 : 409;
      return reply.code(status).send({ error: { code: error.code, message: error.message } });
    }
    throw error;
  };
  app.post('/api/import/email-templates/preview', async (request, reply) => {
    const upload = await request.file();
    if (!upload) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '请选择 Excel 邮件模板文件' } });
    if (/\.xls$/iu.test(upload.filename)) return reply.code(415).send({ error: { code: 'UNSUPPORTED_LEGACY_XLS', message: '旧版 .xls 文件需先另存为 .xlsx 后再导入' } });
    if (!/\.xlsx$/iu.test(upload.filename)) return reply.code(415).send({ error: { code: 'INVALID_WORKBOOK', message: '请选择 .xlsx 文件' } });
    try {
      for (const [id, preview] of previews) if (Date.now() - preview.created > lifetime) previews.delete(id);
      while (previews.size >= 20) previews.delete(previews.keys().next().value!);
      const report = previewEmailTemplates(await parseEmailTemplateWorkbook(await upload.toBuffer()), database);
      const previewId = crypto.randomUUID(); previews.set(previewId, { report, created: Date.now() });
      return { previewId, report };
    } catch (error) { return sendError(error, reply); }
  });
  app.post('/api/import/email-templates/confirm', async (request, reply) => {
    const parsed = confirmSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '导入确认字段不完整，请重新预览并核对' } });
    const preview = previews.get(parsed.data.previewId);
    if (!preview || Date.now() - preview.created > lifetime) {
      previews.delete(parsed.data.previewId);
      return reply.code(404).send({ error: { code: 'PREVIEW_NOT_FOUND', message: '邮件模板预览已失效，请重新上传' } });
    }
    try {
      const selections = parsed.data.rows.map(row => ({ ...preview.report.candidates.find(item => item.id === row.id), ...row })) as EmailTemplateImportSelection[];
      const result = confirmEmailTemplates(preview.report, selections, database, parsed.data.signatures);
      previews.delete(parsed.data.previewId); return result;
    } catch (error) { return sendError(error, reply); }
  });
}
