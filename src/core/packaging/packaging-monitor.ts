import {lstatSync,watch,type FSWatcher} from 'node:fs';
import {join} from 'node:path';
import type {FileService} from '../files/file-service.js';
import {isMaterialDirectory} from '../files/material-directory-policy.js';
import {normalizeProductDirectories} from '../files/pdf-scanner.js';
import {toWorkspacePathKey} from '../files/workspace-paths.js';
import type {PackagingTaskService} from './packaging-task-service.js';
import type {PackagingTask} from './packaging-types.js';

export interface PackagingMonitorStatus {
 running:boolean;watching:boolean;root:string|null;pendingScans:number;pendingDiscoveries:number;
 lastCheckedAt?:string;error?:string;
}
interface ProductDirectory {productId:number;relativePath:string}
interface PendingScope {root:string;relativePath:string;queuedAt:number}
const message=(error:unknown)=>error instanceof Error?error.message:'本机资料监听失败';

/** Events request a fresh observation; they never establish absence or authorize archiving. */
export class PackagingMonitor {
 private watcher?:FSWatcher;
 private interval?:ReturnType<typeof setInterval>;
 private debounce?:ReturnType<typeof setTimeout>;
 private inFlight?:Promise<void>;
 private started=false;
 private closed=false;
 private rerun=false;
 private catchup=true;
 private root:string|null=null;
 private lastRoot:string|null=null;
 private known=new Map<string,ProductDirectory>();
 private tasks=new Map<string,PackagingTask>();
 private scans=new Map<string,PendingScope>();
 private discoveries=new Set<string>();
 private lastCheckedAt?:string;
 private error?:string;
 private readonly intervalMs:number;
 private readonly debounceMs:number;
 constructor(private readonly service:PackagingTaskService,private readonly files:Pick<FileService,'scanProducts'>&Partial<Pick<FileService,'latestScan'>>,
  options:{intervalMs?:number;debounceMs?:number}={}){
  this.intervalMs=options.intervalMs??60_000;this.debounceMs=options.debounceMs??200;
  if(!Number.isSafeInteger(this.intervalMs)||this.intervalMs<1||!Number.isSafeInteger(this.debounceMs)||this.debounceMs<0)throw new Error('资料监听时间间隔无效');
 }
 status():PackagingMonitorStatus{return{running:this.started&&!this.closed,watching:Boolean(this.watcher),root:this.root,
  pendingScans:this.scans.size,pendingDiscoveries:this.discoveries.size,lastCheckedAt:this.lastCheckedAt,error:this.error};}
 start():void{
  if(this.started||this.closed)return;this.started=true;
  this.interval=setInterval(()=>{this.catchup=true;this.schedule();},this.intervalMs);this.interval.unref();
  this.schedule();
 }
 /** Settings and task mutations can introduce scopes before a filesystem watcher exists. */
 refresh():void{this.catchup=true;this.schedule();}
 async close():Promise<void>{
  this.closed=true;this.rerun=false;
  if(this.interval)clearInterval(this.interval);this.interval=undefined;
  if(this.debounce)clearTimeout(this.debounce);this.debounce=undefined;
  this.watcher?.close();this.watcher=undefined;
  await this.inFlight;
  this.scans.clear();this.discoveries.clear();
 }
 private schedule():void{
  if(this.closed||!this.started)return;
  if(this.inFlight){this.rerun=true;return;}
  if(this.debounce)clearTimeout(this.debounce);
  this.debounce=setTimeout(()=>{this.debounce=undefined;this.launch();},this.debounceMs);this.debounce.unref();
 }
 private launch():void{
  if(this.closed||this.inFlight)return;this.rerun=false;
  const work=this.drain().catch(error=>{this.error=message(error);});this.inFlight=work;
  void work.finally(()=>{this.inFlight=undefined;if(this.rerun&&!this.closed)this.schedule();});
 }
 private refreshRoot():boolean{
  let root:string;
  try{root=this.service.workspace.root();}
  catch(error){this.watcher?.close();this.watcher=undefined;this.root=null;this.error=message(error);return false;}
  if(root!==this.lastRoot){
   this.watcher?.close();this.watcher=undefined;this.scans.clear();this.discoveries.clear();this.known.clear();this.tasks.clear();
   this.lastRoot=root;this.catchup=true;
  }
  this.root=root;
  if(!this.watcher){
   try{
    const watcher=watch(root,{recursive:true,persistent:false},(_event,fileName)=>{
     if(this.closed||this.root!==root)return;
     this.signal(fileName?.toString());
    });
    watcher.on('error',error=>{if(this.closed||this.watcher!==watcher)return;this.error=message(error);watcher.close();this.watcher=undefined;this.catchup=true;});
    this.watcher=watcher;
   }catch(error){this.error=message(error);}
  }
  return true;
 }
 private refreshKnown():void{
  const products=this.service.db.prepare(`select product.id from products product
   left join product_identity_members identity on identity.raw_product_id=product.id
   where product.deleted_at is null and product.status='active'
    and coalesce(identity.canonical_product_id,product.id)=product.id order by product.id`).all() as Array<{id:number}>;
  const allTasks=this.service.listTasks();
  const claims=new Map<string,{directory:ProductDirectory;owners:Set<number>}>();
  for(const product of products){
   try{
    for(const directory of this.service.workspace.productDirectories(product.id)){
     if(!directory.exists)continue;
     const relativePath=normalizeProductDirectories([directory.relativePath])[0],key=toWorkspacePathKey(relativePath);
     const claim=claims.get(key)??{directory:{productId:product.id,relativePath},owners:new Set<number>()};claim.owners.add(product.id);claims.set(key,claim);
    }
   }catch(error){this.error=message(error);}
  }
  this.known=new Map([...claims].filter(([key,claim])=>{
   if(claim.owners.size!==1)return false;
   // An existing sibling00 or durable unfinished task explicitly opts the product into this workflow.
   if(allTasks.some(task=>task.state!=='completed'&&task.productId===claim.directory.productId&&toWorkspacePathKey(task.productDirectory)===key))return true;
   try{const stats=lstatSync(this.service.workspace.path(`${claim.directory.relativePath}/00.临时文件`));return stats.isDirectory()&&!stats.isSymbolicLink();}
   catch{return false;}
  }).map(([key,claim])=>[key,claim.directory]));
  if([...claims.values()].some(claim=>claim.owners.size>1))this.error='部分产品共用同一资料目录，已暂停该目录的自动扫描';
  this.tasks=new Map(allTasks.filter(task=>task.state==='active').filter(task=>{
   try{return this.known.get(toWorkspacePathKey(task.productDirectory))?.productId===task.productId;}catch{return false;}
  }).map(task=>[task.id,task]));
  for(const id of this.discoveries)if(!this.tasks.has(id))this.discoveries.delete(id);
 }
 private signal(fileName:string|undefined):void{
  if(!fileName){this.catchup=true;this.schedule();return;}
  const segments=fileName.split(/[\\/]/u);
  if(segments.some(segment=>!segment||segment==='.'||segment==='..'))return;
  if(segments.length<3){
   // Category/product directory changes may add a new known scope; ordinary metadata is ignored.
   const relativePath=segments.join('/');let directory=false;
   try{const stat=lstatSync(join(this.root!,...segments));directory=stat.isDirectory()&&!stat.isSymbolicLink();}catch{
    directory=[...this.known.values()].some(known=>known.relativePath===relativePath||known.relativePath.startsWith(`${relativePath}/`));
   }
   if(directory){this.catchup=true;this.schedule();}return;
  }
  let key:string;
  try{key=toWorkspacePathKey(segments.slice(0,2).join('/'));}catch{return;}
  const known=this.known.get(key);
  if(!known){
   if(segments[2]==='00.临时文件'){this.catchup=true;this.schedule();}
   return;
  }
  if(isMaterialDirectory(segments[2]))this.scans.set(key,{root:this.root!,relativePath:known.relativePath,queuedAt:Date.now()});
  else if(segments[2]==='00.临时文件'){
   for(const task of this.tasks.values())if(toWorkspacePathKey(task.productDirectory)===key)this.discoveries.add(task.id);
  }else return;
  this.schedule();
 }
 private async drain():Promise<void>{
  if(this.closed)return;this.error=undefined;
  if(!this.refreshRoot())return;
  const root=this.root!;
  this.refreshKnown();
  if(this.catchup){
   this.catchup=false;
   for(const[key,directory]of this.known)if(!this.scans.has(key))this.scans.set(key,{root,relativePath:directory.relativePath,queuedAt:Date.now()});
   for(const id of this.tasks.keys())this.discoveries.add(id);
  }
  for(const id of [...this.discoveries]){
   if(this.closed)return;
   if(!this.refreshRoot()||this.root!==root)return;
   this.discoveries.delete(id);if(!this.tasks.has(id))continue;
   try{await this.service.discover(id);}catch(error){this.error=message(error);this.discoveries.add(id);}
  }
  for(const[key,scope]of [...this.scans]){
   if(this.closed)return;
   if(!this.refreshRoot()||this.root!==root)return;
   this.scans.delete(key);
   if(scope.root!==root||!this.known.has(key))continue;
   const latest=this.files.latestScan?.();
   if(latest&&Date.parse(latest.completedAt)>=scope.queuedAt&&(latest.scope?.kind==='workspace'
    ||latest.scope?.kind==='products'&&latest.scope.productDirectories.some(directory=>toWorkspacePathKey(directory)===key)))continue;
   try{await this.files.scanProducts([scope.relativePath]);}
   catch(error){this.error=message(error);this.scans.set(key,scope);}
  }
  this.lastCheckedAt=new Date().toISOString();
 }
}
