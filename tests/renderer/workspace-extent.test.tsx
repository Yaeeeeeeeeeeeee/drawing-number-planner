import {act,render} from '@testing-library/react';
import {useRef} from 'react';
import {afterEach,expect,it,vi} from 'vitest';
import {useWorkspaceExtent} from '../../src/renderer/components/useWorkspaceExtent';
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('ignores virtual tbody changes and coalesces toolbar and window layout measurements per frame',async()=>{
 const callbacks:ResizeObserverCallback[]=[];const frames=new Map<number,FrameRequestCallback>();let id=0;
 vi.stubGlobal('requestAnimationFrame',(fn:FrameRequestCallback)=>{frames.set(++id,fn);return id;});
 vi.stubGlobal('cancelAnimationFrame',(key:number)=>frames.delete(key));
 vi.stubGlobal('ResizeObserver',class{constructor(fn:ResizeObserverCallback){callbacks.push(fn);}observe(){}disconnect(){}});
 const geometry=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect');
 function Example(){const root=useRef<HTMLDivElement>(null);useWorkspaceExtent(root);return <main className="workspace"><section className="page-surface"><div className="filter-bar">筛选</div><div ref={root} className="table-wrap"><table><tbody/></table></div></section></main>;}
 const view=render(<Example/>);const flush=()=>act(()=>{const pending=[...frames.values()];frames.clear();pending.forEach(fn=>fn(0));});flush();geometry.mockClear();
 await act(async()=>{view.container.querySelector('tbody')!.append(document.createElement('tr'));await Promise.resolve();});flush();
 expect(geometry).not.toHaveBeenCalled();
 act(()=>{callbacks.forEach(fn=>fn([],{} as ResizeObserver));window.dispatchEvent(new Event('resize'));window.dispatchEvent(new Event('resize'));});
 expect(geometry).not.toHaveBeenCalled();flush();expect(geometry).toHaveBeenCalledTimes(1);
});
