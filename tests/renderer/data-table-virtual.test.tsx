import {fireEvent,render,screen,waitFor} from '@testing-library/react';
import {useState} from 'react';
import {describe,expect,it,vi} from 'vitest';
import {DataTable} from '../../src/renderer/components/DataTable';
const items=Array.from({length:10000},(_,id)=>({id,name:`产品 ${id}`}));
describe('bounded scrolling data table',()=>{
 it('renders a bounded window and retains user expansion when returning to a row',async()=>{
  function Example(){const [expanded,setExpanded]=useState(false);return <DataTable virtualize items={items} columns={[{key:'name',label:'产品',render:item=><button onClick={()=>setExpanded(!expanded)}>{item.name}</button>}]} renderExpandedRow={item=>item.id===0&&expanded?<div>保留的用途明细</div>:null}/>;}
  const {container}=render(<Example/>);
  expect(container.querySelectorAll('tbody tr').length).toBeLessThan(100);
  fireEvent.click(screen.getByRole('button',{name:'产品 0'}));expect(screen.getByText('保留的用途明细')).toBeVisible();
  const scroll=container.querySelector('.table-wrap')!;
  fireEvent.scroll(scroll,{target:{scrollTop:440000}});await screen.findByRole('button',{name:'产品 9999'});
  expect(container.querySelectorAll('tbody tr').length).toBeLessThan(100);expect(screen.queryByText('保留的用途明细')).not.toBeInTheDocument();
  fireEvent.scroll(scroll,{target:{scrollTop:0}});expect(await screen.findByText('保留的用途明细')).toBeVisible();
 });
 it('requests the next chunk once per loaded range while keeping the table mounted',async()=>{
  const end=vi.fn();const {container,rerender}=render(<DataTable virtualize onEndReached={end} items={items.slice(0,100)} columns={[{key:'name',label:'产品',render:item=>item.name}]}/>);
  const table=container.querySelector('table'),scroll=container.querySelector('.table-wrap')!;
  fireEvent.scroll(scroll,{target:{scrollTop:4400}});await waitFor(()=>expect(end).toHaveBeenCalledTimes(1));
  fireEvent.scroll(scroll,{target:{scrollTop:4400}});expect(end).toHaveBeenCalledTimes(1);
  rerender(<DataTable virtualize onEndReached={end} items={items.slice(0,200)} columns={[{key:'name',label:'产品',render:item=>item.name}]}/>);
  expect(container.querySelector('table')).toBe(table);
  fireEvent.scroll(scroll,{target:{scrollTop:8800}});await waitFor(()=>expect(end).toHaveBeenCalledTimes(2));
 });
 it('retries an end notification rejected during loading without requiring different row identities',async()=>{
  const waiting=vi.fn(()=>false),ready=vi.fn(()=>true);const columns=[{key:'name',label:'产品',render:(item:typeof items[number])=>item.name}];
  const view=render(<DataTable virtualize onEndReached={waiting} items={items.slice(0,2)} columns={columns}/>);
  await waitFor(()=>expect(waiting).toHaveBeenCalled());
  view.rerender(<DataTable virtualize onEndReached={ready} items={items.slice(0,2)} columns={columns}/>);
  await waitFor(()=>expect(ready).toHaveBeenCalledOnce());
 });
 it('returns to the top for a new query without remounting the table',async()=>{
  const columns=[{key:'name',label:'产品',render:(item:typeof items[number])=>item.name}];
  const {container,rerender}=render(<DataTable virtualize virtualKey="all" items={items} columns={columns}/>);
  const table=container.querySelector('table'),scroll=container.querySelector('.table-wrap')!;
  fireEvent.scroll(scroll,{target:{scrollTop:440000}});await screen.findByText('产品 9999');
  rerender(<DataTable virtualize virtualKey="unassociated" items={items.slice(0,300)} columns={columns}/>);
  await waitFor(()=>expect(scroll.scrollTop).toBe(0));expect(await screen.findByText('产品 0')).toBeVisible();expect(container.querySelector('table')).toBe(table);
 });

 it('removes the cached height of an offscreen detail when another detail opens',async()=>{
  const original=HTMLElement.prototype.getBoundingClientRect;
  const geometry=vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockImplementation(function(this:HTMLElement){if(this.tagName==='TR'){const height=this.classList.contains('expanded-table-row')?240:44;return {...original.call(this),height};}return original.call(this);});
  try{
   function Example(){const [expanded,setExpanded]=useState(0);return <><button onClick={()=>setExpanded(9999)}>切换末行详情</button><DataTable virtualize items={items} columns={[{key:'name',label:'产品',render:item=>item.name}]} renderExpandedRow={item=>item.id===expanded?<div>明细 {item.id}</div>:null}/></>;}
   const {container}=render(<Example/>);await screen.findByText('明细 0');
   const scroll=container.querySelector('.table-wrap')!;fireEvent.scroll(scroll,{target:{scrollTop:440000}});await screen.findByText('产品 9999');
   expect(container.querySelector('.virtual-table-spacer td')).toBeTruthy();
   fireEvent.click(screen.getByRole('button',{name:'切换末行详情'}));await screen.findByText('明细 9999');
   await waitFor(()=>{const first=container.querySelector('tbody > tr:not(.virtual-table-spacer):not(.expanded-table-row)')!;const index=Number(first.textContent!.replace('产品 ',''));expect(Number.parseFloat((container.querySelector('.virtual-table-spacer td') as HTMLElement).style.height)).toBe(index*44);});
  }finally{geometry.mockRestore();}
 });

});

it('retains row ResizeObservers when expanded content has a fresh ReactNode identity',()=>{
 const disconnected=vi.fn();const observed:Element[]=[];
 vi.stubGlobal('ResizeObserver',class{constructor(_callback:ResizeObserverCallback){} observe(element:Element){observed.push(element);}disconnect(){disconnected();}});
 try{
  const columns=[{key:'name',label:'产品',render:(item:typeof items[number])=>item.name}];
  const view=render(<DataTable virtualize items={items.slice(0,2)} columns={columns} renderExpandedRow={item=>item.id===0?<div>用途</div>:null}/>);
  expect(observed.some(node=>node.tagName==='TR')).toBe(true);disconnected.mockClear();
  view.rerender(<DataTable virtualize items={items.slice(0,2)} columns={columns} renderExpandedRow={item=>item.id===0?<div>更新的用途</div>:null}/>);
  expect(screen.getByText('更新的用途')).toBeVisible();expect(disconnected).not.toHaveBeenCalled();
 }finally{vi.unstubAllGlobals();}
});
