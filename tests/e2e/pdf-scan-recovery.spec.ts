import { fork } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { DrawingAssociationService } from '../../src/core/drawings/drawing-association-service';
import { LocalServiceController } from '../../src/main/local-service-controller';

const digest = (contents: Buffer | string) => createHash('sha256').update(contents).digest('hex');

test('drains a blocked file read before retry and starts the replacement child only after the old one exits', async ({ page }) => {
  test.setTimeout(100_000);
  const directory = mkdtempSync(join(tmpdir(), 'planner-p02-'));
  const dataDir = join(directory, 'data');
  const workspace = join(directory, 'workspace');
  const profile = join(directory, 'profile');
  const output = resolve('test-results/p0-2');
  mkdirSync(dataDir); mkdirSync(workspace); mkdirSync(profile); mkdirSync(output, { recursive: true });
  writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({ workspaceRoot: workspace }));
  const log = join(directory, 'fixture-io.jsonl');
  const gate = join(directory, 'hold-read');
  const paced = join(directory, 'pace-read');
  const preflightGate = join(directory, 'hold-preflight');
  const startFile = join(directory, 'controlled-entry.mjs');
  const installedEntry = pathToFileURL(resolve('dist/service/entry.js')).href;
  // The child opens a real PDF handle. A test-only wrapper controls when an issued read resolves.
  writeFileSync(startFile, `
    import { appendFileSync, existsSync } from 'node:fs';
    import fs from 'node:fs/promises';
    import { syncBuiltinESMExports } from 'node:module';
    import { setTimeout as delay } from 'node:timers/promises';
    const hold = ${JSON.stringify(gate)}, pace = ${JSON.stringify(paced)}, log = ${JSON.stringify(log)};
    const open = fs.open;
    const record = (event, details = {}) => appendFileSync(log, JSON.stringify({event, at: Date.now(), pid: process.pid, ...details}) + '\\n');
    fs.open = async (...args) => {
      const handle = await open(...args);
      if (!String(args[0]).endsWith('large.pdf')) return handle;
      const read = handle.read.bind(handle);
      handle.read = async (...readArgs) => {
        if (existsSync(hold)) {
          record('blocked');
          while (existsSync(hold)) await delay(15);
          record('released');
        }
        const slow = existsSync(pace);
        if (slow) await delay(12);
        const result = await read(...readArgs);
        if (slow && result.bytesRead) record('read', { bytes: result.bytesRead });
        return result;
      };
      return handle;
    };
    const preflightGate = ${JSON.stringify(preflightGate)}, workspace = ${JSON.stringify(workspace)};
    const readdir = fs.readdir;
    fs.readdir = async (path, options) => {
      if (path === workspace && options?.withFileTypes && existsSync(preflightGate)) {
        record('preflight-blocked');
        while (existsSync(preflightGate)) await delay(15);
      }
      return readdir(path, options);
    };
    syncBuiltinESMExports();
    await import(${JSON.stringify(installedEntry)});
  `);
  const config = { dataDir, rendererDir: resolve('dist/renderer'), port: 0, scanStallTimeoutMs: 2500 };
  const events: { event: string; pid?: number; code?: number | null; signal?: NodeJS.Signals | null; at: number }[] = [];
  const controller = new LocalServiceController({
    entryPath: startFile, config, stopTimeoutMs: 1200, diagnosticsPath: join(dataDir, 'logs', 'startup.jsonl'),
    spawn: path => {
      const child = fork(path, [], { execArgv: [], stdio: ['ignore', 'ignore', 'inherit', 'ipc'], cwd: profile });
      events.push({ event: 'spawn', pid: child.pid, at: Date.now() });
      child.on('exit', (code, signal) => events.push({ event: 'exit', pid: child.pid, code, signal, at: Date.now() }));
      return child;
    },
  });

  const db = openDatabase(join(dataDir, 'planner.db'));
  try {
    migrateDatabase(db, {databaseExists: false, createBackup: () => undefined});
    const dict = new DictionaryService(db);
    const brand = dict.create({type: 'brand', code: '02', name: '隔离品牌'});
    const size = dict.create({type: 'product_size', code: '0404', name: '隔离类别'});
    const appearance = dict.create({type: 'appearance', code: '01', name: '1号外观'});
    const color = dict.create({type: 'color', code: '0', name: '白色'});
    const category = dict.create({type: 'main_category', code: '04', name: '印刷件'});
    const project = dict.create({type: 'project_item', code: '01', name: '标签', parentId: category.id});
    const product = new ProductService(db).create({sku: 'KEEP', model: 'P0-2', productCategory: '受保护占号',
      brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id});
    const appearances = new AppearanceService(db);
    const version = appearances.createDraft(product.id, {appearanceId: appearance.id, colorIds: [color.id], label: '1号外观'});
    appearances.activate(version.id, {expectedRevision: version.revision, expectedIdentityRevision: appearances.list(product.id).revision});
    const planning = new PlanningService(db);
    const plan = { productId: product.id, rows: [{clientId: 'p02', colorId: color.id, mainCategoryId: category.id, projectItemId: project.id}] };
    const drawing = planning.reserve({ ...plan, rows: [{...plan.rows[0], expectedFullCode: planning.preview(plan).rows[0].fullCode}] })[0];
    new DrawingAssociationService(db).correct({signedId: drawing.id, productId: product.id, appearanceVersionId: version.id}, 'P0-2 隔离保护夹具');

    let connection = await controller.start();
    const request = async (route: string, body?: object, expected = 200) => {
      const response = await fetch(connection.url + route, body === undefined ? undefined : {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-planner-token': connection.token, origin: connection.url },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBe(expected);
      return result;
    };
    const startScan = () => request('/api/tasks/workspace_scan', {}, 202);
    const state = () => request('/api/files/scans/status');
    const task = (id: string) => request('/api/tasks/' + id);
    const latest = () => request('/api/files/scans/latest');
    const waitForStatus = async (id: string, status: string) => {
      await expect.poll(async () => (await task(id)).status, {timeout: 15_000}).toBe(status);
      return task(id);
    };
    const measure = async () => {
      const startedAt = performance.now();
      const entry = await startScan();
      const completed = await waitForStatus(entry.id, 'completed');
      return { ...completed.result, wallMs: Math.round(performance.now() - startedAt), taskId: entry.id };
    };
    const empty = await measure();
    expect(empty.total).toBe(0);
    const source = join(workspace, '隔离资料', 'FIXTURE-PDF', '02.未转曲源文件');
    mkdirSync(source, {recursive: true});
    for (let i = 1; i <= 12; i++) writeFileSync(join(source, `normal-${i}.pdf`), '%PDF-1.4\n%%EOF\n');
    const normal = await measure();
    expect(normal.total).toBe(12);

    const large = join(source, 'large.pdf');
    const padded = Buffer.alloc(64 * 1024 * 1024, 32);
    padded.write('%PDF-1.4\n');
    padded.write('\n%%EOF\n', padded.length - 7);
    writeFileSync(large, padded);
    writeFileSync(paced, '');
    const largeResult = await measure();
    unlinkSync(paced);
    expect(largeResult.total).toBe(13);
    expect((await state()).recent.bytesRead).toBeGreaterThanOrEqual(padded.length);
    const diskHash = digest(padded);
    const snapshot = () => ({
      schema: db.prepare('select type,name,sql from sqlite_schema order by name').all(),
      protected: Object.fromEntries(['schema_migrations', 'products', 'product_appearance_versions', 'drawing_numbers',
        'historical_drawing_numbers', 'drawing_appearance_bindings', 'drawing_association_audit', 'pdf_product_assignments',
        'bom_versions'].map(table => [table, db.prepare(`select * from ${table} order by rowid`).all()])),
      indexed: db.prepare('select * from pdf_files order by id').all(),
      changes: db.prepare('select * from file_scan_changes order by id').all(),
      runs: db.prepare('select * from file_scan_runs order by id').all(),
      pdfHashes: Object.fromEntries(readdirSync(source).sort().map(name => [name, digest(readFileSync(join(source, name)))])),
    });
    const baseline = snapshot();
    expect(baseline.protected.drawing_appearance_bindings).toMatchObject([{appearance_version_id: version.id}]);
    expect(baseline.pdfHashes['large.pdf']).toBe(diskHash);

    const observed = () => (existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) : []);
    const waitForBlocked = async () => {
      const count = observed().filter(row => row.event === 'blocked').length;
      writeFileSync(gate, '');
      const entry = await startScan();
      await expect.poll(() => observed().filter(row => row.event === 'blocked').length).toBeGreaterThan(count);
      return entry;
    };

    await page.setViewportSize({width: 1600, height: 900});
    await page.goto(connection.url);
    const nav = page.getByRole('navigation', {name: '主导航'});
    if (!await nav.isVisible()) await page.getByRole('button', {name: '展开导航', exact: true}).click();
    await nav.getByRole('button', {name: 'PDF 文件中心', exact: true}).click();

    const cancelling = await waitForBlocked();
    await page.getByRole('button', {name: '取消扫描', exact: true}).click();
    await expect(page.getByText('资料库扫描：停止中', {exact: true})).toBeVisible();
    const stillRunning = await startScan();
    expect((await waitForStatus(stillRunning.id, 'failed')).error.code).toBe('SCAN_IN_PROGRESS');
    expect((await state()).active).toMatchObject({taskId: cancelling.id, status: 'stopping', stopReason: 'cancelled'});
    expect((await task(cancelling.id)).status).toBe('running');
    expect((await latest()).id).toBe(largeResult.scanId);
    await page.screenshot({path: join(output, 'cancel-draining.png')});
    unlinkSync(gate);
    await waitForStatus(cancelling.id, 'cancelled');
    expect(snapshot()).toEqual(baseline);

    const timeout = await waitForBlocked();
    await expect.poll(async () => (await state()).active?.stopReason).toBe('timeout');
    const sawTimeout = observed().filter(row => row.event === 'blocked').at(-1);
    const blockedWithoutProgressMs = Date.now() - sawTimeout.at;
    const timeoutOwner = (await state()).active;
    expect(timeoutOwner).toMatchObject({ taskId: timeout.id, status: 'stopping' });
    const scanProgress = page.getByRole('status', { name: '扫描任务进度' });
    await expect(scanProgress.getByText(/扫描超时，正在等待读取结束/)).toBeVisible();
    await page.screenshot({path: join(output, 'timeout-draining.png')});
    unlinkSync(gate);
    expect((await waitForStatus(timeout.id, 'failed')).error.code).toBe('SCAN_TIMEOUT');
    expect(snapshot()).toEqual(baseline);

    const gracefulTask = await waitForBlocked();
    const firstPid = events[0].pid!;
    const gracefulRestart = controller.restart();
    await expect.poll(() => controller.health().status).toBe('stopping');
    expect(events).toMatchObject([{event: 'spawn', pid: firstPid}]);
    unlinkSync(gate);
    connection = await gracefulRestart;
    expect(events.map(entry => entry.event)).toEqual(['spawn', 'exit', 'spawn']);
    expect(events[1]).toMatchObject({pid: firstPid, code: 0, signal: null});
    expect(await latest()).toMatchObject({id: largeResult.scanId, currentTotal: 13});
    expect(snapshot()).toEqual(baseline);

    await page.goto(connection.url);
    if (!await nav.isVisible()) await page.getByRole('button', {name: '展开导航', exact: true}).click();
    await nav.getByRole('button', {name: 'PDF 文件中心', exact: true}).click();
    await expect(page.getByRole('button', {name: '扫描资料库', exact: true})).toBeEnabled();
    writeFileSync(preflightGate, '');
    const abandoned = await request('/api/tasks/product_scan', { productId: product.id }, 202);
    await expect.poll(() => observed().some(row => row.event === 'preflight-blocked')).toBe(true);
    const preflightOwner = (await state()).active;
    expect(preflightOwner).toMatchObject({
      source: 'product', productId: product.id, taskId: abandoned.id, progress: {phase: 'checking-directories'},
    });
    await expect(page.getByText('当前型号扫描：准备扫描', {exact: true})).toBeVisible();
    await expect(page.getByText(/正在检查目录 · 已处理/)).toBeVisible();
    await expect(page.getByRole('button', {name: '取消扫描', exact: true})).toBeEnabled();
    await page.screenshot({path: join(output, 'directory-preflight.png')});
    const old = events[2].pid!;
    const restarting = controller.restart();
    const stopWatch = performance.now();
    await expect.poll(() => controller.health().status).toBe('stopping');
    // The old child must remain the only spawned process even while its reader is blocked.
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(events).toHaveLength(3);
    expect(events.at(-1)).toMatchObject({event: 'spawn', pid: old});
    expect(snapshot()).toEqual(baseline);
    connection = await restarting;
    const restartWallMs = Math.round(performance.now() - stopWatch);
    expect(events.map(entry => entry.event)).toEqual(['spawn', 'exit', 'spawn', 'exit', 'spawn']);
    expect(events[3]).toMatchObject({pid: old, signal: process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL'});
    expect(await request('/api/health')).toMatchObject({status: 'ok'});
    expect(await latest()).toMatchObject({id: largeResult.scanId, currentTotal: 13});
    expect(snapshot()).toEqual(baseline);
    expect((await request('/api/tasks/' + abandoned.id, undefined, 404)).error.code).toBe('TASK_NOT_FOUND');
    unlinkSync(preflightGate);
    const retry = await measure();
    expect(retry.taskId).not.toBe(abandoned.id);
    expect(retry.scanId).toBe(largeResult.scanId + 1);
    expect(retry).toMatchObject({total: 13, missing: 0, comparison: {added: 0, missing: 0, unchanged: 13}});

    const after = snapshot();
    expect(after.schema).toEqual(baseline.schema);
    expect(after.protected).toEqual(baseline.protected);
    expect(after.pdfHashes).toEqual(baseline.pdfHashes);
    const presence = (rows: unknown[]) => rows.map(row => {
      const { scanned_at, last_seen_scan_run_id, ...protectedFields } = row as Record<string, unknown>;
      return protectedFields;
    });
    expect(presence(after.indexed)).toEqual(presence(baseline.indexed));
    const integrity = db.pragma('integrity_check', {simple: true});
    const foreignKeys = db.pragma('foreign_key_check');
    expect(integrity).toBe('ok');
    expect(foreignKeys).toEqual([]);
    expect(db.prepare('select max(version) from schema_migrations').pluck().get()).toBe(26);

    await page.goto(connection.url);
    if (!await nav.isVisible()) await page.getByRole('button', {name: '展开导航', exact: true}).click();
    await nav.getByRole('button', {name: 'PDF 文件中心', exact: true}).click();
    await expect(page.getByText(`扫描记录 #${retry.scanId}`, {exact: false})).toBeVisible();
    await page.screenshot({path: join(output, 'recovered-scan.png')});

    const chunks = observed().filter(row => row.event === 'read');
    const gap = chunks.slice(1).map((row, index) => row.at - chunks[index].at);
    const diagnostics = readFileSync(join(dataDir, 'logs', 'pdf-scans.jsonl'), 'utf8').trim().split('\n').map(line => JSON.parse(line));
    const timeoutLog = diagnostics.filter(entry => entry.execution.id === timeoutOwner.id);
    const gracefulLog = diagnostics.filter(entry => entry.execution.taskId === gracefulTask.id);
    expect(gracefulLog.map(entry => entry.event)).toEqual(['started', 'stop-requested', 'failed', 'released']);
    expect(gracefulLog[1].execution).toMatchObject({stopReason: 'shutdown', stoppedPhase: 'reading'});
    writeFileSync(join(output, 'scan-recovery-evidence.json'), JSON.stringify({
      isolatedStallTimeoutMs: config.scanStallTimeoutMs, configuredProductionDefault: null,
      empty: {files: empty.total, wallMs: empty.wallMs}, normal: {files: normal.total, wallMs: normal.wallMs},
      large: {bytes: padded.length, scanWallMs: largeResult.wallMs, chunks: chunks.length,
        observedMs: chunks.at(-1).at - chunks[0].at, longestGapMs: Math.max(...gap)},
      timeout: {blockedWithoutProgressMs, stopRequestedAfterMs: Date.parse(timeoutLog[1].at) - sawTimeout.at,
        executionId: timeoutOwner.id, taskId: timeout.id, diagnosticEvents: timeoutLog.map(entry => entry.event)},
      preflight: {executionId: preflightOwner.id, taskId: abandoned.id, phase: preflightOwner.progress.phase},
      gracefulTaskId: gracefulTask.id, gracefulStopEvents: gracefulLog.map(entry => entry.event),
      cancelledTaskId: cancelling.id, excludedAttemptTaskId: stillRunning.id, abandonedTaskId: abandoned.id, retryTaskId: retry.taskId,
      beforeRestartScanId: largeResult.scanId, afterRestartScanId: largeResult.scanId, afterRetryScanId: retry.scanId,
      forcedRestartWallMs: restartWallMs, childEvents: events, indexCountBefore: baseline.indexed.length, indexCountAfter: after.indexed.length,
      sameSnapshotAfterCancelTimeoutAndRestart: true, schemaVersion: 26, schemaSha256: digest(JSON.stringify(after.schema)),
      protectedTableCounts: Object.fromEntries(Object.entries(after.protected).map(([table, rows]) => [table, rows.length])),
      protectedRowsSha256: digest(JSON.stringify(after.protected)), pdfHashes: after.pdfHashes, integrity, foreignKeys,
    }, null, 2));
  } finally {
    if (existsSync(gate)) unlinkSync(gate);
    if (existsSync(preflightGate)) unlinkSync(preflightGate);
    try { await controller.stop(); } finally {
      db.close();
      rmSync(directory, {recursive: true, force: true});
    }
  }
});
