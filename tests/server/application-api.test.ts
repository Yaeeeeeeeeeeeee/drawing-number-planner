// @vitest-environment node
import { mkdirSync, mkdtempSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { startServer } from '../../src/server/start-server';
import { resolveAppPaths } from '../../src/core/config/app-paths';
import { openDatabase } from '../../src/db/database';

describe('real application API', () => {
  it('persists dictionary writes across server restarts', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'drawing-planner-server-'));
    const first = await startServer({ port: 0, dataDir, token: 'restart-test-token', allowedOrigins: ['http://127.0.0.1:5173'] });
    expect((await fetch(`${first.url}/api/dictionaries/brand`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '02', name: 'SAMKYO' }),
    })).status).toBe(403);
    const created = await fetch(`${first.url}/api/dictionaries/brand`, {
      method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://127.0.0.1:5173', 'x-planner-token': 'restart-test-token' },
      body: JSON.stringify({ code: '02', name: 'SAMKYO' }),
    });
    expect(created.status).toBe(201);
    await first.close();

    const second = await startServer({ port: 0, dataDir, token: 'restart-test-token', allowedOrigins: ['http://127.0.0.1:5173'] });
    const listed = await fetch(`${second.url}/api/dictionaries/brand`);
    expect(await listed.json()).toEqual({
      items: [expect.objectContaining({ code: '02', name: 'SAMKYO' })],
    });
    await second.close();
  });

  it('serves the built renderer without a Vite development server', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drawing-planner-renderer-'));
    const rendererDir = join(root, 'renderer');
    const { mkdirSync } = await import('node:fs'); mkdirSync(rendererDir);
    writeFileSync(join(rendererDir, 'index.html'), '<!doctype html><title>图号规划器生产窗口</title>');
    const server = await startServer({ port: 0, dataDir: join(root, 'data'), rendererDir });

    const response = await fetch(`${server.url}/`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('图号规划器生产窗口');
    const productionSession = await fetch(`${server.url}/api/session`, { method: 'POST', headers: { origin: server.url } });
    expect(productionSession.status).toBe(200);
    const devOriginSession = await fetch(`${server.url}/api/session`, { method: 'POST', headers: { origin: 'http://127.0.0.1:5173' } });
    expect(devOriginSession.status).toBe(403);
    await server.close();
  });

  it('releases the database file when startup migration fails', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'drawing-planner-failed-start-'));
    const paths = resolveAppPaths(dataDir); mkdirSync(paths.baseDir, { recursive: true });
    const database = openDatabase(paths.database);
    database.exec(`create table schema_migrations (version integer primary key, applied_at text not null);
      insert into schema_migrations values (3, '2026-08-24T00:00:00Z')`);
    database.close();

    await expect(startServer({ port: 0, dataDir })).rejects.toThrow('高于当前软件支持的版本');

    const moved = `${paths.database}.released`;
    expect(() => renameSync(paths.database, moved)).not.toThrow();
  });
});
