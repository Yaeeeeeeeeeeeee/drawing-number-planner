// Real installed Electron on the ephemeral Windows runner; all fixtures live in RUNNER_TEMP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{spawn,execFileSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {waitForNativeDesktopWindow}=require('./comprehensive-native-handshake.cjs');
const [sourceArg,executableArg,evidenceArg,helperArg]=process.argv.slice(2);
const source=path.resolve(sourceArg),executable=path.resolve(executableArg),evidence=path.resolve(evidenceArg),helper=path.resolve(helperArg);
const {_electron}=createRequire(path.join(source,'package.json'))('@playwright/test');
const appRoot=path.join(path.dirname(executable),'resources','app');
const profileHome=path.join(process.env.APPDATA,'DrawingNumberPlanner'),config=path.join(profileHome,'profile.json');
const temporary=fs.mkdtempSync(path.join(process.env.RUNNER_TEMP,'planner-production-verification-'));
const report={revision:process.env.PLANNER_ACCEPTANCE_REVISION,fixtureOnly:true,physicalDpi:'Physical 4K/DPI and cross-monitor checks require local acceptance.',screenshots:[],viewports:[]};
function database(mode,root){execFileSync(executable,[helper,mode,root],{env:{...process.env,ELECTRON_RUN_AS_NODE:'1',NODE_PATH:path.join(appRoot,'node_modules')},stdio:'inherit'});}
function snapshot(file){const db=new DatabaseSync(file,{readOnly:true});try{return Object.fromEntries(db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all().map(({name})=>[name,db.prepare(`select * from "${name}" order by rowid`).all()]));}finally{db.close();}}
function nativeDialog(mode,file,label=mode){const child=spawn('pwsh.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(source,'scripts/verify-comprehensive-profile-dialog.ps1'),'-Mode',mode,...(file?['-DatabasePath',file]:[]),'-ReportPath',path.join(evidence,`native-profile-${label}.json`)],{stdio:['ignore','pipe','pipe']});let output='';const log=path.join(evidence,`native-profile-${label}-process.txt`);const record=(kind,d)=>{output+=d;fs.appendFileSync(log,`[${kind}] ${d}`);process.stdout.write(`[native-dialog ${label} ${kind}] ${d}`);};child.stdout.on('data',d=>record('stdout',d));child.stderr.on('data',d=>record('stderr',d));const done=new Promise((resolve,reject)=>{child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Native profile dialog failed: '+output)));});done.catch(()=>{});return{done,child};}
function writePdf(file,text){
 const stream=`BT /F1 12 Tf 20 100 Td (${text}) Tj ET`;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let pdf='%PDF-1.4\n';const offsets=[0];for(const [index,object]of objects.entries()){offsets.push(Buffer.byteLength(pdf));pdf+=`${index+1} 0 obj\n${object}\nendobj\n`;}const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,pdf);return createHash('sha256').update(pdf).digest('hex');
}
function assertPreservedRows(before,after){for(const [table,rows]of Object.entries(before))for(const row of rows)assert.ok(after[table].some(candidate=>Object.keys(row).every(key=>candidate[key]===row[key])),`Historical row changed in ${table}`);}
function qrState(file,name){const all=snapshot(file),code=all.product_qr_codes.find(row=>row.name===name);assert.ok(code,'Committed QR must exist in actual SQLite');const links=all.qr_manual_links.filter(row=>row.qr_code_id===code.id);return{code,links,files:links.map(link=>all.qr_manual_files.find(row=>row.id===link.file_id)),audit:all.qr_manual_audit.filter(row=>row.qr_code_id===code.id)};}
async function go(page,label){const navigation=page.getByRole('navigation',{name:'主导航'});if(!await navigation.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await navigation.getByRole('button',{name:label,exact:true}).click();await page.getByRole('heading',{name:label==='图号规划 / 更新包材'?'图号规划':label,exact:true}).waitFor();}
async function assertQrListLayout(page,label){
 const table=page.locator('.qr-main-table > .table-wrap > table');await table.waitFor();
 const expected=['SKU','型号','产品类别','说明书','售后卡','菜谱','操作'];
 assert.deepEqual((await table.locator(':scope > thead > tr > th').allTextContents()).map(text=>text.trim()),expected);
 assert.equal(await page.getByLabel('二维码每页数量',{exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);
 const layout=await table.evaluate(element=>({alignments:[...element.querySelectorAll(':scope > thead > tr > th')].map(cell=>getComputedStyle(cell).textAlign),viewportRegion:element.parentElement.classList.contains('viewport-region'),visiblePrimaryRows:[...element.querySelectorAll(':scope > tbody > tr')].filter(row=>!row.classList.contains('expanded-table-row')&&!row.classList.contains('virtual-table-spacer')).length}));
 assert.deepEqual(layout.alignments,['center','center','center','center','center','center','center']);assert.equal(layout.viewportRegion,true);
 // Only real migrated fixture records are used here. Large-list DOM bounds are separately tested with 1000 product fixtures in Vitest.
 (report.qrListLayouts??=[]).push({label,columns:expected,traditionalPagination:false,...layout,longListStress:false});
}
async function assertQrModalLayout(modal,label,stage){
 const layout=await modal.evaluate(element=>{const backdrop=element.closest('.modal-backdrop');if(!backdrop)throw Error('QR modal backdrop missing');const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};return{position:getComputedStyle(backdrop).position,backdrop:rect(backdrop),modal:rect(element),viewport:{width:innerWidth,height:innerHeight},documentScroll:{top:document.scrollingElement.scrollTop,left:document.scrollingElement.scrollLeft},workspaceScroll:document.querySelector('main.workspace')?.scrollTop??null};});
 assert.equal(layout.position,'fixed','QR backdrop must overlay the viewport');const tolerance=2;
 assert.ok(Math.abs(layout.backdrop.x)<=tolerance&&Math.abs(layout.backdrop.y)<=tolerance&&Math.abs(layout.backdrop.right-layout.viewport.width)<=tolerance&&Math.abs(layout.backdrop.bottom-layout.viewport.height)<=tolerance,'QR backdrop must cover the actual viewport');
 assert.ok(layout.modal.width>0&&layout.modal.height>0&&layout.modal.x>=-tolerance&&layout.modal.y>=-tolerance&&layout.modal.right<=layout.viewport.width+tolerance&&layout.modal.bottom<=layout.viewport.height+tolerance,'QR dialog must fit inside the viewport without scrolling the document to its footer');
 const row={label,stage,...layout};(report.qrModalLayouts??=[]).push(row);fs.writeFileSync(path.join(evidence,'windows-qr-modal-layout.json'),JSON.stringify({revision:report.revision,items:report.qrModalLayouts},null,2));console.log('[native QR modal layout]',JSON.stringify(row));
}
async function chooseAndCommitQr(page,file,label){const modal=page.getByRole('dialog',{name:'手动关联二维码PDF'});const picker=nativeDialog('qr',file,label);try{await assertQrModalLayout(modal,label,'before-native-picker');await modal.getByRole('button',{name:'选择本地PDF',exact:true}).click();await picker.done;const selected=modal.getByTitle(file,{exact:true});await selected.waitFor();assert.equal(await selected.locator('small').textContent(),file);assert.ok((await selected.textContent()).startsWith(path.basename(file)));await modal.getByRole('button',{name:'校验文件',exact:true}).click();await modal.getByText('型号、用途、网址尾码与PDF内容校验通过。',{exact:true}).waitFor();await assertQrModalLayout(modal,label,'validated-before-screenshot');await page.screenshot({path:path.join(evidence,`Windows-原生二维码PDF-${label}-校验.png`)});await modal.getByRole('button',{name:'确认关联',exact:true}).click();await modal.waitFor({state:'hidden'});await page.getByText('文件已关联，业务状态保持不变。',{exact:true}).waitFor();}catch(error){await captureFailure(activeApp,`QR-${label}`,error);throw error;}finally{picker.child.kill();}}
let launchNumber=0,activeApp;
function fileDiagnostic(file){try{return{file,text:fs.readFileSync(file,'utf8')}}catch(error){return{file,error:error.message}}}
async function captureFailure(app,label,error){
 const diagnostic={label,error:error?.stack||String(error),at:new Date().toISOString(),profile:fileDiagnostic(config),appData:process.env.APPDATA,temporary,pid:app?.process()?.pid};
 try{diagnostic.native=await Promise.race([app.evaluate(({app,BrowserWindow})=>({appData:app.getPath('appData'),userData:app.getPath('userData'),windows:BrowserWindow.getAllWindows().map(w=>({id:w.id,title:w.getTitle(),url:w.webContents.getURL(),visible:w.isVisible()}))})),new Promise((_,reject)=>setTimeout(()=>reject(Error('Native evaluation exceeded diagnostic limit')),3000))]);}catch(e){diagnostic.nativeError=e.message;}
 try{const saved=JSON.parse(fs.readFileSync(config,'utf8'));diagnostic.settings=fileDiagnostic(path.join(saved.dataDir,'settings.json'));diagnostic.tableCounts=Object.fromEntries(Object.entries(snapshot(path.join(saved.dataDir,'planner.db'))).map(([table,rows])=>[table,rows.length]));}catch(e){diagnostic.profileError=e.message;}
 fs.writeFileSync(path.join(evidence,`windows-${label}-failure.json`),JSON.stringify(diagnostic,null,2));console.error('[native-verification failure]',JSON.stringify(diagnostic));
 try{execFileSync('pwsh.exe',['-NoProfile','-STA','-ExecutionPolicy','Bypass','-File',path.join(source,'scripts/verify-comprehensive-profile-dialog.ps1'),'-Mode','inspect','-ReportPath',path.join(evidence,`windows-${label}-desktop.json`)],{timeout:10000,stdio:'inherit'});}catch(e){console.error('[desktop diagnosis failed]',e.message);}
 for(const [index,page]of (app?.windows()??[]).entries())try{await page.screenshot({path:path.join(evidence,`Windows-${label}-failure-${index}.png`),timeout:3000});fs.writeFileSync(path.join(evidence,`windows-${label}-renderer-${index}.txt`),await page.locator('body').innerText({timeout:1000}));}catch(e){console.error('[renderer diagnosis failed]',e.message);}
}
async function launch(){
 const label=`launch-${++launchNumber}`,log=path.join(evidence,`windows-${label}-process.txt`);fs.writeFileSync(log,`Starting installed Electron ${executable}\n`);
 let app;try{app=await _electron.launch({executablePath:executable,args:['--enable-logging',`--log-file=${path.join(evidence,`windows-${label}-chromium.txt`)}`],timeout:60000});}catch(error){fs.appendFileSync(log,error.stack||String(error));throw error;}
 app.__verificationLabel=label;const record=(kind,value)=>{const text=`[${kind}] ${value}\n`;fs.appendFileSync(log,text);process.stdout.write(`[${label}] ${text}`);};
 app.process().stdout?.on('data',d=>record('stdout',d));app.process().stderr?.on('data',d=>record('stderr',d));app.process().on('exit',(code,signal)=>record('exit',JSON.stringify({code,signal})));app.on('console',message=>record('main-console',message.text()));app.on('window',page=>{record('window',page.url());page.on('console',m=>record('renderer-'+m.type(),m.text()));page.on('pageerror',e=>record('renderer-error',e.stack||e.message));});
 record('pid',app.process().pid);activeApp=app;return app;
}
async function ready(app,dialog){try{const page=await waitForNativeDesktopWindow(app,dialog);await page.getByRole('heading',{name:'图号规划',exact:true}).waitFor({timeout:45000});return page;}catch(error){await captureFailure(app,app.__verificationLabel,error);throw error;}}
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});assert.equal(fs.existsSync(profileHome),false,'Refuse to touch any pre-existing runner/user production profile');
 const version=JSON.parse(fs.readFileSync(path.join(appRoot,'acceptance-version.json'),'utf8'));assert.equal(version.revision,report.revision);assert.equal(version.schemaVersion,24);assert.equal(version.applicationVersion,'1.4.0');assert.equal(JSON.parse(fs.readFileSync(path.join(appRoot,'package.json'),'utf8')).version,version.applicationVersion);assert.equal(version.bundledSample,false);assert.equal(fs.existsSync(path.join(appRoot,'acceptance-seed')),false);
 const legacy=path.join(temporary,'旧版原始数据目录');database('prepare',legacy);database('rollback-and-wal',legacy);const settingsBefore=fs.readFileSync(path.join(legacy,'settings.json'));
 const dialog=nativeDialog('existing',path.join(legacy,'planner.db'));let app;
 try{app=await launch();const page=await ready(app,dialog);
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),legacy);assert.equal(await app.evaluate(({app})=>app.getVersion()),version.applicationVersion);assert.equal(JSON.parse(fs.readFileSync(config,'utf8')).dataDir,legacy);
  assert.deepEqual(fs.readFileSync(path.join(legacy,'settings.json')),settingsBefore);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const native=await app.evaluate(({BrowserWindow,Menu})=>{const w=BrowserWindow.getAllWindows()[0];return{isolated:w.webContents.getLastWebPreferences().contextIsolation,sandbox:w.webContents.getLastWebPreferences().sandbox,nodeIntegration:w.webContents.getLastWebPreferences().nodeIntegration,recovery:Menu.getApplicationMenu().items[0].submenu.items.some(i=>i.label==='安全恢复')};});assert.deepEqual(native,{isolated:true,sandbox:true,nodeIntegration:false,recovery:true});report.native=native;
  for(const [width,height]of [[3840,2160],[2560,1440],[1920,1080],[1366,768],[720,600]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);
   await page.waitForTimeout(200);
   const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio,screenWidth:screen.width,screenHeight:screen.height}));
   assert.equal(viewport.width,width);assert.equal(viewport.height,height);report.viewports.push({requested:{width,height},actual:viewport,scope:'Actual Electron renderer viewport; does not validate physical display/DPI/cross-monitor behavior'});
   for(const label of ['产品档案','图号库','PDF 文件中心','包材模板','二维码管理','BOM 管理','外发资料']){
    const navigation=page.getByRole('navigation',{name:'主导航'});if(!await navigation.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await navigation.getByRole('button',{name:label,exact:true}).click();
    await page.getByRole('heading',{name:label,exact:true}).waitFor();
    await page.waitForTimeout(150);if(label==='二维码管理')await assertQrListLayout(page,`${width}x${height}`);
    if(['产品档案','PDF 文件中心','图号库','二维码管理'].includes(label))assert.equal(await page.locator('.table-pagination').count(),0,`${label} must use scrolling rather than traditional paging`);
    const uiControls=await page.evaluate(()=>({hiddenToggleVisible:[...document.querySelectorAll('.navigation-toggle[hidden]')].some(e=>getComputedStyle(e).display!=='none'),selectHeights:[...document.querySelectorAll('.page-surface select')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().height)}));
    assert.equal(uiControls.hiddenToggleVisible,false);assert.ok(uiControls.selectHeights.every(height=>Math.abs(height-36)<1),`${label} controls must share 36px height`);
    (report.uiControlConsistency??=[]).push({label,width,...uiControls});
    if(width===1920&&label==='图号库'){
     await page.getByRole('button',{name:'查看 / 管理',exact:true}).first().click();
     const drawer=page.locator('.drawing-maintenance');await drawer.waitFor();assert.equal(await drawer.locator(':scope > .drawing-detail-group').count(),4);
     const bounds=await drawer.evaluate(element=>{const r=element.closest('.module-detail').getBoundingClientRect();return {width:r.width,height:r.height};});
     assert.ok(bounds.width>=600&&bounds.width<=690,`Drawing detail width ${bounds.width}`);
     await page.screenshot({path:path.join(evidence,'Windows-V3-图号详情-1920.png')});await page.getByRole('button',{name:'关闭图号详情',exact:true}).click();
    }
    const shot=`Windows-综合改版-${label.replaceAll(' ','')}-${width}.png`;await page.screenshot({path:path.join(evidence,shot)});const png=fs.readFileSync(path.join(evidence,shot));const actualPng={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};assert.equal(actualPng.width,Math.round(viewport.width*viewport.devicePixelRatio));assert.equal(actualPng.height,Math.round(viewport.height*viewport.devicePixelRatio));report.screenshots.push({file:shot,png:actualPng,viewport});fs.writeFileSync(path.join(evidence,'windows-comprehensive-viewports.json'),JSON.stringify({revision:report.revision,viewports:report.viewports,screenshots:report.screenshots},null,2));
   }
  }
  assert.deepEqual(errors,[]);report.rendererErrors=errors;
 }finally{dialog.child.kill();if(app)await app.close();}
 database('audit-upgrade',legacy);report.oldV15Upgrade={originalDirectoryRetained:true,settingsBytesPreserved:true,oldRowsAndSnapshotsPreserved:true,realMigrationBackupValidated:true,walAndRollback:JSON.parse(fs.readFileSync(path.join(legacy,'native-rollback-and-wal.json'),'utf8'))};
 // Exercise the reported zero-count failure through a real installed scan and navigation.
 const directoryRoot=path.join(legacy,'workspace','冰柜','SKU-M1','03.量产后的变更文件（已量产的产品看最新日期）','00.首批大货');
 const directoryPdf=path.join(directoryRoot,'02.0209.010.0401002-M1-铭牌及安装注意事项多语言生产定稿（转曲）.pdf'),unmatchedPdf=path.join(directoryRoot,'M1-补充资料（转曲）.pdf');
 const directoryHashes=[writePdf(directoryPdf,'Directory context matched drawing'),writePdf(unmatchedPdf,'Directory context unmatched drawing')];
 const beforeDirectoryScan=snapshot(path.join(legacy,'planner.db'));const bindingsBeforeScan=beforeDirectoryScan.drawing_appearance_bindings;
 app=await launch();try{
  const page=await ready(app);const priorList=await page.evaluate(async()=>await(await fetch('/api/files?productId=5&presence=present')).json());await go(page,'PDF 文件中心');await page.getByRole('button',{name:'扫描资料库',exact:true}).click();await page.getByText('资料库扫描完成',{exact:true}).waitFor({timeout:45000});
  const counts=await page.evaluate(async()=>await(await fetch('/api/files/navigation?presence=present')).json());
  const list=await page.evaluate(async()=>await(await fetch('/api/files?productId=5&presence=present')).json());
  const directoryItems=list.items.filter(item=>[path.basename(directoryPdf),path.basename(unmatchedPdf)].includes(item.fileName));
  assert.equal(counts.products.find(item=>item.productId===5)?.count,priorList.total+2);assert.equal(list.total,priorList.total+2);assert.equal(directoryItems.length,2);assert.deepEqual(directoryItems.map(item=>item.matchStatus).sort(),['matched','unmatched']);
  assert.ok(directoryItems.every(item=>item.materialBatchId&&item.conversionType==='outlined'));assert.ok(directoryItems.every(item=>item.materialBatchName.includes('首批大货')));
  const afterDirectoryScan=snapshot(path.join(legacy,'planner.db'));for(const row of beforeDirectoryScan.pdf_files)assert.deepEqual(afterDirectoryScan.pdf_files.find(item=>item.id===row.id),row,'Narrowed scan scope must preserve original out-of-scope index rows');

  const product=page.getByRole('button',{name:'产品 SKU · M1',exact:true});if(!await product.isVisible())await page.getByRole('button',{name:'产品／批次导航',exact:true}).click();await product.click();
  await page.getByRole('checkbox',{name:`选择 ${path.basename(directoryPdf)}`,exact:true}).waitFor();await page.getByRole('checkbox',{name:`选择 ${path.basename(unmatchedPdf)}`,exact:true}).waitFor();
  const unassociated=await page.evaluate(async()=>await(await fetch('/api/drawings?associationState=unassociated')).json());assert.ok(unassociated.items.some(item=>item.fullCode==='02.0209.010.0401002'));
  assert.deepEqual(snapshot(path.join(legacy,'planner.db')).drawing_appearance_bindings,bindingsBeforeScan);
  assert.equal(createHash('sha256').update(fs.readFileSync(directoryPdf)).digest('hex'),directoryHashes[0]);assert.equal(createHash('sha256').update(fs.readFileSync(unmatchedPdf)).digest('hex'),directoryHashes[1]);
  await page.screenshot({path:path.join(evidence,'Windows-PDF-目录归类-无图号确认.png')});report.pdfDirectoryClassification={actualScan:true,productCount:list.total,listCount:list.total,newScopedFiles:2,oldOutOfScopeIndexRowsPreserved:true,matchedAndUnmatchedPreserved:true,unconfirmedDrawingStillUnassociated:true,noBindingWrites:true,originalFileHashesPreserved:true};
  // Regressions: real renderer JSON requests and filtered counts must not change catalog membership.
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1920,1080));
  const catalog=page.getByRole('navigation',{name:'资料导航'});await catalog.waitFor();
  const productBranch=catalog.locator('.pdf-nav-product').filter({has:page.getByRole('button',{name:'产品 SKU · M1',exact:true})});
  const expandProduct=productBranch.locator('.pdf-nav-expand').first();if(await expandProduct.getAttribute('aria-expanded')==='false')await expandProduct.click();
  const fileFilters=catalog.locator('.pdf-nav-filters');if(await fileFilters.getAttribute('open')===null)await fileFilters.locator('summary').click();
  const keyword=page.getByLabel('文件关键词',{exact:true}),range=page.getByLabel('纳入范围',{exact:true}),filterButton=page.getByRole('button',{name:'筛选 PDF',exact:true});
  await keyword.fill('no-file-matches-this-filter');await filterButton.click();await page.getByRole('heading',{name:'没有符合条件的 PDF',exact:true}).waitFor();
  assert.ok(await productBranch.getByRole('button',{name:'批次 首批大货',exact:true}).count(),'A zero count must not move the real batch out of its product');
  await keyword.fill('');await filterButton.click();await page.getByRole('checkbox',{name:`选择 ${path.basename(unmatchedPdf)}`,exact:true}).waitFor();
  const managementActions=[['ignore','排除所选文件'],['restore','恢复所选文件'],['clear','移除文件记录']];
  for(const [action,button]of managementActions){
    await range.selectOption(action==='restore'?'ignored':'included');await filterButton.click();
    await page.getByRole('checkbox',{name:`选择 ${path.basename(unmatchedPdf)}`,exact:true}).check();
    await page.getByRole('button',{name:button,exact:true}).click();const preview=page.getByRole('dialog',{name:'PDF 管理预览',exact:true});await preview.waitFor();
    // Use the actual preview phrase so the check also covers renderer/server contract changes.
    const text=await preview.locator('strong').first().textContent();const confirmation=text.split(' · ')[0];assert.ok(confirmation.length>0);
    await preview.getByLabel('PDF 管理确认短语',{exact:true}).fill(confirmation);
    await page.screenshot({path:path.join(evidence,`Windows-PDF管理-${action}-真实预览.png`)});
    await preview.getByRole('button',{name:'确认处理',exact:true}).click();await preview.waitFor({state:'detached'});
    await page.waitForFunction(async({name,action})=>{const result=await(await fetch('/api/files?managementState=all&presence=all')).json();const file=result.items.find(item=>item.fileName===name);return action==='clear'?!file:file?.managementState===(action==='ignore'?'ignored':'included');},{name:path.basename(unmatchedPdf),action});
    assert.equal(createHash('sha256').update(fs.readFileSync(unmatchedPdf)).digest('hex'),directoryHashes[1]);
  }
  await range.selectOption('included');await filterButton.click();await page.getByRole('button',{name:'扫描资料库',exact:true}).click();
  await page.getByRole('checkbox',{name:`选择 ${path.basename(unmatchedPdf)}`,exact:true}).waitFor({timeout:45000});
  report.pdfManagementButtons={actualRenderer:true,previewApplyIgnoreRestoreClear:true,originalFileHashPreserved:true,clearedIndexRediscovered:true,zeroCountDoesNotReparentBatch:true};
  await go(page,'图号库');await page.getByRole('button',{name:'自动归类',exact:true}).click();
  await page.locator('.drawing-association-result').waitFor({timeout:45000});
  const drawingList=await page.evaluate(async()=>await(await fetch('/api/drawings?productId=5')).json());
  assert.ok(drawingList.items.some(item=>item.fullCode==='02.0209.010.0401002'&&item.productId===5));
  const drawingCounts=await page.evaluate(async()=>await(await fetch('/api/drawings/navigation-counts')).json());
  assert.ok(drawingCounts.products.some(item=>item.productId===5&&item.count>0));
  assert.ok(snapshot(path.join(legacy,'planner.db')).drawing_association_audit.length>0);
  await page.screenshot({path:path.join(evidence,'Windows-图号一键归类-真实保存.png')});
  const drawingCatalog=page.getByRole('navigation',{name:'图号导航'});
  const drawingBranch=drawingCatalog.locator('.pdf-nav-product').filter({has:page.getByRole('button',{name:'产品 M1',exact:true})});
  await drawingBranch.waitFor();
  await page.getByLabel('关键词',{exact:true}).fill('no-drawing-matches-this-filter');await page.getByRole('button',{name:'查询',exact:true}).click();
  await page.getByRole('heading',{name:'没有符合查询条件的图号',exact:true}).waitFor();
  // Scan-only batches do not establish drawing business usage. Check the real product,
  // while renderer tests separately cover batches with explicit BOM/outbound usage.
  await drawingBranch.getByRole('button',{name:'产品 M1',exact:true}).getByLabel('0 个图号',{exact:true}).waitFor();
  await page.screenshot({path:path.join(evidence,'Windows-图号筛选零结果-保留产品目录.png')});
  await page.getByLabel('关键词',{exact:true}).fill('');await page.getByRole('button',{name:'查询',exact:true}).click();
  report.drawingCatalogRefresh={productVisibleAfterClassification:true,zeroCountKeepsProduct:true};
  await page.getByRole('button',{name:'02.0209.010.0401002',exact:true}).click();
  const compactDrawer=page.locator('.drawing-maintenance');await compactDrawer.waitFor();
  assert.equal(await compactDrawer.locator(':scope > .drawing-detail-group').count(),4);
  const fileGeometry=await compactDrawer.locator('.drawing-file-row').evaluateAll(rows=>rows.map(row=>{
    const filename=row.querySelector('.drawing-file-name'),action=row.querySelector('button');
    const name=filename.getBoundingClientRect(),button=action.getBoundingClientRect(),card=row.getBoundingClientRect(),content=row.querySelector('.drawing-file-identity').getBoundingClientRect();
    const style=getComputedStyle(row),nameStyle=getComputedStyle(filename),buttonStyle=getComputedStyle(action);
    const insets=['paddingTop','paddingBottom','borderTopWidth','borderBottomWidth'].reduce((sum,key)=>sum+(parseFloat(style[key])||0),0);
    return {display:style.display,height:card.height,contentHeight:content.height,insets,rowY:card.y+card.height/2,buttonY:button.y+button.height/2,overlap:name.right>button.left,nameWhiteSpace:nameStyle.whiteSpace,buttonWhiteSpace:buttonStyle.whiteSpace};
  }));
  const innerBackgrounds=await compactDrawer.locator('.drawing-detail-group .drawing-detail-section').evaluateAll(items=>items.map(e=>getComputedStyle(e).backgroundColor));assert.ok(innerBackgrounds.every(color=>color==='rgba(0, 0, 0, 0)'));
  await page.screenshot({path:path.join(evidence,'Windows-UI修正-四板块文件行.png')});
  assert.ok(fileGeometry.length>0);for(const row of fileGeometry){assert.equal(row.display,'flex');assert.ok(row.height>=48&&row.height<=Math.max(64,row.contentHeight+row.insets)+1);assert.ok(Math.abs(row.rowY-row.buttonY)<3);assert.equal(row.overlap,false);assert.equal(row.nameWhiteSpace,'nowrap');assert.equal(row.buttonWhiteSpace,'nowrap');}
  await compactDrawer.getByRole('button',{name:'取消占号并删除',exact:true}).click();
  await compactDrawer.getByText(/该图号存在历史扫描占用记录/).waitFor();
  report.compactDrawingDrawer={fourGroups:true,fileGeometry,innerBackgrounds,historicalReleaseQualificationReachable:true,protectedHistoryReleaseBlocked:true};
  report.oneClickDrawingClassification={actualRendererClick:true,realDatabaseSaved:true,productFilteredListContainsDrawing:true,navigationCountsNonzero:true,auditRecorded:true};

 }catch(error){await captureFailure(app,'pdf-directory',error);throw error;}finally{await app.close();}
 const beforeQr=snapshot(path.join(legacy,'planner.db'));const qrName='Windows原生手动售后卡';
 const firstPdf=path.join(temporary,'原生QR首次','M1-warranty (qagp85g).pdf'),replacementPdf=path.join(temporary,'原生QR替换','M1-warranty (qagp85g).pdf');
 const firstHash=writePdf(firstPdf,'Native QR first PDF'),replacementHash=writePdf(replacementPdf,'Native QR replacement PDF');assert.notEqual(firstHash,replacementHash);
 let linkedState,replacedState;
 app=await launch();try{
  const page=await ready(app);assert.equal(await app.evaluate(({app})=>app.getPath('userData')),legacy);assert.equal(await app.evaluate(({app})=>app.getVersion()),version.applicationVersion);assert.deepEqual(snapshot(path.join(legacy,'planner.db')),beforeQr);report.restartPreservesDatabase=true;
  await go(page,'二维码管理');await assertQrListLayout(page,'before-native-association');await page.getByRole('button',{name:'展开 M1 的二维码用途',exact:true}).locator('xpath=ancestor::tr').getByRole('button',{name:'新增用途',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'手动关联二维码PDF'});await modal.waitFor();
  assert.equal(await modal.evaluate(element=>element.contains(document.activeElement)),true);
  const modalCancel=modal.getByRole('button',{name:'取消',exact:true});await modalCancel.focus();await page.keyboard.press('Tab');assert.equal(await modal.evaluate(element=>element.contains(document.activeElement)),true);assert.equal(await modalCancel.evaluate(element=>element===document.activeElement),false);await page.keyboard.press('Shift+Tab');assert.equal(await modalCancel.evaluate(element=>element===document.activeElement),true);
  report.qrModalKeyboardFocus={initialFocus:true,tabLoop:true};
  const purpose=await page.evaluate(async()=>{const result=await(await fetch('/api/qr-purposes')).json();return result.items.find(p=>p.key==='warranty'&&p.englishName==='Warranty');});assert.ok(purpose);
  assert.equal(await modal.getByLabel('手动二维码外观版本',{exact:true}).count(),0);assert.ok(!beforeQr.product_qr_codes.some(row=>row.product_id===5&&row.purpose_id===purpose.id&&row.deleted_at==null&&row.appearance_version_id==null),'Native test must not replace an existing shared Warranty QR');
  await modal.getByLabel('手动二维码用途',{exact:true}).selectOption(String(purpose.id));await modal.getByLabel('手动二维码名称',{exact:true}).fill(qrName);await modal.getByLabel('手动二维码网址',{exact:true}).fill('https://qrs.ly/qagp85g');
  await chooseAndCommitQr(page,firstPdf,'QR首次关联');linkedState=qrState(path.join(legacy,'planner.db'),qrName);assert.equal(linkedState.code.product_id,5);assert.equal(linkedState.code.purpose_id,purpose.id);assert.equal(linkedState.code.appearance_version_id,null);assert.equal(linkedState.code.status,'inactive');assert.equal(linkedState.code.target_url,'https://qrs.ly/qagp85g');assert.equal(linkedState.files.length,1);assert.equal(linkedState.files[0].absolute_path,firstPdf);assert.equal(linkedState.files[0].content_sha256,firstHash);assert.equal(linkedState.links[0].unlinked_at,null);assert.equal(linkedState.audit.length,1);assert.equal(linkedState.audit[0].event,'link');assertPreservedRows(beforeQr,snapshot(path.join(legacy,'planner.db')));
 }finally{await app.close();}
 // A fresh real Electron process must reload the new external file and metadata.
 app=await launch();try{
  const page=await ready(app);assert.deepEqual(qrState(path.join(legacy,'planner.db'),qrName),linkedState);await go(page,'二维码管理');
  await page.getByRole('button',{name:'展开 M1 的二维码用途',exact:true}).click();await page.getByRole('button',{name:`查看 ${qrName}`,exact:true}).click();await page.getByRole('heading',{name:qrName,exact:true}).waitFor();
  await page.getByText(firstPdf,{exact:true}).waitFor();await page.screenshot({path:path.join(evidence,'Windows-原生二维码PDF-关联后重启.png')});
  await page.getByRole('button',{name:'更换文件',exact:true}).click();await chooseAndCommitQr(page,replacementPdf,'QR替换');replacedState=qrState(path.join(legacy,'planner.db'),qrName);assert.deepEqual(replacedState.code,linkedState.code);assert.equal(replacedState.links.length,2);assert.equal(replacedState.files[1].absolute_path,replacementPdf);assert.equal(replacedState.files[1].content_sha256,replacementHash);assert.equal(replacedState.links[1].unlinked_at,null);assert.ok(replacedState.links[0].unlinked_at);assert.deepEqual(replacedState.files[0],linkedState.files[0]);assert.deepEqual(replacedState.audit[0],linkedState.audit[0]);
  await page.waitForFunction(()=>document.querySelector('details.qr-file-section')?.querySelectorAll('p').length===2);
  await page.getByRole('button',{name:'解除关联',exact:true}).click();await page.getByText('已解除当前文件关联，历史记录保留。',{exact:true}).waitFor();
  const unlinked=qrState(path.join(legacy,'planner.db'),qrName);assert.deepEqual(unlinked.code,linkedState.code);assert.equal(unlinked.links.length,2);assert.ok(unlinked.links.every(link=>link.unlinked_at));assert.deepEqual(unlinked.files,replacedState.files);assert.deepEqual(unlinked.audit.slice(0,2),replacedState.audit);assert.equal(unlinked.audit[2].event,'unlink');assertPreservedRows(beforeQr,snapshot(path.join(legacy,'planner.db')));
  assert.equal(createHash('sha256').update(fs.readFileSync(firstPdf)).digest('hex'),firstHash);assert.equal(createHash('sha256').update(fs.readFileSync(replacementPdf)).digest('hex'),replacementHash);
  report.nativeQrPdfPicker={actualNativeDialog:true,rendererSelectionPreviewCommit:true,fullWidthFilename:false,asciiParentheses:true,sevenColumnProductList:true,noIndependentAppearancePicker:true,newRecordProductScoped:true,lowercasePurposeAndParenthesisSpaceValidated:true,firstFileHash:firstHash,replacementFileHash:replacementHash,restartPreservesLinkAndMetadata:true,replacementPreservesMetadataAndHistory:true,unlinkPreservesFilesAndAudit:true,oldV15RowsPreserved:true,qrCodeId:linkedState.code.id};
 }finally{await app.close();}
 app=await launch();try{const page=await ready(app);report.v4=await require('./verify-v4-installed.cjs')({page,app,legacy,evidence,writePdf,snapshot,go});report.v41v42=await require('./verify-v41-v42-installed.cjs')({page,app,legacy,evidence,writePdf,snapshot,go});report.v5=await require('./verify-v5-installed.cjs')({page,app,legacy,evidence,snapshot,go,previous:report.v41v42});report.hotfix111=await require('./verify-1.1.1-installed.cjs')({page,app,legacy,evidence,writePdf,go});report.v51=await require('./verify-v51-mail.cjs')({page,app,source,workspace:path.join(legacy,'workspace'),output:path.join(legacy,'v51-mail-exports'),evidence,writePdf,snapshot,databaseFile:path.join(legacy,'planner.db'),go});report.v52=await require('./verify-v52-installed.cjs')({page,app,source,workspace:path.join(legacy,'workspace'),evidence,writePdf,snapshot,databaseFile:path.join(legacy,'planner.db'),go});report.hotfix131=await require('./verify-1.3.1-mail-import.cjs')({page,app,source,evidence,databaseFile:path.join(legacy,'planner.db'),snapshot,go});report.aitPackaging=await require('./verify-ait-packaging-installed.cjs')({page,app,source,workspace:path.join(legacy,'workspace'),evidence,databaseFile:path.join(legacy,'planner.db'),snapshot,writePdf,go});}catch(error){await captureFailure(app,'v4',error);throw error;}finally{await app.close();}
 const beforeRestart=snapshot(path.join(legacy,'planner.db'));app=await launch();try{const page=await ready(app);assert.deepEqual(snapshot(path.join(legacy,'planner.db')),beforeRestart);assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('table-layout:v1:pdf-files'))),report.v4.tableLayout);report.v4.layoutSurvivesRestart=true;const resumed=await page.evaluate(async id=>{const response=await fetch('/api/packaging/tasks/'+id);if(!response.ok)throw new Error('Task restart retrieval failed');return response.json();},report.aitPackaging.unfinishedTaskId);assert.equal(resumed.state,'active');assert.equal(resumed.productId,report.aitPackaging.productId);assert.ok(resumed.items.length);assert.equal(resumed.items[0].mode,report.aitPackaging.unfinishedTaskMode);assert.deepEqual(resumed.items[0].parameters,report.aitPackaging.unfinishedTaskParameters);report.aitPackaging.realProcessRestartPreservesTask=true;}finally{await app.close();}report.nativeQrPdfPicker.unlinkSurvivesRestart=true;
 // Real same-version reinstalls must ask again; ordinary restarts must not.
 const setup=path.join(evidence,'图号规划器-Windows-x64-安装包.exe');
 const markerFile=path.join(path.dirname(executable),'installation.id');
 const reinstall=()=>{const before=fs.readFileSync(markerFile,'utf8').trim();execFileSync(setup,['/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/DIR='+path.dirname(executable)],{timeout:120000,stdio:'inherit'});const after=fs.readFileSync(markerFile,'utf8').trim();assert.ok(after&&after!==before,'Every installation needs a new marker');return after;};
 const installationChoices=[];let priorFresh;
 for(let attempt=0;attempt<2;attempt++){
  const installId=reinstall(),freshDialog=nativeDialog('fresh',undefined,`reinstall-${attempt}`);app=undefined;let freshData,beforeFreshRestart;
  try{app=await launch();const page=await ready(app,freshDialog);freshData=await app.evaluate(({app})=>app.getPath('userData'));assert.equal(path.dirname(freshData),profileHome);assert.ok(path.basename(freshData)==='data'||path.basename(freshData).startsWith('data-'));if(priorFresh)assert.notEqual(freshData,priorFresh.data);
   assert.equal(JSON.parse(fs.readFileSync(config,'utf8')).installationId,installId);
   const all=snapshot(path.join(freshData,'planner.db'));for(const [name,rows]of Object.entries(all))if(!['schema_migrations','qr_purposes','qr_purpose_product_categories'].includes(name))assert.equal(rows.length,0,name);
   assert.deepEqual(snapshot(path.join(legacy,'planner.db')),beforeRestart);if(priorFresh)assert.deepEqual(snapshot(path.join(priorFresh.data,'planner.db')),priorFresh.snapshot);
   report.freshBusinessTablesEmpty=true;beforeFreshRestart=all;await page.screenshot({path:path.join(evidence,`Windows-重装后创建新数据库-${attempt}.png`)});
  }finally{freshDialog.child.kill();if(app)await app.close();}
  app=await launch();try{await ready(app);assert.equal(await app.evaluate(({app})=>app.getPath('userData')),freshData);assert.deepEqual(snapshot(path.join(freshData,'planner.db')),beforeFreshRestart);}finally{await app.close();}
  priorFresh={data:freshData,snapshot:beforeFreshRestart};installationChoices.push({installId,newDataDirectory:freshData,promptedAfterReinstall:true,createdWithoutFileSelection:true,normalRestartReusesChoice:true,oldDataRetained:true});
 }
 report.installationChoice={actualInstaller:true,sameVersionReinstallChoices:installationChoices};report.freshRestartPreservesDatabase=true;
 fs.writeFileSync(path.join(evidence,'windows-comprehensive-verification.json'),JSON.stringify(report,null,2));
 console.log('Installed production profile, real v15 upgrade, WAL backup, rollback, restart and screenshots passed.');
})().catch(error=>{fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'windows-comprehensive-failure.txt'),error.stack||String(error));console.error(error);process.exitCode=1;});
