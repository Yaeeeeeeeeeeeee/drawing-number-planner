import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';

const headers = { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'phase-one-development' };

async function ensureDictionary(
  request: APIRequestContext,
  type: string,
  code: string,
  name: string,
  parentId?: number,
) {
  const listed = await request.get(`/api/dictionaries/${type}?includeInactive=false`);
  const existing = (await listed.json()).items.find((item: { code: string; parentId?: number | null }) =>
    item.code === code && (parentId === undefined || item.parentId === parentId));
  if (existing) return existing.id as number;
  const response = await request.post(`/api/dictionaries/${type}`, {
    headers,
    data: { code, name, ...(parentId === undefined ? {} : { parentId }) },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id as number;
}

async function reserve(
  request: APIRequestContext,
  productId: number,
  colorId: number,
  mainCategoryId: number,
  projectItemId: number,
) {
  const row = { clientId: 'acceptance', colorId, mainCategoryId, projectItemId };
  const preview = await request.post('/api/planning/preview', { headers, data: { productId, rows: [row] } });
  expect(preview.ok()).toBeTruthy();
  const fullCode = (await preview.json()).rows[0].fullCode as string;
  const saved = await request.post('/api/planning/reserve', {
    headers,
    data: { productId, rows: [{ ...row, expectedFullCode: fullCode }] },
  });
  expect(saved.ok()).toBeTruthy();
  return (await saved.json()).items[0] as { id: number; fullCode: string };
}

test('real-usage acceptance covers lifecycle, QR, historical BOM, outbound packages, mail and recovery boundary', async ({ page, request, context }) => {
  test.setTimeout(90_000);
  const workspaceRoot = process.env.PHASE4_WORKSPACE_ROOT;
  const dataDir = process.env.PHASE4_E2E_DATA_DIR;
  expect(workspaceRoot).toBeTruthy();
  expect(dataDir).toBeTruthy();

  const brandId = await ensureDictionary(request, 'brand', '17', 'ACCEPTANCE');
  const sizeId = await ensureDictionary(request, 'product_size', '1717', '验收产品');
  const appearanceId = await ensureDictionary(request, 'appearance', '17', '验收外观');
  const whiteId = await ensureDictionary(request, 'color', '0', '白色');
  const mainId = await ensureDictionary(request, 'main_category', '17', '验收印刷件');
  const manualId = await ensureDictionary(request, 'project_item', '01', '验收说明书', mainId);
  const labelId = await ensureDictionary(request, 'project_item', '02', '验收标签', mainId);
  const historyId = await ensureDictionary(request, 'project_item', '03', '历史说明', mainId);

  const createProduct = async (sku: string, model: string) => {
    const response = await request.post('/api/products', { headers, data: {
      sku, model, productCategory: '17.验收产品', brandId, productSizeId: sizeId, defaultAppearanceId: appearanceId,
    } });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).id as number;
  };

  const lifecycleProductId = await createProduct('ACCEPT-LIFE', 'LIFE17');
  expect((await request.post(`/api/products/${lifecycleProductId}/deactivate`, { headers })).ok()).toBeTruthy();
  const activated = await request.post(`/api/products/${lifecycleProductId}/activate`, { headers });
  expect(await activated.json()).toMatchObject({ status: 'active' });
  expect((await request.delete(`/api/products/${lifecycleProductId}`, { headers })).ok()).toBeTruthy();

  const productId = await createProduct('ACCEPT17', 'MODEL17');
  const manualDrawings: Array<{ id: number; fullCode: string }> = [];
  for (let index = 0; index < 22; index += 1) {
    manualDrawings.push(await reserve(request, productId, whiteId, mainId, manualId));
  }
  const labelDrawing = await reserve(request, productId, whiteId, mainId, labelId);

  const unprotected = await reserve(request, productId, whiteId, mainId, historyId);
  const deletionPreview = await request.get(`/api/drawings/${unprotected.id}/deletion-preview`);
  expect(await deletionPreview.json()).toMatchObject({ deletable: true });
  expect((await request.delete(`/api/drawings/${unprotected.id}`, { headers, data: { confirmed: true } })).ok()).toBeTruthy();
  expect((await request.post(`/api/drawings/${manualDrawings[0].id}/activate`, { headers, data: { confirmed: true } })).ok()).toBeTruthy();
  const protectedDelete = await request.delete(`/api/drawings/${manualDrawings[0].id}`, { headers, data: { confirmed: true } });
  expect(protectedDelete.status()).toBe(422);
  expect(await protectedDelete.json()).toMatchObject({ error: { code: 'DRAWING_NOT_DELETABLE' } });
  const protectedProductDelete = await request.delete(`/api/products/${productId}`, { headers });
  expect(protectedProductDelete.status()).toBe(409);
  expect(await protectedProductDelete.json()).toMatchObject({ error: { code: 'PRODUCT_REFERENCED' } });

  const purpose = await request.post('/api/qr-purposes', { headers, data: {
    key: 'acceptance_guide', englishName: 'Acceptance Guide', displayName: '验收指南',
    defaultForAll: false, productCategories: ['17.验收产品'],
  } });
  expect(purpose.ok()).toBeTruthy();
  const purposeId = (await purpose.json()).id as number;

  const modelRoot = join(workspaceRoot!, '17.验收产品', 'ACCEPT17-MODEL17');
  const firstBatch = join(modelRoot, '03.量产后的变更文件（已量产的产品看最新日期）', '00.首批大货');
  const updateBatch = join(modelRoot, '03.量产后的变更文件（已量产的产品看最新日期）', '01.20260917');
  const sourceRoot = join(modelRoot, '02.未转曲源文件');
  mkdirSync(firstBatch, { recursive: true });
  mkdirSync(updateBatch, { recursive: true });
  mkdirSync(sourceRoot, { recursive: true });
  const firstManualPath = join(firstBatch, `${manualDrawings[0].fullCode}-验收说明书（转曲）.pdf`);
  const labelPath = join(firstBatch, `${labelDrawing.fullCode}-验收标签（转曲）.pdf`);
  const updateManualPath = join(updateBatch, `${manualDrawings[1].fullCode}-验收说明书更新（转曲）.pdf`);
  writeFileSync(firstManualPath, '%PDF acceptance manual v1');
  writeFileSync(labelPath, '%PDF acceptance label');
  writeFileSync(updateManualPath, '%PDF acceptance manual v2');
  const historicalCode = '17.1717.170.1703099';
  writeFileSync(join(sourceRoot, `${historicalCode}-历史说明.pdf`), '%PDF historical source');
  writeFileSync(join(modelRoot, 'MODEL17-Acceptance Guide（accept17）.pdf'), '%PDF qr matched');
  writeFileSync(join(modelRoot, 'MODEL17-Unknown Purpose（pending17）.pdf'), '%PDF qr pending');

  await page.goto('/');
  await page.getByRole('button', { name: /PDF 文件中心/ }).click();
  await page.getByRole('textbox', { name: '资料根目录', exact: true }).fill(workspaceRoot!);
  await page.getByRole('button', { name: '保存根目录' }).click();
  await page.getByRole('button', { name: '扫描资料库' }).click();
  await expect(page.getByText('资料库扫描完成')).toBeVisible();

  const qrList = await request.get(`/api/qr-codes?productId=${productId}&purposeId=${purposeId}`);
  const qrCode = (await qrList.json()).items[0] as { id: number; status: string; files: Array<{ detectedIdentifier: string }> };
  expect(qrCode.files).toEqual([expect.objectContaining({ detectedIdentifier: 'accept17' })]);
  const qrUpdated = await request.put(`/api/qr-codes/${qrCode.id}`, { headers,
    data: { name: '验收二维码', targetUrl: 'https://example.test/acceptance' } });
  expect(await qrUpdated.json()).toMatchObject({ name: '验收二维码', targetUrl: 'https://example.test/acceptance' });
  expect((await request.post(`/api/qr-codes/${qrCode.id}/activate`, { headers })).ok()).toBeTruthy();
  const qrDelete = await request.delete(`/api/qr-codes/${qrCode.id}`, { headers });
  expect(qrDelete.status()).toBe(409);
  expect(await qrDelete.json()).toMatchObject({ error: { code: 'QR_CODE_REFERENCED', referenceSummary: { files: 1 } } });

  const database = new Database(join(dataDir!, 'planner.db'));
  const historical = database.prepare('select id from historical_drawing_numbers where full_code = ?')
    .get(historicalCode) as { id: number };
  expect(database.prepare('select match_status as matchStatus, detected_identifier as detectedIdentifier from qr_code_files where file_name = ?')
    .get('MODEL17-Unknown Purpose（pending17）.pdf')).toEqual({ matchStatus: 'pending', detectedIdentifier: 'pending17' });
  // Product attribution is a separate explicit confirmation workflow. This fixture records that completed decision
  // so the acceptance flow can exercise historical BOM selection without creating a duplicate product archive.
  database.prepare('update historical_drawing_numbers set product_id = ? where id = ?').run(productId, historical.id);
  database.close();

  const historicalBom = await request.post('/api/boms/versions', { headers, data: {
    productId, entryMode: 'historical', businessChangeDate: '2026-09-17', expectedCurrentVersionId: null,
    items: [{ projectItemId: historyId, drawingReference: { origin: 'historical', historicalDrawingId: historical.id },
      usesWhiteMaterial: true, qrCodeIds: [qrCode.id], notes: 'Task 17 historical acceptance' }],
  } });
  expect(historicalBom.status()).toBe(201);
  const firstVersion = (await historicalBom.json()).version as { id: number };
  const secondBom = await request.post('/api/boms/versions', { headers, data: {
    productId, entryMode: 'historical', businessChangeDate: '2026-09-18', expectedCurrentVersionId: firstVersion.id,
    items: [{ projectItemId: historyId, drawingReference: { origin: 'historical', historicalDrawingId: historical.id },
      usesWhiteMaterial: true, qrCodeIds: [qrCode.id], notes: 'Task 17 rollback acceptance' }],
  } });
  expect(secondBom.status()).toBe(201);
  const secondVersion = (await secondBom.json()).version as { id: number };
  const deleteBomPreview = await request.get(`/api/boms/versions/${secondVersion.id}/delete-preview`);
  expect(await deleteBomPreview.json()).toMatchObject({ isCurrent: true, fallbackVersionId: firstVersion.id });
  expect((await request.delete(`/api/boms/versions/${secondVersion.id}`, { headers, data: { confirmed: true } })).ok()).toBeTruthy();
  expect(await (await request.get(`/api/boms/current?productId=${productId}`)).json()).toMatchObject({ version: { id: firstVersion.id } });

  const batches = await (await request.get(`/api/material-batches?productId=${productId}`)).json() as {
    items: Array<{ id: number; name: string }>;
  };
  const firstBatchId = batches.items.find((item) => item.name === '00.首批大货')!.id;
  const updateBatchId = batches.items.find((item) => item.name === '01.20260917')!.id;
  const previewInitial = await request.post('/api/outbound-packages/preview', { headers, data: {
    productId, selectedMaterialBatchId: firstBatchId, materialType: 'initial', packageMode: 'current_complete',
  } });
  expect(previewInitial.ok()).toBeTruthy();
  expect((await previewInitial.json()).items).toHaveLength(2);
  const previewChange = await request.post('/api/outbound-packages/preview', { headers, data: {
    productId, selectedMaterialBatchId: updateBatchId, materialType: 'update', packageMode: 'change_only',
  } });
  expect(previewChange.ok()).toBeTruthy();
  const changeBody = await previewChange.json();
  expect(changeBody.items).toEqual([expect.objectContaining({ fullCode: manualDrawings[1].fullCode, sourceBatchName: '01.20260917' })]);
  const previewCurrent = await request.post('/api/outbound-packages/preview', { headers, data: {
    productId, selectedMaterialBatchId: updateBatchId, materialType: 'update', packageMode: 'current_complete',
  } });
  expect(previewCurrent.ok()).toBeTruthy();
  const currentBody = await previewCurrent.json();
  expect(currentBody.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ fullCode: manualDrawings[1].fullCode, sourceBatchName: '01.20260917' }),
    expect.objectContaining({ fullCode: labelDrawing.fullCode, sourceBatchName: '00.首批大货', status: 'carried_forward' }),
  ]));

  const outputRoot = join(dataDir!, 'task-17-exports');
  mkdirSync(outputRoot, { recursive: true });
  writeFileSync(join(dataDir!, 'settings.json'), `${JSON.stringify({ workspaceRoot, outboundOutputRoot: outputRoot }, null, 2)}\n`);
  const selectedPdfFileIds = currentBody.items.map((item: { pdfFileId: number }) => item.pdfFileId);
  const selectedSources = [updateManualPath, labelPath].map((path) => ({ path, bytes: readFileSync(path), mtimeMs: statSync(path).mtimeMs }));
  const packageTask = await request.post('/api/tasks/outbound_package', { headers, data: {
    productId, selectedMaterialBatchId: updateBatchId, materialType: 'update', packageMode: 'current_complete',
    previewToken: currentBody.previewToken, selectedPdfFileIds,
  } });
  expect(packageTask.status()).toBe(202);
  const taskId = (await packageTask.json()).id as string;
  let task: { status: string; result?: { id: number; fileCount: number; zipRelativePath: string } };
  do {
    await page.waitForTimeout(50);
    task = await (await request.get(`/api/tasks/${taskId}`)).json();
  } while (['queued', 'running', 'finalizing'].includes(task.status));
  expect(task).toMatchObject({ status: 'completed', result: { fileCount: 2 } });
  const zipPath = join(outputRoot, task.result!.zipRelativePath);
  expect(readFileSync(zipPath).length).toBeGreaterThan(0);
  const zipEntries = execFileSync('tar.exe', ['-tf', zipPath]).toString('latin1').split(/\r?\n/).filter(Boolean);
  expect(zipEntries).toHaveLength(2);
  expect(new Set(zipEntries).size).toBe(2);
  const packageDatabase = new Database(join(dataDir!, 'planner.db'), { readonly: true, fileMustExist: true });
  const packageItems = packageDatabase.prepare(`select item.pdf_file_id as pdfFileId,
      item.file_name_snapshot as fileName, item.source_batch_name_snapshot as sourceBatch,
      file.conversion_type as conversionType
    from outbound_package_items item join pdf_files file on file.id = item.pdf_file_id
    where item.package_id = ? order by item.id`).all(task.result!.id) as Array<{
      pdfFileId: number; fileName: string; sourceBatch: string; conversionType: string;
    }>;
  packageDatabase.close();
  expect(packageItems.map((item) => item.pdfFileId).sort((left, right) => left - right))
    .toEqual([...selectedPdfFileIds].sort((left, right) => left - right));
  expect(packageItems.every((item) => item.conversionType === 'outlined')).toBe(true);
  expect(new Set(packageItems.map((item) => item.fileName.toLocaleLowerCase('en-US'))).size).toBe(2);
  expect(new Set(packageItems.map((item) => item.sourceBatch))).toEqual(new Set(['00.首批大货', '01.20260917']));
  for (const source of selectedSources) {
    expect(readFileSync(source.path)).toEqual(source.bytes);
    expect(statSync(source.path).mtimeMs).toBe(source.mtimeMs);
  }

  const contact = await request.post('/api/outbound-reference/contacts', { headers, data: {
    company: '验收供应商', contactName: '验收联系人', email: 'acceptance@example.test', defaultRecipientType: 'to', notes: null,
  } });
  expect(contact.status()).toBe(201);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://127.0.0.1:5173' });

  await page.getByRole('button', { name: /图号库/ }).click();
  await page.getByLabel('每页条数').selectOption('20');
  await expect(page.getByRole('navigation', { name: '图号分页' })).toContainText(/共 \d+ 条/);
  await page.getByRole('button', { name: '下一页' }).click();
  await expect(page.getByRole('navigation', { name: '图号分页' })).toContainText('第 2');
  await page.getByRole('button', { name: '按资料批次' }).click();
  await page.getByLabel('搜索型号或批次').fill('MODEL17');
  await page.getByRole('button', { name: '查询资料批次' }).click();
  await expect(page.getByText('01.20260917', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: /二维码管理/ }).click();
  await page.getByRole('button', { name: '展开 MODEL17 的二维码用途' }).click();
  await expect(page.getByText('验收二维码', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: /BOM 管理/ }).click();
  await page.getByRole('button', { name: '查询 BOM' }).click();
  await page.getByLabel('查询 BOM 型号').fill('MODEL17');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  await expect(page.getByRole('cell', { name: '2026-09-17', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /外发资料/ }).click();
  await page.getByRole('tab', { name: '邮件撰写' }).click();
  await page.getByLabel('收件人 验收联系人').check();
  await page.getByRole('button', { name: '复制收件人' }).click();
  await expect(page.getByText('已复制', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('acceptance@example.test');

  await expect(page.getByText('系统正常', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '安全恢复', exact: true }).click();
  await expect(page.getByText('安全恢复仅在 Windows 桌面版可用')).toBeVisible();
  for (const name of ['终止当前任务', '重新加载界面', '重启本地服务', '完整恢复应用']) {
    await expect(page.getByRole('button', { name, exact: true })).toBeDisabled();
  }
  await expect(page.getByText(/Failed to fetch|请求失败/)).toHaveCount(0);
});
