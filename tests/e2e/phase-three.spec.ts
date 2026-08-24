import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

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

async function selectDrawing(page: Page, label: string, code: string) {
  const select = page.getByLabel(label);
  const option = select.locator('option').filter({ hasText: code });
  await expect(option).toHaveCount(1);
  const value = await option.getAttribute('value');
  expect(value).not.toBeNull();
  await select.selectOption(value!);
}

test('Phase 3 versions a gray BOM while sharing white drawings from the same model', async ({ page, request }) => {
  const brandId = await ensureDictionary(request, 'brand', '13', 'PHASE3');
  const sizeId = await ensureDictionary(request, 'product_size', '0505', 'ZC100冰柜');
  const appearanceId = await ensureDictionary(request, 'appearance', '02', '二号外观');
  const whiteId = await ensureDictionary(request, 'color', '0', '白色');
  const grayId = await ensureDictionary(request, 'color', '2', '灰色');
  const mainId = await ensureDictionary(request, 'main_category', '04', '印刷件类');
  const logoId = await ensureDictionary(request, 'project_item', '01', 'LOGO', mainId);
  const manualId = await ensureDictionary(request, 'project_item', '02', '说明书', mainId);
  const productResponse = await request.post('/api/products', { headers, data: {
    brandId, productSizeId: sizeId, defaultAppearanceId: appearanceId, model: 'ZC100', productCategory: '冰柜',
  } });
  expect(productResponse.ok()).toBeTruthy(); const productId = (await productResponse.json()).id as number;
  const planningInput = { productId, rows: [
    { clientId: 'gray-logo', colorId: grayId, mainCategoryId: mainId, projectItemId: logoId },
    { clientId: 'white-manual', colorId: whiteId, mainCategoryId: mainId, projectItemId: manualId },
    { clientId: 'white-logo', colorId: whiteId, mainCategoryId: mainId, projectItemId: logoId },
  ] };
  const previewResponse = await request.post('/api/planning/preview', { headers, data: planningInput });
  expect(previewResponse.ok()).toBeTruthy(); const previewRows = (await previewResponse.json()).rows as Array<{ clientId: string; fullCode: string }>;
  const reserveResponse = await request.post('/api/planning/reserve', { headers, data: { ...planningInput,
    rows: planningInput.rows.map((row) => ({ ...row,
      expectedFullCode: previewRows.find((preview) => preview.clientId === row.clientId)!.fullCode })) } });
  expect(reserveResponse.ok()).toBeTruthy();
  const byClientId = new Map(previewRows.map((row) => [row.clientId, row.fullCode]));

  await page.goto('/'); await page.getByRole('button', { name: /BOM 管理/ }).click();
  await page.getByLabel('BOM 产品型号').selectOption({ label: 'PHASE3 · ZC100' });
  await page.getByLabel('BOM 颜色').selectOption(String(grayId));
  await expect(page.getByText('尚未建立 BOM')).toBeVisible();
  await page.getByRole('button', { name: '添加 BOM 项目' }).click();
  await page.getByLabel('第 1 行项目').selectOption(String(logoId));
  await selectDrawing(page, '第 1 行图号', byClientId.get('gray-logo')!);
  await page.getByRole('button', { name: '添加 BOM 项目' }).click();
  await page.getByLabel('第 2 行项目').selectOption(String(manualId));
  await page.getByLabel('第 2 行引用白色图号').check();
  await selectDrawing(page, '第 2 行图号', byClientId.get('white-manual')!);
  await page.getByRole('button', { name: '保存为新版本' }).click();
  await expect(page.getByText('版本 1 已保存')).toBeVisible();

  await page.getByRole('button', { name: '删除 BOM 项目 2' }).click();
  await page.getByLabel('第 1 行引用白色图号').check();
  await selectDrawing(page, '第 1 行图号', byClientId.get('white-logo')!);
  await page.getByRole('button', { name: '保存为新版本' }).click();
  await expect(page.getByText('版本 2 已保存')).toBeVisible();
  await expect(page.getByText('替换 · LOGO')).toBeVisible();
  await expect(page.getByText('移除 · 说明书')).toBeVisible();

  await page.getByRole('button', { name: '查看版本 1' }).click();
  await expect(page.getByText('版本 1 只读明细')).toBeVisible();
  await expect(page.getByText(byClientId.get('gray-logo')!)).toBeVisible();
  await expect(page.getByText(byClientId.get('white-manual')!)).toBeVisible();

  const grayManual = await request.get(`/api/drawings?model=ZC100&colorId=${grayId}&projectItemId=${manualId}`);
  expect((await grayManual.json()).total).toBe(0);
  const drawings = await request.get('/api/drawings?model=ZC100&pageSize=100');
  expect((await drawings.json()).items.filter((item: { brandName: string }) => item.brandName === 'PHASE3')
    .map((item: { status: string }) => item.status)).toEqual(['active', 'active', 'active']);
});
