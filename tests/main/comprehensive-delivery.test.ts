// @vitest-environment node
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';
import {expect,it} from 'vitest';
import {openDatabase} from '../../src/db/database';import {migrateDatabase} from '../../src/db/migrations';import {createDatabaseBackup} from '../../src/db/backup';
// @ts-expect-error Delivery tools run as native Node ESM on Windows.
import {inventory,verifyManifest} from '../../scripts/comprehensive-delivery-integrity.mjs';
const {prepareProductionProfile}=createRequire(import.meta.url)('../../scripts/production-profile.cjs');
it('requires every runtime file and rejects changed, missing, duplicate or escaping manifest entries',()=>{
 const root=mkdtempSync(join(tmpdir(),'planner-manifest-'));try{mkdirSync(join(root,'resources'));writeFileSync(join(root,'resources','native.node'),'native');const manifest={files:inventory(root)};expect(verifyManifest(root,manifest).verifiedFiles).toBe(1);
 expect(()=>verifyManifest(root,{files:[...manifest.files,...manifest.files]})).toThrow('Invalid manifest');
 expect(()=>verifyManifest(root,{files:[{path:'../escape',sha256:'0'.repeat(64)}]})).toThrow('Invalid manifest');
 writeFileSync(join(root,'unlisted.dll'),'dll');expect(()=>verifyManifest(root,manifest,{allowOriginalReports:true})).toThrow('Unmanifested');rmSync(join(root,'unlisted.dll'));
 writeFileSync(join(root,'resources','native.node'),'tampered');expect(()=>verifyManifest(root,manifest)).toThrow('hash mismatch');
 }finally{rmSync(root,{recursive:true,force:true});}
});
it('real SQLite profile and delivery helper preserve old v15 rows, WAL backups, rollback and upgraded restart',async()=>{
 const root=mkdtempSync(join(tmpdir(),'planner-delivery-sqlite-'));try{
 const legacy=join(root,'old'),bundle=join(root,'native-verifier.mjs');execFileSync(process.execPath,[resolve('scripts/build-comprehensive-verifier.mjs'),resolve('.'),bundle]);const helper=(mode:string)=>execFileSync(process.execPath,[bundle,mode,legacy],{encoding:'utf8',env:{...process.env,NODE_PATH:resolve('node_modules')}});
 expect(helper('prepare')).toContain('"passed":true');expect(helper('rollback-and-wal')).toContain('"passed":true');
 const settings=readFileSync(join(legacy,'settings.json'));const input={appData:join(root,'appdata'),chooseMode:async()=>'existing',chooseDatabase:async()=>join(legacy,'planner.db'),initializeDatabase:()=>{throw Error('must not initialize old DB')}};
 expect(await prepareProductionProfile(input)).toBe(legacy);const db=openDatabase(join(legacy,'planner.db'));try{expect(migrateDatabase(db,{databaseExists:true,createBackup(){createDatabaseBackup(db,db.name,join(legacy,'backups'),'migration');}})).toEqual({from:15,to:20});}finally{db.close();}
 expect(helper('audit-upgrade')).toContain('"passed":true');expect(await prepareProductionProfile({...input,chooseMode:()=>{throw Error('must not prompt on restart')}})).toBe(legacy);expect(readFileSync(join(legacy,'settings.json'))).toEqual(settings);
 }finally{rmSync(root,{recursive:true,force:true});}
},20000);
it('fresh creation never clears an existing default data directory',async()=>{
 const root=mkdtempSync(join(tmpdir(),'planner-fresh-refusal-'));try{const data=join(root,'DrawingNumberPlanner','data');mkdirSync(data,{recursive:true});writeFileSync(join(data,'planner.db'),'existing');let initialized=false;
 await expect(prepareProductionProfile({appData:root,chooseMode:async()=>'fresh',chooseDatabase:async()=>null,initializeDatabase(){initialized=true;}})).rejects.toThrow('不会覆盖');expect(initialized).toBe(false);expect(readFileSync(join(data,'planner.db'),'utf8')).toBe('existing');expect(existsSync(join(root,'DrawingNumberPlanner','profile.json'))).toBe(false);
 }finally{rmSync(root,{recursive:true,force:true});}
});

it('surfaces a native dialog failure while Electron has no first window, instead of hiding it behind the window timeout',async()=>{
 const {waitForNativeDesktopWindow}=createRequire(import.meta.url)('../../scripts/comprehensive-native-handshake.cjs');
 const failure=Error('Native filename edit not found');
 await expect(waitForNativeDesktopWindow({firstWindow:()=>new Promise(()=>{})},{done:Promise.reject(failure)})).rejects.toBe(failure);
});
