// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {startServer,type RunningServer} from '../../src/server/start-server';
import {FileService} from '../../src/core/files/file-service';
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
