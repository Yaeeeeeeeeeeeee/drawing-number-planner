import { expect,it,vi } from 'vitest';
import { QueryCache,queryKey,readPageSize,savePageSize } from '../../src/renderer/data/query-cache';
it('deduplicates identical inflight queries and stable keys regardless object property order',async()=>{
 const cache=new QueryCache();let finish!:(v:string)=>void;const load=vi.fn(()=>new Promise<string>(r=>finish=r));
 const a=cache.fetch(queryKey('pdf:list',{page:1,scope:'all'}),load),b=cache.fetch(queryKey('pdf:list',{scope:'all',page:1}),load);
 expect(load).toHaveBeenCalledTimes(1);finish('correct');expect(await a).toBe('correct');expect(await b).toBe('correct');expect(cache.get(queryKey('pdf:list',{page:1,scope:'all'}))).toBe('correct');
});
it('does not repopulate invalidated cache when an old request completes',async()=>{
 const cache=new QueryCache();let finish!:(v:string)=>void;const old=cache.fetch('drawing:list:1',()=>new Promise<string>(r=>finish=r));
 cache.invalidate('drawing:');expect(await cache.fetch('drawing:list:1',async()=> 'new')).toBe('new');finish('stale');expect(await old).toBe('stale');expect(cache.get('drawing:list:1')).toBe('new');
});
it('expires cached results and preserves unrelated namespaces',async()=>{
 let now=0;const cache=new QueryCache(20,()=>now);await cache.fetch('pdf:list:1',async()=>1);await cache.fetch('drawing:list:1',async()=>2);
 cache.invalidate('pdf:');expect(cache.get('pdf:list:1')).toBeUndefined();expect(cache.get('drawing:list:1')).toBe(2);now=21;expect(cache.get('drawing:list:1')).toBeUndefined();
});
it('persists only supported page sizes independently per module',()=>{
 localStorage.clear();expect(readPageSize('pdf')).toBe(50);savePageSize('pdf',25);savePageSize('drawings',100);expect(readPageSize('pdf')).toBe(25);expect(readPageSize('drawings')).toBe(100);savePageSize('pdf',20);expect(readPageSize('pdf')).toBe(25);
});
it('bounds retained query results and evicts the least recently used scope',async()=>{
 const cache=new QueryCache(30000,()=>0,2);
 await cache.fetch('pdf:one',async()=>1);await cache.fetch('pdf:two',async()=>2);
 expect(cache.get('pdf:one')).toBe(1);
 await cache.fetch('pdf:three',async()=>3);
 expect(cache.get('pdf:two')).toBeUndefined();expect(cache.get('pdf:one')).toBe(1);expect(cache.get('pdf:three')).toBe(3);
});

it('observes committed scans once across subscribers and ignores a late older response', async () => {
  const { observeSuccessfulFileScans, publishSuccessfulFileScan, plannerQueryCache } = await import('../../src/renderer/data/query-cache');
  const makeScan = (id: number) => ({ id, completedAt: '2026-11-20', currentTotal: 1, added: 1, missing: 0, moved: 0, changed: 0, unchanged: 0 });
  let finish!: (scan: ReturnType<typeof makeScan>) => void;
  const api = { getLatestFileScan: vi.fn().mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue(makeScan(8)) };
  const files = vi.fn();
  const drawings = vi.fn();
  const unsubscribeFiles = observeSuccessfulFileScans(api, files);
  const unsubscribeDrawings = observeSuccessfulFileScans(api, drawings);
  try {
    const load = vi.fn().mockResolvedValue('data');
    await plannerQueryCache.fetch('pdf:list:scan-test', load);
    expect(api.getLatestFileScan).toHaveBeenCalledTimes(1);
    publishSuccessfulFileScan(api, makeScan(8));
    finish(makeScan(7));
    await Promise.resolve();
    publishSuccessfulFileScan(api, makeScan(8));
    expect(files.mock.calls).toEqual([[makeScan(8)]]);
    expect(drawings.mock.calls).toEqual([[makeScan(8)]]);
    await plannerQueryCache.fetch('pdf:list:scan-test', load);
    expect(load).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(api.getLatestFileScan).toHaveBeenCalledTimes(2), { timeout: 2500 });
    expect(drawings).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribeFiles();
    unsubscribeDrawings();
    plannerQueryCache.invalidate();
  }
});
