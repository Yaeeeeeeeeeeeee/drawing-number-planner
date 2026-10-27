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
