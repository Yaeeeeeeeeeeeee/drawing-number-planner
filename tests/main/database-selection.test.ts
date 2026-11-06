// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import * as safety from '../../src/main/database-validation';
import {initializeEmptyAcceptanceDatabase} from '../../scripts/initialize-empty-acceptance';
const {prepareProductionProfile}=createRequire(import.meta.url)('../../scripts/production-profile.cjs');
const roots:string[]=[];
afterEach(()=>{vi.restoreAllMocks();for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true});});
function fixture(){const root=mkdtempSync(join(tmpdir(),'reselect-'));roots.push(root);const old=join(root,'old'),target=join(root,'target');for(const dir of [old,target]){mkdirSync(dir);initializeEmptyAcceptanceDatabase(join(dir,'planner.db'));}return{root,old,target,input:{appData:root,databaseSafety:safety,initializeDatabase:initializeEmptyAcceptanceDatabase,chooseMode:async()=>'existing',chooseDatabase:async()=>join(old,'planner.db')}};}
it.each(['future','unrecognized','incomplete-ledger','incompatible','foreign-key','corrupt'])('rejects %s without modifying target or saved profile',async kind=>{const {root,target,input}=fixture();await prepareProductionProfile(input);const config=join(root,'DrawingNumberPlanner/profile.json'),previous=readFileSync(config),file=join(target,'planner.db');const db=new Database(file);if(kind==='future')db.prepare('INSERT INTO schema_migrations VALUES(26,?)').run(new Date().toISOString());if(kind==='unrecognized')db.exec('DROP TABLE schema_migrations');if(kind==='incomplete-ledger')db.exec('DELETE FROM schema_migrations WHERE version=4');if(kind==='incompatible')db.exec('DROP TABLE products');if(kind==='foreign-key')db.exec("PRAGMA foreign_keys=OFF;INSERT INTO products(id,brand_id,model,product_size_id,product_category,created_at)VALUES(100,999,'broken',999,'broken','2026-01-01')");db.close();if(kind==='corrupt')writeFileSync(file,'not sqlite');const bytes=readFileSync(file);await expect(prepareProductionProfile({...input,forceSelection:true,chooseDatabase:async()=>target})).rejects.toThrow();expect(readFileSync(config)).toEqual(previous);expect(readFileSync(file)).toEqual(bytes);});
it('cancels explicit reselection with no backup or profile changes',async()=>{const {root,old,input}=fixture();await prepareProductionProfile(input);const config=join(root,'DrawingNumberPlanner/profile.json'),previous=readFileSync(config),files=readdirSync(old);expect(await prepareProductionProfile({...input,forceSelection:true,chooseDatabase:async()=>null})).toBeNull();expect(readFileSync(config)).toEqual(previous);expect(readdirSync(old)).toEqual(files);});
it('verifies a current independent backup and starts target before saving the new profile',async()=>{const {root,old,target,input}=fixture();await prepareProductionProfile(input);const config=join(root,'DrawingNumberPlanner/profile.json');const previous=readFileSync(config);let started=false;await prepareProductionProfile({...input,forceSelection:true,chooseDatabase:async()=>target,beforeSwitch:async()=>{},verifyStartup:async(dir:string)=>{expect(dir).toBe(target);expect(readFileSync(config)).toEqual(previous);const backups=readdirSync(join(old,'backups'));expect(backups.some(file=>file.startsWith('restore-'))).toBe(true);for(const file of backups){const db=new Database(join(old,'backups',file),{readonly:true});expect(db.pragma('integrity_check',{simple:true})).toBe('ok');db.close();}started=true;}});expect(started).toBe(true);expect(JSON.parse(readFileSync(config,'utf8')).dataDir).toBe(target);});
it.each(['startup','migration','write'])('preserves saved profile on %s failure and permits retry',async kind=>{const {root,target,input}=fixture();await prepareProductionProfile(input);const config=join(root,'DrawingNumberPlanner/profile.json'),previous=readFileSync(config);if(kind==='write')vi.spyOn(createRequire(import.meta.url)('node:fs'),'renameSync').mockImplementation(()=>{throw Error('write failed');});await expect(prepareProductionProfile({...input,forceSelection:true,chooseDatabase:async()=>target,databaseSafety:kind==='migration'?{...safety,prepareExistingProductionDatabase(){throw Error('migration failed');}}:safety,verifyStartup:async()=>{if(kind==='startup')throw Error('startup failed');}})).rejects.toThrow();expect(readFileSync(config)).toEqual(previous);vi.restoreAllMocks();expect(await prepareProductionProfile({...input,forceSelection:true,chooseDatabase:async()=>target})).toBe(target);});

it.each(['existing','fresh'])('refuses %s switching if the current database cannot have a verified backup', async mode => {
  const {root, old, target, input} = fixture(); await prepareProductionProfile(input);
  const config = join(root, 'DrawingNumberPlanner/profile.json'), previous = readFileSync(config);
  writeFileSync(join(old, 'planner.db'), 'already corrupt current database');
  const bytes = readFileSync(join(old, 'planner.db'));
  const initializeDatabase = vi.fn(initializeEmptyAcceptanceDatabase);
  await expect(prepareProductionProfile({...input, forceSelection:true, chooseMode:async()=>mode, chooseDatabase:async()=>target, initializeDatabase})).rejects.toThrow();
  expect(readFileSync(config)).toEqual(previous); expect(readFileSync(join(old,'planner.db'))).toEqual(bytes);
  expect(initializeDatabase).not.toHaveBeenCalled();
});
it('refuses switching if the saved current database is missing', async () => {
  const {root, old, target, input} = fixture(); await prepareProductionProfile(input);
  const config = join(root, 'DrawingNumberPlanner/profile.json'), previous = readFileSync(config);
  rmSync(join(old, 'planner.db'));
  await expect(prepareProductionProfile({...input,forceSelection:true,chooseDatabase:async()=>target})).rejects.toThrow();
  expect(readFileSync(config)).toEqual(previous);
});
