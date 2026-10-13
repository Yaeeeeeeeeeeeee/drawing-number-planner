// Acceptance bootstrap only. The original Main/API/recovery implementations are unchanged.
const {app,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const version=JSON.parse(fs.readFileSync(path.join(__dirname,'acceptance-version.json'),'utf8'));
const base=path.join(app.getPath('appData'),'DrawingNumberPlannerAcceptance');
const data=path.join(base,version.revision.slice(0,7));
const marker=path.join(data,'.acceptance-version');
const inside=(root,target)=>{const r=path.relative(root,path.resolve(target));return !r.startsWith('..')&&!path.isAbsolute(r);};
try{
 for(const directory of [base,data])if(fs.existsSync(directory)&&fs.lstatSync(directory).isSymbolicLink())throw Error('验收目录不能是链接，不会访问链接目标。');
 if(fs.existsSync(data)&&(!fs.existsSync(marker)||fs.readFileSync(marker,'utf8')!==version.revision))throw Error('验收目录缺少对应版本标记，不会覆盖现有目录。');
 if(!fs.existsSync(data)){
  fs.mkdirSync(base,{recursive:true});fs.cpSync(path.join(__dirname,'acceptance-seed'),data,{recursive:true});
  const settings=JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8'));
  const workspace=path.resolve(data,version.workspace);
  if(!inside(data,workspace))throw Error('样例资料目录超出验收范围。');
  settings.workspaceRoot=workspace;settings.outboundOutputRoot=path.join(data,'outbound');
  fs.mkdirSync(settings.outboundOutputRoot,{recursive:true});
  fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify(settings));fs.writeFileSync(marker,version.revision);
 }
 const resolved=fs.realpathSync.native(data);
 const settings=JSON.parse(fs.readFileSync(path.join(data,'settings.json'),'utf8'));
 for(const key of ['workspaceRoot','outboundOutputRoot'])if(settings[key]&&(!fs.existsSync(settings[key])||!inside(resolved,fs.realpathSync.native(settings[key]))))throw Error('验收资料或输出目录超出隔离范围或已不存在，请恢复为验收目录后再启动。');
 app.setPath('userData',resolved);
 import('./dist/main/index.js').catch(error=>{
  fs.writeFileSync(path.join(data,'desktop-startup-error.txt'),String(error.stack||error));
  dialog.showErrorBox('桌面验收版未启动',String(error.message));app.quit();
 });
}catch(error){dialog.showErrorBox('桌面验收版未启动',String(error.message));app.quit();}
