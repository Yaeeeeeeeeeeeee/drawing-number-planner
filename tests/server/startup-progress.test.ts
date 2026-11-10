// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startServer,type RunningServer} from '../../src/server/start-server';
import {initializeEmptyAcceptanceDatabase} from '../../scripts/initialize-empty-acceptance';
import Database from 'better-sqlite3';

const roots:string[]=[]; const servers:RunningServer[]=[];
afterEach(async()=>{
  vi.restoreAllMocks();
  for(const server of servers.splice(0)) await server.close();
  for(const root of roots.splice(0)) rmSync(root,{recursive:true,force:true});
});

it('reports protected database initialization and loopback health before becoming ready',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'startup-progress-')); roots.push(dataDir);
  initializeEmptyAcceptanceDatabase(join(dataDir,'planner.db'));
  const phases:string[]=[];
  const server=await startServer({dataDir,requireExistingDatabase:true,port:0,onStartupProgress:phase=>phases.push(phase)});
  servers.push(server);
  expect(phases).toEqual(['database-open','database-validation','database-migration','daily-backup',
    'service-initialization','http-listen','outbound-maintenance','health-check']);
  expect(await (await fetch(server.url+'/api/health')).json()).toEqual({status:'ok'});
});

it('rejects unhealthy startup instead of returning a ready connection and preserves the database',async()=>{
  const dataDir=mkdtempSync(join(tmpdir(),'startup-unhealthy-')); roots.push(dataDir);
  const database=join(dataDir,'planner.db');initializeEmptyAcceptanceDatabase(database);
  const original=new Database(database);
  original.exec("CREATE TABLE startup_sentinel(value TEXT); INSERT INTO startup_sentinel VALUES ('keep-business-data');");original.close();
  const phases:string[]=[];
  // The external transport is the boundary; database initialization/cleanup remain real.
  let attemptedUrl='';
  const healthTransport=vi.spyOn(globalThis,'fetch').mockImplementation(async input=>{
    attemptedUrl=String(input);return new Response('{"status":"failed"}',{status:503});
  });
  await expect(startServer({dataDir,requireExistingDatabase:true,port:0,onStartupProgress:phase=>phases.push(phase)})
    .then(server=>{servers.push(server);return server;}))
    .rejects.toThrow('健康检查');
  expect(phases.at(-1)).toBe('health-check');
  const reopened=new Database(database,{readonly:true,fileMustExist:true});
  try {
    expect(reopened.prepare('SELECT value FROM startup_sentinel').get()).toEqual({value:'keep-business-data'});
    expect(reopened.pragma('foreign_key_check')).toEqual([]);
  } finally {reopened.close();}
  healthTransport.mockRestore();
  const retry=await startServer({dataDir,requireExistingDatabase:true,port:Number(new URL(attemptedUrl).port)});
  servers.push(retry);
  expect(await(await fetch(retry.url+'/api/health')).json()).toEqual({status:'ok'});
});
