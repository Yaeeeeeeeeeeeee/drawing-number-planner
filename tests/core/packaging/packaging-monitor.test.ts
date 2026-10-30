// @vitest-environment node
import {mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {afterEach,expect,it} from 'vitest';
import {PackagingMonitor} from '../../../src/core/packaging/packaging-monitor';
import type {PackagingTaskService} from '../../../src/core/packaging/packaging-task-service';
import type {PackagingTask} from '../../../src/core/packaging/packaging-types';
import {PackagingWorkspace} from '../../../src/core/packaging/packaging-workspace';
import {FileRepository} from '../../../src/core/files/file-repository';
import {FileService} from '../../../src/core/files/file-service';
import {WorkspaceSettingsStore} from '../../../src/core/files/workspace-settings';
import {setup} from './catalog-fixture';
const fixtures:Array<ReturnType<typeof fixture>>=[];
afterEach(async()=>{for(const f of fixtures.splice(0)){await f.monitor?.close();if(f.db.open)f.db.close();rmSync(f.dir,{recursive:true,force:true});}});
function fixture(){
 const f=setup();f.db.prepare("update products set sku='ONE',model='MODEL',product_category='category' where id=?").run(f.first);f.db.prepare("update products set sku='TWO',model='MODEL',product_category='category' where id=?").run(f.second);
 let root:string|null=join(f.dir,'workspace');mkdirSync(root);for(const name of ['ONE-MODEL','TWO-MODEL'])mkdirSync(join(root,'category',name,'00.临时文件'),{recursive:true});const settings=new WorkspaceSettingsStore(join(f.dir,'settings.json'));settings.setWorkspaceRoot(root);
 const files=new FileService(new FileRepository(f.db),settings),workspace=new PackagingWorkspace(f.db,()=>root),tasks:PackagingTask[]=[],discovered:string[]=[],scans:string[][]=[];
 let discoverImplementation=async(id:string)=>{discovered.push(id);};let scanImplementation=async(paths:string[])=>files.scanProducts(paths);let listCount=0;
 const service={db:f.db,workspace,listTasks(){listCount++;return tasks;},discover(id:string){return discoverImplementation(id);}} as unknown as PackagingTaskService;
 const result={...f,root,settings,workspace,tasks,discovered,scans,service,monitor:undefined as PackagingMonitor|undefined,
  setRoot(value:string|null){root=value;if(value)settings.setWorkspaceRoot(value);},
  setDiscover(fn:(id:string)=>Promise<void>){discoverImplementation=fn;},setScan(fn:typeof scanImplementation){scanImplementation=fn;},listCount:()=>listCount,
  files:{latestScan:()=>files.latestScan(),scanProducts:async(paths:string[])=>{scans.push(paths);return scanImplementation(paths);}},
 };return result;
}
function registered(){const f=fixture();fixtures.push(f);return f;}
function pdf(root:string,path:string){const absolute=join(root,...path.split('/'));mkdirSync(join(absolute,'..'),{recursive:true});writeFileSync(absolute,'%PDF-1.7\ncontent\n%%EOF\n');return absolute;}
function task(productId:number,id:string,directory:string,state:PackagingTask['state']='active'):PackagingTask{return{id,productId,model:'MODEL',name:id,type:'new',state,productDirectory:directory,taskDirectory:`${directory}/00.临时文件/当前任务_${id}`,createdAt:'now',items:[],pendingFiles:[]};}
function monitor(f:ReturnType<typeof fixture>,options={intervalMs:10000,debounceMs:15}){return f.monitor=new PackagingMonitor(f.service,f.files,options);}
it('supplements startup using only known product scopes and discovers only active tasks',async()=>{
 const f=registered();pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/a.pdf');pdf(f.root,'category/TWO-MODEL/02.未转曲源文件/b.pdf');pdf(f.root,'category/UNKNOWN/02.未转曲源文件/unknown.pdf');
 f.tasks.push(task(f.first,'active','category/ONE-MODEL'),task(f.second,'waiting','category/TWO-MODEL','awaiting_index'));
 monitor(f).start();await expect.poll(()=>f.db.prepare('select count(*) as count from pdf_files').get(),{timeout:3000}).toEqual({count:2});
 await expect.poll(()=>f.discovered.includes('active')).toBe(true);expect(f.discovered).not.toContain('waiting');expect(f.scans.every(scope=>scope.length===1)).toBe(true);expect(f.scans.flat()).not.toContain('category/UNKNOWN');
});
it('real watcher events index only the affected formal product and discover00 without indexing it',async()=>{
 const f=registered();pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/baseline.pdf');pdf(f.root,'category/TWO-MODEL/02.未转曲源文件/other.pdf');f.tasks.push(task(f.second,'other-active','category/TWO-MODEL'),task(f.first,'active','category/ONE-MODEL'));
 monitor(f).start();await expect.poll(()=>f.scans.length,{timeout:3000}).toBe(2);await expect.poll(()=>f.discovered.length).toBeGreaterThan(0);await new Promise(resolve=>setTimeout(resolve,80));f.scans.length=0;f.discovered.length=0;
 pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/new.pdf');
 await expect.poll(()=>f.db.prepare("select count(*) as count from pdf_files where file_name='new.pdf'").get(),{timeout:3000}).toEqual({count:1});expect(f.scans.flat()).not.toContain('category/TWO-MODEL');
 await new Promise(resolve=>setTimeout(resolve,60));f.scans.length=0;
 const manual=pdf(f.root,'category/ONE-MODEL/00.临时文件/unknown.pdf');await expect.poll(()=>f.discovered.includes('active'),{timeout:3000}).toBe(true);
 expect(readFileSync(manual,'utf8')).toContain('%%EOF');expect(f.db.prepare("select count(*) as count from pdf_files where file_name='unknown.pdf'").get()).toEqual({count:0});expect(f.scans).toHaveLength(0);
 f.discovered.length=0;writeFileSync(join(f.root,'category','ONE-MODEL','metadata.txt'),'metadata');await new Promise(resolve=>setTimeout(resolve,100));expect(f.discovered).toHaveLength(0);expect(f.scans).toHaveLength(0);
});
it('retains busy scan scopes for periodic retry and preserves manual files on discovery failure',async()=>{
 const f=registered();pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/a.pdf');const manual=pdf(f.root,'category/ONE-MODEL/00.临时文件/retain.pdf');f.tasks.push(task(f.first,'active','category/ONE-MODEL'));
 let busy=true;const real=new FileService(new FileRepository(f.db),f.settings);f.setScan(async(paths)=>{if(busy)throw Object.assign(new Error('busy'),{code:'SCAN_IN_PROGRESS'});return real.scanProducts(paths);});f.setDiscover(async()=>{throw new Error('copy still in progress');});
 monitor(f,{intervalMs:40,debounceMs:5}).start();await expect.poll(()=>f.scans.length).toBeGreaterThan(0);expect(f.db.prepare('select count(*) as count from pdf_files').get()).toEqual({count:0});busy=false;
 await expect.poll(()=>f.db.prepare('select count(*) as count from pdf_files').get(),{timeout:3000}).toEqual({count:1});expect(readFileSync(manual,'utf8')).toContain('%%EOF');
});
it('does not scan an unavailable root and safely recreates watching after settings change',async()=>{
 const f=registered();pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/old.pdf');f.setRoot(null);monitor(f,{intervalMs:40,debounceMs:5}).start();await new Promise(resolve=>setTimeout(resolve,70));expect(f.scans).toHaveLength(0);
 const replacement=join(f.dir,'replacement');mkdirSync(replacement);mkdirSync(join(replacement,'category','ONE-MODEL','00.临时文件'),{recursive:true});pdf(replacement,'category/ONE-MODEL/02.未转曲源文件/new.pdf');f.setRoot(replacement);
 await expect.poll(()=>f.db.prepare("select count(*) as count from pdf_files where file_name='new.pdf'").get(),{timeout:3000}).toEqual({count:1});
 pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/ignored-old-root.pdf');await new Promise(resolve=>setTimeout(resolve,80));expect(f.db.prepare("select count(*) as count from pdf_files where file_name='ignored-old-root.pdf'").get()).toEqual({count:0});
});
it('close drains in-flight discovery and stops every later read before database shutdown',async()=>{
 const f=registered();pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/a.pdf');f.tasks.push(task(f.first,'active','category/ONE-MODEL'));
 let release!:()=>void,entered=false,finished=false;f.setDiscover(async()=>{entered=true;await new Promise<void>(resolve=>{release=resolve;});f.db.prepare('select 1').get();finished=true;});
 const watcher=monitor(f,{intervalMs:20,debounceMs:5});watcher.start();await expect.poll(()=>entered).toBe(true);let closed=false;const close=watcher.close().then(()=>{closed=true;});await new Promise(resolve=>setTimeout(resolve,30));expect(closed).toBe(false);release();await close;expect(finished).toBe(true);
 const reads=f.listCount(),scans=f.scans.length;f.db.close();await new Promise(resolve=>setTimeout(resolve,70));expect(f.listCount()).toBe(reads);expect(f.scans).toHaveLength(scans);
});

it('leaves untouched legacy products unscanned until sibling00 explicitly opts them in',async()=>{
 const f=registered();rmSync(join(f.root,'category','ONE-MODEL','00.临时文件'),{recursive:true});rmSync(join(f.root,'category','TWO-MODEL','00.临时文件'),{recursive:true});pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/legacy.pdf');
 monitor(f,{intervalMs:10000,debounceMs:10}).start();await new Promise(resolve=>setTimeout(resolve,80));expect(f.scans).toHaveLength(0);
 mkdirSync(join(f.root,'category','ONE-MODEL','00.临时文件'));await expect.poll(()=>f.db.prepare("select count(*) as count from pdf_files where file_name='legacy.pdf'").get(),{timeout:3000}).toEqual({count:1});
});
it('discovers files retained without a task once an active task appears during catchup',async()=>{
 const f=registered();const manual=pdf(f.root,'category/ONE-MODEL/00.临时文件/retain.pdf');monitor(f,{intervalMs:40,debounceMs:5}).start();await new Promise(resolve=>setTimeout(resolve,70));expect(f.discovered).toHaveLength(0);expect(readFileSync(manual,'utf8')).toContain('%%EOF');
 f.tasks.push(task(f.first,'late','category/ONE-MODEL'));await expect.poll(()=>f.discovered.includes('late'),{timeout:3000}).toBe(true);
});
it('skips queued formal events already covered by an archive or manual product scan',async()=>{
 const f=registered();pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/baseline.pdf');monitor(f,{intervalMs:10000,debounceMs:100}).start();await expect.poll(()=>f.scans.length,{timeout:3000}).toBe(2);await new Promise(resolve=>setTimeout(resolve,100));f.scans.length=0;
 pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/archive.pdf');await new Promise(resolve=>setTimeout(resolve,25));const real=new FileService(new FileRepository(f.db),f.settings);await real.scanProducts(['category/ONE-MODEL']);const archiveScan=real.latestScan();
 await new Promise(resolve=>setTimeout(resolve,200));expect(f.scans).toHaveLength(0);expect(real.latestScan()?.id).toBe(archiveScan?.id);
});
it('preserves the original busy-event time so a later archive scan satisfies its retry',async()=>{
 const f=registered();rmSync(join(f.root,'category','TWO-MODEL','00.临时文件'),{recursive:true});pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/a.pdf');
 let busy=true;const real=new FileService(new FileRepository(f.db),f.settings);f.setScan(async(paths)=>{if(busy)throw Object.assign(new Error('busy'),{code:'SCAN_IN_PROGRESS'});return real.scanProducts(paths);});
 monitor(f,{intervalMs:100,debounceMs:5}).start();await expect.poll(()=>f.scans.length,{interval:5}).toBe(1);busy=false;await real.scanProducts(['category/ONE-MODEL']);
 await new Promise(resolve=>setTimeout(resolve,110));expect(f.scans).toHaveLength(1);
});
it('an unfinished task opts its existing directory in without authorizing automatic archive',async()=>{
 const f=registered();rmSync(join(f.root,'category','ONE-MODEL','00.临时文件'),{recursive:true});pdf(f.root,'category/ONE-MODEL/02.未转曲源文件/a.pdf');const waiting=task(f.first,'waiting','category/ONE-MODEL','awaiting_index');f.tasks.push(waiting);
 monitor(f).start();await expect.poll(()=>f.db.prepare("select count(*) as count from pdf_files where file_name='a.pdf'").get(),{timeout:3000}).toEqual({count:1});expect(f.discovered).not.toContain('waiting');expect(waiting.state).toBe('awaiting_index');
});
it('starts watching promptly after first settings and task creation without waiting for periodic catchup',async()=>{
 const f=registered(),root=f.root;f.setRoot(null);const watcher=monitor(f,{intervalMs:60000,debounceMs:5});watcher.start();await expect.poll(()=>watcher.status().error).toBeTruthy();expect(watcher.status().watching).toBe(false);
 f.setRoot(root);f.tasks.push(task(f.first,'newly-created','category/ONE-MODEL'));pdf(root,'category/ONE-MODEL/00.临时文件/late.pdf');watcher.refresh();
 await expect.poll(()=>f.discovered.includes('newly-created'),{timeout:3000}).toBe(true);expect(watcher.status().watching).toBe(true);
});
