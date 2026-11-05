import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const output = join(tmpdir(), 'planner-files-ui-v3');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const results = [];
try {
  for (const width of [1080, 1200, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const requests = []; const errors = [];
    await page.route('**/api/**', route => { requests.push(route.request().url()); return route.abort(); });
    page.on('pageerror', error => errors.push(error.message));
    for (const scenario of ['normal', 'long', 'anomalies', 'empty', 'no-results', 'loading', 'error', 'scan-error']) {
      await page.goto(`http://127.0.0.1:5190/?mock=files&files-scenario=${scenario}`);
      await page.getByRole('heading', { name: 'PDF 文件中心' }).waitFor();
      if (scenario === 'loading') await page.getByRole('status').filter({ hasText: '正在加载' }).waitFor();
      else if (scenario === 'error') await page.getByRole('alert').waitFor();
      else if (['empty', 'no-results'].includes(scenario)) await page.getByText('没有符合条件的 PDF').waitFor();
      else await page.locator('.files-page tbody tr').first().waitFor();
      await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
      if (scenario === 'anomalies') {
        await page.getByLabel('存在状态', { exact: true }).selectOption('all');
        await page.getByRole('button', { name: '筛选 PDF' }).click();
        await page.getByText('本页有', { exact: false }).waitFor();
      }
      const metrics = await page.evaluate(() => {
        const wrap = document.querySelector('.files-page .table-wrap');
        const rows = [...document.querySelectorAll('.files-page tbody tr')];
        const last = rows[0]?.lastElementChild?.getBoundingClientRect();
        return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, tableClient: wrap?.clientWidth ?? 0, tableScroll: wrap?.scrollWidth ?? 0, rows: rows.length, rowAverage: rows.length ? Math.round(rows.reduce((sum, row) => sum + row.getBoundingClientRect().height, 0) / rows.length) : 0, actionsRight: last?.right ?? 0 };
      });
      if (metrics.pageWidth > width || metrics.tableScroll > metrics.tableClient + 1 || metrics.actionsRight > width) throw new Error(`Overflow ${width}/${scenario}: ${JSON.stringify(metrics)}`);
      if (['normal', 'long', 'anomalies'].includes(scenario) && metrics.rows !== 50) throw new Error('Not 50 rows');
      const screenshot = join(output, `${scenario}-${width}.png`);
      await page.screenshot({ path: screenshot });
      results.push({ width, scenario, ...metrics, screenshot });
      if (scenario === 'long') {
        await page.getByRole('button', { name: /查看 .* 的完整相对路径/ }).first().click();
        await page.locator('.files-path-full').first().waitFor();
        const overflow = await page.evaluate(() => {
          const wrap = document.querySelector('.files-page .table-wrap');
          return document.documentElement.scrollWidth > innerWidth || wrap.scrollWidth > wrap.clientWidth + 1;
        });
        if (overflow) throw new Error('Expanded path overflows table');
        await page.screenshot({ path: join(output, `path-expanded-${width}.png`) });
      }
      if (scenario === 'normal') {
        await page.getByRole('button', { name: '扫描资料库' }).click();
        await page.getByText('资料库扫描完成', { exact: true }).waitFor();
        await page.screenshot({ path: join(output, `scan-${width}.png`) });
        await page.getByRole('button', { name: '查看本次变化' }).click();
        await page.locator('#scan-change-details').waitFor();
        await page.getByText('索引维护', { exact: true }).click();
        await page.getByRole('button', { name: '清空资料库索引', exact: true }).click();
        await page.getByRole('dialog', { name: '确认清空资料库索引', exact: true }).waitFor();
      }
      if (scenario === 'scan-error') {
        await page.getByRole('button', { name: '扫描资料库' }).click();
        await page.getByRole('alert').filter({ hasText: '扫描失败' }).waitFor();
        if (await page.locator('.files-page tbody tr').count() !== 50) throw new Error('Scan failure lost rows');
      }
    }
    if (requests.length || errors.length) throw new Error(JSON.stringify({ requests, errors }));
    await page.close();
  }
  console.log(JSON.stringify({ realApiRequests: 0, results }, null, 2));
} finally { await browser.close(); }
