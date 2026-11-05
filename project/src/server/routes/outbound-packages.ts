import { BatchWorkflowError } from '../../core/outbound/outbound-batch-workflow.js';
import { BomError } from '../../core/bom/bom-errors.js';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { OutboundPackageError, type OutboundPackageService } from '../../core/outbound/outbound-package-service.js';
import { FileError } from '../../core/files/file-errors.js';
import type { TaskRegistry } from '../../core/tasks/task-registry.js';

const previewSchema = z.object({
  regeneratedFromPackageId:z.number().int().positive().optional(),workflowVersion:z.literal(2).optional(),extraPdfFileIds:z.array(z.number().int().positive()).max(10000).optional(),baselineBatchId:z.number().int().positive().optional(),baselineConfirmationReason:z.string().trim().min(5).max(2000).optional(),fileConfirmations:z.array(z.object({pdfFileId:z.number().int().positive(),reason:z.string().trim().min(5).max(2000),contentSha256:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict()).max(10000).optional(),
  appearanceVersionId:z.number().int().positive().optional(), bomVersionId:z.number().int().positive().optional(),
  productId: z.number().int().positive(),
  selectedMaterialBatchId: z.number().int().positive(),
  materialType: z.enum(['initial', 'update']),
  packageMode: z.enum(['change_only', 'current_complete']),
  bomSelections: z.record(z.string().regex(/^[1-9]\d*$/), z.number().int().positive()).optional(),
}).strict();
const createSchema = previewSchema.extend({
  previewToken: z.string().min(1).max(200),
  selectedPdfFileIds: z.array(z.number().int().positive()).max(10_000),
}).strict();

function invalid(reply: FastifyReply) {
  return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: '外发打包条件不完整' } });
}

function sendError(error: unknown, reply: FastifyReply) {
  if(error instanceof BatchWorkflowError)return reply.code(409).send({error:{code:error.code,message:error.message}});
  if(error instanceof BomError)return reply.code(422).send({error:{code:error.code,message:error.message}});
  if (error instanceof FileError) {
    return reply.code(400).send({ error: { code: error.code, message: error.message } });
  }
  if (error instanceof OutboundPackageError) {
    const status = error.code === 'PRODUCT_NOT_FOUND' ? 404
      : ['PREVIEW_STALE', 'PACKAGE_HAS_BLOCKERS', 'DUPLICATE_ACTUAL_PATH', 'OUTPUT_ALREADY_EXISTS',
        'ARCHIVE_NAME_CONFLICT'].includes(error.code) ? 409 : 400;
    return reply.code(status).send({ error: { code: error.code, message: error.message } });
  }
  throw error;
}

export function registerOutboundPackageRoutes(app: FastifyInstance, service: OutboundPackageService, tasks?: TaskRegistry): void {
  app.get('/api/outbound-batch-scopes',async(request,reply)=>{
    const query=z.object({productId:z.coerce.number().int().positive(),appearanceVersionId:z.coerce.number().int().positive().optional()}).strict().safeParse(request.query);if(!query.success)return invalid(reply);return service.batchScopes(query.data.productId,query.data.appearanceVersionId);
  });
  app.patch('/api/outbound-batch-scopes/:id',async(request,reply)=>{
    const params=z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);const body=z.object({appearanceVersionId:z.number().int().positive(),completeness:z.enum(['pending','complete','partial']),baselineBatchId:z.number().int().positive().nullable().optional(),revision:z.number().int().nonnegative(),reason:z.string().min(5).max(2000),confirmed:z.literal(true)}).strict().safeParse(request.body);if(!params.success||!body.success)return invalid(reply);try{return service.setBatchScope(params.data.id,body.data);}catch(error){return sendError(error,reply);}
  });
  app.get('/api/outbound-packages', async (request, reply) => {
    const query = z.object({ productId: z.coerce.number().int().positive().optional(),brand:z.string().max(500).optional(),model:z.string().max(500).optional(),sku:z.string().max(500).optional(),
      appearanceVersionId:z.coerce.number().int().positive().optional(),batchId:z.coerce.number().int().positive().optional(),materialType:z.enum(['initial','update']).optional(),
      dateFrom:z.iso.date().optional(),dateTo:z.iso.date().optional() }).strict().safeParse(request.query);
    if (!query.success || query.data.dateFrom && query.data.dateTo && query.data.dateFrom>query.data.dateTo) return invalid(reply);
    const {productId,...filters}=query.data;return service.listCompleted(productId,filters);
  });
  app.get('/api/outbound-packages/:id',async(request,reply)=>{const params=z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);if(!params.success)return invalid(reply);try{return service.historyDetail(params.data.id);}catch(error){return sendError(error,reply);}});
  app.post('/api/outbound-packages/:id/regeneration-preview',async(request,reply)=>{
    const params=z.object({id:z.coerce.number().int().positive()}).safeParse(request.params);
    if(!params.success)return invalid(reply);
    try{return service.prepareRegeneration(params.data.id);}catch(error){return sendError(error,reply);}
  });
  tasks?.register('outbound_package', (payload, context) => {
    const body = createSchema.safeParse(payload);
    if (!body.success) throw new OutboundPackageError('INVALID_SELECTION', '外发打包条件不完整');
    return service.createPackage(body.data, { signal: context.signal, taskId: context.id,
      onProgress: (processed, total, message) => context.report({ processed, total, phase: 'archiving', message }),
      onFinalizing: () => context.beginFinalizing() });
  });
  app.post('/api/outbound-packages/preview', async (request, reply) => {
    const body = previewSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    try { return service.previewPackage(body.data); }
    catch (error) { return sendError(error, reply); }
  });

  app.post('/api/outbound-packages/preflight',async(request,reply)=>{
    const body=createSchema.safeParse(request.body);if(!body.success)return invalid(reply);
    try{return service.preflightPackage(body.data);}catch(error){return sendError(error,reply);}
  });

  app.post('/api/outbound-packages', async (request, reply) => {
    const body = createSchema.safeParse(request.body);
    if (!body.success) return invalid(reply);
    try { return reply.code(201).send(await service.createPackage(body.data)); }
    catch (error) { return sendError(error, reply); }
  });
}
