// @vitest-environment node
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerOutboundReferenceRoutes } from '../../src/server/routes/outbound-reference';
let db: PlannerDatabase; let app: FastifyInstance;
const payload = { name: '首批完整交付', materialType: 'initial', manufacturer: '厂家A', scenario: '完整交付', subjectTemplate: '{{brand}}', bodyTemplate: '请查收 {{file_list}}' };
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); app = Fastify(); registerOutboundReferenceRoutes(app, new OutboundReferenceService(db)); });
afterEach(async () => { await app.close(); db.close(); });
it('creates and edits templates without requiring a visible code or signature', async () => {
  const created = await app.inject({ method: 'POST', url: '/api/outbound-reference/templates', payload });
  expect(created.statusCode).toBe(201);
  const edited = await app.inject({ method: 'PUT', url: `/api/outbound-reference/templates/${created.json().id}`, payload: { ...payload, name: '已编辑' } });
  expect(edited.statusCode).toBe(200);
  expect(edited.json()).toMatchObject({ key: created.json().key, name: '已编辑' });
});
it('returns field errors for invalid variables and missing fields', async () => {
  for (const [field, value] of [['name', ''], ['subjectTemplate', '{{brand'], ['bodyTemplate', '{{unknown}}']]) {
    const result = await app.inject({ method: 'POST', url: '/api/outbound-reference/templates', payload: { ...payload, [field]: value } });
    expect(result.statusCode).toBe(400);
    expect(result.json().error.fieldErrors[field]).toBeTruthy();
  }
});
it('returns reviewed template roles through list/detail and discloses linked template counts on contact deletion', async () => {
 const service=new OutboundReferenceService(db);
 const contact=service.createContact({company:'共享公司',contactName:'联系人',email:'shared@example.test',defaultRecipientType:'cc'});
 const template=service.createTemplate({...payload,materialType:'initial'});
 const links=[{contactId:contact.id,recipientType:'to' as const,displayOrder:0},{contactId:contact.id,recipientType:'cc' as const,displayOrder:1}];
 service.replaceTemplateContactLinks(template.id,links);
 const detail=await app.inject({method:'GET',url:`/api/outbound-reference/templates/${template.id}`});
 expect(detail.json()).toMatchObject({contactLinksConfigured:true,contactLinks:links});
 const list=await app.inject({method:'GET',url:'/api/outbound-reference/templates'});
 expect(list.json().items.find((item:{id:number})=>item.id===template.id)).toEqual(detail.json());
 const removed=await app.inject({method:'DELETE',url:`/api/outbound-reference/contacts/${contact.id}`});
 expect(removed.statusCode).toBe(409);expect(removed.json()).toMatchObject({error:{code:'REFERENCE_DATA_REFERENCED',referenceSummary:{templates:1}}});
 const deletedTemplate=await app.inject({method:'DELETE',url:`/api/outbound-reference/templates/${template.id}`});expect(deletedTemplate.statusCode).toBe(200);
 expect((await app.inject({method:'GET',url:`/api/outbound-reference/contacts/${contact.id}`})).statusCode).toBe(200);
});
