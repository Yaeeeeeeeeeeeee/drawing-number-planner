import {chromium} from '@playwright/test';
import {createServer} from 'vite';
import fs from 'node:fs';
import assert from 'node:assert/strict';

// Every API request is intercepted; these screenshots are interface fixtures.
const output='docs/screenshots/p4-pdf-navigation-20261019';fs.mkdirSync(output,{recursive:true});fs.mkdirSync('work',{recursive:true});
const server=await createServer({configFile:'vite.config.ts',server:{host:'127.0.0.1',port:5195,strictPort:true}});await server.listen();
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const products=[{id:1,sku:'PREVIEWF60',model:'F60',productCategory:'空气炸锅'},{id:2,sku:'PREVIEWT40',model:'T40',productCategory:'冰柜'}].map(p=>({...p,brandId:1,brandName:'界面夹具',productSizeId:2,productSizeName:'规格',defaultAppearanceId:null,defaultAppearanceName:null,referenceProductId:null,referenceProductModel:null,status:'active'}));
const batches=[{id:11,productId:1,name:'00.首批大货',currentState:'current'},{id:12,productId:1,name:'13.20260815（新桶配新桶贴）',currentState:'historical'},{id:13,productId:2,name:'01.白色首批（20230423）',currentState:'current'}].map(b=>({...b,recognitionStatus:b.id===13?'pending':'recognized',relativePath:`fixture/${b.id}`,isPresent:true}));
const usage=batches.map(b=>({...b,usageProducts:b.id===13?[]:[{productId:1,state:b.id===11?'historical':'current'}]}));
const files=[{id:1,productId:1,materialBatchId:11,fileName:'source.pdf',conversionType:'source',isPresent:true},{id:2,productId:1,materialBatchId:12,fileName:'outlined.pdf',conversionType:'outlined',isPresent:false},{id:3,productId:2,materialBatchId:13,fileName:'T40.pdf',conversionType:'source',isPresent:true},{id:4,productId:null,materialBatchId:null,fileName:'unassociated.pdf',conversionType:'outlined',isPresent:true},{id:5,productId:null,materialBatchId:11,fileName:'known-batch-no-product.pdf',conversionType:'source',isPresent:true}].map(f=>({...f,relativePath:`fixture/${f.fileName}`,fullCode:'02.0404.010.0401001',matchStatus:'matched',materialBatchName:batches.find(b=>b.id===f.materialBatchId)?.name??null,materialBatchStatus:'recognized',model:products.find(p=>p.id===f.productId)?.model??null,productCategory:products.find(p=>p.id===f.productId)?.productCategory??null,sku:products.find(p=>p.id===f.productId)?.sku??null}));
const subset=(query,scope=true)=>files.filter(f=>(!query.get('keyword')||f.fileName.includes(query.get('keyword')))&&(!query.get('matchStatus')||f.matchStatus===query.get('matchStatus'))&&(!query.get('conversionType')||f.conversionType===query.get('conversionType'))&&(query.get('presence')==='all'||f.isPresent===(query.get('presence')!=='missing'))&&(!scope||(!query.has('productId')||f.productId===Number(query.get('productId')))&&(!query.has('materialBatchId')||f.materialBatchId===Number(query.get('materialBatchId')))&&(!query.has('productCategory')||f.productCategory===query.get('productCategory'))&&(query.get('unassociatedProduct')!=='true'||f.productId==null)));
const statistics=query=>{const rows=subset(query,false);return {total:rows.length,unassociatedProducts:rows.filter(f=>f.productId==null).length,categories:[...new Set(rows.map(f=>f.productCategory).filter(Boolean))].map(name=>({name,count:rows.filter(f=>f.productCategory===name).length})),products:products.map(p=>({productId:p.id,count:rows.filter(f=>f.productId===p.id).length})),batches:batches.flatMap(b=>[...new Set(rows.filter(f=>f.materialBatchId===b.id).map(f=>f.productId))].map(productId=>({materialBatchId:b.id,productId,count:rows.filter(f=>f.materialBatchId===b.id&&f.productId===productId).length})))};};
const drawings=products.map((p,i)=>({id:i+1,origin:'planned',fullCode:`02.0404.010.040100${i+1}`,displayName:'接口夹具图纸',productId:p.id,sku:p.sku,model:p.model,productCategory:p.productCategory,mainCategoryName:'印刷',projectItemName:'说明书',status:'active',hasSourceFile:true,hasOutlinedFile:true,dictionaryMappingStatus:'mapped'}));
const results=[];
try {
 for(const [width,height] of [[3840,2160],[2560,1440],[1920,1080],[1280,800],[800,650]]) {
  const page=await browser.newPage({viewport:{width,height}});const errors=[],writes=[];let empty=false;
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/**',async route=>{const req=route.request(),url=new URL(req.url()),path=url.pathname;let body={items:[],total:0,page:1,pageSize:50};
   if(!['GET','HEAD'].includes(req.method())&&path!=='/api/session')writes.push(path);
   if(path==='/api/session')body={token:'isolated-interface-fixture'};
   if(path==='/api/tasks')body={tasks:[]};if(path==='/api/health')body={status:'ok'};
   if(path==='/api/products')body={items:products};if(path==='/api/material-batches')body={items:batches};if(path==='/api/drawings/navigation')body={batches:usage};
   if(path.startsWith('/api/dictionaries/'))body={items:[{id:path.endsWith('brand')?1:2,name:'界面夹具',code:'02',status:'active'}]};
   if(path==='/api/files/settings')body={workspaceRoot:'/interface-fixture',configured:true,available:true};
   if(path==='/api/files/navigation')body=statistics(url.searchParams);
   if(path==='/api/drawings')body={items:drawings,total:drawings.length,page:1,pageSize:50};
   if(path==='/api/drawings/navigation-counts')body={total:2,unassociated:0,recycle:0,categories:products.map(p=>({name:p.productCategory,count:1})),products:products.map(p=>({productId:p.id,count:1})),batches:[]};
   if(path==='/api/files'){const rows=subset(url.searchParams);body={items:rows,total:rows.length,page:1,pageSize:50};}
   if(path==='/api/products/1/cleanup-preview')body={productId:1,model:'F60',sku:'PREVIEWF60',blockers:[],owned:{drawings:40,historicalDrawings:0,bomRecords:2,qrCodes:0,batches:2},preservedSnapshots:1,classification:{alreadyDeleted:0,presentPdfIndexes:1,missingPdfIndexes:1,preservedDrafts:0},choices:{fingerprint:'a'.repeat(64),occupiedDrawings:Array.from({length:40},(_,i)=>({signedId:i+1,fullCode:`02.0404.010.0401${String(i+1).padStart(3,'0')}`})),purgeCounts:{bomRecords:2,qrCodes:0,batches:2,outboundPackages:1,emailDrafts:0},purgeBlockers:[]}};
   if(empty){if(['/api/products','/api/material-batches','/api/drawings'].includes(path))body={items:[],total:0,page:1,pageSize:50};if(path==='/api/drawings/navigation')body={batches:[]};if(path==='/api/files')body={items:[],total:0,page:1,pageSize:50};if(path==='/api/files/navigation')body={total:0,unassociatedProducts:0,categories:[],products:[],batches:[]};if(path==='/api/drawings/navigation-counts')body={total:0,unassociated:0,recycle:0,categories:[],products:[],batches:[]};if(path==='/api/files/settings')body={workspaceRoot:null,configured:false,available:false};}
   await route.fulfill({json:body});
  });
  await page.goto('http://127.0.0.1:5195');await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'PDF 文件中心',exact:true}).click();
  await page.getByRole('heading',{name:'PDF 文件中心',exact:true}).waitFor();
  await page.evaluate(()=>{const mark=document.createElement('div');mark.textContent='自动化接口夹具 · 非真实业务数据';mark.style.cssText='position:fixed;right:10px;bottom:4px;z-index:1000;background:white;color:#777;font:11px sans-serif;padding:3px';document.body.append(mark);});
  const nav=page.getByRole('navigation',{name:'资料导航',exact:true});
  const openNav=async()=>{if(!await nav.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();await nav.waitFor();};
  await openNav();await page.waitForFunction(()=>document.querySelector('.pdf-product-navigation button[aria-label="全部文件"] .pdf-nav-count')?.textContent==='5');
  assert.equal(await nav.locator('.pdf-nav-filters').getAttribute('open'),null);assert.equal(await page.getByLabel('存在状态',{exact:true}).inputValue(),'all');assert.equal(await page.locator('.files-page .files-filter').count(),1);
  await nav.getByRole('button',{name:'展开产品 PREVIEWF60 · F60',exact:true}).click();await nav.getByRole('button',{name:'展开产品 PREVIEWT40 · T40',exact:true}).click();
  assert.match(await nav.getByRole('button',{name:'批次 首批大货',exact:true}).textContent(),/历史使用/);
  assert.match(await nav.getByRole('button',{name:'批次 20260815（新桶配新桶贴）',exact:true}).textContent(),/当前使用/);
  assert.match(await nav.getByRole('button',{name:'批次 白色首批（20230423）',exact:true}).textContent(),/待确认/);
  const search=nav.getByLabel('搜索产品 SKU 或型号');await search.fill('F60');assert.equal(await nav.getByRole('button',{name:'产品 PREVIEWT40 · T40',exact:true}).count(),0);await search.fill('');
  const body=nav.locator('.pdf-nav-scroll');const y=await nav.locator('.pdf-nav-header').evaluate(n=>n.getBoundingClientRect().y);await body.evaluate(n=>n.scrollTop=n.scrollHeight);assert.equal(await nav.locator('.pdf-nav-header').evaluate(n=>n.getBoundingClientRect().y),y);await body.evaluate(n=>n.scrollTop=0);
  await page.screenshot({path:`${output}/pdf-navigation-${width}.png`});
  const selected=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files'&&new URL(r.url()).searchParams.get('productCategory')==='空气炸锅');await nav.getByRole('button',{name:'分类 空气炸锅',exact:true}).click();assert.equal((await (await selected).json()).total,2);
  await openNav();await nav.locator('.pdf-nav-filters > summary').click();
  await page.getByLabel('转曲类型',{exact:true}).selectOption('source');
  const filtered=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files'&&new URL(r.url()).searchParams.get('conversionType')==='source');await page.getByRole('button',{name:'筛选 PDF',exact:true}).click();await filtered;
  await openNav();
  const pending=nav.getByRole('button',{name:'待关联产品',exact:true});await pending.scrollIntoViewIfNeeded();
  const hit=await pending.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.ok(hit,'pending selector must receive actual pointer hits');
  const unassociated=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files'&&new URL(r.url()).searchParams.get('unassociatedProduct')==='true');
  await pending.click();const pendingResponse=await unassociated;const pendingUrl=new URL(pendingResponse.url());
  assert.equal(pendingUrl.searchParams.get('conversionType'),'source');assert.equal(pendingUrl.searchParams.get('presence'),'all');assert.equal(pendingUrl.searchParams.get('page'),'1');
  for(const key of ['productId','materialBatchId','productCategory'])assert.equal(pendingUrl.searchParams.has(key),false);
  assert.equal((await pendingResponse.json()).total,1);
  await openNav();await page.waitForFunction(()=>document.querySelector('[aria-label="待关联产品"] .pdf-nav-count')?.textContent==='1');
  assert.equal(await nav.getByRole('button',{name:'待关联产品',exact:true}).getAttribute('aria-current'),'page');
  assert.equal(await page.getByLabel('转曲类型',{exact:true}).inputValue(),'source');
  const all=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files'&&!new URL(r.url()).searchParams.has('unassociatedProduct'));await nav.getByRole('button',{name:'全部文件',exact:true}).click();assert.equal((await (await all).json()).total,3);
  await openNav();await page.getByLabel('转曲类型',{exact:true}).selectOption('');
  const reset=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/files'&&!new URL(r.url()).searchParams.has('conversionType'));await page.getByRole('button',{name:'筛选 PDF',exact:true}).click();await reset;
  await openNav();await nav.locator('.pdf-nav-filters > summary').click();
  const handle=page.getByRole('separator',{name:'调整产品导航宽度',exact:true});let resize=null;
  if(await handle.isVisible()){await handle.focus();await page.keyboard.press('End');resize=await handle.getAttribute('aria-valuenow');assert.ok(Number(resize)<=420);await page.getByRole('button',{name:'恢复默认宽度',exact:true}).click();assert.equal(await handle.getAttribute('aria-valuenow'),'300');}
  if(width===1920){
   await page.screenshot({path:`${output}/pdf-shared-1920.png`});
   await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'图号库',exact:true}).click();
   const drawingNav=page.getByRole('navigation',{name:'图号导航',exact:true});
   if(!await drawingNav.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();
   await drawingNav.waitFor();await drawingNav.getByRole('button',{name:'展开产品 PREVIEWF60 · F60',exact:true}).click();
   await page.screenshot({path:`${output}/drawings-shared-1920.png`});
   const compare=await browser.newPage({viewport:{width:1920,height:650}});
   const sources=['drawings-shared-1920.png','pdf-shared-1920.png'].map(name=>`data:image/png;base64,${fs.readFileSync(`${output}/${name}`).toString('base64')}`);
   await compare.setContent(`<html><body style="margin:0;background:#eee;font:16px sans-serif"><header style="padding:10px">实际浏览器截图并排 · 自动化接口夹具，非真实业务数据 · 同为1920×1080 CSS视口</header><main style="display:flex">${sources.map((src,i)=>`<section style="width:50%"><h3>${i?'PDF 文件中心':'图号库'}</h3><img style="width:100%" src="${src}"></section>`).join('')}</main></body></html>`);
   await compare.screenshot({path:`${output}/drawing-pdf-side-by-side-1920.png`,fullPage:true});await compare.close();
  }
  if(width===1920){await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'产品档案',exact:true}).click();await page.getByRole('button',{name:'编辑 F60',exact:true}).click();await page.getByRole('button',{name:'删除档案 F60',exact:true}).click();const cleanup=page.getByRole('region',{name:'产品删除检查与清理'});await cleanup.getByLabel('输入型号确认').fill('F60');await cleanup.getByLabel('释放占号',{exact:true}).check();await cleanup.getByLabel('永久清除业务历史',{exact:true}).check();assert.equal(await cleanup.getByRole('textbox').count(),1);assert.equal(await cleanup.locator('details:has(>summary:text-is("查看本次图号清单（40条）"))').getAttribute('open'),null);await cleanup.getByRole('button',{name:'核对处理结果',exact:true}).click();await cleanup.getByRole('region',{name:'最后确认处理范围'}).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/product-bulk-confirmation-40.png`});}
  if(width===1920 || width===800){
   empty=true;await page.reload();
   await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'PDF 文件中心',exact:true}).click();
   await page.getByRole('heading',{name:'PDF 文件中心',exact:true}).waitFor();
   await page.getByText('请先设置资料根目录',{exact:true}).waitFor();
   await page.evaluate(()=>{const mark=document.createElement('div');mark.textContent='自动化空接口夹具 · 非用户数据库 / 非安装包验收';mark.style.cssText='position:fixed;right:10px;bottom:4px;z-index:1000;background:white;color:#777;font:11px sans-serif;padding:3px';document.body.append(mark);});
   await page.screenshot({path:`${output}/pdf-empty-${width}.png`});
   const main=page.getByRole('navigation',{name:'主导航'});
   if(!await main.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();
   await main.getByRole('button',{name:'图号库',exact:true}).click();
   await page.getByRole('heading',{name:'图号库',exact:true}).waitFor();
   await page.getByText('图号库尚无记录',{exact:true}).waitFor();
   await page.screenshot({path:`${output}/drawings-empty-${width}.png`});
  }
  assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);results.push({width,height,counts:statistics(new URLSearchParams('presence=all')),explicitBusinessStates:true,headerSticky:true,allPreservesManualFilter:true,pendingHitTest:true,pendingClearsScope:true,knownBatchNullProduct:true,matchedNullProduct:true,resize,noBusinessWrites:true});await page.close();
 }
 fs.writeFileSync('work/p4-pdf-navigation-browser.json',JSON.stringify(results,null,2));console.log('PDF navigation and 40-number batch confirmation passed at five viewports; no business writes.');
}finally{await browser.close();await server.close();}
