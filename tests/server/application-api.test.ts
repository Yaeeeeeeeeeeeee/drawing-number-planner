// @vitest-environment node
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { startServer } from '../../src/server/start-server';

describe('real application API', () => {
  it('persists dictionary writes across server restarts', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'drawing-planner-server-'));
    const first = await startServer({ port: 0, dataDir, token: 'restart-test-token' });
    expect((await fetch(`${first.url}/api/dictionaries/brand`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '02', name: 'SAMKYO' }),
    })).status).toBe(401);
    const created = await fetch(`${first.url}/api/dictionaries/brand`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-planner-token': 'restart-test-token' },
      body: JSON.stringify({ code: '02', name: 'SAMKYO' }),
    });
    expect(created.status).toBe(201);
    await first.close();

    const second = await startServer({ port: 0, dataDir, token: 'restart-test-token' });
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
    await server.close();
  });
});
