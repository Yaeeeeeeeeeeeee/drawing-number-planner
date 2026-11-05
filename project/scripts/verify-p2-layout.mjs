// Read-only production-layout verification against an explicitly isolated sample.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base = process.env.PLANNER_UI_CHECK_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error('Supply isolated PLANNER_UI_CHECK_URL');
const output = 'work/p2/layout'; fs.mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const records = [], failures = [], writes = [];
const sizes = [[720,600,1],[960,540,2],[1080,800,1],[1280,720,1.5],[1370,900,1],[1600,900,1],[1920,1080,1],[2560,1440,1],[3840,2160,1],[1536,864,1.25],[1706,960,1.5],[1280,720,2],[3072,1728,1.25],[2560,1440,1.5],[1920,1080,2]];
const check = (condition, name, size, evidence) => { records.push({ name,size,pass:condition,evidence }); if (!condition) failures.push(records.at(-1)); };
try {
 for (const size of sizes) {
  const [width,height,dpr] = size;
  const context = await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr}); const page = await context.newPage();
  await page.route('**/api/**', route => {
   if (route.request().method() === 'GET' || new URL(route.request().url()).pathname === '/api/session') return route.continue();
   writes.push(route.request().method()+' '+route.request().url()); return route.abort();
  });
  page.on('pageerror', error => failures.push({size,error:error.message}));
  await page.goto(base); await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor();
  async function nav(name) {
   const toggle = page.getByRole('button',{name:/^(展开|收起)导航$/});
   if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
   await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();
   await page.waitForTimeout(150);
  }
  async function overflow(name) {
   const measured = await page.evaluate(()=>({width:innerWidth,height:innerHeight,page:document.documentElement.scrollWidth>innerWidth,workspace:document.querySelector('.workspace').scrollWidth>document.querySelector('.workspace').clientWidth}));
   check(!measured.page&&!measured.workspace,name,size,measured);
  }
  await nav('产品档案'); await page.getByRole('button',{name:'详情 F60'}).waitFor();
  const productActions = await page.locator('.products-integrated > .table-wrap .row-actions').first().evaluate(el=>[...el.children].map(e=>({top:e.getBoundingClientRect().top,right:e.getBoundingClientRect().right})));
  check(new Set(productActions.map(e=>e.top)).size===1,'product-actions-one-line',size,productActions); await overflow('products-overflow');
  if(width===720&&dpr===1) await page.screenshot({path:`${output}/products-actions-720x600.png`});
  await nav('编码字典'); await page.locator('.dm-actions').first().waitFor();
  const dictionaryActions = await page.locator('.dm-actions').first().evaluate(el=>[...el.children].map(e=>e.getBoundingClientRect().top));
  check(new Set(dictionaryActions).size===1,'dictionary-actions-one-line',size,dictionaryActions); await overflow('dictionary-overflow');
  if(width===720&&dpr===1) await page.screenshot({path:`${output}/dictionary-actions-720x600.png`});
  await nav('图号库'); const codeButton = page.locator('.module-list .link-button').first(); await codeButton.waitFor();
  const checkbox = page.locator('.module-list input[type=checkbox]').first(); await checkbox.check();
  check(await page.getByRole('complementary',{name:'图号详情'}).count()===0,'checkbox-does-not-open-detail',size);
  await codeButton.click(); const drawing = page.getByRole('complementary',{name:'图号详情'}); await drawing.waitFor();
  check(await drawing.evaluate(el=>!el.closest('table')),'drawing-detail-outside-table',size);
  check(await checkbox.isChecked(),'detail-retains-batch-selection',size);
  if(width===1920&&dpr===1) {
   const keyword = drawing.getByRole('textbox',{name:'搜索现有 PDF'});
   if(await keyword.count()) {
    await keyword.fill('保留输入'); await page.setViewportSize({width:720,height:600}); await page.waitForTimeout(100);
    check(await keyword.inputValue()==='保留输入','narrowing-retains-detail-input',size);
    await page.setViewportSize({width,height}); await page.waitForTimeout(100);
    check(await keyword.inputValue()==='保留输入','widening-retains-detail-input',size);
   }
  }
  if([720,1920,3840].includes(width)&&dpr===1) await page.screenshot({path:`${output}/drawing-detail-${width}x${height}.png`});
  const dialog = page.getByRole('dialog',{name:'图号详情窗口'});
  if (await dialog.count()) {
   const close = drawing.getByRole('button',{name:'关闭',exact:true}); await close.press('Shift+Tab');
   check(await dialog.evaluate(el=>el.contains(document.activeElement)),'detail-focus-trap',size);
   await page.keyboard.press('Escape'); await page.waitForTimeout(30);
   check(await codeButton.evaluate(el=>el===document.activeElement),'detail-focus-return',size);
  } else { await drawing.getByRole('button',{name:'关闭',exact:true}).click(); }
  await overflow('drawings-overflow');
  await nav('PDF 文件中心'); const file = page.locator('.files-name-button').first(); await file.waitFor();
  check(await file.evaluate(el=>getComputedStyle(el).textAlign==='left' && getComputedStyle(el.parentElement).justifyContent==='flex-start'),'filename-left-aligned',size);
  await file.click(); const detail = page.getByRole('complementary',{name:'文件详情'}); await detail.waitFor();
  check(await detail.locator('dt').count()===9,'real-file-detail-fields',size);
  await overflow('files-overflow');
  if([720,1920,3840].includes(width)&&dpr===1) await page.screenshot({path:`${output}/pdf-detail-${width}x${height}.png`});
  await detail.getByRole('button',{name:'关闭文件详情'}).click();
  check(await file.evaluate(el=>el===document.activeElement),'file-detail-focus-return',size);
  const navToggle = page.getByRole('button',{name:'产品／批次导航',exact:true});
  if(await navToggle.count()) await navToggle.click();
  await page.locator('.module-navigation summary').first().click();
  await page.getByRole('button',{name:'产品 PREVIEWF60 · F60',exact:true}).click();
  await page.waitForTimeout(150); check(await page.getByRole('combobox',{name:'产品档案'}).inputValue()!=='','product-navigation-real-filter',size);
  await overflow('navigation-overflow');
  await context.close();
 }
} finally { await browser.close(); }
fs.writeFileSync(`${output}/result.json`,JSON.stringify({scope:'Chromium CSS/DPR simulation, not human Windows DPI acceptance',records,failures,writes},null,2));
console.log(JSON.stringify({checks:records.length,failures:failures.length,writes:writes.length,firstFailures:failures.slice(0,8)}));
if(failures.length||writes.length) process.exitCode=1;
