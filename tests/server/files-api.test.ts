// @vitest-environment node
import { mkdirSync, mkdtempSync, realpathSync, unlinkSync, writeFileSync } from 'node:fs';
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
    writeFileSync(join(workspace, '02.0404.010.0401007-history.pdf'), '%PDF-1.4');
    writeFileSync(join(workspace, '02.0404.010.0401000-invalid.pdf'), '%PDF-1.4');

    const scan = await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    expect(scan.status).toBe(200);
    expect(await scan.json()).toMatchObject({ total: 3, matched: 1, pending: 1, historicalRegistered: 1,
      unmatched: 1, conflict: 0, outlined: 1, missing: 0 });
    const listed = await fetch(`${server.url}/api/files?keyword=${encodeURIComponent('转曲')}&matchStatus=unmatched&conversionType=outlined&presence=present&page=1&pageSize=20`);
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ total: 1, items: [expect.objectContaining({
      relativePath: 'unknown（转曲）.PDF', drawingId: null, conversionType: 'outlined', isPresent: true,
    })] });
    const pending = await fetch(`${server.url}/api/files?matchStatus=pending`);
    expect(pending.status).toBe(200);
    expect(await pending.json()).toMatchObject({ total: 1, items: [expect.objectContaining({
      matchStatus: 'pending', classificationWarning: expect.stringContaining('invalid-format'),
      detectedCodes: ['02.0404.010.0401000'],
    })] });

    const batchRoot = join(workspace, '01.洗碗机', 'SKU-T40', '03.量产后的变更文件', '01.20241210');
    mkdirSync(batchRoot, { recursive: true });
    writeFileSync(join(batchRoot, 'batch.pdf'), '%PDF-1.4');
    await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    const batches = await (await fetch(`${server.url}/api/material-batches?search=T40`)).json() as { items: Array<{ id: number }> };
    const byBatch = await (await fetch(`${server.url}/api/files?materialBatchId=${batches.items[0].id}`)).json();
    expect(byBatch).toMatchObject({ total: 1, items: [expect.objectContaining({ fileName: 'batch.pdf' })] });
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

  it('authenticates and atomically cleans only selected missing PDF index records', async () => {
    const { server, workspace } = await serverFixture();
    const filePath = join(workspace, '02.0404.010.0401007-history.pdf');
    await fetch(`${server.url}/api/files/settings`, { method: 'PUT', headers: writeHeaders,
      body: JSON.stringify({ workspaceRoot: workspace }) });
    writeFileSync(filePath, '%PDF-1.4');
    await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    unlinkSync(filePath);
    await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    const missing = await (await fetch(`${server.url}/api/files?presence=missing`)).json() as { items: Array<{ id: number }> };
    const id = missing.items[0].id;

    expect((await fetch(`${server.url}/api/files/cleanup`, { method: 'POST', body: JSON.stringify({ ids: [id] }) })).status).toBe(403);
    const invalid = await fetch(`${server.url}/api/files/cleanup`, { method: 'POST', headers: writeHeaders,
      body: JSON.stringify({ ids: [] }) });
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe('INVALID_REQUEST');

    const mixed = await fetch(`${server.url}/api/files/cleanup`, { method: 'POST', headers: writeHeaders,
      body: JSON.stringify({ ids: [id, 999999] }) });
    expect(mixed.status).toBe(422);
    expect((await mixed.json()).error.code).toBe('PDF_CLEANUP_NOT_ALLOWED');
    expect((await (await fetch(`${server.url}/api/files?presence=missing`)).json()).total).toBe(1);

    const cleaned = await fetch(`${server.url}/api/files/cleanup`, { method: 'POST', headers: writeHeaders,
      body: JSON.stringify({ ids: [id] }) });
    expect(cleaned.status).toBe(200);
    expect(await cleaned.json()).toEqual({ cleaned: 1 });
    expect((await (await fetch(`${server.url}/api/files?presence=all`)).json()).total).toBe(0);
  });
});
