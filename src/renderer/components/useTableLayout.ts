import {useEffect,useState} from 'react';
export interface LayoutColumn {key:string;label:string; width?:number; minWidth?:number; align?:'left'|'center'|'right'; locked?:'start'|'end'}
export function columnAlignment(c:LayoutColumn){
 if(/^(sku|model|brand|name|fileName|filename)$/i.test(c.key))return 'left';
 if(/status|count|quantity|date|time|created|updated|color|action|operation|select|checkbox|^qty$/i.test(c.key))return 'center';
 return c.align??'left';
}
/** Fill the available space using the actual final column without persisting automatic stretch. */
export function fillTrailingColumn(columns: Array<{key:string}>, widths:Record<string,number>, available:number){
 const result={...widths};const last=columns.at(-1);if(!last)return result;
 const total=columns.reduce((sum,column)=>sum+(widths[column.key]??0),0);
 if(available>total)result[last.key]=(result[last.key]??0)+available-total;
 return result;
}
export interface TableLayout {fixed?:boolean;order:string[];widths:Record<string,number>}
const PREFIX='table-layout:v1:';
export function columnMinimum(c:LayoutColumn){return c.minWidth??(c.locked==='start'?48:80);}
export function columnDefault(c:LayoutColumn){return Math.max(columnMinimum(c),c.width??(c.locked==='start'?48:c.locked==='end'?180:160));}
export function normalizeLayout(columns:LayoutColumn[],value?:unknown):TableLayout{
 const stored=value as Partial<TableLayout>&{version?:number}|undefined;
 const valid=stored?.version===1?stored:undefined;
 const keys=columns.map(c=>c.key);const order=[...new Set([...(Array.isArray(valid?.order)?valid.order.filter(k=>keys.includes(k)):[]),...keys])];
 const pinned=(lock:'start'|'end')=>columns.filter(c=>c.locked===lock).map(c=>c.key);
 return {...(valid?.fixed===true?{fixed:true}:{}),order:[...pinned('start'),...order.filter(k=>!columns.find(c=>c.key===k)?.locked),...pinned('end')],widths:Object.fromEntries(columns.map(c=>{const w=valid?.widths?.[c.key];return[c.key,typeof w==='number'&&Number.isFinite(w)?Math.min(3000,Math.max(columnMinimum(c),w)):columnDefault(c)];}))};
}
export function resetTableLayouts(tableId?:string){
 try{if(tableId)localStorage.removeItem(PREFIX+tableId);else Object.keys(localStorage).filter(k=>k.startsWith(PREFIX)).forEach(k=>localStorage.removeItem(k));}catch{/* unavailable storage */}
 window.dispatchEvent(new CustomEvent('table-layout:reset',{detail:{tableId}}));
}
export function useTableLayout(tableId:string,columns:LayoutColumn[]){
 const signature=JSON.stringify(columns.map(c=>[c.key,c.width,c.minWidth,c.locked]));
 const read=()=>{try{return normalizeLayout(columns,JSON.parse(localStorage.getItem(PREFIX+tableId)??'null'));}catch{return normalizeLayout(columns);}};
 const [layout,setLayout]=useState(read);
 useEffect(()=>{setLayout(read());},[tableId,signature]);
 useEffect(()=>{try{localStorage.setItem(PREFIX+tableId,JSON.stringify({version:1,...layout}));}catch{/* unavailable storage */}},[tableId,layout]);
 useEffect(()=>{const reset=(e:Event)=>{const id=(e as CustomEvent).detail?.tableId;if(!id||id===tableId)setLayout(normalizeLayout(columns));};window.addEventListener('table-layout:reset',reset);return()=>window.removeEventListener('table-layout:reset',reset);},[tableId,signature]);
 const resize=(key:string,width:number,snap=true)=>{const c=columns.find(c=>c.key===key);if(!c)return;const recommended=columnDefault(c);const next=Math.max(columnMinimum(c),Math.min(3000,snap&&Math.abs(width-recommended)<=6?recommended:width));setLayout(previous=>({...previous,fixed:true,widths:{...previous.widths,[key]:next}}));};
 const move=(key:string,target:string,after=false)=>{if(columns.find(c=>c.key===key)?.locked||columns.find(c=>c.key===target)?.locked||key===target)return;setLayout(previous=>{const order=previous.order.filter(k=>k!==key);order.splice(order.indexOf(target)+(after?1:0),0,key);return{...previous,order};});};
 const materialize=(widths:Record<string,number>)=>setLayout(previous=>({...previous,fixed:true,widths:{...previous.widths,...widths}}));
 return {layout,resize,move,materialize,reset:()=>resetTableLayouts(tableId)};
}
