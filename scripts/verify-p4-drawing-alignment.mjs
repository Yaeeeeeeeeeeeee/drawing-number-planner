import {chromium} from '@playwright/test';
import fs from 'node:fs';
import {createServer} from 'vite';
import {drawingLibraryMockDetails} from '../src/renderer/pages/drawing-library-mock.ts';
const baseline=process.argv.includes('--baseline');
const rows=[1,2,4].map(id=>structuredClone(drawingLibraryMockDetails.get(id)));
const product={id:1,sku:'SKU-T40',model:'T40',productCategory:'洗碗机',brandName:'样例品牌',status:'active'};
const batches=[{id:1,productId:1,name:'01.20261001',usageProducts:[{productId:1,state:'current',drawingCount:1}],currentState:'current',recognitionStatus:'recognized'}, {id:9,productId:null,name:'历史待关联批次',usageProducts:[],currentState:'indeterminate',recognitionStatus:'pending'}];
const vite=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5193,strictPort:true}});await vite.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[];
fs.mkdirSync('docs/screenshots/p4-drawing-alignment-20261017',{recursive:true});
try{for(const [width,height] of baseline?[[1920,1080]]:[[3840,2160],[2560,1440],[1920,1080],[1366,768],[1100,760],[720,600]]){
 const page=await browser.newPage({viewport:{width,height},permissions:['clipboard-read','clipboard-write']});const writes=[],queries=[];
 await page.route('**/api/**',async route=>{const r=route.request(),u=new URL(r.url()),p=u.pathname;let body;
 if(!['GET','HEAD'].includes(r.method())&&p!='/api/session')writes.push(p);
 if(p==='/api/session')body={token:'isolated-alignment-fixture'};else if(p==='/api/products')body={items:[product]};else if(p==='/api/qr-codes')body={items:[{id:1,productId:1,sku:'SKU-T40',model:'T40',productCategory:'洗碗机',purposeId:1,key:'user_manual',englishName:'User Manual',displayName:'说明书',purposeStatus:'active',name:'T40说明书二维码',status:'active',files:[],pendingFiles:[]},{id:2,productId:1,sku:'SKU-T40',model:'T40',productCategory:'洗碗机',purposeId:2,key:'warranty',englishName:'Warranty',displayName:'售后卡',purposeStatus:'active',name:'T40售后卡二维码',status:'inactive',files:[],pendingFiles:[]}]};else if(p==='/api/health')body={status:'ok'};else if(p.includes('settings'))body={configured:false,available:false,workspaceRoot:null};else if(p.startsWith('/api/dictionaries'))body={items:[]};else if(p==='/api/drawings/navigation')body={batches};else if(p==='/api/material-batches')body={items:batches};else if(p==='/api/drawings'){queries.push(Object.fromEntries(u.searchParams));body={items:rows,total:rows.length,page:1,pageSize:50};}else if(/^\/api\/drawings\/\d+$/.test(p))body=rows.find(x=>x.id===Number(p.split('/').at(-1)));else body={items:[],total:0,page:1,pageSize:50};await route.fulfill({json:body});});
 await page.goto('http://127.0.0.1:5193/');const navToggle=page.getByRole('button',{name:'展开导航',exact:true});if(await navToggle.isVisible())await navToggle.click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'图号库',exact:true}).click();await page.getByRole('button',{name:rows[0].fullCode,exact:true}).waitFor();await page.waitForTimeout(250);
 const table=page.locator('.drawing-library-page .module-list table');
 const measure=()=>table.locator('tbody tr').evaluateAll(nodes=>nodes.map(row=>{const code=row.querySelector('.drawing-code-inline'),button=code.querySelector('.link-button').getBoundingClientRect(),copy=code.querySelector('.copy-icon-button').getBoundingClientRect();return {height:row.getBoundingClientRect().height,codeY:button.y+button.height/2,copyY:copy.y+copy.height/2,copyRight:copy.left>=button.right-1};}));
 const before=await measure();await table.locator('tbody tr').first().getByRole('button',{name:'复制完整图号',exact:true}).click();await page.waitForTimeout(150);const after=await measure();
 const copied=await page.evaluate(()=>navigator.clipboard.readText());
 const successText=await table.getByText('已复制完整图号',{exact:true}).count();
 const geometry=await table.evaluate(t=>({overflow:document.documentElement.scrollWidth>innerWidth+1,align:[...t.querySelectorAll('thead th')].map((th,i)=>({heading:getComputedStyle(th).textAlign,body:getComputedStyle(t.querySelectorAll('tbody tr:first-child td')[i]).textAlign}))}));
 results.push({width,height,before,after,successText,copiedCorrectly:copied===rows[0].fullCode,...geometry});
 if(!baseline){if(successText||after.some((m,i)=>Math.abs(m.height-before[i].height)>1||Math.abs(m.codeY-m.copyY)>2||!m.copyRight)||geometry.overflow||geometry.align.some(x=>x.heading!==x.body)||copied!==rows[0].fullCode)throw Error(JSON.stringify(results.at(-1)));
 let tree=page.getByRole('navigation',{name:'图号产品与批次'});if(!await tree.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();
 await tree.getByText('SKU-T40 · T40',{exact:true}).click();await tree.getByRole('button',{name:'产品全部图号 SKU-T40 · T40',exact:true}).click();
 if(!await page.getByRole('heading',{name:'T40',exact:true}).isVisible())throw Error('Product heading was not simplified');
 if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-drawing-alignment-20261017/product-scope-${width}.png`});
 if(!await tree.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();
 await tree.getByText('未关联产品的批次（1）',{exact:true}).click();await tree.getByRole('button',{name:/历史待关联批次/}).click();if(queries.at(-1)?.usageBatchId!=='9'||queries.at(-1)?.associationState)throw Error('Batch navigation semantics changed');
 if(!await tree.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();await tree.getByRole('button',{name:'未关联图号',exact:true}).click();if(queries.at(-1)?.associationState!=='pending'||queries.at(-1)?.usageBatchId)throw Error('Pending drawing query changed');
 await page.evaluate(()=>{const n=document.createElement('span');n.textContent='自动化接口夹具 · 非真实业务数据';Object.assign(n.style,{position:'fixed',right:'12px',bottom:'6px',background:'#fff',padding:'4px',zIndex:99999,fontSize:'12px'});document.body.append(n);});
 if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-drawing-alignment-20261017/after-copy-${width}.png`});
 await (async()=>{const toggle=page.getByRole('button',{name:'展开导航',exact:true});if(await toggle.isVisible())await toggle.click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'产品档案',exact:true}).click();})();
 await page.getByRole('button',{name:'说明书 · 已启用',exact:true}).waitFor();
 const products=await page.locator('.products-compact table').evaluate(t=>({aligned:[...t.querySelectorAll('th,td')].every(n=>getComputedStyle(n).textAlign==='center'),badges:[...t.querySelectorAll('.product-purpose-link')].map(n=>({classes:n.className,border:getComputedStyle(n).borderTopWidth,background:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color}))}));
 if(!products.aligned||products.badges.length!==3||products.badges.some(n=>n.border==='0px')||new Set(products.badges.map(n=>n.background)).size!==3)throw Error('Product badge/alignment failure '+JSON.stringify(products));results.at(-1).products=products;
 if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-drawing-alignment-20261017/products-centered-${width}.png`});
 {const toggle=page.getByRole('button',{name:'展开导航',exact:true});if(await toggle.isVisible())await toggle.click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'PDF 文件中心',exact:true}).click();}
 if(!await page.getByRole('navigation',{name:'资料导航'}).isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();
 await page.getByRole('button',{name:'全部文件',exact:true}).click();if(await page.getByRole('button',{name:'未关联／未归批次核对',exact:true}).count())throw Error('Misleading file filter remains');
 if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-drawing-alignment-20261017/files-navigation-${width}.png`});
 {const toggle=page.getByRole('button',{name:'展开导航',exact:true});if(await toggle.isVisible())await toggle.click();await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'二维码管理',exact:true}).click();}
 await page.getByRole('button',{name:'展开 T40 的二维码用途',exact:true}).click();
 const qrHeaders=await page.locator('.qr-page > .table-wrap > table > thead th').allTextContents();if(qrHeaders.join('|')!=='产品 · SKU / 型号|需关注|操作'||!await page.getByRole('columnheader',{name:'用途',exact:true}).isVisible())throw Error('QR count/detail regression '+JSON.stringify(qrHeaders));results.at(-1).qrHeaders=qrHeaders;
 if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-drawing-alignment-20261017/qr-no-count-${width}.png`});
 {const toggle=page.getByRole('button',{name:'展开导航',exact:true});if(await toggle.isVisible())await toggle.click();await page.getByRole('button',{name:'安全恢复',exact:true}).click();}
 const recovery=await page.getByRole('region',{name:'安全恢复面板'}).evaluate(n=>({width:n.getBoundingClientRect().width,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right}));if(recovery.width>361||recovery.left<0||recovery.right>width)throw Error('Recovery too wide '+JSON.stringify(recovery));results.at(-1).recovery=recovery;
 if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-drawing-alignment-20261017/recovery-compact-${width}.png`});
 if(writes.length)throw Error('Unexpected mutation');}
 await page.close();console.log(width,JSON.stringify(results.at(-1)));
 }}finally{await browser.close();await vite.close();fs.writeFileSync(`work/p4-drawing-alignment/${baseline?'baseline':'browser'}.json`,JSON.stringify(results,null,2));}
 if(baseline&&results.some(x=>x.successText||x.after.some((m,i)=>Math.abs(m.height-x.before[i].height)>1)))process.exitCode=1;
