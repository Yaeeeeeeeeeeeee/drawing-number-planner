import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AppearanceError, type AppearanceService } from '../../core/products/appearance-service.js';
const id=z.coerce.number().int().positive();
const draft=z.object({appearanceId:id.nullable().optional(),label:z.string().trim().min(1),colorIds:z.array(id).optional(),predecessorId:id.nullable().optional()}).strict();
const merge=z.object({primaryProductId:id,aliasProductIds:z.array(id).min(1)}).strict();
function error(e:unknown,reply:FastifyReply){if(e instanceof AppearanceError)return reply.code(e.code==='NOT_FOUND'?404:e.code==='INVALID_INPUT'?400:409).send({error:{code:e.code,message:e.message}});throw e;}
export function registerAppearanceRoutes(app:FastifyInstance,service:AppearanceService):void {
 app.get('/api/products/:productId/appearances',async(req,reply)=>{const p=z.object({productId:id}).safeParse(req.params);if(!p.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return service.list(p.data.productId);}catch(e){return error(e,reply);}});
 app.post('/api/products/:productId/appearances',async(req,reply)=>{const p=z.object({productId:id}).safeParse(req.params),b=draft.safeParse(req.body);if(!p.success||!b.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return reply.code(201).send(service.createDraft(p.data.productId,b.data));}catch(e){return error(e,reply);}});
 app.get('/api/appearances/:id/resources',async(req,reply)=>{const p=z.object({id}).safeParse(req.params);if(!p.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return service.resources(p.data.id);}catch(e){return error(e,reply);}});
 app.get('/api/appearances/:id',async(req,reply)=>{const p=z.object({id}).safeParse(req.params);if(!p.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return service.get(p.data.id);}catch(e){return error(e,reply);}});
 app.put('/api/appearances/:id',async(req,reply)=>{const p=z.object({id}).safeParse(req.params),b=draft.extend({expectedRevision:z.number().int().nonnegative()}).safeParse(req.body);if(!p.success||!b.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return service.updateDraft(p.data.id,b.data);}catch(e){return error(e,reply);}});
 app.post('/api/appearances/:id/activate',async(req,reply)=>{const p=z.object({id}).safeParse(req.params),b=z.object({expectedRevision:z.number().int().nonnegative(),expectedIdentityRevision:z.number().int().nonnegative()}).strict().safeParse(req.body);if(!p.success||!b.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return service.activate(p.data.id,b.data);}catch(e){return error(e,reply);}});
 app.post('/api/products/merge-preview',async(req,reply)=>{const b=merge.safeParse(req.body);if(!b.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return service.mergePreview(b.data);}catch(e){return error(e,reply);}});
 app.post('/api/products/merge-confirm',async(req,reply)=>{const b=merge.extend({confirmed:z.literal(true),expectedFingerprint:z.string().regex(/^[a-f0-9]{64}$/),expectedRevision:z.number().int().nonnegative()}).safeParse(req.body);if(!b.success)return reply.code(400).send({error:{code:'INVALID_REQUEST'}});try{return service.mergeConfirm(b.data);}catch(e){return error(e,reply);}});
}
