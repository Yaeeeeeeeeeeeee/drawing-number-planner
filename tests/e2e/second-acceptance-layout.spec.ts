import { expect, test } from '@playwright/test';

test('selection controls remain compact beside their labels in a desktop-sized window', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/');
  await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '图号库', exact: true }).click();
  const selectAll = page.getByRole('checkbox', { name: '全选当前页', exact: true });
  await expect(selectAll).toBeVisible();
  const box = await selectAll.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeLessThanOrEqual(20);
  expect(box!.width).toBeLessThanOrEqual(20);
  const layout = await selectAll.evaluate((input) => ({
    labelHeight: input.parentElement!.getBoundingClientRect().height,
    horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }));
  expect(layout.labelHeight).toBeLessThanOrEqual(32);
  expect(layout.horizontalOverflow).toBeLessThanOrEqual(1);
});
