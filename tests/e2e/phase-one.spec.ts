import { expect, test } from '@playwright/test';
import writeXlsxFile from 'write-excel-file/node';

const tokenHeaders = { origin: 'http://127.0.0.1:5173', 'x-planner-token': 'phase-one-development' };

test('Phase 1 browser workflow uses the real local database', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /图号库/ }).click();
  await expect(page.getByRole('heading', { name: '图号库', exact: true })).toBeVisible();
  await expect(page.getByText('图号库尚无记录')).toBeVisible();

  await page.getByRole('button', { name: /编码字典/ }).click();
  await page.getByRole('button', { name: '新增', exact: true }).click();
  await page.getByLabel('编码', { exact: true }).fill('02');
  await page.getByLabel('名称', { exact: true }).fill('SAMKYO');
  await page.getByRole('button', { name: '新增编码' }).click();
  await expect(page.getByText('SAMKYO')).toBeVisible();

  const size = await request.post('/api/dictionaries/product_size', {
    headers: tokenHeaders, data: { code: '0209', name: 'ZC220冰柜' },
  });
  const appearance = await request.post('/api/dictionaries/appearance', {
    headers: tokenHeaders, data: { code: '1', name: '1号外观' },
  });
  expect(size.ok()).toBeTruthy(); expect(appearance.ok()).toBeTruthy();

  await page.getByRole('button', { name: /产品档案/ }).click();
  await page.getByRole('button', { name: '新建产品' }).click();
  await page.getByRole('textbox', { name: 'SKU', exact: true }).fill('PHASE1-ZC220');
  await page.getByRole('textbox', { name: '型号', exact: true }).fill('ZC220');
  await page.getByRole('textbox', { name: '产品类别', exact: true }).fill('冰柜');
  await page.getByRole('combobox', { name: '品牌', exact: true }).selectOption({ label: 'SAMKYO' });
  await page.getByLabel('品类尺寸').selectOption({ label: 'ZC220冰柜' });
  await page.getByLabel('默认外观').selectOption({ label: '1号外观' });
  await page.getByRole('button', { name: '保存产品' }).click();
  await expect(page.getByText('ZC220', { exact: true })).toBeVisible();

  const rows = Array.from({ length: 23 }, () => Array<string | null>(14).fill(null));
  rows[20] = ['品类尺寸', null, null, null, null, '品牌字典', null, null, null, null, null, null, null, null];
  rows[21] = ['0209', 'ZC200冰柜', null, null, '01', 'SAMKYO', null, null, null, null, null, null, null, null];
  rows[22] = ['0209', 'ZC220冰柜', null, null, '02', 'VIBMI', null, null, null, null, null, null, null, null];
  const workbook = await writeXlsxFile([{ sheet: '新版图号', data: rows }]).toBuffer();

  await page.getByRole('button', { name: /迁移检查/ }).click();
  await page.getByLabel('选择 Excel 文件').setInputFiles({
    name: '图号规划.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook,
  });
  await page.getByRole('button', { name: '开始检查' }).click();
  await expect(page.getByText('发现 4 个问题')).toBeVisible();
  await expect(page.getByRole('table',{name:'迁移问题工作表'}).getByText('工作簿重复编码')).toBeVisible();
  await expect(page.getByRole('table',{name:'迁移问题工作表'}).getByText('数据库编码冲突').first()).toBeVisible();
});
