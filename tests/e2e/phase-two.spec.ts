import { expect, test, type APIRequestContext } from '@playwright/test';

const headers = { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'phase-one-development' };

async function createDictionary(request: APIRequestContext, type: string, code: string, name: string, parentId?: number) {
  const listed = await request.get(`/api/dictionaries/${type}?includeInactive=false`);
  const existing = (await listed.json()).items.find((item: { code: string; parentId?: number | null }) =>
    item.code === code && (parentId === undefined || item.parentId === parentId));
  if (existing) return existing.id as number;
  const response = await request.post(`/api/dictionaries/${type}`, { headers, data: { code, name, ...(parentId ? { parentId } : {}) } });
  expect(response.ok()).toBeTruthy(); return (await response.json()).id as number;
}

test('Phase 2 previews and atomically reserves a real batch', async ({ page, request }) => {
  const brandId = await createDictionary(request, 'brand', '12', 'PHASE2');
  const sizeId = await createDictionary(request, 'product_size', '0404', 'ZC200冰柜');
  const appearanceId = await createDictionary(request, 'appearance', '01', '一号外观');
  const colorId = await createDictionary(request, 'color', '0', '白色');
  const mainId = await createDictionary(request, 'main_category', '04', '印刷件类');
  const itemId = await createDictionary(request, 'project_item', '01', 'LOGO', mainId);
  const productResponse = await request.post('/api/products', { headers, data: {
    brandId, productSizeId: sizeId, defaultAppearanceId: appearanceId, model: 'ZC200', productCategory: '冰柜',
  } });
  expect(productResponse.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByRole('button', { name: /图号规划/ }).click();
  await page.getByLabel('产品型号').selectOption({ label: 'PHASE2 · ZC200' });
  await page.getByLabel('第 1 行主类别').selectOption(String(mainId));
  await page.getByLabel('第 1 行项目明细').selectOption(String(itemId));
  await page.getByLabel('第 1 行颜色').selectOption(String(colorId));
  await page.getByRole('button', { name: '添加项目' }).click();
  await page.getByLabel('第 2 行主类别').selectOption(String(mainId));
  await page.getByLabel('第 2 行项目明细').selectOption(String(itemId));
  await page.getByLabel('第 2 行颜色').selectOption(String(colorId));
  await page.getByRole('button', { name: '查重并预览' }).click();

  await expect(page.getByText('12.0404.010.0401001')).toBeVisible();
  await expect(page.getByText('12.0404.010.0401002')).toBeVisible();
  await page.getByRole('button', { name: '确认批量占号' }).click();
  await expect(page.getByText('已成功占用 2 个图号')).toBeVisible();

  await page.getByRole('button', { name: /图号库/ }).click();
  await page.getByLabel('型号').fill('ZC200');
  await page.getByRole('button', { name: '检索', exact: true }).click();
  await expect(page.getByText('2 条记录')).toBeVisible();
  await expect(page.getByText('12.0404.010.0401001')).toBeVisible();
  await expect(page.getByText('12.0404.010.0401002')).toBeVisible();
});
