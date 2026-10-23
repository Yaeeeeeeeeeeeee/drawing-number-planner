import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const url=process.env.PLANNER_UI_CHECK_URL, code=process.env.PLANNER_UI_DRAWING_CODE;
if(!url||!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!code)throw Error('Provide an isolated local server and an existing drawing code');
const out=process.env.PLANNER_UI_EVIDENCE_DIR??'work/ui-consistency';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const results=[];
try{for(const [width,height] of [[1280,720],[1920,1080],[2560,1440],[3840,2160]]){
 const p=await browser.newPage({viewport:{width,height}});
 await p.route('**/api/**',r=>['GET','HEAD'].includes(r.request().method())||new URL(r.request().url()).pathname==='/api/session'?r.continue():r.abort());
 await p.goto(url);await p.locator('.sidebar nav').getByRole('button',{name:'图号库',exact:true}).click();await p.getByRole('button',{name:code,exact:true}).click();
 const detail=p.locator('.drawing-maintenance');await detail.waitFor();
 const colors=await detail.locator('.drawing-detail-attributes dt').evaluateAll(labels=>labels.map(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e.closest('.drawing-detail-group')).backgroundColor})));
 const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 for(const c of colors){const values=[luminance(c.color),luminance(c.background)].sort((a,b)=>b-a);c.ratio=(values[0]+.05)/(values[1]+.05);}
 results.push({width,height,colors});
 await p.screenshot({path:`${out}/drawing-detail-${width}.png`});
 assert.equal(colors.length,6);assert.ok(colors.every(c=>c.ratio>=4.5),JSON.stringify(colors));assert.equal(await detail.locator(':scope > .drawing-detail-group').count(),4);await p.close();
}}finally{await browser.close();fs.writeFileSync(`${out}/drawing-detail-contrast.json`,JSON.stringify(results,null,2));}
console.log(JSON.stringify({viewports:results.length,minContrast:Math.min(...results.flatMap(r=>r.colors.map(c=>c.ratio)))}));
