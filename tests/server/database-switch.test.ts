// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,existsSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {startServer,type RunningServer} from '../../src/server/start-server';
import {FileService} from '../../src/core/files/file-service';
import {createRequire} from 'node:module';
import {initializeEmptyAcceptanceDatabase} from '../../scripts/initialize-empty-acceptance';
import * as databaseSafety from '../../src/main/database-validation';
import {performDatabaseReselection} from '../../src/main/database-reselection';
import {request as httpRequest} from 'node:http';
const roots:string[]=[];const servers:RunningServer[]=[];
afterEach(async()=>{vi.restoreAllMocks();for(const server of servers.splice(0))await server.close();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
async function fixture(){const dataDir=mkdtempSync(join(tmpdir(),'db-switch-'));roots.push(dataDir);const server=await startServer({dataDir,port:0});servers.push(server);return{dataDir,server};}
it('blocks a switch while Illustrator is unsettled, and keeps the old listener usable',async()=>{const{dataDir,server}=await fixture();mkdirSync(join(dataDir,'illustrator-operations'));writeFileSync(join(dataDir,'illustrator-operations/active-operation.json'),'uncertain');await expect(server.prepareDatabaseSwitch()).rejects.toMatchObject({code:'DATABASE_SWITCH_BUSY'});expect((await fetch(server.url+'/api/health')).status).toBe(200);});
it('quiesces without a renderer, rejecting writes and preserving the database until close',async()=>{const{server}=await fixture();await server.prepareDatabaseSwitch();const result=await fetch(server.url+'/api/session',{method:'POST',headers:{origin:server.url,'x-planner-token':server.token}});expect(result.status).toBe(503);});

it('blocks running and finalizing local work, then permits switching after it settles', async () => {
  let finalize!:()=>void, finish!:()=>void;
  const running = new Promise<void>(resolve => {finalize=resolve;}), finalizing = new Promise<void>(resolve => {finish=resolve;});
  vi.spyOn(FileService.prototype,'scan').mockImplementation(async context => {
    await running; context!.beginFinalizing(); await finalizing; throw Error('controlled task end');
  });
  const {server}=await fixture();
  try {
    const result=await fetch(server.url+'/api/tasks/workspace_scan',{method:'POST',headers:{origin:server.url,'x-planner-token':server.token,'content-type':'application/json'},body:'{}'});
    expect(result.status).toBe(202); const task=await result.json() as {id:string};
    await expect(server.prepareDatabaseSwitch()).rejects.toMatchObject({code:'DATABASE_SWITCH_BUSY'});
    finalize(); await vi.waitFor(async()=>expect(await (await fetch(server.url+'/api/tasks/'+task.id)).json()).toMatchObject({status:'finalizing'}));
    await expect(server.prepareDatabaseSwitch()).rejects.toMatchObject({code:'DATABASE_SWITCH_BUSY'});
    finish(); await vi.waitFor(async()=>expect(await (await fetch(server.url+'/api/tasks/'+task.id)).json()).toMatchObject({status:'failed'}));
    await server.prepareDatabaseSwitch();
  } finally {finalize();finish();}
});

it('requires an existing database atomically for production and leaves default development initialization available', async () => {
  const dataDir=mkdtempSync(join(tmpdir(),'planner-required-db-')); roots.push(dataDir);
  await expect(startServer({dataDir,port:0,requireExistingDatabase:true})).rejects.toThrow();
  expect(existsSync(join(dataDir,'planner.db'))).toBe(false);
  const server=await startServer({dataDir,port:0});servers.push(server);
  expect(existsSync(join(dataDir,'planner.db'))).toBe(true);
});

it('validates the actual opened production database before initializing or changing its bytes', async () => {
  const dataDir=mkdtempSync(join(tmpdir(),'planner-required-empty-')); roots.push(dataDir);
  const file=join(dataDir,'planner.db');writeFileSync(file,'');
  await expect(startServer({dataDir,port:0,requireExistingDatabase:true})).rejects.toThrow();
  expect(readFileSync(file)).toEqual(Buffer.alloc(0));
});

it('refuses a target removed after validation and restores the old service/profile without creating an empty replacement', async () => {
  const {dataDir:old,server}=await fixture(), root=mkdtempSync(join(tmpdir(),'planner-target-disappeared-')); roots.push(root);
  const target=join(root,'target');mkdirSync(target);initializeEmptyAcceptanceDatabase(join(target,'planner.db'));
  const {prepareProductionProfile}=createRequire(import.meta.url)('../../scripts/production-profile.cjs');
  const input={appData:root,databaseSafety,chooseMode:async()=>'existing',chooseDatabase:async()=>old};
  await prepareProductionProfile(input);
  const config=join(root,'DrawingNumberPlanner/profile.json'), previous=readFileSync(config);
  let restored:RunningServer|undefined;
  await expect(performDatabaseReselection({
    quiesce:()=>server.prepareDatabaseSwitch(),
    prepare:beforeSwitch=>prepareProductionProfile({...input,forceSelection:true,beforeSwitch,chooseDatabase:async()=>target,verifyStartup:async()=>{
      await server.close(); rmSync(join(target,'planner.db'));
      const candidate=await startServer({dataDir:target,port:0,requireExistingDatabase:true}); servers.push(candidate);
    }}),
    restore:async()=>{restored=await startServer({dataDir:old,port:0,requireExistingDatabase:true});servers.push(restored);},
  })).rejects.toThrow();
  expect(readFileSync(config)).toEqual(previous);expect(existsSync(join(target,'planner.db'))).toBe(false);
  expect(restored).toBeDefined();expect((await fetch(restored!.url+'/api/health')).status).toBe(200);
});

it('keeps consumed disconnected requests busy until their handler settles, then permits native switching without restart', async () => {
  let enter!:()=>void,finish!:()=>void,settle!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve;}), gate=new Promise<void>(resolve=>{finish=resolve;}), settled=new Promise<void>(resolve=>{settle=resolve;});
  vi.spyOn(FileService.prototype,'scan').mockImplementation(async()=>{enter();await gate;settle();throw Error('controlled scan end');});
  const {server}=await fixture();
  const request=httpRequest(server.url+'/api/files/scan',{method:'POST',headers:{origin:server.url,'x-planner-token':server.token,'content-type':'application/json','content-length':'2'}});
  request.on('error',()=>{});
  try {
    request.end('{}'); await entered;
    const disconnected=new Promise<void>(resolve=>request.once('close',()=>resolve()));request.destroy();await disconnected;
    // A new completed HTTP round trip lets the server observe the peer close
    // before the held handler is released; client close alone is only local.
    expect((await fetch(server.url+'/api/health')).status).toBe(200);
    await expect(server.prepareDatabaseSwitch()).rejects.toMatchObject({code:'DATABASE_SWITCH_BUSY'});
    finish(); await settled;
    await vi.waitFor(()=>server.prepareDatabaseSwitch());
  } finally {finish();request.destroy();}
});
