import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {act,fireEvent,render,screen,within} from '@testing-library/react';
import {DataTable} from '../../src/renderer/components/DataTable';
import {LayoutTable} from '../../src/renderer/components/LayoutTable';
import {columnAlignment,redistributeColumnWidths,fitColumnWidths,normalizeLayout} from '../../src/renderer/components/useTableLayout';
const columns=[{key:'select',label:'选择',locked:'start' as const,width:48,minWidth:48,render:()=> 'check'},{key:'name',label:'名称',width:160,render:(x:{id:number})=>`Name ${x.id}`},{key:'batch',label:'批次',render:()=> 'Batch'},{key:'actions',label:'操作',locked:'end' as const,render:()=> 'Open'}];
beforeEach(()=>localStorage.clear());
describe('shared table layouts',()=>{
 it('fills the current trailing column by default and contracts to minima without changing preferences',()=>{
  const widths={name:160,batch:140};
  expect(fitColumnWidths([{key:'name',label:'名称'},{key:'batch',label:'批次'}],widths,600)).toEqual({name:160,batch:440});
  expect(fitColumnWidths([{key:'batch',label:'批次'},{key:'name',label:'名称'}],widths,600)).toEqual({name:460,batch:140});
  expect(fitColumnWidths([{key:'name',label:'名称'},{key:'batch',label:'批次'}],widths,200)).toEqual({name:102.85714285714286,batch:97.14285714285714});
  expect(widths).toEqual({name:160,batch:140});
 });
 it('retains header dragging, edge resizing and reset without six-dot handles or instructional text',()=>{
  const view=render(<DataTable columns={columns} items={[{id:1}]}/>);
  expect(view.container.querySelector('.table-column-drag-handle')).toBeNull();
  expect(screen.queryByText('拖动表头换序 · 列边调宽')).toBeNull();
  expect(screen.getByRole('columnheader',{name:'名称'})).toHaveAttribute('draggable','true');
  expect(screen.getByRole('separator',{name:'调整名称列宽'})).toBeVisible();
  expect(screen.getByRole('button',{name:'恢复默认表格布局'})).toBeVisible();
 });
 it('restores width and order through a visible button without resetting another table or its records',()=>{
  const view=render(<><DataTable tableId="first-reset" columns={columns} items={[{id:1}]}/><DataTable tableId="second-reset" columns={columns} items={[{id:2}]}/></>);
  const [first,second]=Array.from(view.container.querySelectorAll('table'));
  fireEvent.keyDown(within(first).getByRole('columnheader',{name:'名称'}),{key:'ArrowRight',altKey:true});
  fireEvent.keyDown(within(first).getByRole('separator',{name:'调整名称列宽'}),{key:'ArrowRight'});
  fireEvent.keyDown(within(second).getByRole('separator',{name:'调整名称列宽'}),{key:'ArrowRight'});
  const preserved=localStorage.getItem('table-layout:v1:second-reset');
  fireEvent.click(within(first).getByRole('button',{name:'恢复默认表格布局'}));
  expect(within(first).getByRole('separator',{name:'调整名称列宽'})).toHaveAttribute('aria-valuenow','160');
  expect(Array.from(first.querySelectorAll('thead th')).map(h=>h.getAttribute('data-column-key'))).toEqual(columns.map(c=>c.key));
  expect(first).toHaveTextContent('Name 1');expect(second).toHaveTextContent('Name 2');
  expect(localStorage.getItem('table-layout:v1:second-reset')).toBe(preserved);
  expect(within(second).getByRole('separator',{name:'调整名称列宽'})).toHaveAttribute('aria-valuenow','170');
 });

 it('materializes real wide-container columns before resizing and persists their actual widths',()=>{
  render(<DataTable tableId="wide" columns={columns} items={[{id:1}]}/>);
  const header=screen.getByRole('columnheader',{name:'名称'});Object.defineProperty(header,'getBoundingClientRect',{value:()=>({width:460})});
  const separator=screen.getByRole('separator',{name:'调整名称列宽'});const pointer=(type:string,x:number)=>{const event=new Event(type,{bubbles:true});Object.defineProperty(event,'clientX',{value:x});fireEvent(type==='pointerdown'?separator:window,event);};
  pointer('pointerdown',200);pointer('pointermove',242);pointer('pointerup',242);
  expect(separator).toHaveAttribute('aria-valuenow','502');const stored=JSON.parse(localStorage.getItem('table-layout:v1:wide')!);expect(stored.fixed).toBe(true);expect(stored.widths.name).toBe(502);
  expect(screen.getByRole('table').style.minWidth).toBe('100%');
 });
 it('sanitizes malformed/versioned storage and locks edges',()=>{expect(normalizeLayout(columns,{version:1,order:['actions','batch','bad','batch','select'],widths:{name:-5,batch:Infinity}})).toEqual({order:['select','batch','name','actions'],widths:{select:48,name:80,batch:160,actions:180}});expect(normalizeLayout(columns,{version:0,order:['batch']} ).order).toEqual(columns.map(c=>c.key));});
 it('keeps real cells aligned through keyboard reorder, persists independently and resets',()=>{const view=render(<DataTable tableId="test" columns={columns} items={[{id:1}]} renderExpandedRow={()=>'Details'}/>);fireEvent.keyDown(screen.getByRole('columnheader',{name:'名称'}),{key:'ArrowRight',altKey:true});let rows=screen.getAllByRole('row');expect(within(rows[1]).getAllByRole('cell').map(c=>c.textContent)).toEqual(['check','Batch','Name 1','Open']);expect(screen.getByText('Details').getAttribute('colspan')).toBe('4');fireEvent.keyDown(screen.getByRole('separator',{name:'调整名称列宽'}),{key:'ArrowRight'});view.unmount();render(<DataTable tableId="test" columns={columns} items={[{id:2}]}/>);expect(screen.getByRole('separator',{name:'调整名称列宽'})).toHaveAttribute('aria-valuenow','170');expect(JSON.parse(localStorage.getItem('table-layout:v1:test')!).order).toEqual(['select','batch','name','actions']);fireEvent.contextMenu(screen.getByRole('columnheader',{name:'名称'}));expect(screen.getByRole('separator',{name:'调整名称列宽'})).toHaveAttribute('aria-valuenow','160');expect(JSON.parse(localStorage.getItem('table-layout:v1:test')!).order).toEqual(columns.map(c=>c.key));});
 it('resizes live, snaps within six pixels and fits measured actual content',()=>{render(<DataTable tableId="pointer" columns={columns} items={[{id:1}]}/>);const separator=screen.getByRole('separator',{name:'调整名称列宽'});const pointer=(type:string,x:number)=>{const event=new Event(type,{bubbles:true});Object.defineProperty(event,'clientX',{value:x});fireEvent(type==='pointerdown'?separator:window,event);};pointer('pointerdown',100);pointer('pointermove',145);expect(separator).toHaveAttribute('aria-valuenow','205');pointer('pointermove',105);expect(separator).toHaveAttribute('aria-valuenow','160');pointer('pointermove',-500);expect(separator).toHaveAttribute('aria-valuenow','80');pointer('pointerup',0);Object.defineProperty(screen.getByText('Name 1'),'scrollWidth',{value:410});fireEvent.doubleClick(separator);expect(Number(separator.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(410);});
 it('moves raw cells by drag and preserves spanning rows',()=>{render(<LayoutTable tableId="raw" columns={columns}><thead><tr><th>选择</th><th>名称</th><th>批次</th><th>操作</th></tr></thead><tbody><tr><td>check</td><td>Name</td><td>Batch</td><td>Open</td></tr><tr><td colSpan={4}>detail</td></tr></tbody></LayoutTable>);const source=screen.getByRole('columnheader',{name:'批次'}),target=screen.getByRole('columnheader',{name:'名称'});fireEvent.dragStart(source);fireEvent.dragOver(target,{clientX:0});expect(target).toHaveClass('column-insert-before');fireEvent.drop(target);expect(screen.getAllByRole('row')[1].textContent).toBe('checkBatchNameOpen');expect(screen.getByText('detail')).toHaveAttribute('colspan','4');});
 it('preserves virtual rows and expansion after moving columns',()=>{render(<DataTable tableId="virtual" columns={columns} items={Array.from({length:1000},(_,id)=>({id}))} virtualize renderExpandedRow={x=>x.id===0?'Virtual detail':null}/>);fireEvent.keyDown(screen.getByRole('columnheader',{name:'名称'}),{key:'ArrowRight',altKey:true});const first=screen.getAllByRole('row')[1];expect(first.textContent).toBe('checkBatchName 0Open');expect(screen.getByText('Virtual detail')).toHaveAttribute('colspan','4');expect(screen.getAllByRole('row').length).toBeLessThan(100);});
 it('keeps locked boundary columns fixed through keyboard attempts',()=>{render(<DataTable tableId="locked" columns={columns} items={[{id:1}]}/>);fireEvent.keyDown(screen.getByRole('columnheader',{name:'选择'}),{key:'ArrowRight',altKey:true});fireEvent.keyDown(screen.getByRole('columnheader',{name:'名称'}),{key:'ArrowLeft',altKey:true});fireEvent.keyDown(screen.getByRole('columnheader',{name:'操作'}),{key:'ArrowLeft',altKey:true});expect(screen.getAllByRole('columnheader').map(x=>x.getAttribute('data-column-key'))).toEqual(columns.map(c=>c.key));});
 it('does not turn row labels into resize handles',()=>{render(<LayoutTable tableId="row-label" columns={[{key:'label',label:'项目'},{key:'value',label:'值'}]}><tbody><tr><th scope="row">Row label</th><td>Value</td></tr></tbody></LayoutTable>);expect(screen.queryByRole('separator')).not.toBeInTheDocument();expect(screen.getByRole('rowheader')).not.toHaveAttribute('draggable');});
 it('ignores broken JSON and isolates reset by stable ID',()=>{localStorage.setItem('table-layout:v1:broken','{');render(<><DataTable tableId="broken" columns={columns} items={[]}/><DataTable tableId="other" columns={columns} items={[]}/></>);const handles=screen.getAllByRole('separator',{name:'调整名称列宽'});fireEvent.keyDown(handles[0],{key:'ArrowRight'});fireEvent.keyDown(handles[1],{key:'ArrowRight'});fireEvent.contextMenu(screen.getAllByRole('columnheader',{name:'名称'})[0]);expect(handles[0]).toHaveAttribute('aria-valuenow','160');expect(handles[1]).toHaveAttribute('aria-valuenow','170');});
});


describe('container-constrained shared table widths',()=>{
 let available=900;
 const widths=(table:HTMLTableElement)=>Object.fromEntries(Array.from(table.querySelectorAll('col')).map((col,index)=>[table.querySelectorAll('thead th')[index].getAttribute('data-column-key')!,parseFloat(col.style.width)]));
 const total=(table:HTMLTableElement)=>Object.values(widths(table)).reduce((sum,width)=>sum+width,0);
 const pointer=(separator:HTMLElement,type:string,x:number)=>{const event=new Event(type,{bubbles:true});Object.defineProperty(event,'clientX',{value:x});fireEvent(type==='pointerdown'?separator:window,event);};
 beforeEach(()=>{available=900;vi.spyOn(HTMLElement.prototype,'clientWidth','get').mockImplementation(function(this:HTMLElement){return this.classList.contains('table-wrap')?available:0;});});
 afterEach(()=>vi.restoreAllMocks());
 it('redistributes keyboard and pointer resizing within the measured container and clamps at the other column minima',()=>{
  render(<DataTable tableId="contained" columns={columns} items={[{id:1}]}/>);
  const table=screen.getByRole('table') as HTMLTableElement;
  const separator=screen.getByRole('separator',{name:'调整名称列宽'});
  const initial=widths(table);
  fireEvent.keyDown(separator,{key:'ArrowRight'});
  expect(total(table)).toBeCloseTo(available);expect(widths(table).name).toBe(initial.name+10);
  expect(widths(table).actions).toBeLessThan(initial.actions);
  pointer(separator,'pointerdown',100);pointer(separator,'pointermove',10000);pointer(separator,'pointerup',10000);
  expect(total(table)).toBeCloseTo(available);expect(widths(table).name).toBe(692);
  expect(widths(table)).toEqual({select:48,name:692,batch:80,actions:80});
  expect(separator).toHaveAttribute('aria-valuenow','692');expect(separator).toHaveAttribute('aria-valuemax','692');
 });
 it('normalizes huge old saved widths to the container while preserving column order and preferences',()=>{
  localStorage.setItem('table-layout:v1:old-wide',JSON.stringify({version:1,fixed:true,order:['select','batch','name','actions'],widths:{select:48,name:3000,batch:2000,actions:1000}}));
  render(<DataTable tableId="old-wide" columns={columns} items={[{id:1}]}/>);
  const table=screen.getByRole('table') as HTMLTableElement;
  expect(total(table)).toBeCloseTo(available);expect(parseFloat(table.style.width)).toBeCloseTo(available);
  expect(widths(table).name).toBeGreaterThan(widths(table).batch);expect(widths(table).batch).toBeGreaterThan(widths(table).actions);
  expect(Array.from(table.querySelectorAll<HTMLElement>('thead th')).map(h=>h.dataset.columnKey)).toEqual(['select','batch','name','actions']);
 });
 it('allows only actual minimum-width overflow and adapts on window changes without rewriting saved preferences',()=>{
  render(<DataTable tableId="responsive" columns={columns} items={[{id:1}]}/>);
  const table=screen.getByRole('table') as HTMLTableElement;
  fireEvent.keyDown(screen.getByRole('separator',{name:'调整名称列宽'}),{key:'ArrowRight'});
  const original=widths(table),saved=localStorage.getItem('table-layout:v1:responsive');
  available=1800;act(()=>window.dispatchEvent(new Event('resize')));
  expect(total(table)).toBeCloseTo(1800);expect(widths(table).name).toBeGreaterThan(original.name);
  available=240;act(()=>window.dispatchEvent(new Event('resize')));
  expect(widths(table)).toEqual({select:48,name:80,batch:80,actions:80});expect(total(table)).toBe(288);
  fireEvent.keyDown(screen.getByRole('separator',{name:'调整名称列宽'}),{key:'ArrowRight'});
  expect(total(table)).toBe(288);expect(localStorage.getItem('table-layout:v1:responsive')).toBe(saved);
  available=900;act(()=>window.dispatchEvent(new Event('resize')));
  for(const key of Object.keys(original))expect(widths(table)[key]).toBeCloseTo(original[key]);
  expect(localStorage.getItem('table-layout:v1:responsive')).toBe(saved);
 });
 it('persists a valid column wider than the old 3000px cap and constrains content fit to the available budget',()=>{
  available=3840;
  const view=render(<DataTable tableId="four-k" columns={columns} items={[{id:1}]}/>);
  const separator=screen.getByRole('separator',{name:'调整名称列宽'});
  Object.defineProperty(screen.getByText('Name 1'),'scrollWidth',{value:10000});
  fireEvent.doubleClick(separator);
  expect(widths(screen.getByRole('table') as HTMLTableElement)).toEqual({select:48,name:3632,batch:80,actions:80});
  view.unmount();render(<DataTable tableId="four-k" columns={columns} items={[{id:2}]}/>);
  expect(widths(screen.getByRole('table') as HTMLTableElement).name).toBe(3632);
 });
 it('keeps redistributed widths through reorder and remount, and restores the default fill on reset',()=>{
  const view=render(<DataTable tableId="redistributed" columns={columns} items={[{id:1}]}/>);
  fireEvent.keyDown(screen.getByRole('separator',{name:'调整名称列宽'}),{key:'ArrowRight'});
  const before=widths(screen.getByRole('table') as HTMLTableElement);
  fireEvent.keyDown(screen.getByRole('columnheader',{name:'名称'}),{key:'ArrowRight',altKey:true});
  expect(widths(screen.getByRole('table') as HTMLTableElement)).toEqual(before);
  view.unmount();render(<DataTable tableId="redistributed" columns={columns} items={[{id:2}]}/>);
  expect(widths(screen.getByRole('table') as HTMLTableElement)).toEqual(before);
  fireEvent.click(screen.getByRole('button',{name:'恢复默认表格布局'}));
  expect(widths(screen.getByRole('table') as HTMLTableElement)).toEqual({select:48,name:160,batch:160,actions:532});
 });
});

it('ignores a queued size observation after a table is unmounted during workspace navigation',()=>{
 let callback:ResizeObserverCallback|undefined;
 vi.stubGlobal('ResizeObserver',class {constructor(fn:ResizeObserverCallback){callback=fn;}observe(){}unobserve(){}disconnect(){}});
 try {
  const view=render(<DataTable tableId="queued-unmount" columns={columns} items={[{id:1}]}/>);
  expect(callback).toBeDefined();view.unmount();
  expect(()=>callback!([],{} as ResizeObserver)).not.toThrow();
 } finally {vi.unstubAllGlobals();}
});


describe('V5.2 explicit alignment and rightmost resize receiver',()=>{
 it('honors explicit alignment for identity and status columns in ordinary, virtual and raw tables',()=>{
  expect(columnAlignment({key:'status',label:'状态',align:'right'})).toBe('right');
  const associated=render(<LayoutTable tableId="explicit-file" columns={[{key:'fileName',label:'关联文件',align:'left'}]}><thead><tr><th>关联文件</th></tr></thead><tbody><tr><td>PDF</td></tr></tbody></LayoutTable>);
  expect(screen.getByRole('columnheader')).toHaveStyle({textAlign:'left'});associated.unmount();
  for(const virtualize of [false,true]){
   const view=render(<DataTable tableId={`align-${virtualize}`} virtualize={virtualize} columns={[{key:'model',label:'型号',align:'center',render:()=> 'M1'}]} items={[{id:1}]}/>);
   expect(screen.getByRole('columnheader',{name:'型号'})).toHaveStyle({textAlign:'center'});expect(screen.getByRole('cell')).toHaveStyle({textAlign:'center'});view.unmount();
  }
  render(<LayoutTable tableId="raw-center" columns={[{key:'name',label:'名称',align:'center'}]}><thead><tr><th>名称</th></tr></thead><tbody><tr><td>字典</td></tr></tbody></LayoutTable>);
  expect(screen.getByRole('columnheader')).toHaveStyle({textAlign:'center'});expect(screen.getByRole('cell')).toHaveStyle({textAlign:'center'});
 });
 it('returns released width exclusively to the rightmost displayed stretchable peer',()=>{
  const widths={select:48,name:200,batch:200,actions:252};
  expect(redistributeColumnWidths(columns,widths,'name',150,700)).toEqual({select:48,name:150,batch:200,actions:302});
  const reordered=[columns[0],columns[1],columns[3],columns[2]];
  expect(redistributeColumnWidths(reordered,widths,'name',150,700)).toEqual({select:48,name:150,batch:250,actions:252});
  expect(redistributeColumnWidths(reordered,widths,'batch',150,700)).toEqual({select:48,name:200,batch:150,actions:302});
 });
});
