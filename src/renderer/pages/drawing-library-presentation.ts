import type {DrawingView} from '../data/client';
const tones=[['#E8EFF8','#365B82'],['#F2EAF8','#785095'],['#E8F4EB','#36754B'],['#FFF0E4','#9A6029'],['#E7F3F5','#356E78'],['#F1EDE5','#756440'],['#ECECFA','#565C91'],['#F8EAF0','#8A526B']];
const standard:Record<string,number>={'04':0,'03':1,'05':2,'02':3,'01':4};
export function drawingCategoryStyle(item:DrawingView){const key=String(item.mainCategoryCode??item.mainCategoryId??item.mainCategoryName??'unknown');let index=standard[key];if(index===undefined){index=0;for(const char of key)index=(index*31+char.charCodeAt(0))%tones.length;}return{backgroundColor:tones[index][0],color:tones[index][1]};}
export function drawingBusinessState(status:DrawingView['status']){return status==='active'?'active':'inactive';}
export function drawingBusinessLabel(status:DrawingView['status']){return drawingBusinessState(status)==='active'?'使用中':'已停用';}
/** Keep the user's saved position and width when the old placeholder column is renamed. */
export function upgradeDrawingColumnLayout(){try{const key='table-layout:v1:drawing-library',raw=localStorage.getItem(key);if(!raw)return;const saved=JSON.parse(raw);if(saved.version!==1||!Array.isArray(saved.order)||!saved.order.includes('version'))return;saved.order=saved.order.map((name:string)=>name==='version'?'color':name);if(saved.widths&&saved.widths.color===undefined)saved.widths.color=saved.widths.version;if(saved.widths)delete saved.widths.version;localStorage.setItem(key,JSON.stringify(saved));}catch{/* The shared layout reader handles unavailable or malformed storage. */}}
