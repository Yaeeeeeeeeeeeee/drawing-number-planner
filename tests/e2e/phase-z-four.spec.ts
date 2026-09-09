import { mkdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { expect, test, type APIRequestContext } from '@playwright/test';
import Database from 'better-sqlite3';

const headers = { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'phase-one-development' };

async function ensureDictionary(request: APIRequestContext, type: string, code: string, name: string, parentId?: number) {
  const listed = await request.get(`/api/dictionaries/${type}?includeInactive=false`);
  const existing = (await listed.json()).items.find((item: { code: string; parentId?: number | null }) =>
    item.code === code && (parentId === undefined || item.parentId === parentId));
  if (existing) return existing.id as number;
  const response = await request.post(`/api/dictionaries/${type}`, { headers,
    data: { code, name, ...(parentId === undefined ? {} : { parentId }) } });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id as number;
}

test('Phase 4 scans a local PDF workspace and persists relative paths only', async ({ page, request }) => {
  const workspaceRoot = process.env.PHASE4_WORKSPACE_ROOT;
  const dataDir = process.env.PHASE4_E2E_DATA_DIR;
  expect(workspaceRoot).toBeTruthy();
  expect(dataDir).toBeTruthy();

  const brandId = await ensureDictionary(request, 'brand', '14', 'PHASE4');
  const sizeId = await ensureDictionary(request, 'product_size', '0606', 'ZC400冰柜');
  const appearanceId = await ensureDictionary(request, 'appearance', '03', '三号外观');
  const whiteId = await ensureDictionary(request, 'color', '0', '白色');
  const mainId = await ensureDictionary(request, 'main_category', '14', 'Phase4印刷件类');
  const logoId = await ensureDictionary(request, 'project_item', '41', 'Phase4 LOGO', mainId);
  const manualId = await ensureDictionary(request, 'project_item', '42', 'Phase4 说明书', mainId);
  const productResponse = await request.post('/api/products', { headers, data: {
    sku: 'PHASE4-ZC400', brandId, productSizeId: sizeId, defaultAppearanceId: appearanceId, model: 'ZC400', productCategory: '冰柜',
  } });
  expect(productResponse.ok()).toBeTruthy();
  const productId = (await productResponse.json()).id as number;
  const planningInput = { productId, rows: [
    { clientId: 'logo', colorId: whiteId, mainCategoryId: mainId, projectItemId: logoId },
    { clientId: 'manual', colorId: whiteId, mainCategoryId: mainId, projectItemId: manualId },
  ] };
  const previewResponse = await request.post('/api/planning/preview', { headers, data: planningInput });
  expect(previewResponse.ok()).toBeTruthy();
  const previewRows = (await previewResponse.json()).rows as Array<{ clientId: string; fullCode: string }>;
  const reserveResponse = await request.post('/api/planning/reserve', { headers, data: { ...planningInput,
    rows: planningInput.rows.map((row) => ({ ...row,
      expectedFullCode: previewRows.find((preview) => preview.clientId === row.clientId)!.fullCode })) } });
  expect(reserveResponse.ok()).toBeTruthy();
  const logoCode = previewRows.find((row) => row.clientId === 'logo')!.fullCode;
  const manualCode = previewRows.find((row) => row.clientId === 'manual')!.fullCode;

  const modelDir = join(workspaceRoot!, 'PHASE4', '冰柜', 'ZC400');
  mkdirSync(modelDir, { recursive: true });
  writeFileSync(join(modelDir, `${logoCode}-PHASE4-ZC400白色-LOGO.pdf`), '%PDF-1.4 source');
  writeFileSync(join(modelDir, `${logoCode}-PHASE4-ZC400白色-LOGO（转曲）.pdf`), '%PDF-1.4 outlined');
  writeFileSync(join(modelDir, '待整理资料.pdf'), '%PDF-1.4 unmatched');
  writeFileSync(join(modelDir, `${logoCode}-${manualCode}-冲突.pdf`), '%PDF-1.4 conflict');

  await page.goto('/');
  await page.getByRole('button', { name: /PDF 文件中心/ }).click();
  await page.getByRole('textbox', { name: '资料根目录', exact: true }).fill(workspaceRoot!);
  await page.getByRole('button', { name: '保存根目录' }).click();
  await expect(page.getByText('资料根目录已保存')).toBeVisible();
  await page.getByRole('button', { name: '扫描资料库' }).click();
  await expect(page.getByText('资料库扫描完成')).toBeVisible();
  await expect(page.getByText('4 个索引文件（PDF / 二维码）')).toBeVisible();
  await expect(page.getByText('2 已匹配')).toBeVisible();
  await expect(page.getByText('1 未匹配')).toBeVisible();
  await expect(page.getByText('1 待确认')).toBeVisible();
  await expect(page.getByText('0 冲突')).toBeVisible();
  await expect(page.getByText('1 转曲后')).toBeVisible();
  await expect(page.getByText(`${logoCode}-PHASE4-ZC400白色-LOGO.pdf`, { exact: true })).toBeVisible();
  await expect(page.getByText(`${logoCode}-PHASE4-ZC400白色-LOGO（转曲）.pdf`, { exact: true })).toBeVisible();

  const database = new Database(join(dataDir!, 'planner.db'), { readonly: true });
  try {
    const rows = database.prepare('SELECT relative_path FROM pdf_files').all() as Array<{ relative_path: string }>;
    expect(rows).toHaveLength(4);
    expect(rows.every((row) => !isAbsolute(row.relative_path) && !row.relative_path.includes(workspaceRoot!))).toBe(true);
  } finally {
    database.close();
  }
});
