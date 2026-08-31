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
  it('returns current scan counts and grouped changes without treating old missing rows as newly deleted', async () => {
    const { server, workspace } = await serverFixture();
    const retained = join(workspace, 'retained.pdf');
    const removed = join(workspace, 'removed.pdf');
    const changed = join(workspace, 'changed.pdf');
    await fetch(`${server.url}/api/files/settings`, { method: 'PUT', headers: writeHeaders,
      body: JSON.stringify({ workspaceRoot: workspace }) });
    writeFileSync(retained, '%PDF-1.4 retained'); writeFileSync(removed, '%PDF-1.4 removed');
    writeFileSync(changed, '%PDF-1.4 first');
    await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });

    unlinkSync(removed); writeFileSync(changed, '%PDF-1.4 second version');
    writeFileSync(join(workspace, 'added.pdf'), '%PDF-1.4 added');
    const secondScan = await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    expect(await secondScan.json()).toMatchObject({
      total: 3, currentTotal: 3,
      comparison: { added: 1, missing: 1, moved: 0, changed: 1, unchanged: 1 },
    });

    const latest = await (await fetch(`${server.url}/api/files/scans/latest`)).json() as { id: number; currentTotal: number };
    expect(latest.currentTotal).toBe(3);
    const onePage = await (await fetch(`${server.url}/api/files?page=1&pageSize=1`)).json();
    expect(onePage).toMatchObject({ total: 3, items: [expect.any(Object)] });
    expect(onePage.items).toHaveLength(1);
    expect(latest.currentTotal).toBe(3);
    const changes = await (await fetch(`${server.url}/api/files/scans/${latest.id}/changes`)).json();
    expect(changes).toMatchObject({
      scan: { id: latest.id, currentTotal: 3 },
      changes: {
        added: [expect.objectContaining({ relativePath: 'added.pdf' })],
        missing: [expect.objectContaining({ relativePath: 'removed.pdf' })],
        changed: [expect.objectContaining({ relativePath: 'changed.pdf' })],
      },
    });
    expect(changes.changes.added[0].relativePath).not.toContain(workspace);

    unlinkSync(retained); unlinkSync(changed); unlinkSync(join(workspace, 'added.pdf'));
    await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    const newest = await (await fetch(`${server.url}/api/files/scans/latest`)).json() as { id: number; currentTotal: number };
    const newestChanges = await (await fetch(`${server.url}/api/files/scans/${newest.id}/changes`)).json();
    expect(newest.currentTotal).toBe(0);
    expect(newestChanges.changes.missing).toHaveLength(3);
    expect(newestChanges.changes.missing.map((item: { relativePath: string }) => item.relativePath)).not.toContain('removed.pdf');
  });

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

  it('previews and clears scan indexes only after the exact confirmation phrase', async () => {
    const { server, workspace } = await serverFixture();
    const filePath = join(workspace, '02.0404.010.0401002-history.pdf');
    await fetch(`${server.url}/api/files/settings`, { method: 'PUT', headers: writeHeaders,
      body: JSON.stringify({ workspaceRoot: workspace }) });
    writeFileSync(filePath, '%PDF-1.4 unchanged');
    await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });

    const preview = await fetch(`${server.url}/api/files/index/clear-preview`);
    expect(await preview.json()).toMatchObject({ workspaceRoot: realpathSync.native(workspace),
      counts: { pdfFiles: 1, materialBatches: 0, scanChanges: 1, scanRuns: 1 } });
    const wrongConfirmation = await fetch(`${server.url}/api/files/index/clear`, { method: 'POST', headers: writeHeaders,
      body: JSON.stringify({ confirmation: '清空资料库' }) });
    expect(wrongConfirmation.status).toBe(422);
    expect((await wrongConfirmation.json()).error.code).toBe('INVALID_CLEAR_INDEX_CONFIRMATION');

    const cleared = await fetch(`${server.url}/api/files/index/clear`, { method: 'POST', headers: writeHeaders,
      body: JSON.stringify({ confirmation: '清空资料库索引' }) });
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ pdfFiles: 1, materialBatches: 0, scanChanges: 1, scanRuns: 1 });
    expect((await (await fetch(`${server.url}/api/files?presence=all`)).json()).total).toBe(0);
    expect(await (await fetch(`${server.url}/api/files/settings`)).json()).toMatchObject({ workspaceRoot: realpathSync.native(workspace) });
    expect(await (await import('node:fs')).promises.readFile(filePath, 'utf8')).toBe('%PDF-1.4 unchanged');

    const rescan = await fetch(`${server.url}/api/files/scan`, { method: 'POST', headers: actionHeaders });
    expect(await rescan.json()).toMatchObject({ historicalRegistered: 0, total: 1 });
  });
});
