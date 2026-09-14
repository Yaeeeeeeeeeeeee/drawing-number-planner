// @vitest-environment node
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerOutboundReferenceRoutes } from '../../src/server/routes/outbound-reference';

let db: PlannerDatabase;
let app: FastifyInstance;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  app = Fastify();
  registerOutboundReferenceRoutes(app, new OutboundReferenceService(db));
});

afterEach(async () => { await app.close(); db.close(); });

describe('outbound reference API', () => {
  it('provides contact CRUD and lifecycle routes with normalized email', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/outbound-reference/contacts', payload: {
      company: '供应商 A', contactName: '王先生', email: ' SALES@Example.COM ', defaultRecipientType: 'to', notes: '主要联系人',
    } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as number;
    expect(created.json()).toEqual(expect.objectContaining({ email: 'sales@example.com', status: 'active' }));

    expect((await app.inject({ method: 'POST', url: `/api/outbound-reference/contacts/${id}/deactivate` })).json().status)
      .toBe('inactive');
    expect((await app.inject({ method: 'POST', url: `/api/outbound-reference/contacts/${id}/activate` })).json().status)
      .toBe('active');
    const updated = await app.inject({ method: 'PUT', url: `/api/outbound-reference/contacts/${id}`, payload: {
      company: '供应商 A', contactName: '李女士', email: 'new@example.com', defaultRecipientType: 'cc', notes: null,
    } });
    expect(updated.json()).toEqual(expect.objectContaining({ contactName: '李女士', defaultRecipientType: 'cc' }));
    expect((await app.inject({ method: 'GET', url: '/api/outbound-reference/contacts?status=all' })).json())
      .toEqual({ items: [expect.objectContaining({ id })] });
    expect((await app.inject({ method: 'DELETE', url: `/api/outbound-reference/contacts/${id}` })).json())
      .toEqual({ deleted: true });
  });

  it('returns a stable conflict for duplicate emails', async () => {
    const payload = { company: 'A', contactName: '甲', email: 'sales@example.com', defaultRecipientType: 'to', notes: null };
    await app.inject({ method: 'POST', url: '/api/outbound-reference/contacts', payload });
    const duplicate = await app.inject({ method: 'POST', url: '/api/outbound-reference/contacts',
      payload: { ...payload, company: 'B', email: 'SALES@EXAMPLE.COM' } });

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: { code: 'DUPLICATE_EMAIL', message: '联系人邮箱已经存在' } });
  });

  it('provides template, block and render routes with explicit variable errors', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/outbound-reference/templates', payload: {
      key: 'initial_supplier', name: '首批模板', materialType: 'initial',
      subjectTemplate: '{{package_name}}', bodyTemplate: '{{company_name}} {{signature}}',
    } });
    expect(created.statusCode).toBe(201);
    const templateId = created.json().id as number;
    const block = await app.inject({ method: 'POST', url: `/api/outbound-reference/templates/${templateId}/blocks`, payload: {
      key: 'meti', name: 'METI', bodyTemplate: '{{model}} 后续更新', displayOrder: 10,
    } });
    expect(block.statusCode).toBe(201);
    expect((await app.inject({ method: 'GET', url: '/api/outbound-reference/templates?status=all' })).json())
      .toEqual({ items: expect.arrayContaining([expect.objectContaining({ id: templateId,
        blocks: [expect.objectContaining({ key: 'meti' })] })]) });

    const missing = await app.inject({ method: 'POST', url: `/api/outbound-reference/templates/${templateId}/render`,
      payload: { variables: { package_name: 'Package' } } });
    expect(missing.statusCode).toBe(400);
    expect(missing.json()).toEqual({ error: { code: 'MISSING_TEMPLATE_VARIABLE',
      message: '邮件模板缺少变量：company_name, signature', variableNames: ['company_name', 'signature'] } });
    const rendered = await app.inject({ method: 'POST', url: `/api/outbound-reference/templates/${templateId}/render`,
      payload: { variables: { package_name: 'Package', company_name: '供应商 A', signature: '签名' } } });
    expect(rendered.json()).toEqual({ subject: 'Package', body: '供应商 A 签名' });
  });

  it('provides signature CRUD and lifecycle routes', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/outbound-reference/signatures',
      payload: { name: '销售签名', content: 'Sales Team', isDefault: false } });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as number;
    expect((await app.inject({ method: 'POST', url: `/api/outbound-reference/signatures/${id}/deactivate` })).json().status)
      .toBe('inactive');
    const madeDefault = await app.inject({ method: 'PUT', url: `/api/outbound-reference/signatures/${id}`,
      payload: { name: '销售签名 2', content: 'Sales Team 2', isDefault: true } });
    expect(madeDefault.json())
      .toEqual(expect.objectContaining({ isDefault: true, status: 'active', content: 'Sales Team 2' }));
    const active = (await app.inject({ method: 'GET', url: '/api/outbound-reference/signatures?status=active' })).json();
    expect(active.items.filter((signature: { isDefault: boolean }) => signature.isDefault))
      .toEqual([expect.objectContaining({ id })]);
    expect((await app.inject({ method: 'DELETE', url: `/api/outbound-reference/signatures/${id}` })).json())
      .toEqual({ deleted: true });
  });

  it('rejects malformed requests without leaking database errors', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/outbound-reference/contacts', payload: {
      company: '', contactName: '', email: 'not-an-email', defaultRecipientType: 'bcc',
    } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: '外发联系人数据不完整' } });
  });
});
