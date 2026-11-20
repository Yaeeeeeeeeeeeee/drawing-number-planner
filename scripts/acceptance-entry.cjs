// Acceptance bootstrap only. The original Main/API/recovery implementations are unchanged.
const {app,dialog}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const version=JSON.parse(fs.readFileSync(path.join(__dirname,'acceptance-version.json'),'utf8'));
let data;
try{
 const {prepareAcceptanceData}=require('./prepare-acceptance-data.cjs');
 const resolved=prepareAcceptanceData({appData:app.getPath('appData'),appDirectory:__dirname,version});
 data=resolved;
 app.setPath('userData',resolved);
 import('./dist/main/index.js').catch(error=>{
  if(data)fs.writeFileSync(path.join(data,'desktop-startup-error.txt'),String(error.stack||error));
  dialog.showErrorBox('桌面验收版未启动',String(error.message));app.quit();
 });
}catch(error){dialog.showErrorBox('桌面验收版未启动',String(error.message));app.quit();}
