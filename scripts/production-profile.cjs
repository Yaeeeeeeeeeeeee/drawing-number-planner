const fs=require('node:fs');const path=require('node:path');
/** Resolve an explicitly selected existing database or one stable empty profile. Never copy/reset history. */
async function prepareProductionProfile({appData,chooseMode,chooseDatabase,initializeDatabase}){
 const home=path.join(appData,'DrawingNumberPlanner');const config=path.join(home,'profile.json');
 const rejectLink=p=>{if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error('数据配置不能使用链接，请选择原始数据库目录。');};
 rejectLink(home);rejectLink(config);
 if(fs.existsSync(config)){
  const saved=JSON.parse(fs.readFileSync(config,'utf8'));if(typeof saved.dataDir!=='string'||!path.isAbsolute(saved.dataDir))throw Error('保存的数据目录无效，不会创建替代空库。');
  rejectLink(saved.dataDir);const db=path.join(saved.dataDir,'planner.db');rejectLink(db);if(!fs.existsSync(db))throw Error('已选数据库不存在，请恢复原文件；不会自动创建空库。');return fs.realpathSync.native(saved.dataDir);
 }
 const mode=await chooseMode();if(mode==='cancel')return null;let data;
 if(mode==='existing'){
  const file=await chooseDatabase();if(!file)return null;
  if(path.basename(file).toLowerCase()!=='planner.db')throw Error('请选择旧版数据目录中的 planner.db，保留 settings.json 和 backups 等原文件。');
  rejectLink(file);data=fs.realpathSync.native(path.dirname(file));const header=Buffer.alloc(16);const fd=fs.openSync(file,'r');try{fs.readSync(fd,header,0,16,0);}finally{fs.closeSync(fd);}if(header.toString('ascii')!=='SQLite format 3\0')throw Error('所选文件不是有效的 SQLite 数据库。');
 }else if(mode==='fresh'){
  fs.mkdirSync(home,{recursive:true});data=path.join(home,'data');rejectLink(data);
  if(fs.existsSync(data))throw Error('默认数据目录已存在但未配置；不会覆盖。请选择其中的 planner.db 或恢复备份。');
  fs.mkdirSync(data);try{initializeDatabase(path.join(data,'planner.db'));}catch(error){fs.writeFileSync(path.join(data,'first-start-error.txt'),String(error));throw error;}
 }else throw Error('数据目录选择无效');
 fs.mkdirSync(home,{recursive:true});fs.writeFileSync(config,JSON.stringify({dataDir:data},null,2),{flag:'wx'});return data;
}
module.exports={prepareProductionProfile};
