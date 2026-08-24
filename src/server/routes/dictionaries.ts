import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { DictionaryError, type DictionaryService } from '../../core/dictionaries/dictionary-service.js';
import { dictionaryTypes } from '../../core/dictionaries/dictionary-types.js';

const typeSchema = z.enum(dictionaryTypes);
const createSchema = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), parentId: z.number().int().positive().optional() });

export function registerDictionaryRoutes(app: FastifyInstance, service: DictionaryService): void {
  const sendDomainError = (error: unknown, reply: FastifyReply) => {
    if (error instanceof DictionaryError) {
      const status = error.code === 'DUPLICATE_CODE' || error.code === 'DICTIONARY_ITEM_REFERENCED' ? 409 : 400;
      return reply.code(status).send({ error: { code: error.code, message: error.message } });
    }
    throw error;
  };

  app.get('/api/dictionaries/:type', async (request, reply) => {
    const parsed = z.object({ type: typeSchema }).safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '无效字典类型' } });
    const query = z.object({ includeInactive: z.string().optional() }).parse(request.query);
    return { items: service.list({ type: parsed.data.type, includeInactive: query.includeInactive === 'true' }) };
  });

  app.post('/api/dictionaries/:type', async (request, reply) => {
    const params = z.object({ type: typeSchema }).safeParse(request.params);
    const body = createSchema.safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '字典数据不完整' } });
    try {
      return reply.code(201).send(service.create({ type: params.data.type, ...body.data }));
    } catch (error) {
      return sendDomainError(error, reply);
    }
  });

  app.patch('/api/dictionaries/items/:id', async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    const body = z.object({ name: z.string().trim().min(1) }).safeParse(request.body);
    if (!params.success || !body.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '字典数据不完整' } });
    try { return service.updateName(params.data.id, body.data.name); }
    catch (error) { return sendDomainError(error, reply); }
  });

  app.post('/api/dictionaries/items/:id/deactivate', async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).safeParse(request.params);
    if (!params.success) return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '无效字典编号' } });
    try { return service.deactivate(params.data.id); }
    catch (error) { return sendDomainError(error, reply); }
  });
}
