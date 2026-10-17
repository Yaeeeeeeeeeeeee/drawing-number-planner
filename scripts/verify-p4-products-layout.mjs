import {chromium} from '@playwright/test';import fs from 'node:fs';
const product={id:1,brandId:1,brandName:'SAMKYO',productSizeId:2,productSizeName:'冰柜',defaultAppearanceId:3,defaultAppearanceName:'外观',sku:'SKU-N',model:'N100',productCategory:'冰柜',referenceProductId:null,referenceProductModel:null,status:'active'};
const manual={id:11,productId:1,sku:'SKU-N',model:'N100',productCategory:'冰柜',purposeId:1,key:'user_manual',englishName:'User Manual',displayName:'说明书',purposeStatus:'active',name:'N100 使用说明',targetUrl:null,status:'active',createdAt:'2026-09-01T00:00:00Z',updatedAt:'2026-09-02T00:00:00Z',files:[],pendingFiles:[]};
const purposes=[{id:1,key:'user_manual',englishName:'User Manual',displayName:'说明书',status:'active'},{id:2,key:'warranty',englishName:'Warranty',displayName:'售后卡',status:'active'},{id:3,key:'recipe',englishName:'Recipe',displayName:'菜谱',status:'active'}];
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const results=[];fs.mkdirSync('docs/screenshots/p4-products-list-20261016',{recursive:true});
for(const [width,height] of [[3840,2160],[2560,1440],[1920,1080],[1366,768],[1100,760],[720,600]]){
 const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>console.log('PAGEERROR',e.message));console.log('window',width);let codes=[{...manual}];const writes=[];
 await page.route('**/api/**',async route=>{const request=route.request(),u=new URL(request.url()),p=u.pathname;
  if(p!=='/api/session'&&!['GET','HEAD'].includes(request.method()))writes.push({path:p,method:request.method()});
  let body;
  if(p==='/api/session')body={token:'isolated-browser-fixture'};else if(p==='/api/products')body={items:[product]};else if(p.startsWith('/api/dictionaries'))body={items:[{id:1,name:'SAMKYO',code:'02',status:'active'}]};
  else if(p==='/api/qr-codes')body={items:codes.filter(c=>!u.searchParams.has('purposeId')||String(c.purposeId)===u.searchParams.get('purposeId'))};
  else if(p==='/api/qr-purposes')body={items:purposes};else if(p==='/api/qr-codes/11')body=codes[0];
  else if(p==='/api/qr-codes/11/deactivate'){codes=[{...codes[0],status:'inactive'}];body=codes[0];}
  else if(p.includes('pending'))body={items:[]};else if(p.includes('recovery'))body={items:[]};else body={items:[]};
  await route.fulfill({json:body});
 });
 await page.goto('http://127.0.0.1:5193/');
 if(await page.getByRole('button',{name:'展开导航',exact:true}).isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();
 await page.getByRole('button',{name:'产品档案',exact:true}).click();await page.getByRole('button',{name:'编辑 N100'}).waitFor();
 await page.evaluate(()=>{const n=document.createElement('span');n.textContent='自动化接口夹具 · 非真实业务数据';Object.assign(n.style,{position:'fixed',right:'12px',bottom:'8px',background:'#fff',border:'1px solid #ccc',padding:'4px',zIndex:9999,fontSize:'12px'});document.body.append(n);});
 const geometry=await page.evaluate(()=>{const root=document.querySelector('.products-compact'),table=root.querySelector('table'),wrap=table.parentElement,headers=[...table.querySelectorAll('thead th')].map(n=>n.textContent),last=table.querySelector('tbody tr td:last-child');wrap.scrollLeft=wrap.scrollWidth;const r=last.getBoundingClientRect(),w=wrap.getBoundingClientRect();return{headers,overflow:document.documentElement.scrollWidth>innerWidth+1,tableWidth:wrap.getBoundingClientRect().width,workspaceWidth:root.clientWidth,actionVisible:r.left>=w.left-1&&r.right<=w.right+1,expanded:table.querySelectorAll('.expanded-table-row').length,filtersTop:[...root.querySelectorAll('.filter-bar label')].map(n=>Math.round(n.getBoundingClientRect().top))};});
 if(geometry.headers.join('|')!=='SKU / 型号|品牌 / 类别|产品规格|状态|说明书|售后卡|菜谱|操作'||geometry.overflow||!geometry.actionVisible||geometry.expanded||geometry.tableWidth<geometry.workspaceWidth-3)throw Error(JSON.stringify({width,...geometry}));
 if([3840,1920,1100].includes(width))await page.screenshot({path:`docs/screenshots/p4-products-list-20261016/api-fixture-${width}.png`});
 await page.locator('.products-compact .table-wrap').evaluate(n=>n.scrollLeft=0);
 await page.getByRole('button',{name:'说明书 · 已启用',exact:true}).click();await page.getByRole('heading',{name:manual.name,exact:true}).waitFor();
 if(writes.length)throw Error('Navigation wrote business data');
 await page.getByRole('button',{name:'停用二维码',exact:true}).click();await page.getByRole('button',{name:'启用二维码',exact:true}).waitFor();
 await page.getByRole('button',{name:'返回产品档案',exact:true}).click();await page.getByRole('button',{name:'说明书 · 已停用',exact:true}).waitFor();
 await page.getByRole('button',{name:'菜谱 · 未配置',exact:true}).click();await page.getByLabel('新增二维码用途').waitFor();
 if(await page.getByLabel('新增二维码用途').inputValue()!=='3'||await page.getByLabel('新增二维码产品').inputValue()!=='1')throw Error('Incorrect unconfigured target');
 if(writes.length!==1||!writes[0].path.endsWith('/deactivate'))throw Error('Unexpected auto write');
 results.push({width,height,source:'existing test fixtures via intercepted API; no real database',pass:true,...geometry});await page.close();
}
await browser.close();fs.writeFileSync('work/p4-products-list/browser.json',JSON.stringify(results,null,2));console.log(JSON.stringify(results));
