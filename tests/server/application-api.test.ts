// @vitest-environment node
import { mkdirSync, mkdtempSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';

import { startServer } from '../../src/server/start-server';
import { resolveAppPaths } from '../../src/core/config/app-paths';
import { expectedOutboundClaimFileName } from '../../src/core/outbound/outbound-artifact-ownership';
import { openDatabase } from '../../src/db/database';

describe('real application API', () => {
  it('resolves an unindexed drawing file through the installed-service bridge without index writes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'v52-drawing-bridge-'));
    const dataDir = join(root, 'data'), workspaceRoot = join(root, 'workspace');
    const relativePath = '冰柜/SKU-M/02.未转曲源文件/02.0209.010.0401001-铭牌.pdf';
    mkdirSync(join(workspaceRoot, '冰柜/SKU-M/02.未转曲源文件'), { recursive: true });
    writeFileSync(join(workspaceRoot, relativePath), '%PDF-1.4');
    const server = await startServer({ port: 0, dataDir });
    const paths = resolveAppPaths(dataDir);
    writeFileSync(paths.settings, JSON.stringify({ workspaceRoot }));
    const database = openDatabase(paths.database);
    try {
      const dictionary = new DictionaryService(database);
      const brand = dictionary.create({ type: 'brand', code: '02', name: 'Brand' });
      const size = dictionary.create({ type: 'product_size', code: '0209', name: 'Size' });
      const appearance = dictionary.create({ type: 'appearance', code: '01', name: 'Appearance' });
      const color = dictionary.create({ type: 'color', code: '0', name: 'White' });
      const main = dictionary.create({ type: 'main_category', code: '04', name: 'Main' });
      const project = dictionary.create({ type: 'project_item', code: '01', name: 'Logo', parentId: main.id });
      const product = new ProductService(database).create({ sku: 'SKU', model: 'M', productCategory: '冰柜',
        brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });
      const id = Number(database.prepare(`insert into drawing_numbers (full_code, display_name, product_id,
        appearance_id, color_id, main_category_id, project_item_id, brand_code, product_size_code,
        appearance_code, color_code, main_category_code, project_item_code, sequence, status, created_at)
        values ('02.0209.010.0401001', 'Drawing', ?, ?, ?, ?, ?, '02', '0209', '01', '0', '04', '01', 1, 'reserved', '2026-10-28')`)
        .run(product.id, appearance.id, color.id, main.id, project.id).lastInsertRowid);
      const request = { kind: 'drawing-file', origin: 'planned', recordId: id, relativePath };
      expect(server.resolvePdfFilePath(request)).toBe(join(workspaceRoot, relativePath));
      expect(() => server.resolvePdfFilePath({ ...request, relativePath: '../outside.pdf' })).toThrow();
      expect(() => server.resolvePdfFilePath({ ...request, recordId: 999 })).toThrow();
      expect(database.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 0 });
      expect(database.prepare('select status from drawing_numbers where id=?').get(id)).toEqual({ status: 'reserved' });
    } finally { database.close(); await server.close(); }
  });

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
      insert into schema_migrations values (25, '2026-08-24T00:00:00Z')`);
    database.close();

    await expect(startServer({ port: 0, dataDir })).rejects.toThrow('高于当前软件支持的版本');

    const moved = `${paths.database}.released`;
    expect(() => renameSync(paths.database, moved)).not.toThrow();
  });

  it('rejects invalid or missing BOM attachment paths in the server-owned resolver', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drawing-planner-bom-resolver-'));
    const dataDir = join(root, 'data'); const workspaceRoot = join(root, 'workspace');
    mkdirSync(workspaceRoot); const paths = resolveAppPaths(dataDir);
    const server = await startServer({ port: 0, dataDir });
    writeFileSync(paths.settings, `${JSON.stringify({ workspaceRoot })}\n`);
    const database = openDatabase(paths.database);
    const assetId = Number(database.prepare(`insert into bom_assets
      (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
      values ('missing.png', 'missing.png', 'image/png', 0, 'missing', '2026-09-11T00:00:00Z')`).run().lastInsertRowid);
    database.close();

    expect(() => server.resolveBomAssetPath(0)).toThrow(expect.objectContaining({ code: 'INVALID_BOM_ASSET_ID' }));
    expect(() => server.resolveBomAssetPath(assetId)).toThrow(expect.objectContaining({ code: 'BOM_ASSET_UNAVAILABLE' }));
    await server.close();
  });

  it('conservatively preserves unproven outbound claim, temporary and final files on startup', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drawing-planner-recovery-boundary-'));
    const dataDir = join(root, 'data'); const paths = resolveAppPaths(dataDir);
    mkdirSync(paths.exports, { recursive: true });
    const claim = join(paths.exports, '.unknown.claim');
    const temporary = join(paths.exports, '.unknown.tmp');
    const completed = join(paths.exports, 'completed.zip');
    writeFileSync(claim, ''); writeFileSync(temporary, ''); writeFileSync(completed, 'zip');

    const server = await startServer({ port: 0, dataDir });

    expect([claim, temporary, completed].map(existsSync)).toEqual([true, true, true]);
    await server.close();
  });

  it('removes only stale task-owned outbound claim and temporary files after restart', async () => {
    const root = mkdtempSync(join(tmpdir(), 'drawing-planner-stale-outbound-'));
    const dataDir = join(root, 'data'); const paths = resolveAppPaths(dataDir);
    const configuredOutput = join(root, 'configured-exports'); const workspaceRoot = join(root, 'workspace');
    mkdirSync(paths.exports, { recursive: true }); mkdirSync(configuredOutput); mkdirSync(workspaceRoot);
    writeFileSync(paths.settings, JSON.stringify({ workspaceRoot, outboundOutputRoot: configuredOutput }));
    const taskId = '6fc3f8a7-e1d0-4d61-9235-13d98350f091';
    const temporaryFile = '.17b40f41-2eed-4912-9db7-cd998a8bd444.tmp';
    const finalFile = 'completed.zip';
    const claimFile = expectedOutboundClaimFileName(finalFile);
    const claim = join(paths.exports, claimFile); const temporary = join(paths.exports, temporaryFile);
    const completed = join(paths.exports, finalFile);
    writeFileSync(claim, JSON.stringify({ version: 1, taskId, lifecycle: 'active',
      createdAt: '2020-01-01T00:00:00.000Z', temporaryFile, finalFile }));
    writeFileSync(temporary, 'partial'); writeFileSync(completed, 'published');
    const configuredTemporaryFile = '.27b40f41-2eed-4912-9db7-cd998a8bd444.tmp';
    const configuredFinalFile = 'configured.zip';
    const configuredClaim = join(configuredOutput, expectedOutboundClaimFileName(configuredFinalFile));
    const configuredTemporary = join(configuredOutput, configuredTemporaryFile);
    writeFileSync(configuredClaim, JSON.stringify({ version: 1, taskId, lifecycle: 'active',
      createdAt: '2020-01-01T00:00:00.000Z', temporaryFile: configuredTemporaryFile, finalFile: configuredFinalFile }));
    writeFileSync(configuredTemporary, 'partial');

    const server = await startServer({ port: 0, dataDir });

    expect([claim, temporary, completed, configuredClaim, configuredTemporary].map(existsSync))
      .toEqual([false, false, true, false, false]);
    await server.close();
  });
});
