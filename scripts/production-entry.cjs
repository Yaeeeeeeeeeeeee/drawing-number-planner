const {app,dialog}=require('electron');const path=require('node:path');const fs=require('node:fs');
const {prepareProductionProfile}=require('./production-profile.cjs');
app.whenReady().then(async()=>{
 console.info('[production-profile] ready; resolving installation profile');
 let installationId;
 try{installationId=fs.readFileSync(path.join(__dirname,'..','..','installation.id'),'utf8').trim();if(!installationId)throw Error('安装标识为空，请重新安装程序。');}catch(error){if(error.code!=='ENOENT')throw error;}
 const data=await prepareProductionProfile({appData:app.getPath('appData'),installationId,
  chooseMode:async()=>{const {response}=await dialog.showMessageBox({type:'question',title:'图号规划器 · 选择数据库',message:'本次安装使用旧数据库还是新数据库？',detail:'使用旧数据库：选择原数据目录中的 planner.db，保留原设置和历史，程序会先备份再安全升级。创建新数据库：自动建立独立空库，无需选择文件，原有数据库和文件保持保留。完成选择后，日常启动沿用所选数据库。',buttons:['使用旧数据库','创建新数据库','取消'],defaultId:0,cancelId:2});return ['existing','fresh','cancel'][response];},
  chooseDatabase:async()=>{const result=await dialog.showOpenDialog({title:'选择旧版数据目录中的 planner.db',defaultPath:app.getPath('appData'),properties:['openFile'],filters:[{name:'图号规划器数据库',extensions:['db']}]});return result.canceled?null:result.filePaths[0];},
  initializeDatabase:database=>require('./initialize-empty-acceptance.cjs').initializeEmptyAcceptanceDatabase(database)
 });
 if(!data){console.info('[production-profile] selection cancelled');app.quit();return;}console.info('[production-profile] selected existing/fresh data; loading application');app.setPath('userData',data);await import('./dist/main/index.js');console.info('[production-profile] application module loaded');
}).catch(error=>{console.error('[production-profile] startup failed',error);dialog.showErrorBox('图号规划器未启动',String(error.message));app.quit();});
