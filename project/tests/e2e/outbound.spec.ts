import { expect, test } from '@playwright/test';

test('browser preview opens outbound workspace while keeping desktop file actions unavailable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /外发资料/ }).click();
  await expect(page.getByRole('heading', { name: '外发资料', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '选择外发范围' })).toBeVisible();
  await page.getByText('编辑邮件草稿', { exact: true }).click();
  await expect(page.getByLabel('正文', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '邮件草稿' })).toBeVisible();
  await expect(page.getByRole('button', { name: '复制邮件内容' })).toBeVisible();
  await expect(page.getByText(/Failed to fetch|请求失败/)).toHaveCount(0);
});
