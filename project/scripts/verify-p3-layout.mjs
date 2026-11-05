// Production browser checks; requires an explicitly isolated sample, never a formal library.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const base=process.env.PLANNER_UI_CHECK_URL;
if(!base||!/^http:\/\/127\.0\.0\.1:\d+$/.test(base))throw Error('Set isolated PLANNER_UI_CHECK_URL');
const output='work/p3/layout';fs.mkdirSync(output,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[],failures=[],writes=[];
const check=(ok,name,size,evidence)=>{const row={ok,name,size,evidence};results.push(row);if(!ok)failures.push(row);};
const sizes=process.env.PLANNER_P3_BASELINE?[[1920,1080,1]]:[[720,600,1],[960,540,2],[1080,800,1],[1280,720,1.5],[1600,900,1],[1920,1080,1],[2560,1440,1],[3840,2160,1],[1536,864,1.25],[1706,960,1.5],[1280,720,2],[3072,1728,1.25],[2560,1440,1.5],[1920,1080,2]];
try{for(const size of sizes){const [width,height,dpr]=size;const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr});const page=await context.newPage();
await page.route('**/api/**',route=>{if(route.request().method()==='GET'||new URL(route.request().url()).pathname==='/api/session')return route.continue();writes.push(route.request().url());return route.abort();});
page.on('pageerror',error=>failures.push({size,error:error.message}));
await page.goto(base);await page.locator('.page-header').waitFor();
async function nav(name){const toggle=page.getByRole('button',{name:/^(展开|收起)导航$/});if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();await page.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();await page.waitForTimeout(120);}
for(const name of ['图号规划 / 更新包材','产品档案','BOM 管理','二维码管理','编码字典','图号库','PDF 文件中心','外发资料','迁移检查']){await nav(name);const header=page.locator('.page-surface > .page-header');const h=await header.evaluate(el=>({heading:el.querySelector('h1')?.textContent,paragraphs:[...el.querySelectorAll('p')].map(p=>p.textContent),english:!!el.querySelector('.eyebrow')}));check(h.paragraphs.length===1&&!h.english&&await header.locator('p').first().isVisible(),'consistent-heading-'+name,size,h);const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth||document.querySelector('.workspace').scrollWidth>document.querySelector('.workspace').clientWidth+1);check(!overflow,'no-page-overflow-'+name,size);}
await nav('图号规划 / 更新包材');await page.getByRole('combobox',{name:'产品型号',exact:true}).selectOption({label:'PREVIEWF60 · F60 · 验收样例'});await page.getByLabel('项目 1',{exact:true}).waitFor();const number=await page.getByLabel('项目 1',{exact:true}).evaluate(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight)}));check(number.height<=number.line+1,'planning-number-single-line',size,number);
await page.getByRole('button',{name:'添加项目',exact:true}).click();await page.getByRole('button',{name:'添加项目',exact:true}).click();for(const i of [2,3]){const n=await page.getByLabel(`项目 ${i}`,{exact:true}).evaluate(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight)}));check(n.height<=n.line+1,`planning-number-${i}-single-line`,size,n);}
await nav('编码字典');await page.getByRole('tab',{name:'主类别',exact:true}).click();await page.locator('.dictionary-parent').first().waitFor();const alignment=await page.evaluate(()=>{const a=document.querySelector('.dm-toolbar > input').getBoundingClientRect(),b=document.querySelector('.dictionary-master').getBoundingClientRect();return {searchLeft:a.left,searchRight:a.right,listLeft:b.left,listRight:b.right};});check(Math.abs(alignment.searchLeft-alignment.listLeft)<2&&Math.abs(alignment.searchRight-alignment.listRight)<2,'dictionary-column-alignment',size,alignment);
await page.locator('.dictionary-parent').first().click();await page.locator('.dm-child-head').waitFor();const selectedAlignment=await page.evaluate(()=>({width:document.querySelector('.workspace').clientWidth-48,filter:document.querySelector('.dm-toolbar > select').getBoundingClientRect().left,detail:document.querySelector('.dm-child-head').getBoundingClientRect().left}));if(selectedAlignment.width>1000)check(Math.abs(selectedAlignment.filter-selectedAlignment.detail)<2,'dictionary-selected-detail-aligned',size,selectedAlignment);
if(width===1920&&dpr===1)await page.screenshot({path:output+'/dictionary-aligned.png'});
await nav('PDF 文件中心');await page.locator('.files-name-button').first().waitFor();const before=await page.locator('.module-list').boundingBox();await page.locator('.files-name-button').first().click();await page.getByRole('complementary',{name:'文件详情'}).waitFor();const after=await page.locator('.module-list').boundingBox();check(Math.abs(before.width-after.width)<2,'pdf-list-width-retained',size,{before:before.width,after:after.width});
const cell=await page.locator('.module-list tbody > tr').first().evaluate(row=>[...row.children].map((el,i)=>({i,align:getComputedStyle(el).textAlign,space:getComputedStyle(el).whiteSpace})));check(cell.every(c=>c.align===(c.i===1?'left':'center')),'pdf-column-alignment',size,cell);check(cell[2].space==='nowrap'&&cell[3].space==='nowrap','pdf-batches-single-line',size,cell.slice(2,4));
if(dpr===1&&[720,1920,3840].includes(width))await page.screenshot({path:`${output}/pdf-${width}.png`});
const viewport=page.locator('.module-workspace-viewport');if(await viewport.count()&&width>=1600){const scroll=await viewport.evaluate(el=>({width:el.clientWidth,scroll:el.scrollWidth}));check(scroll.scroll>scroll.width,'pdf-local-horizontal-scroll',size,scroll);const offset=await viewport.evaluate(el=>el.scrollLeft);await viewport.focus();await page.keyboard.press('ArrowLeft');await page.waitForTimeout(120);check(await viewport.evaluate(el=>el.scrollLeft)<offset,'pdf-keyboard-scroll',size);}
if(width===1920&&dpr===1){
await page.getByRole('button',{name:'关闭文件详情',exact:true}).click();
// Layout-only stress: insert visual clones before the last real React row, without business writes.
await page.locator('.module-list tbody').evaluate(tbody=>{const last=tbody.lastElementChild;for(let i=0;i<25;i++)tbody.insertBefore(last.cloneNode(true),last);});
await page.locator('.module-list tbody > tr:last-child .files-name-button').click();
const detailBox=await page.getByRole('complementary',{name:'文件详情'}).boundingBox();
check(detailBox&&detailBox.y>=54&&detailBox.y<height-50,'long-list-detail-reachable',size,detailBox);
const frame=await page.locator('.module-workspace-viewport').boundingBox();
check(frame&&frame.y>=54&&frame.y+frame.height<=height+1,'long-list-scrollbar-reachable',size,frame);
}
await context.close();}}
finally{await browser.close();}
fs.writeFileSync(output+'/results.json',JSON.stringify({scope:'CSS/DPR simulation, not Windows human acceptance',results,failures,writes},null,2));console.log(JSON.stringify({checks:results.length,failures:failures.length,writes:writes.length,first:failures.slice(0,10)}));if(failures.length||writes.length)process.exitCode=1;
