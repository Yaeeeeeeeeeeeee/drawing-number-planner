// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DrawingQueryService } from '../../src/core/drawings/drawing-query-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerDrawingRoutes } from '../../src/server/routes/drawings';

let db: PlannerDatabase;

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
});
afterEach(() => db.close());

describe('drawing library API', () => {
  it('returns an accurate empty paged result', async () => {
    const app = Fastify();
    registerDrawingRoutes(app, new DrawingQueryService(db));
    const response = await app.inject({ method: 'GET', url: '/api/drawings?keyword=不存在' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    await app.close();
  });

  it('rejects invalid paging and exposes no creation route', async () => {
    const app = Fastify();
    registerDrawingRoutes(app, new DrawingQueryService(db));
    const invalid = await app.inject({ method: 'GET', url: '/api/drawings?pageSize=101' });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toEqual({ error: { code: 'INVALID_REQUEST', message: '图号筛选条件无效' } });
    expect((await app.inject({ method: 'POST', url: '/api/drawings', payload: {} })).statusCode).toBe(404);
    await app.close();
  });

  it('returns a stable not-found error for missing detail', async () => {
    const app = Fastify();
    registerDrawingRoutes(app, new DrawingQueryService(db));
    const response = await app.inject({ method: 'GET', url: '/api/drawings/999' });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: { code: 'NOT_FOUND', message: '图号记录不存在' } });
    await app.close();
  });
});
