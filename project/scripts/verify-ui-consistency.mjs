import {chromium} from '@playwright/test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const url=process.env.PLANNER_UI_CHECK_URL;
if(!url||!/^http:\/\/127\.0\.0\.1:\d+$/.test(url))throw Error('Set PLANNER_UI_CHECK_URL to an isolated local test server');
const dir=process.env.PLANNER_UI_EVIDENCE_DIR??'work/ui-consistency'; fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const names=['图号规划 / 更新包材','BOM 管理','外发资料','产品档案','图号库','二维码管理','PDF 文件中心','编码字典','迁移检查'];
const results=[]; const errors=[];
try {for(const [width,height] of [[1280,720],[1920,1080],[2560,1440],[3840,2160]]){
 const page=await browser.newPage({viewport:{width,height}});
 page.on('pageerror',e=>errors.push({width,error:e.message}));
 await page.route('**/api/**',r=>['GET','HEAD'].includes(r.request().method())||new URL(r.request().url()).pathname==='/api/session'?r.continue():r.abort());
 await page.goto(url);
 for(let i=0;i<names.length;i++){
  const toggle=page.locator('.navigation-toggle'); if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
  await page.locator('.sidebar nav').getByRole('button',{name:names[i],exact:true}).click(); await page.waitForTimeout(400);
  const metrics=await page.evaluate(()=>({
   font:getComputedStyle(document.body).fontFamily,
   headingTop:[...document.querySelectorAll('h1')].find(e=>e.getClientRects().length)?.getBoundingClientRect().top,
   hiddenVisible:[...document.querySelectorAll('.navigation-toggle[hidden]')].some(e=>getComputedStyle(e).display!=='none'),
   overflow:document.documentElement.scrollWidth>innerWidth,
   headings:[...document.querySelectorAll('h1,h2')].filter(e=>e.getClientRects().length).map(e=>({text:e.textContent,size:getComputedStyle(e).fontSize})),
   controls:[...document.querySelectorAll('button,input,select,textarea')].filter(e=>e.getClientRects().length&&!e.closest('[hidden]')).map(e=>({tag:e.tagName,text:e.textContent.trim().slice(0,45),label:e.getAttribute('aria-label'),title:e.title,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,size:getComputedStyle(e).fontSize})),
   tables:[...document.querySelectorAll('table')].filter(e=>e.getClientRects().length).map(e=>({width:e.getBoundingClientRect().width,container:e.parentElement.clientWidth,headers:[...e.querySelectorAll('th')].map(x=>x.textContent)}))
  }));
  const screenshot=`${dir}/${i+1}-${width}.png`; await page.screenshot({path:screenshot});
  results.push({name:names[i],width,height,screenshot,...metrics});
 }
 await page.close();
}}finally{await browser.close(); fs.writeFileSync(`${dir}/results.json`,JSON.stringify({scope:'Current code, isolated empty database, read-only API browsing. Not Windows/native/populated acceptance.',results,errors},null,2));}
console.log(JSON.stringify({views:results.length,errors,overflow:results.filter(x=>x.overflow).map(x=>[x.name,x.width])}));

assert.equal(results.length,36);assert.deepEqual(errors,[]);assert.ok(results.every(r=>!r.overflow&&!r.hiddenVisible));assert.ok(results.every(r=>r.controls.filter(c=>c.tag==='SELECT').every(c=>Math.abs(c.height-36)<1)));
