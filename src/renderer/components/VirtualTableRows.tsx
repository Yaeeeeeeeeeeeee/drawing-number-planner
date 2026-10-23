import {Fragment,useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ReactNode,type RefObject} from 'react';
import {columnAlignment} from './useTableLayout';
import {TableCellContent} from './LayoutTable';
import type {TableColumn} from './DataTable';
const ROW_ESTIMATE=44, OVERSCAN=12;
interface Props<T extends {id:number|string}>{items:T[];columns:TableColumn<T>[];scrollRoot:RefObject<HTMLDivElement|null>;onRowClick?:(item:T)=>void;renderExpandedRow?:(item:T)=>ReactNode|null;onEndReached?:()=>void|boolean;virtualKey?:string}
function firstAt(offsets:number[],position:number){let low=0,high=offsets.length-1;while(low<high){const middle=Math.floor((low+high)/2);if(offsets[middle+1]<=position)low=middle+1;else high=middle;}return Math.min(low,Math.max(0,offsets.length-2));}
function MeasuredRows<T extends {id:number|string}>({item,columns,expanded,onRowClick,onMeasure}:{item:T;columns:TableColumn<T>[];expanded?:ReactNode;onRowClick?:(item:T)=>void;onMeasure:(id:T['id'],height:number,detailHeight:number)=>void}){
 const primary=useRef<HTMLTableRowElement>(null),detail=useRef<HTMLTableRowElement>(null);
 useLayoutEffect(()=>{const measure=()=>{const height=primary.current?.getBoundingClientRect().height??0,detailHeight=detail.current?.getBoundingClientRect().height??0;if(height>0)onMeasure(item.id,height,detailHeight);};measure();if(typeof ResizeObserver==='undefined')return;const observer=new ResizeObserver(measure);if(primary.current)observer.observe(primary.current);if(detail.current)observer.observe(detail.current);return()=>observer.disconnect();},[item.id,expanded,onMeasure]);
 return <Fragment><tr ref={primary} onClick={()=>onRowClick?.(item)} className={onRowClick?'clickable-row':undefined}>{columns.map(column=><td key={column.key} data-column-key={column.key} style={{textAlign:columnAlignment(column)}}><TableCellContent columnKey={column.key}>{column.render(item)}</TableCellContent></td>)}</tr>{expanded!=null&&<tr ref={detail} className="expanded-table-row"><td colSpan={columns.length}>{expanded}</td></tr>}</Fragment>;
}
/** Window only the DOM. Record identity, selection and expansion stay in the owning page. */
export function VirtualTableRows<T extends {id:number|string}>({items,columns,scrollRoot,onRowClick,renderExpandedRow,onEndReached,virtualKey}:Props<T>){
 const heights=useRef(new Map<number|string,{primary:number;detail:number}>()),[measurement,setMeasurement]=useState(0),[viewport,setViewport]=useState({top:0,height:600});
 const measured=useCallback((id:number|string,height:number,detailHeight:number)=>{const previous=heights.current.get(id);if(previous&&Math.abs(previous.primary-height)<1&&Math.abs(previous.detail-detailHeight)<1)return;heights.current.set(id,{primary:height,detail:detailHeight});setMeasurement(value=>value+1);},[]);
 const offsets=useMemo(()=>{const result=[0];for(const item of items){const measured=heights.current.get(item.id);const detail=measured?.detail&&renderExpandedRow?.(item)!=null?measured.detail:0;result.push(result[result.length-1]+(measured?.primary??ROW_ESTIMATE)+detail);}return result;},[items,measurement,renderExpandedRow]);
 const total=offsets[offsets.length-1];
 useEffect(()=>{const element=scrollRoot.current;if(!element)return;const update=()=>{const header=element.querySelector('thead')?.getBoundingClientRect().height??0;setViewport(previous=>{const next={top:Math.max(0,element.scrollTop-header),height:element.clientHeight||600};return previous.top===next.top&&previous.height===next.height?previous:next;});};update();element.addEventListener('scroll',update,{passive:true});const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;observer?.observe(element);return()=>{element.removeEventListener('scroll',update);observer?.disconnect();};},[scrollRoot,items.length,virtualKey]);
 useLayoutEffect(()=>{const element=scrollRoot.current;if(element&&virtualKey!==undefined){element.scrollTop=0;setViewport(previous=>({...previous,top:0}));}},[virtualKey,scrollRoot]);
 const identity=`${virtualKey??''}:${items.length}:${items[0]?.id??''}:${items.at(-1)?.id??''}`;
 const notified=useRef<string|null>(null);
 useEffect(()=>{if(items.length&&viewport.top+viewport.height>=total-ROW_ESTIMATE*3&&notified.current!==identity){const accepted=onEndReached?.();if(accepted!==false)notified.current=identity;}},[identity,items.length,total,viewport,onEndReached]);
 const start=Math.max(0,firstAt(offsets,viewport.top)-OVERSCAN),end=Math.min(items.length,firstAt(offsets,viewport.top+viewport.height)+OVERSCAN+1);
 const spacer=(height:number,key:string)=>height>0?<tr key={key} aria-hidden="true" className="virtual-table-spacer"><td colSpan={columns.length} style={{height,padding:0,border:0}}/></tr>:null;
 return <tbody>{spacer(offsets[start]??0,'before')}{items.slice(start,end).map(item=><MeasuredRows key={item.id} item={item} columns={columns} expanded={renderExpandedRow?.(item)} onRowClick={onRowClick} onMeasure={measured}/>)}{spacer(Math.max(0,total-(offsets[end]??0)),'after')}</tbody>;
}
