/** Production UI verification against an explicitly supplied isolated sample server.
 * Read-only business requests; never start or connect to a formal library implicitly.
 * Chromium DPR is a layout simulation, not a Windows DPI acceptance result.
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
const base = process.env.PLANNER_UI_CHECK_URL;
if (!base || !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error('Set PLANNER_UI_CHECK_URL to an isolated local sample server');
const directory = process.env.PLANNER_UI_SHOTS || 'work/p1/layout';
fs.mkdirSync(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PLANNER_CHROMIUM || '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
const records = [], blocked = [], failures = [];
// Limit screenshot output to representative minimum/full-HD/4K contexts; all checks are recorded.
const modules = ['图号规划 / 更新包材','图号库','产品档案','BOM 管理','PDF 文件中心','二维码管理','外发资料','编码字典','迁移检查'];
const cases = [{ width:720,height:600,dpr:1 },{width:960,height:540,dpr:2},
 {width:1080,height:900,dpr:1},{width:1280,height:720,dpr:1.5},
 {width:960,height:900,dpr:1},{width:1920,height:1080,dpr:1},{width:2560,height:1440,dpr:1},{width:3840,height:2160,dpr:1}];
for (const [width,height] of [[1920,1080],[2560,1440],[3840,2160]]) {
 for (const scale of [1.25,1.5,2]) cases.push({width:Math.floor(width/scale),height:Math.floor(height/scale),dpr:scale});
 for (const scale of [1,1.25,1.5,2]) {
  const w=Math.floor(width/scale/2),h=Math.floor(height/scale);
  if(w>=720 && h>=600) cases.push({width:w,height:h,dpr:scale,mode:'half-screen simulation'});
 }
}
const requestedWidths=process.env.PLANNER_UI_CASES?.split(',').map(Number);
const selectedCases=requestedWidths ? cases.filter(item=>requestedWidths.includes(item.width)) : cases;
try {
 for (const size of selectedCases) {
  const context = await browser.newContext({viewport:{width:size.width,height:size.height},deviceScaleFactor:size.dpr});
  const page = await context.newPage();
  await page.route('**/api/**', route => {
   const r=route.request(), pathname=new URL(r.url()).pathname;
   if(r.method()==='GET'||r.method()==='POST'&&['/api/session','/api/planning/preview','/api/outbound-packages/preview'].includes(pathname)) return route.continue();
   blocked.push(r.method()+' '+pathname); return route.abort();
  });
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.locator('.page-surface').waitFor();
  if(size.width<1280) {
   await page.getByRole('button',{name:'展开导航',exact:true}).click();
   const close=page.getByRole('button',{name:'关闭导航',exact:true});
   await close.press('Shift+Tab');
   if(!await page.locator('.sidebar').evaluate(el=>el.contains(document.activeElement))) failures.push({name:'navigation-focus-cycle',...size});
   await page.keyboard.press('Escape');
   await page.waitForTimeout(20);
   if(!await page.getByRole('button',{name:'展开导航',exact:true}).evaluate(el=>el===document.activeElement)) failures.push({name:'navigation-focus-return',...size});
  }
  async function nav(name) {
   if(await page.getByRole('button',{name:/^(展开|收起)导航$/}).getAttribute('aria-expanded') === 'false') await page.getByRole('button',{name:'展开导航',exact:true}).click();
   await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();
   await page.waitForTimeout(120);
  }
  async function check(name) {
   await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
   const savedScroll = await page.locator('.workspace').evaluate(el => ({top:el.scrollTop,left:el.scrollLeft}));
   const unreachable=[];
   const actions=page.locator('.workspace:not([inert]) .primary-button:visible, .safe-recovery-panel button:visible');
   for(let index=0;index<await actions.count();index++) {
    const action=actions.nth(index); await action.scrollIntoViewIfNeeded();
    const bounds=await action.boundingBox();
    if(size.width===720&&name==='planning-preview'&&index===await actions.count()-1) await page.screenshot({path:path.join(directory,'planning-confirm-reachable-720x600.png')});
    if(!bounds || bounds.x < -1 || bounds.y < 53 || bounds.x+bounds.width>size.width+1 || bounds.y+bounds.height>size.height+1) unreachable.push(await action.innerText());
   }
   await page.locator('.workspace').evaluate((el,scroll)=>{el.scrollTop=scroll.top;el.scrollLeft=scroll.left;},savedScroll);
   const result=await page.evaluate(()=>{
    const workspace=document.querySelector('.workspace'), header=document.querySelector('.workspace-topbar');
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,
     pageOverflow:document.documentElement.scrollWidth>innerWidth+1,
     workspaceOverflow:workspace.scrollWidth>workspace.clientWidth+1,
     scrollHeight:workspace.scrollHeight,availableHeight:workspace.clientHeight,
     color:getComputedStyle(header).backgroundColor,
     headingSize:getComputedStyle(document.querySelector('.page-header h1')).fontSize,
     escapees:[...workspace.querySelectorAll('*')].filter(el=>{
      const rect=el.getBoundingClientRect();
      if(!rect.width||!rect.height||rect.right<=workspace.getBoundingClientRect().right+1)return false;
      if(el.closest('.table-wrap,.outbound-file-list'))return false;
      return true;
     }).slice(0,8).map(el=>el.className||el.tagName)};
   });
   records.push({name,...size,...result,unreachable,errors:[...errors]});
   if(result.pageOverflow||result.workspaceOverflow||unreachable.length||errors.length) failures.push({name,...size,...result,unreachable,errors:[...errors]});
   if(size.dpr===1&&[720,1920,3840].includes(size.width)) await page.screenshot({path:path.join(directory,`${name}-${size.width}x${size.height}.png`)});
  }
  for(const [i,name] of modules.entries()) {
   await nav(name);await check(`module-${i}`);
   if(name==='图号规划 / 更新包材') {
    await page.getByLabel('产品型号',{exact:true}).selectOption('1');
    await page.getByLabel('第 1 行主类别').selectOption('5');
    await page.getByLabel('第 1 行项目明细').selectOption('6');
    await page.getByLabel('第 1 行颜色').selectOption('4');
    await page.getByRole('button',{name:'查重并预览',exact:true}).click();
    await page.locator('.pp-result').waitFor(); await check('planning-preview');
   }
   if(name==='BOM 管理') {
    await page.getByLabel('BOM 产品型号').selectOption('1');
    await page.locator('.bom-work-record').first().waitFor(); await check('bom-editor');
   }
   if(name==='二维码管理') {
    await page.getByRole('button',{name:/展开 .* 的二维码用途/}).first().click();
    await page.locator('.qr-subtable').getByRole('button',{name:/^查看 .*说明书/}).click();
    await page.locator('.qr-detail-page').waitFor(); await check('qr-detail');
   }
   if(name==='外发资料') {
    await page.getByLabel('品牌',{exact:true}).selectOption('1');
    await page.getByLabel('产品',{exact:true}).selectOption('1');
    await page.getByLabel('资料批次',{exact:true}).selectOption({index:1});
    await page.getByRole('button',{name:'预览文件',exact:true}).click();
    await page.getByRole('table',{name:'外发文件预览'}).waitFor(); await check('outbound-preview');
   }
   if(name==='图号库') {
    const detail=page.locator('.drawing-library-page tbody .link-button').first();
    if(await detail.count()) {await detail.click();await check('drawing-inline-detail');}
   }
   if(name==='产品档案') { const b=page.getByRole('button',{name:'详情 F60'});if(await b.count()){await b.click();await check('product-detail');await page.getByRole('button',{name:'删除档案 F60'}).click();await page.getByRole('heading',{name:'关联检查与退出指引'}).waitFor();await check('product-preflight');} }
   if(name==='编码字典') {
    const b=page.getByRole('button',{name:/修改 /}).first();
    if(await b.count()) {await b.click();await check('dictionary-edit');await page.getByRole('button',{name:'取消',exact:true}).click();}
    await page.getByRole('button',{name:'删除 验收样例'}).click();
    const confirmation=page.getByRole('button',{name:'确认删除',exact:true});
    const danger=await confirmation.evaluate(el=>getComputedStyle(el).backgroundColor);
    if(await page.locator('.inline-confirm p').evaluate(el=>getComputedStyle(el).whiteSpace)!=='normal')failures.push({name:'confirmation-wrap',...size});
    if(danger!=='rgb(180, 35, 24)')failures.push({name:'danger-color',...size,danger});
    await check('dictionary-delete-confirm');
   }
  }
  if(await page.getByRole('button',{name:/^(展开|收起)导航$/}).getAttribute('aria-expanded') === 'false')await page.getByRole('button',{name:'展开导航',exact:true}).click();
  await page.getByRole('button',{name:'安全恢复',exact:true}).click();await check('recovery-feedback');
  await context.close();
 }
} finally {
 await browser.close();
 fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify({kind:'Linux Chromium production layout; simulated DPR',base,records,failures,blocked},null,2));
}
console.log(JSON.stringify({cases:selectedCases.length,checks:records.length,failures:failures.length,blockedWrites:blocked,output:directory}));
if(failures.length||blocked.length)process.exitCode=1;
