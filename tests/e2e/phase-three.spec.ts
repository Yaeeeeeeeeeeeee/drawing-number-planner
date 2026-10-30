import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const headers = { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'phase-one-development' };

async function ensureDictionary(request: APIRequestContext, type: string, code: string, name: string, parentId?: number) {
  const listed = await request.get(`/api/dictionaries/${type}?includeInactive=false`);
  const existing = (await listed.json()).items.find((item: { code: string; parentId?: number | null }) => item.code === code && (parentId === undefined || item.parentId === parentId));
  if (existing) return existing.id as number;
  const response = await request.post(`/api/dictionaries/${type}`, { headers, data: { code, name, ...(parentId === undefined ? {} : { parentId }) } });
  expect(response.ok()).toBeTruthy(); return (await response.json()).id as number;
}

async function selectDrawing(page: Page, label: string, code: string) {
  const option = page.getByLabel(label).locator('option').filter({ hasText: code });
  await expect(option).toHaveCount(1); await page.getByLabel(label).selectOption((await option.getAttribute('value'))!);
}

test('Phase 3 creates and queries a product-level BOM with a business date', async ({ page, request }) => {
  const brandId = await ensureDictionary(request, 'brand', '13', 'PHASE3');
  const sizeId = await ensureDictionary(request, 'product_size', '0505', 'ZC100冰柜');
  const appearanceId = await ensureDictionary(request, 'appearance', '02', '二号外观');
  const whiteId = await ensureDictionary(request, 'color', '0', '白色');
  const mainId = await ensureDictionary(request, 'main_category', '04', '印刷件类');
  const logoId = await ensureDictionary(request, 'project_item', '01', 'LOGO', mainId);
  const productResponse = await request.post('/api/products', { headers, data: { sku: 'PHASE3-ZC100', brandId, productSizeId: sizeId, defaultAppearanceId: appearanceId, model: 'ZC100', productCategory: '冰柜' } });
  expect(productResponse.ok()).toBeTruthy(); const productId = (await productResponse.json()).id as number;
  const planning = { productId, rows: [{ clientId: 'logo', colorId: whiteId, mainCategoryId: mainId, projectItemId: logoId }] };
  const preview = await request.post('/api/planning/preview', { headers, data: planning }); expect(preview.ok()).toBeTruthy();
  const fullCode = (await preview.json()).rows[0].fullCode as string;
  const reserved = await request.post('/api/planning/reserve', { headers, data: { ...planning, rows: [{ ...planning.rows[0], expectedFullCode: fullCode }] } }); expect(reserved.ok()).toBeTruthy();

  await page.goto('/'); await page.getByRole('button', { name: /BOM 管理/ }).click();
  await page.getByLabel('BOM 产品类别').selectOption('冰柜');
  await page.getByLabel('BOM 产品型号').selectOption(String(productId));
  await expect(page.getByLabel('业务变更日期')).toBeVisible(); await expect(page.getByLabel('BOM 颜色')).toHaveCount(0);
  await page.getByLabel('业务变更日期').fill('2026-09-02');
  await page.getByRole('button', { name: '添加 BOM 项目' }).click();
  await page.getByLabel('第 1 行主类别').selectOption(String(mainId));
  await page.getByLabel('第 1 行项目明细').selectOption(String(logoId));
  await selectDrawing(page, '第 1 行图号', fullCode);
  await expect(page.getByLabel('第 1 行数量')).toHaveCount(0);
  await page.getByRole('button', { name: '保存当前 BOM' }).click();
  await expect(page.getByText('当前 BOM 已保存')).toBeVisible();
  await expect(page.getByLabel('第 1 行主类别')).toHaveCount(0);

  await page.getByRole('button', { name: '查询 BOM' }).click();
  await expect(page.getByLabel('查询 BOM 产品类别')).toHaveCount(0);
  await page.getByLabel('查询 BOM 产品型号').selectOption(String(productId));
  await page.getByLabel('查询 BOM 开始日期').fill('2026-09-02');
  await page.getByLabel('查询 BOM 结束日期').fill('2026-09-02');
  const queryButton = page.getByRole('button', { name: '查询', exact: true });
  await expect(queryButton).toBeEnabled(); await queryButton.click();
  const bomRow = page.getByRole('row').filter({ hasText: '2026-09-02' }).filter({ hasText: 'ZC100' });
  await expect(bomRow).toHaveCount(1);
  await bomRow.getByRole('button', { name: /^查看 BOM / }).click();
  await expect(page.getByRole('region', { name: '所选 BOM 记录' })).toContainText(fullCode);
  await bomRow.getByRole('button', { name: /^编辑 BOM / }).click();
  await expect(page.getByRole('heading', { name: '编辑所选 BOM' })).toBeVisible();
  await page.getByLabel('第 1 行材质').fill('亚银特多龙 银底黑字');
  await page.getByLabel('第 1 行尺寸').fill('宽45.5mm × 高34.5mm');
  await page.getByLabel('第 1 行位置', { exact: true }).fill('本体背部下侧');
  await page.getByLabel('第 1 行修改明细').fill('调整尺寸\n保留原提交记录');
  await page.getByRole('button', { name: '保存修改', exact: true }).click();
  await expect(page.getByText('BOM 修改已保存')).toBeVisible();
  await page.getByRole('button', { name: '查询 BOM' }).click();
  const editedRow = page.getByRole('row').filter({ hasText: '2026-09-02' }).filter({ hasText: 'ZC100' });
  await expect(editedRow).toHaveCount(1);
  await editedRow.getByRole('button', { name: /^查看 BOM / }).click();
  const details = page.getByRole('region', { name: '所选 BOM 记录' });
  await expect(details).toContainText('亚银特多龙 银底黑字');
  await expect(details).toContainText('宽45.5mm × 高34.5mm');
  await expect(details).toContainText('本体背部下侧');
  await expect(details).toContainText('保留原提交记录');
  await expect(details.getByLabel('输入型号确认删除整个 BOM')).not.toBeVisible();
});
