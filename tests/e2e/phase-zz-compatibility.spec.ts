import { mkdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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
  expect(response.ok()).toBeTruthy(); return (await response.json()).id as number;
}

test('compatibility correction scans history, preserves occupancy, and reports completeness', async ({ page, request }) => {
  const workspaceRoot = process.env.COMPATIBILITY_WORKSPACE_ROOT;
  const dataDir = process.env.PHASE4_E2E_DATA_DIR;
  expect(workspaceRoot).toBeTruthy(); expect(dataDir).toBeTruthy();
  const brandId = await ensureDictionary(request, 'brand', '02', 'SAMKYO');
  const sizeId = await ensureDictionary(request, 'product_size', '0404', '洗碗机 T40');
  const appearanceId = await ensureDictionary(request, 'appearance', '01', '一号外观');
  const colorId = await ensureDictionary(request, 'color', '0', '白色');
  const mainId = await ensureDictionary(request, 'main_category', '04', '印刷件类');
  const projectId = await ensureDictionary(request, 'project_item', '01', 'LOGO', mainId);
  const productResponse = await request.post('/api/products', { headers, data: {
    sku: 'SKDWT040JP', brandId, productSizeId: sizeId, defaultAppearanceId: appearanceId,
    model: 'T40', productCategory: '01.洗碗机',
  } });
  expect(productResponse.ok()).toBeTruthy();
  const productId=(await productResponse.json()).id as number;

  const sourceDir = join(workspaceRoot!, '01.洗碗机', 'SKDWT040JP-T40', '02.未转曲源文件');
  const outlinedDir = join(workspaceRoot!, '01.洗碗机', 'SKDWT040JP-T40',
    '03.量产后的变更文件（已量产的产品看最新日期）', '01.20241210');
  mkdirSync(sourceDir, { recursive: true }); mkdirSync(outlinedDir, { recursive: true });
  const sourceFile = join(sourceDir, '02.0404.010.0401007-SAMKYO-T40-LOGO.pdf');
  const outlinedFile = join(outlinedDir, '02.0404.010.0401007-SAMKYO-T40-LOGO（转曲）.pdf');
  const pendingFile = join(sourceDir, '02.0404.010.0401000-invalid.pdf');
  writeFileSync(sourceFile, '%PDF source'); writeFileSync(outlinedFile, '%PDF outlined'); writeFileSync(pendingFile, '%PDF pending');
  const before = [sourceFile, outlinedFile, pendingFile].map((path) => ({ path, size: statSync(path).size, mtime: statSync(path).mtimeMs }));

  await page.goto('/'); await page.getByRole('button', { name: /PDF 文件中心/ }).click();
  await page.getByRole('button', { name: '详细信息', exact: true }).click();
  await page.getByRole('textbox', { name: '资料根目录', exact: true }).fill(workspaceRoot!);
  await page.getByRole('button', { name: '保存根目录' }).click();
  await page.getByRole('button', { name: '扫描资料库' }).click();
  await expect(page.getByText('1 个历史图号已登记')).toBeVisible();
  await expect(page.getByText('1 待确认')).toBeVisible();
  const pendingResponse = await request.get('/api/files?keyword=02.0404.010.0401000');
  expect((await pendingResponse.json()).items).toEqual([expect.objectContaining({matchStatus:'pending',classificationWarning:expect.stringContaining('invalid-format')})]);
  expect(before.map(({ path, size, mtime }) => ({ path, size: statSync(path).size, mtime: statSync(path).mtimeMs })))
    .toEqual(before);

  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '图号库', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('02.0404.010.0401007');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  const historicalResult = page.getByRole('row').filter({
    has: page.getByRole('button', { name: '02.0404.010.0401007', exact: true }),
  });
  await expect(historicalResult.getByRole('cell', { name: '历史扫描', exact: true })).toBeVisible();
  await historicalResult.getByRole('button', { name: '查看 / 管理', exact: true }).click();
  const detail = page.getByRole('complementary', { name: '图号详情' });
  await expect(detail.getByRole('button', { name: /打开转曲前文件.*的位置/ })).toBeEnabled();
  await expect(detail.getByRole('button', { name: /打开转曲后文件.*的位置/ })).toBeEnabled();
  await page.getByRole('button', { name: '关闭图号详情', exact: true }).click();

  await page.getByRole('button', { name: /图号规划/ }).click();
  await page.getByLabel('产品型号').selectOption(String(productId));
  await page.getByLabel('第 1 行主类别').selectOption(String(mainId));
  await page.getByLabel('第 1 行项目明细').selectOption(String(projectId));
  await page.getByLabel('第 1 行颜色').selectOption(String(colorId));
  await page.getByRole('button', { name: '查重并预览' }).click();
  await expect(page.getByText('02.0404.010.0401008')).toBeVisible();

  unlinkSync(sourceFile); unlinkSync(outlinedFile);
  await page.getByRole('button', { name: /PDF 文件中心/ }).click();
  await page.getByRole('button', { name: '扫描资料库' }).click();
  await page.getByText('文件筛选', { exact: true }).click();
  await page.getByLabel('文件关键词').fill('02.0404.010.0401007');
  await page.getByLabel('存在状态').selectOption('missing');
  await page.getByRole('button', { name: '筛选 PDF' }).click();
  await expect(page.locator('.file-primary').filter({ hasText: '02.0404.010.0401007' })).toHaveCount(2);
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '图号库', exact: true }).click();
  await page.getByLabel('关键词', { exact: true }).fill('02.0404.010.0401007');
  await page.getByRole('button', { name: '查询', exact: true }).click();
  const historicalRow = page.getByRole('row').filter({ hasText: '02.0404.010.0401007' });
  await historicalRow.getByRole('button', { name: '查看 / 管理', exact: true }).click();
  await expect(detail.getByRole('heading', { name: '转曲前文件 已缺失', exact: true })).toBeVisible();
  await expect(detail.getByRole('heading', { name: '转曲后文件 已缺失', exact: true })).toBeVisible();
  await expect(detail.getByRole('button', { name: /打开转曲[前后]文件.*的位置/ })).toHaveCount(0);
  await page.getByRole('button', { name: '关闭图号详情', exact: true }).click();

  await page.getByRole('button', { name: /图号规划/ }).click();
  await page.getByLabel('产品型号').selectOption(String(productId));
  await page.getByLabel('第 1 行主类别').selectOption(String(mainId));
  await page.getByLabel('第 1 行项目明细').selectOption(String(projectId));
  await page.getByLabel('第 1 行颜色').selectOption(String(colorId));
  await page.getByRole('button', { name: '查重并预览' }).click();
  await expect(page.getByText('02.0404.010.0401008')).toBeVisible();

  const database = new Database(join(dataDir!, 'planner.db'), { readonly: true });
  try {
    const paths = database.prepare('select relative_path from pdf_files').all() as Array<{ relative_path: string }>;
    expect(paths.every((item) => !isAbsolute(item.relative_path) && !item.relative_path.includes(workspaceRoot!))).toBe(true);
    expect(database.prepare(`select count(*) as count from historical_drawing_numbers
      where full_code = '02.0404.010.0401007'`).get()).toEqual({ count: 1 });
  } finally { database.close(); }
});
