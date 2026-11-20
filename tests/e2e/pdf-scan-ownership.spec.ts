import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { DrawingAssociationService } from '../../src/core/drawings/drawing-association-service';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { scanPdfWorkspace } from '../../src/core/files/pdf-scanner';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { PlanningService } from '../../src/core/planning/planning-service';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { startServer } from '../../src/server/start-server';

const digest = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');

test('shows the real watcher owner while rejecting concurrent scans without changing Schema26 or protected data', async ({ page }) => {
  test.setTimeout(60_000);
  const dataDir = mkdtempSync(join(tmpdir(), 'planner-p0-1-'));
  const root = join(dataDir, 'materials');
  const databasePath = join(dataDir, 'planner.db');
  const db = openDatabase(databasePath);
  const output = resolve('test-results/p0-1');
  mkdirSync(output, { recursive: true });
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const original = FileService.prototype.scanProducts;
  let server: Awaited<ReturnType<typeof startServer>> | undefined;
  try {
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const dictionary = new DictionaryService(db);
    const brand = dictionary.create({ type: 'brand', code: '02', name: '测试品牌' });
    const size = dictionary.create({ type: 'product_size', code: '0404', name: '冰柜' });
    const appearance = dictionary.create({ type: 'appearance', code: '01', name: '1号外观' });
    const color = dictionary.create({ type: 'color', code: '0', name: '白色' });
    const category = dictionary.create({ type: 'main_category', code: '04', name: '印刷件' });
    const item = dictionary.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: category.id });
    const products = new ProductService(db);
    const product = products.create({ sku: 'FIXTURE100', model: 'ZC100', productCategory: '冰柜',
      brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });
    const planning = new PlanningService(db);
    const plan = { productId: product.id, rows: [{ clientId: 'fixture', colorId: color.id, mainCategoryId: category.id, projectItemId: item.id }] };
    const preview = planning.preview(plan);
    const drawing = planning.reserve({ ...plan, rows: [{ ...plan.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
    const versions = new AppearanceService(db);
    const version = versions.createDraft(product.id, { appearanceId: appearance.id, colorIds: [color.id], label: '1号外观' });
    const versionId = versions.activate(version.id, {
      expectedRevision: version.revision, expectedIdentityRevision: versions.list(product.id).revision,
    }).id;
    new DrawingAssociationService(db).correct({ signedId: drawing.id, productId: product.id, appearanceVersionId: versionId }, 'P0-1测试人工确认');

    const source = join(root, '冰柜', 'FIXTURE100-ZC100', '02.未转曲源文件');
    const first = join(source, `${drawing.fullCode}-测试源件.pdf`);
    const second = join(source, `${drawing.fullCode}-测试副件.pdf`);
    mkdirSync(source, { recursive: true });
    writeFileSync(first, '%PDF-1.4\n1 0 obj\n<</Type /Catalog>>\nendobj\n%%EOF\n');
    const settings = new WorkspaceSettingsStore(join(dataDir, 'settings.json'));
    settings.setWorkspaceRoot(root);
    await new FileService(new FileRepository(db), settings).scan();
    writeFileSync(second, '%PDF-1.4\n2 0 obj\n<</Type /Catalog>>\nendobj\n%%EOF\n');

    const snapshot = () => ({
      schema: db.prepare('select type,name,tbl_name,sql from sqlite_schema order by name').all(),
      migrations: db.prepare('select * from schema_migrations order by version').all(),
      schemaVersion: db.prepare('select max(version) from schema_migrations').pluck().get(),
      protected: Object.fromEntries(['products', 'product_appearance_versions', 'drawing_numbers', 'historical_drawing_numbers',
        'drawing_appearance_bindings', 'drawing_association_audit', 'pdf_product_assignments', 'pdf_product_assignment_audit',
        'bom_versions'].map(table => [table, db.prepare(`select * from ${table} order by rowid`).all()])),
      files: db.prepare('select id,file_name,is_present,drawing_id,content_sha256,last_seen_scan_run_id from pdf_files order by id').all(),
      batches: db.prepare('select * from material_batches order by id').all(),
      runs: db.prepare('select * from file_scan_runs order by id').all(),
      changes: db.prepare('select * from file_scan_changes order by id').all(),
      pdfHashes: [first, second].map(path => digest(readFileSync(path))),
    });
    const before = snapshot();
    expect(before.schemaVersion).toBe(26);
    expect(before.files).toHaveLength(1);
    expect(before.protected.drawing_appearance_bindings).toMatchObject([{ appearance_version_id: versionId }]);
    expect(before.protected.product_appearance_versions).toHaveLength(1);
    expect(before.protected.drawing_association_audit).toHaveLength(1);

    let firstWatcher = true;
    FileService.prototype.scanProducts = function (directories, context, origin, checkDirectories) {
      if (origin?.source !== 'watcher' || !firstWatcher) return original.call(this, directories, context, origin, checkDirectories);
      firstWatcher = false;
      const scanner = Reflect.get(this, 'scanner') as typeof scanPdfWorkspace;
      Reflect.set(this, 'scanner', async (path: string, options: Parameters<typeof scanPdfWorkspace>[1]) => {
        const files = await scanner(path, options);
        await hold;
        return files;
      });
      return original.call(this, directories, context, origin, checkDirectories)
        .finally(() => Reflect.set(this, 'scanner', scanner));
    };

    server = await startServer({ port: 0, dataDir, rendererDir: resolve('dist/renderer') });
    const { url, token } = server;
    const get = async (path: string) => {
      const response = await fetch(url + path, { headers: { 'x-planner-token': token } });
      expect(response.ok).toBe(true);
      return response.json();
    };
    const status = () => get('/api/files/scans/status');
    await expect.poll(async () => (await status()).active?.source).toBe('watcher');
    const owner = (await status()).active;
    const reply = await fetch(url + '/api/packaging/scan-category', { method: 'POST',
      headers: { 'content-type': 'application/json', 'x-planner-token': token, origin: url },
      body: JSON.stringify({ category: '冰柜' }) });
    expect(reply.status).toBe(409);
    const conflict = await reply.json();
    expect(JSON.stringify(conflict)).toContain(owner.id);
    expect(await status()).toMatchObject({ active: { id: owner.id, scope: owner.scope }, recent: null });
    expect(await get('/api/files/scans/latest')).toMatchObject({ id: 1 });
    expect(snapshot()).toEqual(before);

    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto(url);
    const nav = page.getByRole('navigation', { name: '主导航' });
    if (!await nav.isVisible()) await page.getByRole('button', { name: '展开导航', exact: true }).click();
    await nav.getByRole('button', { name: 'PDF 文件中心', exact: true }).click();
    await expect(page.getByText('后台监听扫描：进行中', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '扫描资料库', exact: true })).toBeDisabled();
    await page.screenshot({ path: join(output, 'pdf-watcher-running.png') });

    release();
    await expect(page.getByText('后台监听扫描：已完成', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '扫描资料库', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: '详细信息', exact: true }).click();
    await expect(page.getByLabel('当前资料库状态').getByText('2 个所选产品范围 PDF 索引')).toBeVisible();
    await page.screenshot({ path: join(output, 'pdf-watcher-complete.png') });
    const completed = (await status()).recent;
    const after = snapshot();
    expect(completed.id).toBe(owner.id);
    expect(completed.result.scanId).toBe(2);
    expect(await get('/api/files/scans/latest')).toMatchObject({ id: 2, currentTotal: 2, added: 1, missing: 0 });
    expect(after.files).toHaveLength(2);
    expect(after.runs).toHaveLength(2);
    expect(after.schema).toEqual(before.schema);
    expect(after.migrations).toEqual(before.migrations);
    expect(after.protected).toEqual(before.protected);
    expect(after.pdfHashes).toEqual(before.pdfHashes);
    const integrity = db.pragma('integrity_check', { simple: true });
    const foreignKeys = db.pragma('foreign_key_check');
    expect(integrity).toBe('ok');
    expect(foreignKeys).toEqual([]);
    const originalReplaceScan = FileRepository.prototype.replaceScan;
    FileRepository.prototype.replaceScan = function (...args) {
      const connection = Reflect.get(this, 'db') as PlannerDatabase;
      connection.exec(`create temp trigger p01_fail_scan_change before insert on file_scan_changes
        begin select raise(abort, 'P0-1 injected change failure'); end`);
      try { return originalReplaceScan.apply(this, args); }
      finally { connection.exec('drop trigger temp.p01_fail_scan_change'); }
    };
    try {
      const failed = await fetch(url + '/api/packaging/scan-product', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-planner-token': token, origin: url },
        body: JSON.stringify({ productId: product.id }) });
      expect((await failed.json()).error).toMatchObject({ code: 'SCAN_FAILED' });
    } finally { FileRepository.prototype.replaceScan = originalReplaceScan; }
    expect(snapshot()).toEqual(after);
    expect(await get('/api/files/scans/latest')).toMatchObject({ id: 2, currentTotal: 2 });
    const failure = (await status()).recent;
    expect(failure).toMatchObject({ source: 'product', status: 'failed', progress: { phase: 'finalizing' } });
    expect(failure.result).toBeUndefined();
    const logs = readFileSync(join(dataDir, 'logs', 'pdf-scans.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    expect(logs.filter(entry => entry.execution.id === owner.id).map(entry => entry.event)).toEqual(['started', 'completed', 'released']);
    const failedLogs = logs.filter(entry => entry.execution.id === failure.id);
    expect(failedLogs.map(entry => entry.event)).toEqual(['started', 'failed', 'released']);
    expect(failedLogs[1].cause.message).toBe('P0-1 injected change failure');
    writeFileSync(join(output, 'scan-ownership-evidence.json'), JSON.stringify({
      before: { files: before.files, runs: before.runs, batches: before.batches.length, changes: before.changes.length },
      after: { files: after.files, runs: after.runs, batches: after.batches.length, changes: after.changes.length },
      concurrentRejectionPreservedSnapshot: true, commitFailurePreservedSnapshot: true,
      failedCommit: { events: failedLogs.map(entry => entry.event), cause: failedLogs[1].cause, latestSuccessfulScanId: 2 },
      conflict, executionId: owner.id, schemaVersion: after.schemaVersion, schemaSha256: digest(JSON.stringify(after.schema)),
      protected: Object.fromEntries(Object.entries(after.protected).map(([table, rows]) => [table, {
        count: rows.length, sha256: digest(JSON.stringify(rows)),
      }])), pdfHashes: after.pdfHashes, integrity, foreignKeys,
      logEvents: logs.filter(entry => entry.execution.id === owner.id).map(entry => entry.event),
    }, null, 2));
  } finally {
    release();
    try { await server?.close(); } finally {
      FileService.prototype.scanProducts = original;
      db.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  }
});
