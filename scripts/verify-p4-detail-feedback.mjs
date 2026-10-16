// Read-only real-page geometry: no seeded records, query mocks or business writes.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const url=process.env.PLANNER_UI_CHECK_URL;
if(!url||!/^http:\/\/127\.0\.0\.1:\d+$/.test(url))throw Error('Set readonly-workspace URL');
const dir='work/p4-product-columns';fs.mkdirSync(dir,{recursive:true});
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[],failures=[];
const check=(ok,name,size,evidence)=>{const r={ok,name,size,evidence};results.push(r);if(!ok)failures.push(r);};
try{for(const size of [[720,600],[1366,768],[1920,1080],[3840,2160]]){
 const p=await b.newPage({viewport:{width:size[0],height:size[1]}});p.setDefaultTimeout(8000);
 p.on('pageerror',e=>failures.push({size,error:e.message}));
 await p.route('**/api/**',r=>['GET','HEAD'].includes(r.request().method())||new URL(r.request().url()).pathname==='/api/session'?r.continue():r.abort());
 await p.goto(url);await p.locator('.pp-row-no').waitFor();await p.waitForTimeout(250);
 const frame=await p.evaluate(()=>{const n=document.querySelector('.pp-row-no'),row=document.querySelector('.pp-row');return{rootBorder:getComputedStyle(document.querySelector('.pp-rows')).borderTopWidth,numberBottom:n.getBoundingClientRect().bottom,rowTop:row.getBoundingClientRect().top,insideFrame:!!n.closest('.pp-row'),overflow:document.documentElement.scrollWidth>innerWidth||document.querySelector('.workspace').scrollWidth>document.querySelector('.workspace').clientWidth+1};});
 check(frame.rootBorder==='0px'&&!frame.insideFrame&&frame.rowTop>=frame.numberBottom,'number-visually-outside-frame',size,frame);check(!frame.overflow,'planning-no-page-overflow',size,frame);
 const fields=await p.locator('.pp-fields').first().evaluate(e=>({labels:[...e.querySelectorAll(':scope > label')].map(x=>({top:x.getBoundingClientRect().top,width:x.getBoundingClientRect().width})),remove:e.querySelector('button').getBoundingClientRect().width,scrollHost:e.closest('.pp-row').clientWidth,scrollWidth:e.closest('.pp-row').scrollWidth}));
 check(new Set(fields.labels.map(x=>Math.round(x.top))).size===1&&fields.labels[2].width>=140&&fields.remove<=100,'horizontal-fields-readable-color-compact-remove',size,fields);
 await p.screenshot({path:`${dir}/planning-${size[0]}-existing-empty.png`});
 await p.getByRole('button',{name:'添加项目',exact:true}).click();check(await p.locator('.pp-row-no').count()===2,'add-keeps-two-separate-labels',size);await p.getByRole('button',{name:'删除项目 2',exact:true}).click();check(await p.locator('.pp-row-no').count()===1,'remove-keeps-remaining-label',size);
 const t=p.getByRole('button',{name:/^(展开|收起)导航$/});if(await t.getAttribute('aria-expanded')==='false')await t.click();await p.locator('.sidebar nav').getByRole('button',{name:'外发资料',exact:true}).click();await p.getByRole('heading',{name:'邮件草稿',exact:true}).waitFor();
 for(const label of['复制收件人','复制抄送','复制主题','复制正文','全部复制']){const button=p.getByRole('button',{name:label,exact:true});const m=await button.evaluate(e=>({text:e.textContent,title:e.title,svg:!!e.querySelector('svg'),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height}));check(m.text===''&&m.title===label&&m.svg&&m.width===32&&m.height===32,'icon-'+label,size,m);}
 await p.screenshot({path:`${dir}/outbound-${size[0]}-existing-empty.png`});await p.close();
}}
finally{await b.close();fs.writeFileSync(`${dir}/geometry.json`,JSON.stringify({scope:'Read-only existing cloud DB empty business entities; no Windows or populated-data acceptance',results,failures},null,2));console.log(JSON.stringify({checks:results.length,failures:failures.length,first:failures.slice(0,4)}));}
if(failures.length)process.exitCode=1;
