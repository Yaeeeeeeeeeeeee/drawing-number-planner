import { expect, test } from '@playwright/test';

test('browser preview opens outbound workspace while keeping desktop file actions unavailable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /外发资料/ }).click();
  await expect(page.getByRole('heading', { name: '外发资料', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '1. 准备外发资料' })).toBeVisible();
  await expect(page.getByLabel('正文', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '邮件草稿' })).toBeVisible();
  await expect(page.getByRole('button', { name: '全部复制' })).toBeVisible();
  await expect(page.getByText(/Failed to fetch|请求失败/)).toHaveCount(0);
});
