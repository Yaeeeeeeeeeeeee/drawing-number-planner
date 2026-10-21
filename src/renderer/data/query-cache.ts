interface Cached {value:unknown;expires:number;epoch:number}
export class QueryCache {
 private results=new Map<string,Cached>();
 private pending=new Map<string,{epoch:number;promise:Promise<unknown>}>();
 private epoch=0;
 constructor(private ttl=30_000,private clock:()=>number=Date.now){}
 get<T>(key:string):T|undefined{const entry=this.results.get(key);if(!entry)return;if(entry.expires<=this.clock()){this.results.delete(key);return;}return entry.value as T;}
 fetch<T>(key:string,loader:()=>Promise<T>):Promise<T>{
  const value=this.get<T>(key);if(value!==undefined)return Promise.resolve(value);
  const previous=this.pending.get(key);if(previous)return previous.promise as Promise<T>;
  const epoch=this.epoch;
  // Call loader synchronously; register its promise before any continuation runs.
  let result:Promise<T>;try{result=loader();}catch(error){return Promise.reject(error);}
  const promise=result.then(value=>{if(this.pending.get(key)?.promise===promise&&this.pending.get(key)?.epoch===epoch)this.results.set(key,{value,epoch,expires:this.clock()+this.ttl});return value;}).finally(()=>{if(this.pending.get(key)?.promise===promise)this.pending.delete(key);});
  this.pending.set(key,{epoch,promise});return promise;
 }
 invalidate(prefix=''):void{this.epoch++;for(const key of this.results.keys())if(key.startsWith(prefix))this.results.delete(key);for(const key of this.pending.keys())if(key.startsWith(prefix))this.pending.delete(key);}
}
function sorted(value:unknown):unknown{if(Array.isArray(value))return value.map(sorted);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,sorted(v)]));return value;}
export function queryKey(namespace:string,params:unknown):string{return namespace+':'+JSON.stringify(sorted(params));}
const sizes=[10,25,50,100];
export function readPageSize(module:string,fallback=50):number{try{const value=Number(localStorage.getItem('planner:page-size:'+module));return sizes.includes(value)?value:fallback;}catch{return fallback;}}
export function savePageSize(module:string,value:number):void{if(!sizes.includes(value))return;try{localStorage.setItem('planner:page-size:'+module,String(value));}catch{/* Browsers may deny storage; query operation remains available. */}}
export const plannerQueryCache=new QueryCache();
export function notifyPlannerMutation():void{plannerQueryCache.invalidate();if(typeof window!=='undefined')window.dispatchEvent(new Event('planner:data-changed'));}
