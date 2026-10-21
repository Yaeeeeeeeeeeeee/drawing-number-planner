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
async function go(page,label){const navigation=page.getByRole('navigation',{name:'主导航'});if(!await navigation.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await navigation.getByRole('button',{name:label,exact:true}).click();await page.getByRole('heading',{name:label,exact:true}).waitFor();}
async function chooseAndCommitQr(page,file,label){const modal=page.getByRole('dialog',{name:'手动关联二维码PDF'});const picker=nativeDialog('qr',file,label);try{await modal.getByRole('button',{name:'选择本地PDF',exact:true}).click();await picker.done;const selected=modal.getByTitle(file,{exact:true});await selected.waitFor();assert.equal(await selected.locator('small').textContent(),file);assert.ok((await selected.textContent()).startsWith(path.basename(file)));await modal.getByRole('button',{name:'校验文件',exact:true}).click();await modal.getByText('型号、用途、网址尾码与PDF内容校验通过。',{exact:true}).waitFor();await page.screenshot({path:path.join(evidence,`Windows-原生二维码PDF-${label}-校验.png`)});await modal.getByRole('button',{name:'确认关联',exact:true}).click();await modal.waitFor({state:'hidden'});await page.getByText('文件已关联，业务状态保持不变。',{exact:true}).waitFor();}catch(error){await captureFailure(activeApp,`QR-${label}`,error);throw error;}finally{picker.child.kill();}}
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
 const version=JSON.parse(fs.readFileSync(path.join(appRoot,'acceptance-version.json'),'utf8'));assert.equal(version.revision,report.revision);assert.equal(version.schemaVersion,17);assert.equal(version.bundledSample,false);assert.equal(fs.existsSync(path.join(appRoot,'acceptance-seed')),false);
 const legacy=path.join(temporary,'旧版原始数据目录');database('prepare',legacy);database('rollback-and-wal',legacy);const settingsBefore=fs.readFileSync(path.join(legacy,'settings.json'));
 const dialog=nativeDialog('existing',path.join(legacy,'planner.db'));let app;
 try{app=await launch();const page=await ready(app,dialog);
  assert.equal(await app.evaluate(({app})=>app.getPath('userData')),legacy);assert.equal(JSON.parse(fs.readFileSync(config,'utf8')).dataDir,legacy);
  assert.deepEqual(fs.readFileSync(path.join(legacy,'settings.json')),settingsBefore);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const native=await app.evaluate(({BrowserWindow,Menu})=>{const w=BrowserWindow.getAllWindows()[0];return{isolated:w.webContents.getLastWebPreferences().contextIsolation,sandbox:w.webContents.getLastWebPreferences().sandbox,nodeIntegration:w.webContents.getLastWebPreferences().nodeIntegration,recovery:Menu.getApplicationMenu().items[0].submenu.items.some(i=>i.label==='安全恢复')};});assert.deepEqual(native,{isolated:true,sandbox:true,nodeIntegration:false,recovery:true});report.native=native;
  for(const [width,height]of [[3840,2160],[2560,1440],[1920,1080],[1366,768],[720,600]]){
   await app.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setContentSize(...size),[width,height]);
   await page.waitForTimeout(200);
   const viewport=await page.evaluate(()=>({width:innerWidth,height:innerHeight,devicePixelRatio,screenWidth:screen.width,screenHeight:screen.height}));
   assert.equal(viewport.width,width);assert.equal(viewport.height,height);report.viewports.push({requested:{width,height},actual:viewport,scope:'Actual Electron renderer viewport; does not validate physical display/DPI/cross-monitor behavior'});
   for(const label of ['产品档案','图号库','PDF 文件中心','二维码管理','BOM 管理','外发资料']){
    const navigation=page.getByRole('navigation',{name:'主导航'});if(!await navigation.isVisible())await page.getByRole('button',{name:'展开导航',exact:true}).click();await navigation.getByRole('button',{name:label,exact:true}).click();
    await page.getByRole('heading',{name:label,exact:true}).waitFor();
    await page.waitForTimeout(150);const shot=`Windows-综合改版-${label.replaceAll(' ','')}-${width}.png`;await page.screenshot({path:path.join(evidence,shot)});const png=fs.readFileSync(path.join(evidence,shot));const actualPng={width:png.readUInt32BE(16),height:png.readUInt32BE(20)};assert.equal(actualPng.width,Math.round(viewport.width*viewport.devicePixelRatio));assert.equal(actualPng.height,Math.round(viewport.height*viewport.devicePixelRatio));report.screenshots.push({file:shot,png:actualPng,viewport});fs.writeFileSync(path.join(evidence,'windows-comprehensive-viewports.json'),JSON.stringify({revision:report.revision,viewports:report.viewports,screenshots:report.screenshots},null,2));
   }
  }
  assert.deepEqual(errors,[]);report.rendererErrors=errors;
 }finally{dialog.child.kill();if(app)await app.close();}
 database('audit-upgrade',legacy);report.oldV15Upgrade={originalDirectoryRetained:true,settingsBytesPreserved:true,oldRowsAndSnapshotsPreserved:true,realMigrationBackupValidated:true,walAndRollback:JSON.parse(fs.readFileSync(path.join(legacy,'native-rollback-and-wal.json'),'utf8'))};
 const beforeQr=snapshot(path.join(legacy,'planner.db'));const qrName='Windows原生手动说明书';
 const firstPdf=path.join(temporary,'原生QR首次','M1-User Manual（qagp85g）.pdf'),replacementPdf=path.join(temporary,'原生QR替换','M1-User Manual（qagp85g）.pdf');
 const firstHash=writePdf(firstPdf,'Native QR first PDF'),replacementHash=writePdf(replacementPdf,'Native QR replacement PDF');assert.notEqual(firstHash,replacementHash);
 let linkedState,replacedState;
 app=await launch();try{
  const page=await ready(app);assert.equal(await app.evaluate(({app})=>app.getPath('userData')),legacy);assert.deepEqual(snapshot(path.join(legacy,'planner.db')),beforeQr);report.restartPreservesDatabase=true;
  await go(page,'二维码管理');await page.getByRole('button',{name:'新增用途',exact:true}).click();
  const modal=page.getByRole('dialog',{name:'手动关联二维码PDF'});await modal.waitFor();
  const purpose=await page.evaluate(async()=>{const result=await(await fetch('/api/qr-purposes')).json();return result.items.find(p=>p.key==='user_manual');});assert.ok(purpose);
  const appearance=await page.evaluate(async()=>{const result=await(await fetch('/api/products/5/appearances')).json();return result.items.find(item=>item.status==='current');});assert.ok(appearance);
  await modal.getByLabel('手动二维码外观版本',{exact:true}).selectOption(String(appearance.id));await modal.getByLabel('手动二维码用途',{exact:true}).selectOption(String(purpose.id));await modal.getByLabel('手动二维码名称',{exact:true}).fill(qrName);await modal.getByLabel('手动二维码网址',{exact:true}).fill('https://qrs.ly/qagp85g');
  await chooseAndCommitQr(page,firstPdf,'QR首次关联');linkedState=qrState(path.join(legacy,'planner.db'),qrName);assert.equal(linkedState.code.status,'inactive');assert.equal(linkedState.code.target_url,'https://qrs.ly/qagp85g');assert.equal(linkedState.files.length,1);assert.equal(linkedState.files[0].absolute_path,firstPdf);assert.equal(linkedState.files[0].content_sha256,firstHash);assert.equal(linkedState.links[0].unlinked_at,null);assert.equal(linkedState.audit.length,1);assert.equal(linkedState.audit[0].event,'link');assertPreservedRows(beforeQr,snapshot(path.join(legacy,'planner.db')));
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
  report.nativeQrPdfPicker={actualNativeDialog:true,rendererSelectionPreviewCommit:true,fullWidthFilename:true,firstFileHash:firstHash,replacementFileHash:replacementHash,restartPreservesLinkAndMetadata:true,replacementPreservesMetadataAndHistory:true,unlinkPreservesFilesAndAudit:true,oldV15RowsPreserved:true,qrCodeId:linkedState.code.id};
 }finally{await app.close();}
 const beforeRestart=snapshot(path.join(legacy,'planner.db'));app=await launch();try{await ready(app);assert.deepEqual(snapshot(path.join(legacy,'planner.db')),beforeRestart);}finally{await app.close();}report.nativeQrPdfPicker.unlinkSurvivesRestart=true;
 // New-user path uses the real native first-start choice; the old selected DB remains intact.
 fs.unlinkSync(config);fs.rmdirSync(profileHome);const freshDialog=nativeDialog('fresh');app=undefined;
 try{app=await launch();await ready(app,freshDialog);const data=await app.evaluate(({app})=>app.getPath('userData'));assert.equal(data,path.join(profileHome,'data'));const all=snapshot(path.join(data,'planner.db'));for(const [name,rows]of Object.entries(all))if(!['schema_migrations','qr_purposes','qr_purpose_product_categories'].includes(name))assert.equal(rows.length,0,name);assert.deepEqual(snapshot(path.join(legacy,'planner.db')),beforeRestart);report.freshBusinessTablesEmpty=true;report.freshDatabaseBeforeRestart=all;}finally{freshDialog.child.kill();if(app)await app.close();}
 app=await launch();try{await ready(app);assert.deepEqual(snapshot(path.join(profileHome,'data','planner.db')),report.freshDatabaseBeforeRestart);}finally{await app.close();}delete report.freshDatabaseBeforeRestart;report.freshRestartPreservesDatabase=true;
 fs.writeFileSync(path.join(evidence,'windows-comprehensive-verification.json'),JSON.stringify(report,null,2));
 console.log('Installed production profile, real v15 upgrade, WAL backup, rollback, restart and screenshots passed.');
})().catch(error=>{fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,'windows-comprehensive-failure.txt'),error.stack||String(error));console.error(error);process.exitCode=1;});
