import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { ProductService } from '../../src/core/products/product-service';
import { LocalServiceController } from '../../src/main/local-service-controller';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

async function navigate(page: Page, name: string) {
  const nav = page.getByRole('navigation', { name: '主导航' });
  if (!await nav.isVisible()) await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await nav.getByRole('button', { name, exact: true }).click();
}

test('new reservations display as pending across app reopen and change only on explicit activation and deactivation', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const dataDir = mkdtempSync(join(tmpdir(), 'planner-p03-'));
  const workspace = join(dataDir, 'fixture-library');
  const output = resolve('test-results/p0-3');
  mkdirSync(workspace);
  mkdirSync(output, { recursive: true });
  writeFileSync(join(dataDir, 'settings.json'), JSON.stringify({ workspaceRoot: workspace }));
  const db = openDatabase(join(dataDir, 'planner.db'));
  const controller = new LocalServiceController({
    entryPath: resolve('dist/service/entry.js'),
    config: { dataDir, rendererDir: resolve('dist/renderer'), port: 0, requireExistingDatabase: true },
  });

  try {
    migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const dictionaries = new DictionaryService(db);
    const brand = dictionaries.create({ type: 'brand', code: '02', name: '测试品牌' });
    const size = dictionaries.create({ type: 'product_size', code: '0101', name: '洗碗机' });
    const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '标准外观' });
    const white = dictionaries.create({ type: 'color', code: '0', name: '白色' });
    const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const logo = dictionaries.create({ type: 'project_item', parentId: main.id, code: '01', name: 'LOGO' });
    const manual = dictionaries.create({ type: 'project_item', parentId: main.id, code: '02', name: '说明书' });
    const product = new ProductService(db).create({ sku: 'FIXT40', model: 'T40', productCategory: '洗碗机',
      brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });

    const appearances = new AppearanceService(db);
    const draft = appearances.createDraft(product.id, { appearanceId: appearance.id, colorIds: [white.id], label: '一代' });
    const version = appearances.activate(draft.id, { expectedRevision: draft.revision, expectedIdentityRevision: appearances.list(product.id).revision });
    const plan = new PlanningService(db);
    const seed = { productId: product.id, appearanceVersionId: version.id,
      rows: [{ clientId: 'protected', mainCategoryId: main.id, projectItemId: manual.id, colorId: white.id }] };
    const baselineDrawing = plan.reserve({
      ...seed, rows: [{ ...seed.rows[0], expectedFullCode: plan.preview(seed).rows[0].fullCode }],
    })[0];
    const firstHistory = '02.0101.010.0401007', stoppedHistory = '02.0101.010.0401008', deletedHistory = '02.0101.010.0401009';
    const history = db.prepare(`insert into historical_drawing_numbers
      (full_code,brand_code,product_size_code,appearance_code,color_code,main_category_code,project_item_code,
        sequence,first_seen_at,last_seen_at,status,deleted_at,deletion_mode,deleted_previous_status)
      values (?,'02','0101','01','0','04','01',?,'2026-11-01','2026-11-01',?,?,?,?)`);
    history.run(firstHistory, 7, 'active', null, null, null);
    history.run(stoppedHistory, 8, 'inactive', null, null, null);
    history.run(deletedHistory, 9, 'active', '2026-11-01', 'retain_occupied', 'active');
    const schema = () => db.prepare('select type,name,sql from sqlite_schema order by name').all();
    const protectedRows = () => Object.fromEntries([
      'schema_migrations', 'products', 'product_appearance_versions', 'historical_drawing_numbers', 'drawing_association_audit',
    ].map(table => [table, db.prepare(`select * from ${table} order by rowid`).all()]));
    const initialSchema = schema(), initialProtected = protectedRows();
    const identityRows = () => ({
      drawings: db.prepare('select * from drawing_numbers order by id').all().map(row => {
        const { status: _status, ...identity } = row as Record<string, unknown>;
        return identity;
      }),
      bindings: db.prepare('select * from drawing_appearance_bindings order by origin,record_id').all(),
    });
    expect(identityRows().bindings).toMatchObject([{ record_id: baselineDrawing.id, appearance_version_id: version.id }]);

    let connection = await controller.start();
    const request = async (path: string, body?: object) => {
      const res = await fetch(connection.url + path, body === undefined ? undefined : { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-planner-token': connection.token, origin: connection.url }, body: JSON.stringify(body) });
      return { status: res.status, data: await res.json() };
    };
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.goto(connection.url);
    await navigate(page, '图号规划 / 更新包材');
    await page.getByRole('combobox', { name: '产品型号', exact: true }).selectOption(String(product.id));
    const next = page.getByRole('button', { name: '下一步', exact: true });
    await next.click();
    await page.getByRole('combobox', { name: '第 1 行主类别' }).selectOption(String(main.id));
    await page.getByRole('combobox', { name: '第 1 行项目明细' }).selectOption(String(logo.id));
    await page.getByRole('combobox', { name: '第 1 行颜色' }).selectOption(String(white.id));
    await next.click();
    await expect(page.getByText('可占用', { exact: true })).toBeVisible();
    await next.click();
    await page.getByRole('checkbox', { name: '已核对本次占号清单' }).check();
    await page.getByRole('button', { name: '确认批量占号', exact: true }).click();
    await expect(page.getByRole('region', { name: '本次占号结果' })).toBeVisible();
    const formal = () => db.prepare('select id,full_code,sequence,product_id,appearance_id,status from drawing_numbers where id <> ?')
      .get(baselineDrawing.id) as { id: number; full_code: string; sequence: number; product_id: number; appearance_id: number; status: string };
    const reserved = formal();
    expect(reserved).toMatchObject({ status: 'reserved', product_id: product.id, appearance_id: appearance.id });
    const before = identityRows();
    expect(before.bindings).toContainEqual(expect.objectContaining({record_id: reserved.id, product_id: product.id}));
    const exact = { exact: true };
    const openRow = (view: Page) => view.getByRole('button', { name: reserved.full_code, exact: true });
    const panel = (view: Page) => view.getByRole('complementary', { name: '图号详情' });
    const assertPending = async (view: Page) => {
      const badge = panel(view).locator('.drawing-business-badge');
      await expect(badge).toHaveText('待启动');
      await expect(badge).toHaveCSS('background-color', 'rgb(255, 243, 206)');
      await expect(panel(view).getByRole('combobox', { name: '图号业务状态' })).toHaveValue('reserved');
    };
    await page.getByRole('button', { name: '查看 T40 图号库' }).click();
    await assertPending(page);
    await page.screenshot({ path: join(output, 'drawing-pending-detail.png') });
    await page.reload();
    await navigate(page, '图号库');
    await expect(page.getByRole('row', { name: new RegExp(reserved.full_code.replaceAll('.', '\\.')) })).toContainText('待启动');
    await openRow(page).click();
    await assertPending(page);
    expect(formal()).toEqual(reserved);
    expect(identityRows()).toEqual(before);

    // Close the original client and server, then open a fresh client against the same isolated database.
    await page.close();
    await controller.stop();
    connection = await controller.start();
    const reopened = await browser.newPage({ viewport: {width: 1600, height: 1000} });
    try {
      await reopened.goto(connection.url);
      await navigate(reopened, '图号库');
      const filter = reopened.getByRole('combobox', {name:'状态',exact:true});
      const apply = async (status: string, count: number) => {
        await filter.selectOption(status);
        await reopened.getByRole('button', { name: '查询', exact: true }).click();
        await expect(reopened.locator('.drawing-list-heading')).toContainText(`${count} 个图号`);
        const query = status ? '?status=' + status : '';
        const result = await request('/api/drawings' + query);
        const navCount = await request('/api/drawings/navigation-counts' + query);
        expect(result.status).toBe(200);
        expect(navCount.status).toBe(200);
        expect(result.data.total).toBe(count);
        expect(navCount.data.total).toBe(count);
      };
      await apply('reserved', 2);
      await reopened.screenshot({ path: join(output, 'drawing-pending-filter.png') });
      await apply('active', 1);
      await expect(reopened.getByRole('button', { name: firstHistory, ...exact })).toBeVisible();
      await apply('inactive', 1);
      await expect(reopened.getByRole('button', { name: stoppedHistory, ...exact })).toBeVisible();
      await apply('reserved', 2);
      await openRow(reopened).click();
      await assertPending(reopened);
      expect(formal()).toEqual(reserved);
      expect(identityRows()).toEqual(before);

      const duplicate = await request('/api/planning/reserve', { productId: product.id,
        rows: [{ clientId: 'duplicate', mainCategoryId: main.id, projectItemId: logo.id, colorId: white.id,
          expectedFullCode: reserved.full_code }] });
      expect(duplicate.status).toBe(409);
      expect(duplicate.data.error.code).toMatch(/PLAN_STALE|DRAWING_CODE_CONFLICT/);
      expect(identityRows()).toEqual(before);

      reopened.on('dialog', dialog => dialog.accept());
      const select = panel(reopened).getByRole('combobox', { name: '图号业务状态' });
      const badge = panel(reopened).locator('.drawing-business-badge');
      await select.selectOption('active');
      await expect(badge).toHaveText('使用中');
      await expect(badge).toHaveCSS('background-color', 'rgb(200, 241, 217)');
      await expect(reopened.locator('.drawing-list-heading')).toContainText('1 个图号');
      await reopened.screenshot({ path: join(output, 'drawing-active-detail.png') });
      const active = formal();
      expect(active).toEqual({ ...reserved, status: 'active' });
      await select.selectOption('inactive');
      await expect(badge).toHaveText('已停用');
      const stopped = formal();
      expect(stopped).toEqual({ ...reserved, status: 'voided' });
      expect(identityRows()).toEqual(before);
      await panel(reopened).getByRole('button', { name: '关闭图号详情' }).click();
      await apply('inactive', 2);
      await expect(openRow(reopened)).toBeVisible();
      await reopened.screenshot({ path: join(output, 'drawing-inactive-filter.png') });
      await apply('', 4);
      await reopened.getByRole('button', { name: /^回收站/ }).click();
      await expect(reopened.getByRole('button', { name: deletedHistory, ...exact })).toBeVisible();
      await reopened.getByRole('button', { name: deletedHistory, ...exact }).click();
      await expect(panel(reopened).locator('.drawing-business-badge')).toHaveText('删除·保留占号');
      await reopened.screenshot({ path: join(output, 'drawing-recycle-detail.png') });

      expect(schema()).toEqual(initialSchema);
      expect(protectedRows()).toEqual(initialProtected);
      const integrity = db.pragma('integrity_check', {simple: true});
      const foreignKeys = db.pragma('foreign_key_check');
      const schemaVersion = db.prepare('select max(version) from schema_migrations').pluck().get();
      expect(integrity).toBe('ok');
      expect(foreignKeys).toEqual([]);
      expect(schemaVersion).toBe(26);
      writeFileSync(join(output, 'drawing-status-evidence.json'), JSON.stringify({
        schemaVersion, integrity, foreignKeys, reserved, active, stopped, rejectedDuplicate: duplicate.data.error,
        before, after: identityRows(), protectedTables: Object.keys(initialProtected), protectedRowsUnchanged: true,
        schemaUnchanged: true, reopenedWithNewClientAndService: true,
      }, null, 2));
    } finally { await reopened.close(); }
  } finally {
    await controller.stop();
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});
