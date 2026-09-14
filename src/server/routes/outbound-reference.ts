import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { OutboundReferenceError, type OutboundReferenceService } from '../../core/outbound/outbound-reference-service.js';

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const templateIdSchema = z.object({ templateId: z.coerce.number().int().positive() });
const statusQuerySchema = z.object({ status: z.enum(['active', 'inactive', 'all']).optional() });
const contactSchema = z.object({
  company: z.string().trim().min(1), contactName: z.string().trim().min(1), email: z.string().trim().email(),
  defaultRecipientType: z.enum(['to', 'cc']), notes: z.string().nullable().optional(),
}).strict();
const templateSchema = z.object({
  key: z.string().trim().min(1), name: z.string().trim().min(1), materialType: z.enum(['initial', 'update']),
  subjectTemplate: z.string().trim().min(1), bodyTemplate: z.string().trim().min(1),
}).strict();
const blockCreateSchema = z.object({
  key: z.string().trim().min(1), name: z.string().trim().min(1), bodyTemplate: z.string().trim().min(1),
  displayOrder: z.number().int().nonnegative(),
}).strict();
const blockUpdateSchema = blockCreateSchema.omit({ key: true });
const signatureSchema = z.object({
  name: z.string().trim().min(1), content: z.string().trim().min(1), isDefault: z.boolean(),
}).strict();
const renderSchema = z.object({ variables: z.record(z.string(), z.string()) }).strict();

function invalid(reply: FastifyReply, message: string) {
  return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message } });
}

function sendReferenceError(error: unknown, reply: FastifyReply) {
  if (error instanceof OutboundReferenceError) {
    const status = error.code === 'NOT_FOUND' ? 404
      : ['DUPLICATE_EMAIL', 'DUPLICATE_KEY', 'DUPLICATE_BLOCK_KEY', 'REFERENCE_DATA_REFERENCED'].includes(error.code) ? 409 : 400;
    return reply.code(status).send({ error: { code: error.code, message: error.message,
      ...(error.referenceSummary ? { referenceSummary: error.referenceSummary } : {}),
      ...(error.variableNames ? { variableNames: error.variableNames } : {}) } });
  }
  throw error;
}

export function registerOutboundReferenceRoutes(app: FastifyInstance, service: OutboundReferenceService): void {
  app.get('/api/outbound-reference/contacts', async (request, reply) => {
    const query = statusQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(reply, '外发联系人筛选条件无效');
    return { items: service.listContacts(query.data.status ?? 'all') };
  });
  app.get('/api/outbound-reference/contacts/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params);
    if (!params.success) return invalid(reply, '外发联系人编号无效');
    try { return service.getContact(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/contacts', async (request, reply) => {
    const body = contactSchema.safeParse(request.body);
    if (!body.success) return invalid(reply, '外发联系人数据不完整');
    try { return reply.code(201).send(service.createContact(body.data)); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.put('/api/outbound-reference/contacts/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const body = contactSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply, '外发联系人数据不完整');
    try { return service.updateContact(params.data.id, body.data); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/contacts/:id/activate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '外发联系人编号无效');
    try { return service.activateContact(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/contacts/:id/deactivate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '外发联系人编号无效');
    try { return service.deactivateContact(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.delete('/api/outbound-reference/contacts/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '外发联系人编号无效');
    try { return service.deleteContact(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });

  app.get('/api/outbound-reference/templates', async (request, reply) => {
    const query = statusQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(reply, '邮件模板筛选条件无效');
    return { items: service.listTemplates(query.data.status ?? 'all') };
  });
  app.get('/api/outbound-reference/templates/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件模板编号无效');
    try { return service.getTemplate(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/templates', async (request, reply) => {
    const body = templateSchema.safeParse(request.body); if (!body.success) return invalid(reply, '邮件模板数据不完整');
    try { return reply.code(201).send(service.createTemplate(body.data)); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.put('/api/outbound-reference/templates/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const body = templateSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply, '邮件模板数据不完整');
    try { return service.updateTemplate(params.data.id, body.data); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/templates/:id/activate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件模板编号无效');
    try { return service.activateTemplate(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/templates/:id/deactivate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件模板编号无效');
    try { return service.deactivateTemplate(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.delete('/api/outbound-reference/templates/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件模板编号无效');
    try { return service.deleteTemplate(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/templates/:id/render', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const body = renderSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply, '邮件模板渲染数据不完整');
    try { return service.renderTemplate(params.data.id, body.data.variables); }
    catch (error) { return sendReferenceError(error, reply); }
  });

  app.get('/api/outbound-reference/templates/:templateId/blocks', async (request, reply) => {
    const params = templateIdSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件模板编号无效');
    try { return { items: service.listTemplateBlocks(params.data.templateId) }; }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/templates/:templateId/blocks', async (request, reply) => {
    const params = templateIdSchema.safeParse(request.params); const body = blockCreateSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply, '邮件附加段落数据不完整');
    try { return reply.code(201).send(service.createTemplateBlock({ templateId: params.data.templateId, ...body.data })); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.put('/api/outbound-reference/blocks/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const body = blockUpdateSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply, '邮件附加段落数据不完整');
    try { return service.updateTemplateBlock(params.data.id, body.data); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/blocks/:id/activate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件附加段落编号无效');
    try { return service.activateTemplateBlock(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/blocks/:id/deactivate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件附加段落编号无效');
    try { return service.deactivateTemplateBlock(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.delete('/api/outbound-reference/blocks/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件附加段落编号无效');
    try { return service.deleteTemplateBlock(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });

  app.get('/api/outbound-reference/signatures', async (request, reply) => {
    const query = statusQuerySchema.safeParse(request.query);
    if (!query.success) return invalid(reply, '邮件签名筛选条件无效');
    return { items: service.listSignatures(query.data.status ?? 'all') };
  });
  app.get('/api/outbound-reference/signatures/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件签名编号无效');
    try { return service.getSignature(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/signatures', async (request, reply) => {
    const body = signatureSchema.safeParse(request.body); if (!body.success) return invalid(reply, '邮件签名数据不完整');
    try { return reply.code(201).send(service.createSignature(body.data)); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.put('/api/outbound-reference/signatures/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); const body = signatureSchema.safeParse(request.body);
    if (!params.success || !body.success) return invalid(reply, '邮件签名数据不完整');
    try { return service.updateSignature(params.data.id, body.data); }
    catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/signatures/:id/activate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件签名编号无效');
    try { return service.activateSignature(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.post('/api/outbound-reference/signatures/:id/deactivate', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件签名编号无效');
    try { return service.deactivateSignature(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
  app.delete('/api/outbound-reference/signatures/:id', async (request, reply) => {
    const params = idSchema.safeParse(request.params); if (!params.success) return invalid(reply, '邮件签名编号无效');
    try { return service.deleteSignature(params.data.id); } catch (error) { return sendReferenceError(error, reply); }
  });
}

