// @vitest-environment node
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { assertLoopbackHost, registerLocalAccess } from '../../src/server/security/local-access';

describe('local access security', () => {
  it('rejects non-loopback server bindings', () => {
    expect(() => assertLoopbackHost('0.0.0.0')).toThrowError(expect.objectContaining({ code: 'NON_LOOPBACK_BINDING' }));
    expect(() => assertLoopbackHost('127.0.0.1')).not.toThrow();
  });

  it('requires the startup token for write requests', async () => {
    const app = Fastify();
    registerLocalAccess(app, { token: 'local-token', allowedOrigins: ['http://127.0.0.1:5173'] });
    app.post('/write', async () => ({ ok: true }));

    expect((await app.inject({ method: 'POST', url: '/write' })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/write', headers: { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/write', headers: { 'x-planner-token': 'local-token' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/write', headers: { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'local-token' } })).statusCode).toBe(200);
    await app.close();
  });

  it('rejects unapproved browser origins', async () => {
    const app = Fastify();
    registerLocalAccess(app, { token: 'local-token', allowedOrigins: ['http://127.0.0.1:5173'] });
    app.get('/read', async () => ({ ok: true }));

    const rejected = await app.inject({ method: 'GET', url: '/read', headers: { origin: 'https://unapproved.example' } });
    expect(rejected.statusCode).toBe(403);
    expect(rejected.json()).toEqual({ error: { code: 'ORIGIN_NOT_ALLOWED', message: '请求来源不受信任' } });
    expect((await app.inject({ method: 'GET', url: '/read', headers: { origin: 'http://127.0.0.1:5173' } })).statusCode).toBe(200);
    await app.close();
  });

  it('issues the per-launch token only to the approved browser origin', async () => {
    const app = Fastify();
    registerLocalAccess(app, { token: 'fresh-launch-token', allowedOrigins: ['http://127.0.0.1:5173'] });
    app.post('/api/session', async () => ({ token: 'fresh-launch-token' }));

    const missingOrigin = await app.inject({ method: 'POST', url: '/api/session' });
    const wrongOrigin = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'https://unapproved.example' } });
    const approved = await app.inject({ method: 'POST', url: '/api/session', headers: { origin: 'http://127.0.0.1:5173' } });

    expect(missingOrigin.statusCode).toBe(403);
    expect(wrongOrigin.statusCode).toBe(403);
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toEqual({ token: 'fresh-launch-token' });
    await app.close();
  });
});
