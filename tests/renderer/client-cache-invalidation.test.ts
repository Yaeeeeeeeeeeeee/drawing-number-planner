import {afterEach,beforeEach,it,expect,vi} from 'vitest';
let api:typeof import('../../src/renderer/data/client').apiClient;
let cache:typeof import('../../src/renderer/data/query-cache').plannerQueryCache;
beforeEach(async()=>{vi.resetModules();({apiClient:api}=await import('../../src/renderer/data/client'));({plannerQueryCache:cache}=await import('../../src/renderer/data/query-cache'));});
afterEach(()=>vi.unstubAllGlobals());
const response=(body:unknown)=>new Response(JSON.stringify(body),{headers:{'content-type':'application/json'}});
it('does not invalidate business caches for read-only preview, preflight and mail rendering',async()=>{
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>response(path==='/api/session'?{token:'token'}:{})));
 await cache.fetch('drawing:existing',async()=> 'kept');
 await api.previewPlan({productId:1,appearanceVersionId:1,rows:[]});
 await api.preflightOutboundPackage!({productId:1,appearanceVersionId:1,selectedMaterialBatchId:1,materialType:'initial',packageMode:'current_complete',previewToken:'preview',selectedPdfFileIds:[1]});
 await api.renderOutboundTemplate(1,{});
 expect(cache.get('drawing:existing')).toBe('kept');
 await api.createDictionary('brand',{code:'02',name:'品牌'});expect(cache.get('drawing:existing')).toBeUndefined();
});
it('invalidates queries loaded while a scan was in flight when the actual task completes',async()=>{
 let finish!:(response:Response)=>void;let polled!:(value?:unknown)=>void;const ready=new Promise(resolve=>polled=resolve);
 vi.stubGlobal('fetch',vi.fn(async(path:string)=>{if(path==='/api/session')return response({token:'token'});if(path==='/api/tasks/workspace_scan')return response({id:'scan',status:'queued'});polled();return new Promise<Response>(resolve=>finish=resolve);}));
 const scanning=api.scanPdfFiles();await ready;await cache.fetch('drawing:during-scan',async()=> 'previous result');finish(response({id:'scan',status:'completed',result:{total:1}}));await scanning;expect(cache.get('drawing:during-scan')).toBeUndefined();
});
