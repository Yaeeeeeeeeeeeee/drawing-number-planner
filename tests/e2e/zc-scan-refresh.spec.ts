import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { DrawingAssociationService } from '../../src/core/drawings/drawing-association-service';
import { DrawingForceReleaseService } from '../../src/core/drawings/drawing-force-release-service';
import { PdfClassificationRepository } from '../../src/core/files/pdf-classification';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { PackagingCatalogService } from '../../src/core/packaging/packaging-catalog';
import { PlanningService } from '../../src/core/planning/planning-service';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { LocalServiceController } from '../../src/main/local-service-controller';

async function navigate(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: '主导航' });
  if (!await nav.isVisible()) await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await nav.getByRole('button', { name, exact: true }).click();
}

test('actual watcher and archive commits refresh both ZC views without writing product ownership', async ({ page, context }) => {
  test.setTimeout(100_000);
  const dataDir = mkdtempSync(join(tmpdir(), 'planner-p04-zc-'));
  const workspace = join(dataDir, 'fixture-library');
  const output = resolve('test-results/p0-4');
  mkdirSync(workspace);
  mkdirSync(output, { recursive: true });
  const settings = new WorkspaceSettingsStore(join(dataDir, 'settings.json'));
  settings.setWorkspaceRoot(workspace);
  const db = openDatabase(join(dataDir, 'planner.db'));
  const controller = new LocalServiceController({
    entryPath: resolve('dist/service/entry.js'),
    config: { dataDir, rendererDir: resolve('dist/renderer'), port: 0, requireExistingDatabase: true },
  });

  try {
    const pdf = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n';
    const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
    const source = (directory: string, name: string) => join(workspace, directory, '02.未转曲源文件', name + '.pdf');
    const writePdf = (path: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, pdf); };
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const dict = new DictionaryService(db), products = new ProductService(db), appearances = new AppearanceService(db), plan = new PlanningService(db);
    const brand = dict.create({ type: 'brand', code: '02', name: 'ZC 隔离测试品牌' });
    const color = dict.create({ type: 'color', code: '0', name: '白色' });
    const appearanceCodes = ['01', '02'].map((code, index) => dict.create({ type: 'appearance', code, name: `${index + 1}号外观` }));
    const main = dict.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const item = dict.create({ type: 'project_item', parentId: main.id, code: '01', name: '铭牌' });
    const archiveItem = dict.create({ type: 'project_item', parentId: main.id, code: '02', name: '归档项目' });
    new PackagingCatalogService(db, dataDir).saveConfig({ projectItemId: archiveItem.id, mode: 'manual', parameters: [] });
    const reserve = (productId: number, appearanceVersionId: number, projectItemId = item.id) => {
      const input = { productId, appearanceVersionId, rows: [{ clientId: 'zc', mainCategoryId: main.id, projectItemId, colorId: color.id }] };
      return plan.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: plan.preview(input).rows[0].fullCode }] })[0];
    };

    const fixture = ['ZC100', 'ZC100（WB55）', 'ZC200', 'ZC200（WB55）'].map((model, index) => {
      const sku = `FIXZC${index + 1}`;
      const size = dict.create({ type: 'product_size', code: `040${index + 1}`, name: model });
      const product = products.create({ sku, model, brandId: brand.id, productSizeId: size.id,
        defaultAppearanceId: appearanceCodes[0].id, productCategory: '冰柜' });
      const directory = join('冰柜', `${sku}-${model}`);
      const variants = appearanceCodes.map((appearance, offset) => {
        const versionNumber = offset + 1;
        const draft = appearances.createDraft(product.id, { appearanceId: appearance.id, colorIds: [color.id], label: `${versionNumber}号外观` });
        const version = appearances.activate(draft.id, { expectedRevision: draft.revision, expectedIdentityRevision: appearances.list(product.id).revision });
        const drawing = reserve(product.id, version.id);
        return { productId: product.id, versionId: version.id, versionNumber, appearanceId: appearance.id, drawingId: drawing.id,
          fullCode: drawing.fullCode, path: source(directory, `${drawing.fullCode}-夹具${index + 1}外观${versionNumber}`) };
      });
      writePdf(variants[0].path);
      return { product, directory, variants };
    });
    const [zc100, wb100, zc200, wb200] = fixture;
    const archiveDrawing = reserve(wb200.product.id, wb200.variants[1].versionId, archiveItem.id);
    const releasedDrawing = reserve(zc100.product.id, zc100.variants[1].versionId, archiveItem.id);
    const detachedPdf = source(zc100.directory, `${releasedDrawing.fullCode}-强制脱钩`);
    const ambiguousCodes = [zc100.variants[0].fullCode, wb100.variants[0].fullCode];
    const ambiguousPdf = source(wb100.directory, `${ambiguousCodes.join('-')}-两个图号`);
    writePdf(ambiguousPdf);
    writePdf(detachedPdf);

    const historical = db.prepare(`insert into historical_drawing_numbers
      (full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,sequence,first_seen_at,last_seen_at)
      values (?,'02',?,'02','0','04','01',?,'2026-11-19','2026-11-19')`);
    const pendingCode = '02.0403.020.0401720', ambiguousCode = '02.0401.020.0401721', boundCode = '02.0402.020.0401722';
    const pendingId = Number(historical.run(pendingCode,'0403',720).lastInsertRowid);
    const ambiguousId = Number(historical.run(ambiguousCode,'0401',721).lastInsertRowid);
    const boundId = Number(historical.run(boundCode,'0402',722).lastInsertRowid);
    const boundPdf = join(workspace, wb100.directory, '03.量产后的变更文件（已量产的产品看最新日期）', '00.首批大货', `${boundCode}-人工绑定（转曲）.pdf`);
    writePdf(boundPdf);
    const files = new FileService(new FileRepository(db), settings);
    await files.scan();
    const boundFile = db.prepare("select id,material_batch_id from pdf_files where file_name like '%人工绑定%'").get() as { id: number; material_batch_id: number };
    const classifier = new PdfClassificationRepository(db);
    const assignment = { ids: [boundFile.id], productId: wb100.product.id, materialBatchId: boundFile.material_batch_id };
    classifier.apply({ ...assignment, fingerprint: classifier.preview(assignment).fingerprint, confirmed: true, reason: '台架人工 PDF 归纳' });
    const association = new DrawingAssociationService(db);
    association.correct({ signedId: -boundId, productId: wb100.product.id, appearanceVersionId: wb100.variants[1].versionId }, '台架人工绑定');
    const release = new DrawingForceReleaseService(db);
    const force = release.preview(releasedDrawing.id);
    release.confirm({ signedId: releasedDrawing.id, fingerprint: force.fingerprint, confirmed: true });
    const reused = reserve(zc100.product.id, zc100.variants[1].versionId, archiveItem.id);
    expect(reused.fullCode).toBe(releasedDrawing.fullCode);
    expect(reused.id).not.toBe(releasedDrawing.id);
    const assignments = db.prepare('select * from pdf_product_assignments order by pdf_file_id');
    const baselinePaths = [...fixture.map(row => row.variants[0].path), detachedPdf, ambiguousPdf, boundPdf];
    const baselineFiles = () => baselinePaths.map(path => ({ name: path.split('/').at(-1), sha256: hash(path) }));
    const tableRows = (tables: string[]) => Object.fromEntries(tables.map(table => [table, db.prepare(`select * from ${table} order by rowid`).all()]));
    const protectedData = () => tableRows(['products', 'product_appearance_versions', 'product_identity_members',
      'drawing_numbers', 'drawing_appearance_bindings', 'drawing_appearance_usages', 'drawing_association_audit',
      'drawing_force_releases', 'drawing_force_release_files', 'pdf_product_assignments', 'pdf_product_assignment_audit', 'schema_migrations', 'bom_versions', 'bom_items']);
    const schema = () => db.prepare('select type,name,sql from sqlite_schema order by name').all();

    const connection = await controller.start();
    const request = async (path: string, body?: object) => {
      const result = await fetch(connection.url + path, body === undefined ? undefined : { method: 'POST', body: JSON.stringify(body),
        headers: { 'content-type': 'application/json', origin: connection.url, 'x-planner-token': connection.token } });
      const value = await result.json();
      expect(result.ok, JSON.stringify(value)).toBe(true);
      return value;
    };
    const scan = () => request('/api/files/scans/latest');
    const pdfFacts = () => request('/api/files?pageSize=100');
    const historicIdentity = () => db.prepare(`select id, full_code, sequence, appearance_code, status, first_seen_at, deleted_at
      from historical_drawing_numbers where id in (?,?,?) order by id`).all(pendingId, ambiguousId, boundId);
    const initial = { scan: await scan(), pdf: await pdfFacts(), diagnostic: association.preview(undefined, [-pendingId, -ambiguousId, -boundId]),
      protected: protectedData(), schema: schema(), files: baselineFiles(), historic: historicIdentity() };
    const pdfPage = await context.newPage();
    for (const tab of [page, pdfPage]) {
      await tab.setViewportSize({ width: 1600, height: 1000 });
      await tab.goto(connection.url);
    }
    await navigate(page, '图号库');
    await navigate(pdfPage, 'PDF 文件中心');
    await page.getByRole('textbox', { name: '关键词', exact: true }).fill('02.040');
    await page.getByRole('button', { name: '查询', exact: true }).click();
    const drawingCount = page.getByRole('navigation', { name: '图号导航' }).getByRole('button', { name: '全部图号', exact: true }).locator('.pdf-nav-count');
    await expect(drawingCount).toHaveText(/^\d+$/);
    const countBefore = Number(await drawingCount.textContent());
    await page.getByRole('button', { name: /^诊断图号关联（/ }).click();
    const diagnostic = page.getByRole('region', { name: '关联诊断预览' });
    await expect(diagnostic.getByText(new RegExp(`${pendingCode}.*缺少产品依据`))).toBeVisible();
    await expect(pdfPage.getByText(/夹具1外观1/).first()).toBeVisible();
    const beforeBox = pdfPage.getByRole('checkbox', { name: `选择 ${zc100.variants[0].fullCode}-夹具1外观1.pdf` });
    await beforeBox.check();
    await page.screenshot({ path: join(output, 'zc-drawing-diagnosis-before.png') });
    const candidatePdf = source(zc200.directory, `${pendingCode}-新增候选`);
    const competing = [source(zc100.directory, `${ambiguousCode}-候选A`), source(wb100.directory, `${ambiguousCode}-候选B`)];
    const newHistoryCode = '02.0404.020.0401723';
    const newHistoryPdf = source(wb200.directory, `${newHistoryCode}-新增历史图号`);
    for (const entry of [...fixture.map(row => row.variants[1].path), candidatePdf, ...competing, newHistoryPdf]) writePdf(entry);
    await expect(page.getByRole('button', { name: newHistoryCode, exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(drawingCount).toHaveText(String(countBefore + 1));
    await expect(diagnostic.getByText(new RegExp(`${pendingCode}.*唯一候选`))).toBeVisible({ timeout: 20_000 });
    await expect(diagnostic.getByText(new RegExp(`${ambiguousCode}.*候选有歧义`))).toBeVisible({ timeout: 20_000 });
    await expect(pdfPage.getByText(/夹具4外观2/).first()).toBeVisible({ timeout: 20_000 });
    await expect(beforeBox).toBeChecked();
    await expect(page.getByRole('textbox', { name: '关键词', exact: true })).toHaveValue('02.040');
    await expect.poll(async () => (await pdfFacts()).items.length).toBe(15);
    await expect(pdfPage.getByRole('navigation', { name: '资料导航' }).getByRole('button', { name: '全部文件', exact: true }).locator('.pdf-nav-count')).toHaveText('15');

    const watcher = { scan: await scan(), pdf: await pdfFacts(), diagnostic: association.preview(undefined, [-pendingId, -ambiguousId, -boundId]) };
    expect(watcher.scan.id).toBeGreaterThan(initial.scan.id);
    expect(watcher.diagnostic.records).toEqual(expect.arrayContaining([
      expect.objectContaining({ signedId: -pendingId, state: 'ready', targets: [{ signedId: -pendingId, productId: zc200.product.id, appearanceVersionId: null }] }),
      expect.objectContaining({ signedId: -ambiguousId, state: 'ambiguous' }),
      expect.objectContaining({ signedId: -boundId, state: 'associated',
        targets: [{ signedId: -boundId, productId: wb100.product.id, appearanceVersionId: wb100.variants[1].versionId }] }),
    ]));
    expect(watcher.diagnostic.records.find(row => row.signedId === -ambiguousId)?.targets.map(row => row.productId).sort()).toEqual([zc100.product.id, wb100.product.id].sort());
    for (const { product, variants } of fixture) {
      for (const variant of variants) {
        const filesForVersion = await request(`/api/files?productId=${product.id}&appearanceVersionId=${variant.versionId}`);
        expect(filesForVersion.items).toEqual(expect.arrayContaining([expect.objectContaining({
          drawingId: variant.drawingId, fullCode: variant.fullCode, productId: product.id, matchStatus: 'matched',
        })]));
        expect(filesForVersion.items.every((file: { fullCode: string }) => file.fullCode !== variants.find(row => row.versionId !== variant.versionId)?.fullCode)).toBe(true);
        const drawing = await request(`/api/drawings/${variant.drawingId}`);
        expect(drawing).toMatchObject({ productId: product.id, appearanceVersionId: variant.versionId, fullCode: variant.fullCode });
      }
    }
    await pdfPage.screenshot({ path: join(output, 'zc-pdf-after-watcher.png') });
    await page.screenshot({ path: join(output, 'zc-drawing-diagnosis-after.png') });

    const task = await request('/api/packaging/tasks', { productId: wb200.product.id, type: 'new',
      name: 'ZC 隔离归档', drawings: [{ origin: 'planned', id: archiveDrawing.id }] });
    writePdf(join(workspace, task.taskDirectory, `${archiveDrawing.fullCode}-归档验证.pdf`));
    const found = await request(`/api/packaging/tasks/${task.id}/discover`, {});
    await request(`/api/packaging/tasks/${task.id}/items/${found.items[0].id}/review`, { sha256: found.items[0].sha256 });
    const archivePrefix = `/api/packaging/tasks/${task.id}/archive`;
    await expect.poll(async () => (await request(`${archivePrefix}-preview`)).ready).toBe(true);
    const diagnosisAfterArchive = page.waitForResponse(response => response.url().endsWith('/api/drawings/association-preview')
      && response.request().method() === 'POST' && response.ok());
    expect((await request(archivePrefix, { confirmed: true })).state).toBe('completed');
    await diagnosisAfterArchive;
    const archive = { scan: await scan(), pdf: await pdfFacts(), task: db.prepare('select index_scan_id from packaging_tasks where id=?').get(task.id) };
    expect(archive.scan.id).toBeGreaterThan(watcher.scan.id);
    expect(archive.task).toEqual({ index_scan_id: archive.scan.id });
    await expect(pdfPage.locator('tbody').getByText(archiveDrawing.fullCode, { exact: true }).last()).toBeVisible({ timeout: 12_000 });
    await expect(diagnostic.getByText(new RegExp(`${pendingCode}.*唯一候选`))).toBeVisible();
    await pdfPage.screenshot({ path: join(output, 'zc-pdf-after-archive.png') });
    await navigate(pdfPage, '编码字典');
    await navigate(pdfPage, 'PDF 文件中心');
    await expect(pdfPage.locator('tbody').getByText(archiveDrawing.fullCode, { exact: true }).last()).toBeVisible();

    const manualScan = pdfPage.waitForResponse(response => response.url().includes('/api/tasks/') && response.ok()
      && response.request().method() === 'GET' && response.json().then(task => task.status === 'completed'));
    await pdfPage.getByRole('button', { name: '扫描资料库' }).click();
    await manualScan;
    await expect(pdfPage.getByText('资料库扫描完成', { exact: true })).toBeVisible();
    const manualScanFacts = await scan();
    expect(manualScanFacts.id).toBeGreaterThan(archive.scan.id);
    expect(manualScanFacts.scope.kind).toBe('workspace');

    const after = { protected: protectedData(), files: baselineFiles(), schema: schema(), historic: historicIdentity() };
    expect(after).toEqual({ protected: initial.protected, files: initial.files, schema: initial.schema, historic: initial.historic });
    const detached = archive.pdf.items.find((row: { fileName: string }) => row.fileName.includes('强制脱钩'));
    expect(detached).toMatchObject({ drawingId: null, historicalDrawingId: null, matchStatus: 'pending', classificationWarning: 'drawing-force-released' });
    const ambiguous = archive.pdf.items.find((row: { fileName: string }) => row.fileName.includes('两个图号'));
    expect(ambiguous).toMatchObject({ drawingId: null, historicalDrawingId: null, matchStatus: 'pending' });
    expect(assignments.all()).toEqual(initial.protected.pdf_product_assignments);
    const integrity = db.pragma('integrity_check', { simple: true });
    const foreignKeys = db.pragma('foreign_key_check');
    expect(integrity).toBe('ok');
    expect(foreignKeys).toEqual([]);

    await navigate(page, '编码字典');
    await navigate(page, '图号库');
    await expect(page.getByRole('button', { name: newHistoryCode, exact: true })).toBeVisible();
    await expect(diagnostic.getByText(new RegExp(`${pendingCode}.*唯一候选`))).toBeVisible();
    await page.getByRole('checkbox', { name: `选择图号 ${pendingCode}`, exact: true }).check();
    await page.getByRole('button', { name: '自动归类（已选 1 项）', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: /已更新 1 条关联/ })).toBeVisible();
    const auditAfterManual = db.prepare('select * from drawing_association_audit order by id').all();
    expect(auditAfterManual).toHaveLength(initial.protected.drawing_association_audit.length + 1);
    expect(auditAfterManual.at(-1)).toMatchObject({ origin: 'historical', record_id: pendingId, product_id: zc200.product.id });
    expect(association.preview(undefined, [-ambiguousId]).records[0].state).toBe('ambiguous');
    await page.screenshot({ path: join(output, 'zc-manual-classification.png') });

    const compactPdf = (value: typeof initial.pdf) => value.items.map(({ id, fileName, drawingId, historicalDrawingId, productId,
      matchStatus, classificationWarning }: Record<string, unknown>) =>
      ({ id, fileName, drawingId, historicalDrawingId, productId, matchStatus, classificationWarning }));
    const evidence = { schemaVersion: 26, fixture: fixture.map(({ product, variants }) => ({ model: product.model, sku: product.sku,
      variants: variants.map(({ path: _path, ...identity }) => identity) })), scanBefore: initial.scan, watcherScan: watcher.scan, archiveScan: archive.scan, manualScan: manualScanFacts,
      pdfBefore: compactPdf(initial.pdf), pdfAfterWatcher: compactPdf(watcher.pdf), pdfAfterArchive: compactPdf(archive.pdf),
      diagnosisBefore: initial.diagnostic.records, diagnosisAfterWatcher: watcher.diagnostic.records,
      protectedBefore: initial.protected, protectedAfter: after.protected, schemaUnchanged: true,
      schemaSha256: createHash('sha256').update(JSON.stringify(after.schema)).digest('hex'), filesBefore: initial.files, filesAfter: after.files,
      historicBefore: initial.historic, historicAfter: after.historic, integrity, foreignKeys, auditAfterManual };
    writeFileSync(join(output, 'zc-scan-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  } finally {
    await controller.stop();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
