// Disposable size/load probe only. Never accepts an existing database/data directory.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const [appArg,reportArg,sizeArg='960']=process.argv.slice(2);
if(!appArg||!reportArg)throw Error('Usage: Electron-as-Node verify-large-startup.cjs APP_ROOT REPORT_JSON [MIB]');
const appRoot=path.resolve(appArg),reportFile=path.resolve(reportArg),sizeMiB=Number(sizeArg);
if(!Number.isInteger(sizeMiB)||sizeMiB<1||sizeMiB>1024)throw Error('Fixture size must be 1..1024 MiB');
// Use the installed application's actual SQLite ABI, including older Electron Node builds.
const Database=require('node:module').createRequire(path.join(appRoot,'package.json'))('better-sqlite3');
const {initializeEmptyAcceptanceDatabase,ProductionStartupService}=require(path.join(appRoot,'initialize-empty-acceptance.cjs'));
const dataDir=fs.mkdtempSync(path.join(os.tmpdir(),'planner-large-startup-fixture-'));
const databasePath=path.join(dataDir,'planner.db'),diagnosticsPath=path.join(dataDir,'logs','service-startup.jsonl');
let controller;
(async()=>{
 try{
  initializeEmptyAcceptanceDatabase(databasePath);
  const fixture=new Database(databasePath);
  try{
   fixture.exec('PRAGMA journal_mode=DELETE; CREATE TABLE startup_size_fixture(id INTEGER PRIMARY KEY,payload BLOB NOT NULL); BEGIN');
   const insert=fixture.prepare('INSERT INTO startup_size_fixture(payload) VALUES (zeroblob(1048576))');
   for(let i=0;i<sizeMiB;i++)insert.run();
   fixture.exec('COMMIT');
  }finally{fixture.close();}
  controller=new ProductionStartupService({entryPath:path.join(appRoot,'dist/service/entry.js'),diagnosticsPath,
   config:{dataDir,requireExistingDatabase:true,port:0}});
  const start=Date.now(),connection=await controller.start(),startupMs=Date.now()-start;
  assert.equal((await(await fetch(connection.url+'/api/health')).json()).status,'ok');
  const restart=Date.now(),restarted=await controller.restart(),restartMs=Date.now()-restart;
  assert.equal((await(await fetch(restarted.url+'/api/health')).json()).status,'ok');
  await controller.stop();
  const inspected=new Database(databasePath,{readonly:true,fileMustExist:true});
  try{
   assert.equal(inspected.prepare('SELECT count(*) AS n FROM startup_size_fixture').get().n,sizeMiB);
   assert.deepEqual(inspected.pragma('foreign_key_check'),[]);
  }finally{inspected.close();}
  const records=fs.readFileSync(diagnosticsPath,'utf8').trim().split('\n').map(line=>JSON.parse(line));
  assert.ok(records.every(row=>row.databasePath===databasePath));
  assert.equal(records.filter(row=>row.event==='ready').length,2);
  assert.equal(records.some(row=>row.event==='timeout'),false);
  const report={fixtureOnly:true,sizeMiB,databaseBytes:fs.statSync(databasePath).size,startupMs,restartMs,
   exceedsOldFifteenSecondLimit:startupMs>15_000||restartMs>15_000,sameDatabaseOnRestart:true,
   logicalRowsPreserved:true,foreignKeysValid:true,records};
  fs.writeFileSync(reportFile,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({...report,records:records.length}));
 }finally{
  await controller?.stop();
  // Only this function's newly-created fixture is removed; no user path is accepted.
  fs.rmSync(dataDir,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
