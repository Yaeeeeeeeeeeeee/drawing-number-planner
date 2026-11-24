// Real installed Electron on the ephemeral Windows runner; all fixtures live in RUNNER_TEMP.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {createRequire}=require('node:module'),{spawn,execFileSync}=require('node:child_process');
const {DatabaseSync}=require('node:sqlite');
const {createHash}=require('node:crypto');
const {waitForNativeDesktopWindow}=require('./comprehensive-native-handshake.cjs');
const [sourceArg,executableArg,evidenceArg,helperArg]=process.argv.slice(2);
const source=path.resolve(sourceArg),executable=path.resolve(executableArg),evidence=path.resolve(evidenceArg),helper=path.resolve(helperArg);
const {_electron,expect}=createRequire(path.join(source,'package.json'))('@playwright/test');
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
function assertPreservedRows(before,after,scope){
 const appendedQr=new Set(['product_qr_codes','qr_manual_links','qr_manual_files','qr_manual_audit']);
 const protectedAfter=Object.fromEntries(Object.entries(after).map(([table,rows])=>[table,appendedQr.has(table)?require('./verify-packaging-restart.cjs').existingRows(before[table],rows):rows]));
 require('./verify-packaging-restart.cjs')(before,protectedAfter,scope);
}
async function observationScope(page,state){return require('./verify-packaging-restart.cjs').observationScope(state,route=>page.evaluate(async route=>{const response=await fetch(route);if(!response.ok)throw Error('Directory lookup failed');return response.json();},route));}

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
async function chooseAndCommitQr(page,file,label){const modal=page.getByRole('dialog',{name:'手动关联二维码'});const picker=nativeDialog('qr',file,label);try{await assertQrModalLayout(modal,label,'before-native-picker');await modal.getByRole('button',{name:'选择本地PDF',exact:true}).click();await picker.done;const selected=modal.getByTitle(file,{exact:true});await selected.waitFor();assert.equal(await selected.locator('small').textContent(),file);assert.ok((await selected.textContent()).startsWith(path.basename(file)));await modal.getByRole('button',{name:'校验文件',exact:true}).click();await modal.getByText('型号、用途、网址尾码与PDF文件校验通过。',{exact:true}).waitFor();await expect(modal.locator('.qr-pixel-comparison [role=status]')).toHaveText(label==='QR首次关联'?'无当前关联文件，未比较首页像素':'首页像素不同');await assertQrModalLayout(modal,label,'validated-before-screenshot');await page.screenshot({path:path.join(evidence,`Windows-原生二维码PDF-${label}-校验.png`)});await modal.getByRole('button',{name:'确认关联',exact:true}).click();await modal.waitFor({state:'hidden'});await page.getByText('文件已关联，业务状态保持不变。',{exact:true}).waitFor();}catch(error){await captureFailure(activeApp,`QR-${label}`,error);throw error;}finally{picker.child.kill();}}
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
 assert.equal(versionFromDisk().revision, report.revision);
 assert.equal(versionFromDisk().schemaVersion,26);
 assert.equal(fs.existsSync(profileHome), false,'runner profile must be new');
 const legacy=path.join(temporary,'体验版旧库夹具');
 database('prepare',legacy);
 const settingsPath=path.join(legacy,'settings.json');
 const settings=JSON.parse(fs.readFileSync(settingsPath,'utf8'));
 delete settings.workspaceRoot;
 fs.writeFileSync(settingsPath,JSON.stringify(settings));
 const dialog=nativeDialog('existing',path.join(legacy,'planner.db'));
 let app;
 try {
  app=await launch();const p=await ready(app,dialog);
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),legacy);
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'1.6.2');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(1440,900));
  const go=async(name)=>{const n=p.getByRole('navigation',{name:'主导航'});if(!await n.isVisible())await p.getByRole('button',{name:'展开导航'}).click();await n.getByRole('button',{name,exact:true}).click();};
  const shot=async(name)=>{await p.screenshot({path:path.join(evidence,name+'.png')});report.screenshots.push(name);console.log('[windows verified]',name);};
  await go('产品档案');
  await p.getByRole('button',{name:'新建产品',exact:true}).click();
  const drawer=p.getByRole('dialog');
  await expect(drawer.getByRole('button',{name:'保存产品'})).toBeVisible();
  await expect(p.locator('.products-compact table:visible')).toBeVisible();
  await shot('01-new-product');
  await drawer.getByRole('button',{name:'取消'}).click();
  await p.getByRole('button',{name:'编辑 M1',exact:true}).click();
  await expect(drawer.getByLabel('型号',{exact:true})).toHaveValue('M1');
  await expect(drawer.getByRole('button',{name:'保存修改'})).toBeVisible();
  await shot('02-edit-product');
  await drawer.getByRole('button',{name:'取消'}).click();
  const cell=p.locator('.products-compact table:visible td[data-column-key=model]').first();
  assert.equal((await cell.textContent()).trim(),'M1');
  await shot('03-product-list');
  await go('BOM 管理');await expect(p.getByText('请选择产品型号',{exact:true})).toBeVisible();await expect(p.getByText('尚无当前 BOM',{exact:true})).toHaveCount(0);
  await shot('04-bom-initial');
  await p.getByLabel('BOM 产品型号').selectOption('5');await expect(p.getByText('当前 BOM',{exact:true}).first()).toBeVisible();await shot('05-bom-selected');
  await go('PDF 文件中心');
  // The migrated fixture may contain existing PDF indexes. Use a scoped search so the empty-state action is reachable.
  const keyword=p.getByRole('searchbox',{name:'文件关键词'});await keyword.fill('unslop-no-such-pdf');await keyword.press('Enter');
  await p.getByRole('button',{name:'设置资料根目录',exact:true}).click();
  const rootInput=p.getByRole('textbox',{name:'资料根目录',exact:true});await expect(rootInput).toBeFocused();
  const testRoot=path.join(temporary,'体验测试资料');fs.mkdirSync(testRoot);
  await rootInput.fill(testRoot);await p.getByRole('button',{name:'保存根目录'}).click();await expect(keyword).toBeFocused();
  await shot('06-pdf-root-return');
  for(const [label,name] of [['图号规划 / 更新包材','07-planning'],['制图任务','08-tasks'],['外发资料','09-outbound'],['图号库','10-library'],['二维码管理','11-qr'],['包材模板','12-templates'],['编码字典','13-dictionary'],['迁移检查','14-migration']]){
    await go(label);
    if(name==='07-planning')await expect(p.getByText('图号预览：暂无候选图号')).toBeVisible();
    if(name==='09-outbound')await expect(p.getByRole('button',{name:'预览文件',exact:true})).toBeVisible();
    if(name==='12-templates')await p.getByRole('tab',{name:'模板匹配规则'}).click();
    if(name==='13-dictionary')await p.getByRole('button',{name:'更多 品牌',exact:true}).click();
    if(name==='14-migration')await expect(p.getByLabel('选择图号字典 Excel')).toBeAttached();
    await shot(name);
  }
  await p.getByRole('button',{name:'安全恢复',exact:true}).click();await expect(p.getByRole('region',{name:'界面与服务维护'})).toBeVisible();await shot('15-safe-recovery');
  report.version=versionFromDisk();report.profileWasIsolated=true;report.success=true;
  fs.writeFileSync(path.join(evidence,'unslop-installed.json'),JSON.stringify(report,null,2));
 }catch(error){if(app)await captureFailure(app,'unslop',error);throw error;}finally{if(app)await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
function versionFromDisk(){return JSON.parse(fs.readFileSync(path.join(appRoot,'acceptance-version.json'),'utf8'));}
