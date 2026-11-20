import { useEffect, useRef } from 'react';
import type { FileScanRunView, PdfScanSummaryView } from './client';

interface Cached {value:unknown;expires:number;epoch:number}
export class QueryCache {
 private results=new Map<string,Cached>();
 private pending=new Map<string,{epoch:number;promise:Promise<unknown>}>();
 private epoch=0;
 constructor(private ttl=30_000,private clock:()=>number=Date.now,private maxEntries=160){}
 get<T>(key:string):T|undefined{const entry=this.results.get(key);if(!entry)return;if(entry.expires<=this.clock()){this.results.delete(key);return;}this.results.delete(key);this.results.set(key,entry);return entry.value as T;}
 fetch<T>(key:string,loader:()=>Promise<T>):Promise<T>{
  const value=this.get<T>(key);if(value!==undefined)return Promise.resolve(value);
  const previous=this.pending.get(key);if(previous)return previous.promise as Promise<T>;
  const epoch=this.epoch;
  // Call loader synchronously; register its promise before any continuation runs.
  let result:Promise<T>;try{result=loader();}catch(error){return Promise.reject(error);}
  const promise=result.then(value=>{if(this.pending.get(key)?.promise===promise&&this.pending.get(key)?.epoch===epoch){const now=this.clock();for(const [cachedKey,entry] of this.results)if(entry.expires<=now)this.results.delete(cachedKey);this.results.delete(key);this.results.set(key,{value,epoch,expires:now+this.ttl});while(this.results.size>Math.max(1,this.maxEntries))this.results.delete(this.results.keys().next().value!);}return value;}).finally(()=>{if(this.pending.get(key)?.promise===promise)this.pending.delete(key);});
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

type ScanReader = { getLatestFileScan?(): Promise<FileScanRunView | null> };
type ScanListener = (scan: FileScanRunView) => void;
interface ScanObservation {
  latest?: FileScanRunView;
  listeners: Set<ScanListener>;
  timer?: ReturnType<typeof setInterval>;
  reading: boolean;
}
const scanObservations = new WeakMap<ScanReader, ScanObservation>();

function scanObservation(api: ScanReader): ScanObservation {
  let observation = scanObservations.get(api);
  if (!observation) {
    observation = { listeners: new Set(), reading: false };
    scanObservations.set(api, observation);
  }
  return observation;
}

export function publishSuccessfulFileScan(api: ScanReader, scan: FileScanRunView): void {
  const observation = scanObservation(api);
  if (!Number.isSafeInteger(scan.id) || scan.id <= (observation.latest?.id ?? 0)) return;
  observation.latest = scan;
  plannerQueryCache.invalidate('pdf:');
  plannerQueryCache.invalidate('drawing:');
  for (const listener of observation.listeners) listener(scan);
}

export function scanRunFromSummary(summary: PdfScanSummaryView): FileScanRunView {
  return { ...summary.comparison, id: summary.scanId, currentTotal: summary.currentTotal, completedAt: summary.scannedAt };
}

export function observeSuccessfulFileScans(api: ScanReader, listener: ScanListener): () => void {
  const observation = scanObservation(api);
  observation.listeners.add(listener);
  if (observation.latest) listener(observation.latest);
  if (!observation.timer && api.getLatestFileScan) {
    const read = async () => {
      if (observation.reading) return;
      observation.reading = true;
      try {
        const scan = await api.getLatestFileScan!();
        if (scan) publishSuccessfulFileScan(api, scan);
      } catch {
        // Keep the last successful scan and retry while a consumer is visible.
      } finally {
        observation.reading = false;
      }
    };
    void read();
    observation.timer = setInterval(() => void read(), 1500);
  }
  return () => {
    observation.listeners.delete(listener);
    if (!observation.listeners.size) {
      clearInterval(observation.timer);
      observation.timer = undefined;
    }
  };
}

export function useSuccessfulFileScan(api: ScanReader, active: boolean, onScan: ScanListener): void {
  const callback = useRef(onScan);
  useEffect(() => { callback.current = onScan; }, [onScan]);
  const applied = useRef<{ api: ScanReader; id: number } | undefined>(undefined);
  useEffect(() => {
    if (!active) return;
    return observeSuccessfulFileScans(api, scan => {
      if (applied.current?.api === api && applied.current.id >= scan.id) return;
      applied.current = { api, id: scan.id };
      callback.current(scan);
    });
  }, [api, active]);
}
