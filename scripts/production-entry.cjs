const {app,dialog}=require('electron');const path=require('node:path');
const {prepareProductionProfile}=require('./production-profile.cjs');
app.whenReady().then(async()=>{
 console.info('[production-profile] ready; resolving stable profile');
 const data=await prepareProductionProfile({appData:app.getPath('appData'),
  chooseMode:async()=>{const {response}=await dialog.showMessageBox({type:'question',title:'图号规划器 · 首次启动',message:'选择本次使用的数据',detail:'升级用户请先关闭旧版软件，选择原数据目录的 planner.db。程序会先备份再安全升级，不会自动归并产品或清空记录。新用户可创建空数据库。',buttons:['选择旧版数据库','创建空数据库','取消'],defaultId:0,cancelId:2});return ['existing','fresh','cancel'][response];},
  chooseDatabase:async()=>{const result=await dialog.showOpenDialog({title:'选择旧版数据目录中的 planner.db',defaultPath:app.getPath('appData'),properties:['openFile'],filters:[{name:'图号规划器数据库',extensions:['db']}]});return result.canceled?null:result.filePaths[0];},
  initializeDatabase:database=>require('./initialize-empty-acceptance.cjs').initializeEmptyAcceptanceDatabase(database)
 });
 if(!data){console.info('[production-profile] selection cancelled');app.quit();return;}console.info('[production-profile] selected existing/fresh data; loading application');app.setPath('userData',data);await import('./dist/main/index.js');console.info('[production-profile] application module loaded');
}).catch(error=>{console.error('[production-profile] startup failed',error);dialog.showErrorBox('图号规划器未启动',String(error.message));app.quit();});
