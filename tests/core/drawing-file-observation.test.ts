// @vitest-environment node
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {observeDrawingFiles} from '../../src/core/files/drawing-file-observation';
vi.mock('node:fs',async importOriginal=>{const actual=await importOriginal<typeof import('node:fs')>();return{...actual,readdirSync:vi.fn(actual.readdirSync)};});
const code='02.0209.010.0401001';
const directory='冰柜/SKU-T40';
const production='03.量产后的变更文件（已量产的产品看最新日期）';
let root:string;
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'v52-drawing-'));});
afterEach(()=>{vi.restoreAllMocks();rmSync(root,{recursive:true,force:true});});
function put(path:string,bytes='pdf'){mkdirSync(join(root,path,'..'),{recursive:true});writeFileSync(join(root,path),bytes);return path;}
const observe=(extra:Record<string,unknown>={})=>observeDrawingFiles({root,fullCode:code,directories:[directory],indexedFiles:[],batches:[],...extra} as never);
it('finds unindexed source and every exact production batch read-only, sorted by business date',()=>{
 put(`${directory}/02.未转曲源文件/${code}.pdf`);
 put(`${directory}/${production}/01.20260101/${code}（转曲）.pdf`);
 put(`${directory}/${production}/02.20260301/${code}（转曲）.pdf`);
 put(`${directory}/03.量产后的变更文件/03.20260401/${code}（转曲）.pdf`);
 put(`${directory}/${production}/04.20260501/${code}.pdf`);
 put(`${directory}/${production}/05.20260601/${code}9（转曲）.pdf`);
 const result=observe();
 expect(result.source).toMatchObject({state:'present',entries:[{state:'present',files:[{pdfIndexId:null,isPresent:true}]}]});
 expect(result.outlined.entries.map(entry=>entry.businessDate)).toEqual(['2026-03-01','2026-01-01']);
 expect(result.outlined.entries.every(entry=>entry.usageState==='indeterminate')).toBe(true);
});
it('preserves historical usage when every found file belongs to old batches',()=>{
 const path=put(`${directory}/${production}/01.20260101/${code}（转曲）.pdf`);
 const result=observe({batches:[{id:1,relativePath:path.split('/').slice(0,4).join('/'),name:'01.20260101',businessDate:'2026-01-01',usageState:'historical'}]});
 expect(result.outlined.entries[0]).toMatchObject({batchId:1,usageState:'historical'});
});
it('shows one conflict row per batch for differing bytes and retains independent instances',()=>{
 put(`${directory}/${production}/01.20260101/a-${code}（转曲）.pdf`,'first');
 put(`${directory}/${production}/01.20260101/b-${code}（转曲）.pdf`,'second');
 put(`${directory}/${production}/02.20260201/${code}（转曲）.pdf`,'first');
 const result=observe();
 expect(result.outlined.entries).toHaveLength(2);
 expect(result.outlined.entries[1]).toMatchObject({state:'conflict',files:expect.any(Array)});
 expect(result.outlined.entries[1].files).toHaveLength(2);
});
it('only reports physical absence after complete known-directory observation',()=>{
 mkdirSync(join(root,directory),{recursive:true});
 expect(observe().source.state).toBe('missing');
 expect(observe({directories:[]}).source.state).toBe('unindexed');
 expect(observe({root:null}).source.state).toBe('unconfigured');
 expect(observe({root:join(root,'offline')}).source.state).toBe('unavailable');
});
it('does not treat a missing product ancestor as proof that its source or outline file is absent',()=>{
 const result=observe();
 expect(result.source.state).toBe('unavailable');
 expect(result.outlined.state).toBe('unavailable');
});
it('does not treat a directory disappearing during enumeration as complete absence',async()=>{
 const fs=await import('node:fs');
 mkdirSync(join(root,directory,'02.未转曲源文件'),{recursive:true});
 const original=(await vi.importActual<typeof import('node:fs')>('node:fs')).readdirSync;
 vi.spyOn(fs,'readdirSync').mockImplementation(((path:unknown,...args:unknown[])=>{
  if(String(path).endsWith('02.未转曲源文件'))throw Object.assign(new Error('offline'),{code:'ENOENT'});
  return (original as Function)(path,...args);
 }) as typeof fs.readdirSync);
 expect(observe().source.state).toBe('unavailable');
});
it('does not treat linked unobserved directories as physical absence',()=>{
 mkdirSync(join(root,'target'),{recursive:true});mkdirSync(join(root,directory),{recursive:true});
 symlinkSync(join(root,'target'),join(root,directory,'02.未转曲源文件'),'dir');
 expect(observe().source.state).toBe('unavailable');
});
it('keeps directory read failures distinct from missing without losing other found batches',async()=>{
 const fs=await import('node:fs');
 put(`${directory}/${production}/01.20260101/${code}（转曲）.pdf`);
 const original=(await vi.importActual<typeof import('node:fs')>('node:fs')).readdirSync;vi.spyOn(fs,'readdirSync').mockImplementation(((path:unknown,...args:unknown[])=>{if(String(path).endsWith('02.未转曲源文件'))throw Object.assign(new Error('permission'),{code:'EACCES'});return (original as Function)(path,...args);}) as typeof fs.readdirSync);
 mkdirSync(join(root,directory,'02.未转曲源文件'),{recursive:true});
 expect(observe().source.state).toBe('unavailable');expect(observe().outlined.entries).toHaveLength(1);
});
