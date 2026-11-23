import { expect, test } from '@playwright/test';

test('selection controls remain compact beside their labels in a desktop-sized window', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.goto('/?mock=drawing-library');
  await expect(page.getByRole('button', { name: '关闭导航', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '关闭导航', exact: true }).click();
  await page.getByRole('button', { name: '展开导航', exact: true }).click();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '图号库', exact: true }).click();
  const selectAll = page.getByRole('checkbox', { name: '全选已加载', exact: true });
  await expect(selectAll).toBeVisible();
  await expect(page.getByRole('columnheader', { name: '选择', exact: true }).getByRole('checkbox')).toHaveCount(1);
  await expect(page.getByRole('columnheader', { name: '完整图号', exact: true })).toHaveCSS('text-align', 'left');
  await expect(page.getByRole('columnheader', { name: '主类别 / 项目', exact: true })).toHaveCSS('text-align', 'left');
  await expect(page.getByRole('button', { name: /批量删除/ })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: '来源', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '列设置', exact: true }).click();
  await page.getByRole('checkbox', { name: '显示来源列' }).check();
  await expect(page.getByRole('columnheader', { name: '来源', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '恢复默认表格布局', exact: true }).click();
  await expect(page.getByRole('columnheader', { name: '来源', exact: true })).toHaveCount(0);
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
