import {renderHook,waitFor,act} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useScanProgress} from '../../src/renderer/pages/useScanProgress';
it('recovers the latest active scan and stops polling at completion',async()=>{
 const running={id:'1',kind:'product_scan',status:'running',cancelRequested:false,createdAt:'2026-01-01',progress:{processed:2,total:null,phase:'traversing',message:'a'}} as const;
 const completed={...running,status:'completed' as const};
 const list=vi.fn().mockResolvedValueOnce([running]).mockResolvedValue([completed]);
 const {result,unmount}=renderHook(()=>useScanProgress(list,true,0));
 await waitFor(()=>expect(result.current.task?.status).toBe('running'));
 await waitFor(()=>expect(result.current.task?.status).toBe('completed'),{timeout:2000});
 const calls=list.mock.calls.length;await act(()=>new Promise(resolve=>setTimeout(resolve,700)));
 expect(list).toHaveBeenCalledTimes(calls);unmount();
});
it('exposes a retry after scan status retrieval fails',async()=>{
 const list=vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
 const {result}=renderHook(()=>useScanProgress(list,true,false));
 await waitFor(()=>expect(result.current.error).toBe('offline'));
 act(()=>result.current.refresh());
 await waitFor(()=>expect(result.current.error).toBe(''));
 expect(list).toHaveBeenCalledTimes(2);
});
