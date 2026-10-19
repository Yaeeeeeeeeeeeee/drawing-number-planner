// Native verification of the installed empty-data candidate. Never manufactures sample records.
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { DatabaseSync } = require('node:sqlite');
const [sourceArg, executableArg] = process.argv.slice(2);
const source = path.resolve(sourceArg), executable = path.resolve(executableArg), directory = path.dirname(executable);
const { _electron } = createRequire(path.join(source, 'package.json'))('@playwright/test');
function snapshot(file) {
 const db = new DatabaseSync(file,{readOnly:true});
 try { return Object.fromEntries(db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all().map(({name})=>[name,db.prepare(`select * from "${name.replaceAll('"','""')}" order by rowid`).all()])); }
 finally {db.close();}
}
(async () => {
 assert.equal(fs.existsSync(path.join(directory,'resources/app/acceptance-seed')),false);
 const version = JSON.parse(fs.readFileSync(path.join(directory,'resources/app/acceptance-version.json'),'utf8'));
 assert.equal(version.emptyStart,true);
 assert.equal(version.revision,process.env.PLANNER_ACCEPTANCE_REVISION);
 const app = await _electron.launch({ executablePath: executable, timeout: 45000 });
 let root, report;
 try {
  const page = await app.firstWindow();
  const errors=[], writes=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/')&&!['GET','HEAD'].includes(request.method())&&!request.url().endsWith('/api/session'))writes.push(request.method()+' '+new URL(request.url()).pathname);});
  await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor({timeout:30000});
  root = await app.evaluate(({app})=>app.getPath('userData'));
  assert.equal(path.basename(root),version.revision.slice(0,7));
  assert.ok(root.includes('DrawingNumberPlannerAcceptance'));
  const databaseBefore=snapshot(path.join(root,'planner.db'));
  const systemTables=['schema_migrations','qr_purposes','qr_purpose_product_categories'];
  for(const [name,rows] of Object.entries(databaseBefore))if(!systemTables.includes(name))assert.equal(rows.length,0,`${name} must have no example/user records`);
  assert.equal(databaseBefore.qr_purposes.length,3);
  const settings=JSON.parse(fs.readFileSync(path.join(root,'settings.json'),'utf8'));
  assert.deepEqual(fs.readdirSync(settings.workspaceRoot),[]);
  assert.deepEqual(fs.readdirSync(settings.outboundOutputRoot),[]);
  const native=await app.evaluate(({BrowserWindow,Menu})=>{const window=BrowserWindow.getAllWindows()[0];return{menuVisible:window.isMenuBarVisible(),autoHide:window.isMenuBarAutoHide(),recoveryMenuPreserved:Menu.getApplicationMenu().items[0].submenu.items.some(item=>item.label==='安全恢复')};});
  assert.equal(native.menuVisible,false);assert.equal(native.autoHide,true);assert.equal(native.recoveryMenuPreserved,true);
  assert.equal(await page.locator('.workspace-topbar').count(),0);
  const go=async name=>{const navigation=page.getByRole('navigation',{name:'主导航'});if(!await navigation.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await navigation.getByRole('button',{name,exact:true}).click();await page.getByRole('heading',{name,exact:true}).waitFor();};
  await go('二维码管理');
  const rows=[];
  for(const [width,height] of [[3840,2160],[1920,1080],[1100,760],[1024,760],[1023,760],[720,600]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);await page.waitForTimeout(200);
   const toggle=page.getByRole('button',{name:'展开导航',exact:true});if(await toggle.isVisible())await toggle.click();
   const layout=await page.evaluate(()=>{const panel=document.querySelector('#workspace-navigation'),main=document.querySelector('main.workspace');const p=panel.getBoundingClientRect(),m=main.getBoundingClientRect();return{width:innerWidth,height:innerHeight,panelRight:p.right,mainLeft:m.left,mainTop:m.top,mainHeight:m.height,inert:main.inert,overflow:document.documentElement.scrollWidth>innerWidth};});
   assert.equal(layout.width,width);assert.equal(layout.height,height);assert.equal(layout.mainTop,0);assert.equal(layout.mainHeight,height);assert.equal(layout.overflow,false);assert.equal(layout.inert,width<1024);if(width>=1024)assert.ok(layout.panelRight<=layout.mainLeft);
   await page.screenshot({path:path.join(directory,`Windows-浮动目录-展开-${width}.png`)});
   await page.getByRole('button',{name:'关闭导航',exact:true}).click();
   const input=page.getByLabel('SKU / 型号',{exact:true});await input.fill('保留筛选');await toggle.click();
   if(width<1024)await page.keyboard.press('Escape');else await page.getByRole('button',{name:'关闭导航',exact:true}).click();
   assert.equal(await input.inputValue(),'保留筛选');assert.equal(await toggle.evaluate(n=>n===document.activeElement),true);
   rows.push(layout);
  }
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1920,1080));await page.waitForTimeout(200);
  await go('产品档案');await page.getByRole('button',{name:'新建产品',exact:true}).waitFor();
  const products=await page.evaluate(async()=>await(await fetch('/api/products?status=all')).json());assert.equal(products.items.length,0);
  await page.screenshot({path:path.join(directory,'Windows-浮动目录-空产品档案-1920.png')});
  const inspections=[];
  for(const [moduleName,navLabel,allName,pendingName] of [['图号库','图号导航','全部图号','未关联图号'],['PDF 文件中心','资料导航','全部文件','待关联产品']]){
   await go(moduleName);const nav=page.getByRole('navigation',{name:navLabel,exact:true});
   if(!await nav.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();
   await nav.waitFor();await page.waitForFunction(label=>document.querySelector(`.pdf-product-navigation button[aria-label="${label}"] .pdf-nav-count`)?.textContent==='0',allName);
   assert.equal(await nav.locator('.pdf-nav-filters[open]').count(),0);
   const fold=nav.getByRole('button',{name:'收起产品导航',exact:true});
   const headingRow=await fold.evaluate(n=>{const h=n.closest('.catalog-nav-heading'),r=h.querySelector('h2').getBoundingClientRect(),b=n.getBoundingClientRect();return Math.abs((r.y+r.height/2)-(b.y+b.height/2))<8;});assert.ok(headingRow);
   const pending=nav.getByRole('button',{name:pendingName,exact:true});await pending.click();assert.equal(await pending.getAttribute('aria-current'),'page');
   assert.ok(await pending.evaluate(n=>Boolean(n.closest('.pdf-nav-scroll'))));
   assert.equal(await pending.evaluate(n=>{const r=n.getBoundingClientRect();return n.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true);
   await nav.getByRole('button',{name:allName,exact:true}).click();
   const handle=page.getByRole('separator',{name:'调整产品导航宽度',exact:true});
   assert.equal(await handle.getAttribute('aria-valuenow'),'300');assert.equal(await handle.getAttribute('aria-valuemin'),'260');assert.equal(await handle.getAttribute('aria-valuemax'),'420');
   await handle.focus();await page.keyboard.press('End');assert.equal(await handle.getAttribute('aria-valuenow'),'420');await page.getByRole('button',{name:'恢复默认宽度',exact:true}).click();
   const data=await page.evaluate(async kind=>{
    const countUrl=kind==='files'?'/api/files/navigation?presence=all':'/api/drawings/navigation-counts';
    const listUrl=kind==='files'?'/api/files?presence=all&unassociatedProduct=true':'/api/drawings?associationState=unassociated';
    const results=await Promise.all([fetch(countUrl),fetch(listUrl)]);if(results.some(r=>!r.ok))throw Error('Navigation/list request failed');return Promise.all(results.map(r=>r.json()));
   },moduleName==='PDF 文件中心'?'files':'drawings');
   assert.equal(data[0].total,0);assert.equal(data[1].total,0);assert.equal(data[1].items.length,0);
   if(moduleName==='PDF 文件中心')assert.equal(data[0].unassociatedProducts,0);else assert.equal(data[0].unassociated,0);
   await page.screenshot({path:path.join(directory,`Windows-浮动目录-${moduleName==='PDF 文件中心'?'PDF':'图号库'}空数据-1920.png`)});
   inspections.push({moduleName,headingAligned:headingRow,counts:data[0],listTotal:data[1].total,clickable:true,width:{default:300,min:260,max:420}});
  }
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);assert.deepEqual(snapshot(path.join(root,'planner.db')),databaseBefore);
  report={revision:version.revision,native,rows,inspections,noBundledSeed:true,allBusinessTablesEmpty:true,systemDefinitionsPreserved:true,noApiWrites:true,writes,errors,scope:'Installed empty-data EXE on native Windows; actual fresh initialization, readonly counts/list/clicks/resize, six viewport layout checks. No sample import, deletes or record creation; physical 4K/DPI remains manual.'};
 }finally{await app.close();}
 // Reopening the same installed candidate must preserve its initialized DB, not reset it.
 const beforeRestart=snapshot(path.join(root,'planner.db'));
 const restarted=await _electron.launch({executablePath:executable,timeout:45000});
 try{const page=await restarted.firstWindow();await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor({timeout:30000});assert.deepEqual(snapshot(path.join(root,'planner.db')),beforeRestart);report.restartPreservesDatabase=true;}finally{await restarted.close();}
 fs.writeFileSync(path.join(directory,'windows-floating-navigation.json'),JSON.stringify(report,null,2));
 console.log('Installed Chinese/custom-path empty-data Windows candidate verified.');
})().catch(error=>{console.error(error);process.exitCode=1;});
