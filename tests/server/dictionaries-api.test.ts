// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerDictionaryRoutes } from '../../src/server/routes/dictionaries';

let db: PlannerDatabase;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
});
afterEach(() => db.close());

describe('dictionary API', () => {
  it.each(['inactive', 'deleted', 'deleted-active'] as const)('rejects direct project creation under an %s parent and allows explicit restoration', async (state) => {
    const service = new DictionaryService(db);
    const parent = service.create({ type: 'main_category', code: '04', name: '印刷件类' });
    service.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: parent.id });
    if (state === 'inactive') service.deactivate(parent.id);
    else service.deleteUnused(parent.id);
    if (state === 'deleted-active') db.prepare("update dictionary_items set status='active' where id=?").run(parent.id);
    const app = Fastify(); registerDictionaryRoutes(app, service);
    try {
      const before = db.serialize();
      const payload = { code: '02', name: '说明书', parentId: parent.id };
      const rejected = await app.inject({ method: 'POST', url: '/api/dictionaries/project_item', payload });
      expect(rejected.statusCode).toBe(400);
      expect(rejected.json()).toMatchObject({ error: { code: 'INVALID_PARENT', message: expect.stringMatching(/启用/) } });
      expect(db.serialize()).toEqual(before);
      await app.inject({ method: 'POST', url: `/api/dictionaries/items/${parent.id}/activate` });
      const accepted = await app.inject({ method: 'POST', url: '/api/dictionaries/project_item', payload });
      expect(accepted.statusCode).toBe(201);
      expect(accepted.json()).toMatchObject({ parentId: parent.id, code: '02', name: '说明书', status: 'active' });
      expect(db.pragma('foreign_key_check')).toEqual([]);
    } finally { await app.close(); }
  });

  it('creates and lists real dictionary records', async () => {
    const app = Fastify();
    registerDictionaryRoutes(app, new DictionaryService(db));
    const created = await app.inject({ method: 'POST', url: '/api/dictionaries/brand', payload: { code: '02', name: 'SAMKYO' } });
    expect(created.statusCode).toBe(201);
    const listed = await app.inject({ method: 'GET', url: '/api/dictionaries/brand' });
    expect(listed.json()).toEqual({ items: [expect.objectContaining({ code: '02', name: 'SAMKYO' })] });
    await app.close();
  });

  it('returns a stable domain error for duplicate codes', async () => {
    const app = Fastify();
    registerDictionaryRoutes(app, new DictionaryService(db));
    await app.inject({ method: 'POST', url: '/api/dictionaries/color', payload: { code: '0', name: '白色' } });
    const duplicate = await app.inject({ method: 'POST', url: '/api/dictionaries/color', payload: { code: '0', name: '白' } });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json()).toEqual({ error: { code: 'DUPLICATE_CODE', message: '同类字典编码已存在' } });
    await app.close();
  });

  it('renames an unused item and deactivates it through explicit actions', async () => {
    const app = Fastify();
    registerDictionaryRoutes(app, new DictionaryService(db));
    const created = await app.inject({ method: 'POST', url: '/api/dictionaries/color', payload: { code: '0', name: '白' } });
    const id = created.json().id as number;
    const renamed = await app.inject({ method: 'PATCH', url: `/api/dictionaries/items/${id}`, payload: { name: '白色' } });
    expect(renamed.json()).toEqual(expect.objectContaining({ name: '白色' }));
    const deactivated = await app.inject({ method: 'POST', url: `/api/dictionaries/items/${id}/deactivate` });
    expect(deactivated.json()).toEqual(expect.objectContaining({ status: 'inactive' }));
    await app.close();
  });

  it('rejects a code mutation while allowing the name-only update contract', async () => {
    const app = Fastify();
    registerDictionaryRoutes(app, new DictionaryService(db));
    const created = await app.inject({ method: 'POST', url: '/api/dictionaries/color', payload: { code: '0', name: '白' } });
    const id = created.json().id as number;

    const mutated = await app.inject({ method: 'PATCH', url: `/api/dictionaries/items/${id}`, payload: { code: '9', name: '白色' } });

    expect(mutated.statusCode).toBe(400);
    expect(mutated.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: '字典数据不完整' } });
    const listed = await app.inject({ method: 'GET', url: '/api/dictionaries/color?includeInactive=true' });
    expect(listed.json()).toEqual({ items: [expect.objectContaining({ id, code: '0', name: '白' })] });
    await app.close();
  });

  it('reactivates an inactive item through an explicit action', async () => {
    const app = Fastify();
    registerDictionaryRoutes(app, new DictionaryService(db));
    const created = await app.inject({ method: 'POST', url: '/api/dictionaries/color', payload: { code: '0', name: '白' } });
    const id = created.json().id as number;
    await app.inject({ method: 'POST', url: `/api/dictionaries/items/${id}/deactivate` });

    const activated = await app.inject({ method: 'POST', url: `/api/dictionaries/items/${id}/activate` });

    expect(activated.statusCode).toBe(200);
    expect(activated.json()).toEqual(expect.objectContaining({ id, status: 'active', code: '0', name: '白' }));
    await app.close();
  });

  it('deletes an unused item with an empty 204 response', async () => {
    const app = Fastify(); registerDictionaryRoutes(app, new DictionaryService(db));
    const created = await app.inject({ method: 'POST', url: '/api/dictionaries/layer_count', payload: { code: '9', name: '九层' } });

    const deleted = await app.inject({ method: 'DELETE', url: `/api/dictionaries/items/${created.json().id}` });

    expect(deleted.statusCode).toBe(204);
    expect(deleted.body).toBe('');
    await app.close();
  });
});
