// Installed Electron acceptance, invoked only with verify-comprehensive-windows.cjs's ephemeral fixture.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');

module.exports = async function verifyV41V42({ page, app, legacy, evidence, writePdf, snapshot, go }) {
  const temporaryRoot = process.env.RUNNER_TEMP;
  assert.ok(temporaryRoot && path.relative(temporaryRoot, legacy) && !path.relative(temporaryRoot, legacy).startsWith('..') && !path.isAbsolute(path.relative(temporaryRoot, legacy)), 'Only the native verifier RUNNER_TEMP fixture is authorized');
  assert.ok(fs.existsSync(path.join(legacy, 'legacy.json')), 'Native verifier fixture marker required');
  assert.equal(path.resolve(await app.evaluate(({ app }) => app.getPath('userData'))), path.resolve(legacy));
  const dbFile = path.join(legacy, 'planner.db');
  const before = snapshot(dbFile);
  const originalPdfs = [];
  const http = (route, body, method = 'POST') => page.evaluate(async ({ route, body, method }) => {
    const token = (await (await fetch('/api/session', { method: 'POST' })).json()).token;
    const response = await fetch(route, { method, headers: { 'content-type': 'application/json', 'x-planner-token': token }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, result: await response.json() };
  }, { route, body, method });
  const request = async (route, body, method) => { const response = await http(route, body, method); assert.ok(response.status < 400, `${route}: ${JSON.stringify(response)}`); return response.result; };
  const get = route => request(route, undefined, 'GET');
  const items = result => result.items ?? result;
  const ensureDictionary = async (type, code, name, parentId) => {
    const existing = items(await get(`/api/dictionaries/${type}`)).find(item => item.code === code && (parentId == null || item.parentId === parentId));
    return existing ?? request(`/api/dictionaries/${type}`, { code, name, ...(parentId == null ? {} : { parentId }) });
  };
  const size = async width => { await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 1080), width); await page.waitForFunction(width => innerWidth === width, width); };
  const recordPdf = (relative, text) => { const file = path.join(legacy, 'workspace', ...relative); originalPdfs.push({ file, hash: writePdf(file, text) }); return file; };
  const scan = async () => {
    await page.getByRole('button', { name: '扫描资料库', exact: true }).click();
    await page.getByText('资料库扫描完成', { exact: true }).waitFor({ timeout: 45000 });
    await page.getByRole('button', { name: '扫描资料库', exact: true }).waitFor();
  };
  const showCatalog = async () => {
    const catalog = page.getByRole('navigation', { name: '资料导航', exact: true });
    if (!await catalog.isVisible()) await page.getByRole('button', { name: '产品／批次导航', exact: true }).click();
    return catalog;
  };
  const revealBatch = async title => {
    const catalog = await showCatalog();
    const productBranch = catalog.locator(`.pdf-nav-product[data-product-id="${product.id}"]`);
    const expand = productBranch.locator('.pdf-nav-expand').first();
    if (await expand.count() && await expand.getAttribute('aria-expanded') === 'false') await expand.click();
    const orphans = catalog.locator('.catalog-nav-orphans');
    if (await orphans.count() && await orphans.getAttribute('open') === null) await orphans.locator('summary').click();
    const node = catalog.getByRole('button', { name: `批次 ${title}`, exact: true });
    await node.waitFor();
    return node;
  };
  const openMenu = async node => {
    const catalog = await showCatalog();
    const selected = await catalog.locator('[aria-current=page]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
    await node.click({ button: 'right' });
    const menu = page.getByRole('menu', { name: '批次操作', exact: true });
    await menu.waitFor();
    assert.deepEqual(await catalog.locator('[aria-current=page]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))), selected, 'Right click must not navigate');
    assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['重命名批次', '删除批次']);
    assert.equal(await menu.getByRole('separator').count(), 1);
    const bounds = await menu.boundingBox();
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'Context menu must fit the viewport');
    return menu;
  };

  await size(1920);
  // Add distinct records through the same HTTP services used by the installed renderer.
  const baseProduct = await get('/api/products/5');
  const appearance = await ensureDictionary('appearance', '01', '外观');
  const white = await ensureDictionary('color', '0', '白色');
  const gray = await ensureDictionary('color', '1', '灰色');
  const main = await ensureDictionary('main_category', '04', '印刷件类');
  const packaging = await ensureDictionary('main_category', '05', '包装类');
  const logo = await ensureDictionary('project_item', '01', 'LOGO', main.id);
  const box = await ensureDictionary('project_item', '01', '大外箱', packaging.id);
  const product = await request('/api/products', { brandId: baseProduct.brandId, productSizeId: baseProduct.productSizeId, defaultAppearanceId: appearance.id, sku: 'V41VERIFY', model: 'NativeV41', productCategory: 'V41隔离验收' });
  const plan = { productId: product.id, rows: [{ clientId: 'native-print', colorId: white.id, mainCategoryId: main.id, projectItemId: logo.id }, { clientId: 'native-box', colorId: gray.id, mainCategoryId: packaging.id, projectItemId: box.id }] };
  const preview = await request('/api/planning/preview', plan);
  const formal = items(await request('/api/planning/reserve', { ...plan, rows: plan.rows.map(row => ({ ...row, expectedFullCode: preview.rows.find(item => item.clientId === row.clientId).fullCode })) }));
  for (const drawing of formal) await request(`/api/drawings/${drawing.id}/activate`, { confirmed: true });
  const productPath = ['V41隔离验收', 'V41VERIFY-NativeV41'];
  const sourcePdf = recordPdf([...productPath, '02.未转曲源文件', `${formal[0].fullCode}-V41唯一源文件.pdf`], 'Native V41 unique source');
  const outlinedPdf = recordPdf([...productPath, '03.量产后的变更文件', `${formal[0].fullCode}-V41唯一成品（转曲）.pdf`], 'Native V41 unique outlined');
  const historicalCode = `${formal[0].fullCode.slice(0, -3)}998`;
  assert.equal((await get(`/api/drawings?keyword=${encodeURIComponent(historicalCode)}`)).total, 0, 'Historical test code must be new');
  const protectedPdf = recordPdf([...productPath, '03.量产后的变更文件', '01.V42保护批次', `${historicalCode}-V42历史文件.pdf`], 'Native V42 protected history');
  const disposablePdf = recordPdf([...productPath, '03.量产后的变更文件', '02.V42空批次', 'V42无关联索引.pdf'], 'Native V42 disposable index only');
  await go(page, 'PDF 文件中心');
  await scan();
  const initialCatalog = await showCatalog();
  const fileFilters = initialCatalog.locator('.pdf-nav-filters');
  if (await fileFilters.getAttribute('open') === null) await fileFilters.locator('summary').click();
  await initialCatalog.getByRole('textbox', { name: '文件关键词', exact: true }).fill('');
  for (const [label, value] of [['匹配状态', ''], ['转曲类型', ''], ['存在状态', 'all'], ['纳入范围', 'included']]) await initialCatalog.getByRole('combobox', { name: label, exact: true }).selectOption(value);
  await page.getByRole('button', { name: '筛选 PDF', exact: true }).click();
  await initialCatalog.getByRole('button', { name: '全部文件', exact: true }).click();
  let batches = items(await get('/api/material-batches'));
  const protectedBatch = batches.find(batch => batch.relativePath.includes('01.V42保护批次'));
  const emptyBatch = batches.find(batch => batch.relativePath.includes('02.V42空批次'));
  assert.ok(protectedBatch && emptyBatch);
  const historical = (await get(`/api/drawings?keyword=${encodeURIComponent(historicalCode)}`)).items.find(row => row.fullCode === historicalCode);
  assert.ok(historical && historical.origin === 'historical');

  // Six actions, two groups, one row; only the toolbar scrolls at the narrow viewport.
  const toolbar = page.getByRole('region', { name: 'PDF 索引管理', exact: true });
  assert.deepEqual(await toolbar.getByRole('button').allTextContents(), ['全选', '取消选择', '人工归纳', '排除所选文件', '恢复所选文件', '移除文件记录']);
  assert.equal(await toolbar.getByRole('group').count(), 2);
  assert.equal(await page.getByRole('button', { name: '恢复默认表格布局', exact: true }).count(), 1);
  const toolbarGeometry = [];
  for (const width of [1920, 720]) {
    await size(width);
    const geometry = await toolbar.evaluate(element => {
      const buttons = [...element.querySelectorAll('button')].map(button => { const rect = button.getBoundingClientRect(); return { y: rect.y, height: rect.height, nowrap: getComputedStyle(button).whiteSpace }; });
      return { width: innerWidth, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, overflowX: getComputedStyle(element).overflowX, pageOverflow: document.documentElement.scrollWidth - innerWidth, buttons };
    });
    console.log('V42 toolbar geometry', JSON.stringify(geometry));
    assert.ok(geometry.buttons.every(button => button.height >= 32 && button.height <= 36 && button.nowrap === 'nowrap'));
    assert.ok(Math.max(...geometry.buttons.map(button => button.y)) - Math.min(...geometry.buttons.map(button => button.y)) < 2, 'All six buttons must remain on one row');
    assert.ok(geometry.pageOverflow <= 1, 'Narrow toolbar must not overflow the page');
    if (width === 720) { assert.ok(geometry.scrollWidth >= geometry.clientWidth); assert.equal(geometry.overflowX, 'auto'); await toolbar.evaluate(element => { element.scrollLeft = element.scrollWidth; }); }
    toolbarGeometry.push(geometry);
    await page.screenshot({ path: path.join(evidence, `Windows-V42-六按钮-${width}.png`) });
  }
  await size(1920);
  await toolbar.evaluate(element => { element.scrollLeft = 0; });
  let node = await revealBatch(protectedBatch.name);
  const catalog = await showCatalog();
  assert.equal(await catalog.locator('.pdf-nav-batch button[aria-label^="重命名"]').count(), 0);
  assert.ok((await catalog.locator('.pdf-nav-batch').evaluateAll(rows => rows.every(row => row.querySelectorAll('button').length === 1))));
  let menu = await openMenu(node);
  await page.keyboard.press('Escape'); await menu.waitFor({ state: 'detached' });
  menu = await openMenu(node);
  await page.getByRole('heading', { name: 'PDF 文件中心', exact: true }).click(); await menu.waitFor({ state: 'detached' });
  menu = await openMenu(node);
  await menu.getByRole('menuitem', { name: '重命名批次', exact: true }).click();
  const rename = page.getByRole('dialog', { name: '批次显示名称', exact: true });
  await rename.getByLabel('批次显示名称', { exact: true }).fill('V42显示名');
  await rename.getByRole('button', { name: '保存显示名称', exact: true }).click();
  await rename.waitFor({ state: 'detached' });
  node = await revealBatch('V42显示名');
  const renamed = items(await get('/api/material-batches')).find(batch => batch.id === protectedBatch.id);
  assert.equal(renamed.displayName, 'V42显示名');
  assert.equal(renamed.relativePath, protectedBatch.relativePath);
  assert.equal(renamed.originalName, protectedBatch.originalName);
  assert.equal(renamed.sequenceNumber, protectedBatch.sequenceNumber);
  menu = await openMenu(node);
  await menu.getByRole('menuitem', { name: '删除批次', exact: true }).click();
  let deletion = page.getByRole('dialog', { name: '删除批次', exact: true });
  await deletion.waitFor();
  assert.equal(await deletion.getByRole('button', { name: '确认删除批次', exact: true }).isDisabled(), true);
  assert.match(await deletion.getByRole('alert').textContent(), /PDF 索引/);
  const guard = await get(`/api/material-batches/${protectedBatch.id}/deletion-preview`);
  assert.equal(guard.allowed, false);
  const denied = await http(`/api/material-batches/${protectedBatch.id}`, { fingerprint: guard.fingerprint, confirmation: '删除批次' }, 'DELETE');
  assert.equal(denied.status, 422);
  await page.screenshot({ path: path.join(evidence, 'Windows-V42-批次右键与保护.png') });
  await deletion.getByRole('button', { name: '取消', exact: true }).click();

  // Remove only an unassociated disposable index, then confirm deletion of its genuinely empty batch.
  node = await revealBatch(emptyBatch.name); await node.click();
  await page.getByRole('checkbox', { name: `选择 ${path.basename(disposablePdf)}`, exact: true }).check();
  await page.getByRole('button', { name: '移除文件记录', exact: true }).click();
  const management = page.getByRole('dialog', { name: 'PDF 管理预览', exact: true });
  await management.waitFor();
  const phrase = (await management.locator('strong').first().textContent()).split(' · ')[0];
  await management.getByLabel('PDF 管理确认短语', { exact: true }).fill(phrase);
  await management.getByRole('button', { name: '确认处理', exact: true }).click();
  await management.waitFor({ state: 'detached' });
  // Simulate an external user moving this disposable fixture out of the batch.
  // Application deletion must not remove a directory that still contains a real PDF.
  const heldDisposable=path.join(legacy,'outside-material-fixture',path.basename(disposablePdf));
  fs.mkdirSync(path.dirname(heldDisposable),{recursive:true});fs.renameSync(disposablePdf,heldDisposable);
  await page.waitForFunction(async id => (await (await fetch(`/api/material-batches/${id}/deletion-preview`)).json()).allowed, emptyBatch.id);
  node = await revealBatch(emptyBatch.name); menu = await openMenu(node);
  await menu.getByRole('menuitem', { name: '删除批次', exact: true }).click();
  deletion = page.getByRole('dialog', { name: '删除批次', exact: true }); await deletion.waitFor();
  assert.equal(await deletion.getByRole('button', { name: '确认删除批次', exact: true }).isEnabled(), true);
  await deletion.getByRole('button', { name: '确认删除批次', exact: true }).click();
  await deletion.waitFor({ state: 'detached' });
  await page.getByText('已删除批次记录', { exact: true }).waitFor();
  assert.equal(items(await get('/api/material-batches')).some(batch => batch.id === emptyBatch.id), false);
  await page.waitForFunction(id => document.querySelector(`.pdf-nav-product[data-product-id="${id}"] button[data-navigation-select]`)?.getAttribute('aria-current') === 'page', product.id);
  assert.ok(fs.existsSync(heldDisposable) && fs.existsSync(path.dirname(disposablePdf)));
  fs.renameSync(heldDisposable,disposablePdf);
  await page.waitForFunction(() => [...document.querySelectorAll('.files-management-toolbar button')].find(button => button.textContent === '全选')?.disabled === false);
  await scan();
  batches = items(await get('/api/material-batches'));
  assert.ok(batches.some(batch => batch.relativePath === emptyBatch.relativePath), 'Externally restored fixture PDF must be rediscovered in the allowed scan scope');

  // Inspect actual table cells and mutate both formal and historical business states through the visible selector.
  await go(page, '图号库');
  const drawingCatalog = page.getByRole('navigation', { name: '图号导航', exact: true });
  if (!await drawingCatalog.isVisible()) await page.getByRole('button', { name: '产品／批次导航', exact: true }).click();
  await page.getByRole('button', { name: '清除筛选', exact: true }).click();
  await drawingCatalog.getByRole('button', { name: `产品 ${product.model}`, exact: true }).click();
  await page.getByRole('textbox', { name: '关键词', exact: true }).fill(''); await page.getByRole('button', { name: '查询', exact: true }).click();
  const table = page.locator('.drawing-library-page table.layout-table');
  await page.getByRole('button', { name: formal[0].fullCode, exact: true }).waitFor();
  assert.equal(await table.getByRole('columnheader', { name: '颜色', exact: true }).count(), 1);
  assert.equal(await table.getByRole('columnheader', { name: '版本', exact: true }).count(), 0);
  const categoryGeometry = [];
  for (const drawing of formal) {
    const row = page.getByRole('button', { name: drawing.fullCode, exact: true }).locator('xpath=ancestor::tr');
    const geometry = await row.locator('.drawing-category-project').evaluate(element => {
      const badge = element.querySelector('.drawing-category-badge'), project = element.querySelector('.drawing-project-name');
      const a = badge.getBoundingClientRect(), b = project.getBoundingClientRect();
      return { title: element.title, text: element.textContent, nowrap: getComputedStyle(element).whiteSpace, centerDelta: Math.abs(a.y + a.height / 2 - b.y - b.height / 2), background: getComputedStyle(badge).backgroundColor };
    });
    assert.equal(geometry.nowrap, 'nowrap'); assert.ok(geometry.centerDelta < 3); assert.match(geometry.text, /\//);
    assert.ok((await row.locator('td[data-column-key=color]').textContent()).trim()); categoryGeometry.push(geometry);
  }
  assert.notEqual(categoryGeometry[0].background, categoryGeometry[1].background, 'Different main categories need distinct stable colors');
  const stateEvidence = [];
  for (const drawing of [formal[0], historical]) {
    await drawingCatalog.getByRole('button', { name: '全部图号', exact: true }).click();
    await page.getByRole('textbox', { name: '关键词', exact: true }).fill(drawing.fullCode);
    await page.getByRole('button', { name: '查询', exact: true }).click();
    await page.getByRole('button', { name: drawing.fullCode, exact: true }).click();
    const panel = page.getByRole('complementary', { name: '图号详情', exact: true }); await panel.waitFor();
    const selector = panel.getByRole('combobox', { name: '图号业务状态', exact: true });
    assert.deepEqual(await selector.locator('option').allTextContents(), ['使用中', '已停用']);
    const signedId = drawing.origin === 'historical' ? -Math.abs(drawing.id) : drawing.id;
    const statuses = [];
    for (const target of ['inactive', 'active']) {
      const confirmation = page.waitForEvent('dialog');
      const selecting = selector.selectOption(target);
      const dialog = await confirmation;
      assert.equal(dialog.type(), 'confirm');
      const expectedConfirmation = drawing.origin === 'historical'
        ? target === 'active' ? '确认启用该历史图号？启用不会改变文件完整性，也不会释放或重新占用号码。' : '确认停用该历史图号？停用不释放号码，也不会改变文件完整性。'
        : target === 'active' ? '确认将该图号变更为正式使用？此操作会记录业务状态。' : '确认停用该图号？停用期间号码继续占用，可恢复使用。';
      assert.equal(dialog.message(), expectedConfirmation);
      await dialog.accept();
      await selecting;
      const expected = target === 'active' ? 'active' : drawing.origin === 'historical' ? 'inactive' : 'voided';
      await page.waitForFunction(async ({ id, expected }) => (await (await fetch(`/api/drawings/${id}`)).json()).status === expected, { id: signedId, expected });
      await page.waitForFunction(target => { const control = document.querySelector('[aria-label="图号业务状态"]'); return control && !control.disabled && control.value === target; }, target);
      const row = page.getByRole('button', { name: drawing.fullCode, exact: true }).locator('xpath=ancestor::tr');
      await row.locator(`.drawing-business-badge[data-state="${target}"]`).waitFor();
      statuses.push({ selected: target, saved: expected, text: await row.locator('.drawing-business-badge').textContent(), background: await row.locator('.drawing-business-badge').evaluate(element => getComputedStyle(element).backgroundColor) });
    }
    assert.notEqual(statuses[0].background, statuses[1].background);
    stateEvidence.push({ id: signedId, fullCode: drawing.fullCode, origin: drawing.origin ?? 'planned', statuses });
    if (drawing.id === formal[0].id) {
      const detail = await get(`/api/drawings/${signedId}`);
      assert.equal(detail.sourceFiles.filter(file => file.isPresent).length, 1); assert.equal(detail.outlinedFiles.filter(file => file.isPresent).length, 1);
      assert.ok([...detail.sourceFiles, ...detail.outlinedFiles].every(file => file.materialBatchId == null));
      await panel.getByText(path.basename(sourcePdf), { exact: true }).waitFor(); await panel.getByText(path.basename(outlinedPdf), { exact: true }).waitFor();
      assert.equal(await panel.locator('.drawing-file-presence.present').count(), 2);
      assert.equal(await panel.getByText('查看历史文件', { exact: true }).count(), 0);
      await page.screenshot({ path: path.join(evidence, 'Windows-V41-唯一无批次PDF与状态.png') });
    }
    await page.getByRole('button', { name: '关闭图号详情', exact: true }).click();
  }

  // Introduce a second real unbatched outlined instance; the drawer must expose uncertainty, not choose a file.
  const ambiguousPdf = recordPdf([...productPath, '03.量产后的变更文件', `${formal[0].fullCode}-V41第二成品（转曲）.pdf`], 'Native V41 competing outlined content');
  await go(page, 'PDF 文件中心'); await scan(); await go(page, '图号库');
  await page.getByRole('textbox', { name: '关键词', exact: true }).fill(formal[0].fullCode);
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await page.getByRole('button', { name: formal[0].fullCode, exact: true }).click();
  const panel = page.getByRole('complementary', { name: '图号详情', exact: true }); await panel.waitFor();
  const outlined = panel.locator('.drawing-file-section').filter({ has: page.getByRole('heading', { name: /转曲后文件/ }) });
  await outlined.getByText('找到 2 个存在的文件，尚未唯一确认。', { exact: true }).waitFor();
  assert.equal(await outlined.locator('.drawing-file-presence.ambiguous').count(), 1);
  assert.equal(await outlined.locator('.drawing-file-row').count(), 0);
  assert.equal(await panel.getByText(path.basename(ambiguousPdf), { exact: true }).count(), 0);
  await panel.getByText(path.basename(sourcePdf), { exact: true }).waitFor();
  await page.screenshot({ path: path.join(evidence, 'Windows-V41-多文件歧义不自动选.png') });
  await page.getByRole('button', { name: '关闭图号详情', exact: true }).click();
  for (const file of originalPdfs) assert.equal(createHash('sha256').update(fs.readFileSync(file.file)).digest('hex'), file.hash);
  const after = snapshot(dbFile);
  for (const tableName of ['drawing_numbers', 'historical_drawing_numbers', 'bom_versions', 'bom_items', 'outbound_packages', 'outbound_package_items', 'pdf_product_assignments', 'pdf_product_assignment_audit']) {
    for (const row of before[tableName] ?? []) assert.ok(after[tableName].some(candidate => Object.keys(row).filter(key => tableName !== 'historical_drawing_numbers' || key !== 'last_seen_at').every(key => candidate[key] === row[key])), `V4.1/V4.2 must preserve existing ${tableName}`);
  }
  await size(1920);
  return { isolatedFixture: true, actualInstalledHttpAndDom: true, productId: product.id, formalIds: formal.map(row => row.id), historicalId: historical.id, toolbarGeometry, categoryGeometry, stateEvidence, batchContextMenu: { noPersistentIcons: true, rightClickDoesNotNavigate: true, escapeAndOutsideClose: true, renameDisplayOnly: true, protectedDeleteHttpStatus: denied.status, references: guard.references, emptyBatchDeletionAndScanRediscovery: true }, uniqueUnbatchedFilesShown: true, competingUnbatchedFilesRequireConfirmation: true, existingHistoryPreserved: true, physicalPdfHashesPreserved: originalPdfs.length, nativeExecution: 'This report is produced only after the exported verifier completes in the installed Electron app.' };
};
