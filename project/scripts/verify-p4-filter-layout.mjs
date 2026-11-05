// Read-only layout regression. No seeded records, API mocks or business actions.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const url=process.env.PLANNER_UI_CHECK_URL;
if(!url||!/^http:\/\/127\.0\.0\.1:\d+$/.test(url))throw Error('Set readonly-workspace URL');
const dir='work/p4-filter-fix';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[],failures=[];
const check=(ok,name,size,evidence)=>{const r={ok,name,size,evidence};results.push(r);if(!ok)failures.push(r);};
try{for(const size of [[720,600],[1024,720],[1366,768],[1920,1080],[2560,1440],[3840,2160]]){
 const p=await browser.newPage({viewport:{width:size[0],height:size[1]}});p.setDefaultTimeout(8000);
 p.on('pageerror',e=>failures.push({size,error:e.message}));
 await p.route('**/api/**',r=>['GET','HEAD'].includes(r.request().method())||new URL(r.request().url()).pathname==='/api/session'?r.continue():r.abort());
 await p.goto(url);await p.locator('.page-header').waitFor();
 async function nav(name){const t=p.getByRole('button',{name:/^(展开|收起)导航$/});if(await t.getAttribute('aria-expanded')==='false')await t.click();await p.locator('.sidebar nav').getByRole('button',{name,exact:true}).click();await p.waitForTimeout(250);}
 async function grid(selector,key){const m=await p.locator(selector).evaluate(e=>{const r=e.getBoundingClientRect(),page=e.closest('.page-surface').getBoundingClientRect(),labels=[...e.querySelectorAll(':scope > label')].map(x=>{const b=x.getBoundingClientRect();return{x:b.x,y:b.y,w:b.width}});return {width:r.width,pageWidth:page.width,columns:getComputedStyle(e).gridTemplateColumns.split(' ').length,rows:[...new Set(labels.map(x=>Math.round(x.y)))].length,labels,overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('.workspace').scrollWidth>document.querySelector('.workspace').clientWidth+1};});check(!m.overflow,key+'-no-page-overflow',size,m);check(m.width>=m.pageWidth-2,key+'-uses-available-width',size,m);if(size[0]>=1920)check(m.rows<=2,key+'-compact-wide-rows',size,m);return m;}
 await nav('图号库');await p.getByRole('button',{name:'更多筛选',exact:true}).click();const g=await grid('.drawing-advanced-filters','drawing-expanded');if(size[0]>=1920)check(g.columns>=6,'drawing-wide-at-least-six-columns',size,g);await p.screenshot({path:`${dir}/drawings-expanded-${size[0]}.png`});
 await nav('PDF 文件中心');const f=await grid('.files-filter','pdf-filter');if(size[0]>=1920)check(f.rows===1,'pdf-wide-single-row',size,f);await p.screenshot({path:`${dir}/files-${size[0]}.png`});
 await nav('二维码管理');await grid('.qr-filter','qr-filter');const qrEdge=await p.locator('.qr-filter').evaluate(e=>({right:e.getBoundingClientRect().right,button:e.querySelector('button[type=submit]').getBoundingClientRect().right}));check(Math.abs(qrEdge.right-qrEdge.button)<2,'qr-action-at-workspace-edge',size,qrEdge);await p.screenshot({path:`${dir}/qr-${size[0]}.png`});
 await nav('外发资料');const m=await p.locator('[aria-label="资料打包步骤"]').evaluate(e=>{const a=e.getBoundingClientRect(),b=document.querySelector('[aria-label="外发生成结果"]').getBoundingClientRect(),c=document.querySelector('[aria-label="邮件编辑步骤"]').getBoundingClientRect();return{range:{x:a.x,y:a.y,w:a.width},result:{x:b.x,y:b.y,w:b.width},mail:{x:c.x,y:c.y,w:c.width},overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('.workspace').scrollWidth>document.querySelector('.workspace').clientWidth+1};});check(!m.overflow,'outbound-no-page-overflow',size,m);if(size[0]>=1920)check(Math.abs(m.range.y-m.result.y)<2&&m.result.x>=m.range.x+m.range.w,'outbound-wide-range-result-side-by-side',size,m);else check(m.result.y>m.range.y,'outbound-narrow-stages-stack',size,m);await p.screenshot({path:`${dir}/outbound-${size[0]}.png`});await p.close();
}}
finally{await browser.close();fs.writeFileSync(dir+'/results.json',JSON.stringify({scope:'Existing cloud DB empty business tables; CSS browser regression, not Windows populated-data acceptance',results,failures},null,2));console.log(JSON.stringify({checks:results.length,failures:failures.length,first:failures.slice(0,8)}));}
if(failures.length)process.exitCode=1;
