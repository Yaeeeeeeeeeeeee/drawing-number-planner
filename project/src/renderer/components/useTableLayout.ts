import {useEffect,useState} from 'react';
export interface LayoutColumn {key:string;label:string; width?:number; minWidth?:number; align?:'left'|'center'|'right'; locked?:'start'|'end'}
export function columnAlignment(c:LayoutColumn){
 if(c.align)return c.align;
 if(/^(sku|model|brand|name|fileName|filename)$/i.test(c.key))return 'left';
 if(/status|count|quantity|date|time|created|updated|color|action|operation|select|checkbox|^qty$/i.test(c.key))return 'center';
 return c.align??'left';
}
/** Fit preferences to the usable container, overflowing only when actual minima require it.
 * Defaults retain trailing fill; user widths scale their spare space above minima. */
export function fitColumnWidths(columns:LayoutColumn[],widths:Record<string,number>,available:number,fixed=false){
 const result=Object.fromEntries(columns.map(c=>[c.key,Math.max(columnMinimum(c),widths[c.key]??columnDefault(c))]));
 if(!columns.length||available<=0)return result;
 const minimum=columns.reduce((sum,c)=>sum+columnMinimum(c),0);
 const budget=Math.max(available,minimum);
 const total=columns.reduce((sum,c)=>sum+result[c.key],0);
 if(!fixed&&total<=budget){result[columns.at(-1)!.key]+=budget-total;return result;}
 const spare=budget-minimum;
 let weights=columns.map(c=>result[c.key]-columnMinimum(c));
 let weightTotal=weights.reduce((sum,width)=>sum+width,0);
 if(!weightTotal){weights=columns.map(c=>columnDefault(c)-columnMinimum(c));weightTotal=weights.reduce((sum,width)=>sum+width,0);}
 return Object.fromEntries(columns.map((c,index)=>[c.key,columnMinimum(c)+(weightTotal?spare*weights[index]/weightTotal:index===columns.length-1?spare:0)]));
}
/** A resize borrows or returns space to the other columns instead of growing the table. */
export function redistributeColumnWidths(columns:LayoutColumn[],widths:Record<string,number>,key:string,width:number,available:number){
 const column=columns.find(c=>c.key===key);if(!column)return widths;
 if(available<=0)return {...widths,[key]:Math.max(columnMinimum(column),Math.min(3000,width))};
 const others=columns.filter(c=>c.key!==key);
 const otherMinimum=others.reduce((sum,c)=>sum+columnMinimum(c),0);
 const budget=Math.max(available,otherMinimum+columnMinimum(column));
 const receiver=[...others].reverse().find(c=>!(/^(select|selection|checkbox)$/i.test(c.key)||c.locked==='start'&&columnDefault(c)===columnMinimum(c)));
 const current=widths[key]??columnDefault(column);
 const next=others.length?Math.max(columnMinimum(column),Math.min(budget-otherMinimum,width)):budget;
 if(next<current){
  if(!receiver)return widths;
  return {...widths,[key]:next,[receiver.key]:(widths[receiver.key]??columnDefault(receiver))+current-next};
 }
 return {...fitColumnWidths(others,widths,budget-next,true),[key]:next};
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
 return {...(valid?.fixed===true?{fixed:true}:{}),order:[...pinned('start'),...order.filter(k=>!columns.find(c=>c.key===k)?.locked),...pinned('end')],widths:Object.fromEntries(columns.map(c=>{const w=valid?.widths?.[c.key];return[c.key,typeof w==='number'&&Number.isFinite(w)?Math.max(columnMinimum(c),w):columnDefault(c)];}))};
}
export function resetTableLayouts(tableId?:string){
 try{if(tableId)localStorage.removeItem(PREFIX+tableId);else Object.keys(localStorage).filter(k=>k.startsWith(PREFIX)).forEach(k=>localStorage.removeItem(k));}catch{/* unavailable storage */}
 window.dispatchEvent(new CustomEvent('table-layout:reset',{detail:{tableId}}));
}
export function useTableLayout(tableId:string,columns:LayoutColumn[],available=0){
 const signature=JSON.stringify(columns.map(c=>[c.key,c.width,c.minWidth,c.locked]));
 const read=()=>{try{return normalizeLayout(columns,JSON.parse(localStorage.getItem(PREFIX+tableId)??'null'));}catch{return normalizeLayout(columns);}};
 const [layout,setLayout]=useState(read);
 useEffect(()=>{setLayout(read());},[tableId,signature]);
 useEffect(()=>{try{localStorage.setItem(PREFIX+tableId,JSON.stringify({version:1,...layout}));}catch{/* unavailable storage */}},[tableId,layout]);
 useEffect(()=>{const reset=(e:Event)=>{const id=(e as CustomEvent).detail?.tableId;if(!id||id===tableId)setLayout(normalizeLayout(columns));};window.addEventListener('table-layout:reset',reset);return()=>window.removeEventListener('table-layout:reset',reset);},[tableId,signature]);
 const ordered=layout.order.map(key=>columns.find(c=>c.key===key)!).filter(Boolean);
 const displayedWidths=fitColumnWidths(ordered,layout.widths,available,layout.fixed);
 const resize=(key:string,width:number,snap=true,baseWidths?:Record<string,number>)=>{
  // A minimum-only layout cannot resize; keep its saved proportions for a wider window.
  if(available>0&&available<=columns.reduce((sum,c)=>sum+columnMinimum(c),0))return;
  const column=columns.find(c=>c.key===key);if(!column)return;
  const recommended=columnDefault(column);
  const next=snap&&Math.abs(width-recommended)<=6?recommended:width;
  setLayout(previous=>({...previous,fixed:true,widths:redistributeColumnWidths(ordered,baseWidths??fitColumnWidths(ordered,previous.widths,available,previous.fixed),key,next,available)}));
 };
 const move=(key:string,target:string,after=false)=>{if(columns.find(c=>c.key===key)?.locked||columns.find(c=>c.key===target)?.locked||key===target)return;setLayout(previous=>{const order=previous.order.filter(k=>k!==key);order.splice(order.indexOf(target)+(after?1:0),0,key);return{...previous,order};});};
 return {layout,displayedWidths,resize,move,reset:()=>resetTableLayouts(tableId)};
}
