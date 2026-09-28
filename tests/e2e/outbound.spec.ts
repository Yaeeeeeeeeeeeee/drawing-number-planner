import { expect, test } from '@playwright/test';

test('browser preview opens outbound workspace while keeping desktop file actions unavailable', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /外发资料/ }).click();
  await expect(page.getByRole('heading', { name: '外发资料' })).toBeVisible();
  await expect(page.getByRole('button', { name: '资料打包', exact: true })).toBeVisible();
  await expect(page.getByLabel('正文', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '邮件撰写', exact: true }).click();
  await expect(page.getByRole('button', { name: '全部复制' })).toBeVisible();
  await expect(page.getByText(/Failed to fetch|请求失败/)).toHaveCount(0);
});
