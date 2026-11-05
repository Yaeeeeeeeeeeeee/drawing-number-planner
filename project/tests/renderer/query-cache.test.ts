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
