import {renderHook,waitFor,act} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {useOwnedScanProgress,useScanProgress} from '../../src/renderer/pages/useScanProgress';
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

it('clears an outdated owner on a read error and finds the new owner on automatic retry', async () => {
 const owner = { id: 'old-owner', source: 'watcher', status: 'running' };
 const active = { ...owner, id: 'actual-owner', source: 'archive' };
 const read = vi.fn().mockResolvedValueOnce({ active: owner, recent: null })
  .mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ active, recent: null });
 const {result} = renderHook(() => useOwnedScanProgress(read, true));
 await waitFor(() => expect(result.current.status?.active?.id).toBe('old-owner'));
 await waitFor(() => expect(result.current.error).toBe('offline'));
 expect(result.current.status).toBeNull();
 await waitFor(() => expect(result.current.status?.active?.id).toBe('actual-owner'), {timeout: 2500});
 expect(result.current.error).toBe('');
});

it('rejects a late response from a superseded status request', async () => {
 let resolveOld!: (snapshot: {active: null; recent: null}) => void;
 const read = vi.fn().mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }))
  .mockResolvedValue({active: {id: 'latest'}, recent: null});
 const {result} = renderHook(() => useOwnedScanProgress(read, true));
 act(() => result.current.refresh());
 await waitFor(() => expect(result.current.status?.active?.id).toBe('latest'));
 await act(async () => resolveOld({active: null, recent: null}));
 expect(result.current.status?.active?.id).toBe('latest');
});
