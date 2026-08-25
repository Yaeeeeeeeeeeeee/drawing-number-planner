// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { startServer, type RunningServer } from '../../src/server/start-server';

const running: RunningServer[] = [];
afterEach(async () => { await Promise.all(running.splice(0).map((server) => server.close())); });

async function serverFixture() {
  const dataDir = mkdtempSync(join(tmpdir(), 'planner-files-api-'));
  const workspace = join(dataDir, 'library'); mkdirSync(workspace);
  const server = await startServer({ port: 0, dataDir, token: 'files-token', allowedOrigins: ['http://127.0.0.1:5173'] });
  running.push(server); return { server, workspace };
}

const writeHeaders = { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'files-token', 'content-type': 'application/json' };
const actionHeaders = { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'files-token' };

describe('PDF file API', () => {
  it('protects and persists workspace settings, scans real PDFs, and filters indexed results', async () => {
    const { server, workspace } = await serverFixture();
    expect(await (await fetch(`${server.url}/api/files/settings`)).json()).toEqual({
      workspaceRoot: null, configured: false, available: false,
    });
    expect((await fetch(`${server.url}/api/files/settings`, { method: 'PUT', body: JSON.stringify({ workspaceRoot: workspace }) })).status).toBe(403);
    expect((await fetch(`${server.url}/api/files/settings`, { method: 'PUT', headers: { ...writeHeaders, 'x-planner-token': 'wrong' },
      body: JSON.stringify({ workspaceRoot: workspace }) })).status).toBe(401);

    const saved = await fetch(`${server.url}/api/files/settings`, { method: 'PUT', headers: writeHeaders,
      body: JSON.stringify({ workspaceRoot: workspace }) });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ workspaceRoot: realpathSync.native(workspace), configured: true, available: true });
    writeFileSync(join(workspace, 'unknown（转曲）.PDF'), '%PDF-1.4');

    const scan = await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    expect(scan.status).toBe(200);
    expect(await scan.json()).toMatchObject({ total: 1, matched: 0, unmatched: 1, conflict: 0, outlined: 1, missing: 0 });
    const listed = await fetch(`${server.url}/api/files?keyword=${encodeURIComponent('转曲')}&matchStatus=unmatched&conversionType=outlined&presence=present&page=1&pageSize=20`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ total: 1, items: [expect.objectContaining({
      relativePath: 'unknown（转曲）.PDF', drawingId: null, conversionType: 'outlined', isPresent: true,
    })] });
  });

  it('strictly rejects malformed input and maps workspace errors without changing settings', async () => {
    const { server, workspace } = await serverFixture();
    const unknown = await fetch(`${server.url}/api/files/settings`, { method: 'PUT', headers: writeHeaders,
      body: JSON.stringify({ workspaceRoot: workspace, unknown: true }) });
    expect(unknown.status).toBe(400);
    expect((await unknown.json()).error.code).toBe('INVALID_REQUEST');

    const invalid = await fetch(`${server.url}/api/files/settings`, { method: 'PUT', headers: writeHeaders,
      body: JSON.stringify({ workspaceRoot: join(workspace, 'missing') }) });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe('WORKSPACE_INVALID');
    expect((await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders })).status).toBe(422);
    const scanWithBody = await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: writeHeaders,
      body: JSON.stringify({ workspaceRoot: workspace }) });
    expect(scanWithBody.status).toBe(400);
    expect((await fetch(`${server.url}/api/files?unknown=true`)).status).toBe(400);
  });
});
