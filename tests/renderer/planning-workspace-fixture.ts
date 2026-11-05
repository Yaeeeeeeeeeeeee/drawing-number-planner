import {expect,vi} from 'vitest';
import {fireEvent,screen,waitFor} from '@testing-library/react';

export const planningProduct={id:1,sku:'SKDWT040JP',model:'T40',brandId:11,brandName:'SAMKYO',productSizeId:12,productSizeName:'洗碗机',defaultAppearanceId:3,productCategory:'洗碗机',status:'active'};
const dictionaries:Record<string,unknown[]>={appearance:[{id:3,code:'01',name:'一号外观',status:'active'},{id:12,code:'02',name:'二号外观',status:'active'}],color:[{id:4,code:'0',name:'白色',status:'active'},{id:7,code:'1',name:'黑色',status:'active'}],main_category:[{id:5,code:'02',name:'铭牌类',status:'active'}],project_item:[{id:6,code:'01',name:'铭牌',parentId:5,status:'active'},{id:8,code:'02',name:'面板',parentId:5,status:'active'},{id:9,code:'01',name:'其他项目',parentId:99,status:'active'}],brand:[{id:11,code:'02',name:'SAMKYO',status:'active'}],product_size:[{id:12,code:'0101',name:'洗碗机',status:'active'}]};
export function planningApiFixture(){
 let revision=0;const drafts:Record<string,unknown>={};
 return {listProducts:vi.fn().mockResolvedValue([planningProduct,{...planningProduct,id:2,sku:'SKDWT060JP',model:'T60',productSizeId:13}]),listDictionaries:vi.fn(async(type:string)=>dictionaries[type]??[]),
 getPlanningDraft:vi.fn(async(mode:string)=>({draft:drafts[mode]??null,revision})),savePlanningDraft:vi.fn(async(mode:string,input:unknown,_revision?:number)=>({draft:drafts[mode]={revision:++revision,updatedAt:'2026-11-05T00:00:00Z',input,requiresCheck:true}})),deletePlanningDraft:vi.fn(async(mode:string,_revision?:number)=>{delete drafts[mode];return{deleted:true,revision:++revision};}),
 listPlanningWhiteBases:vi.fn().mockResolvedValue({items:[{id:90,origin:'planned',fullCode:'02.0101.010.0201001',displayName:'T40白色铭牌'}]}),
 previewBatchPlan:vi.fn(async(input:any)=>{return {groups:input.groups.map((g:any)=>{return {productId:g.productId,model:g.productId===1?'T40':'T60',rows:g.rows.map((r:any)=>{
   if(!r.colorId||!r.mainCategoryId||!r.projectItemId)return{...r,productId:g.productId,available:false,error:{code:'INVALID_PLAN',message:'项目资料不完整'}};
   const prefix=g.productId===1?'02.0101':'02.0102',project=r.projectItemId===8?'0202':'0201',color=r.colorId===7?'011':'010';
   const shared=r.colorId===7&&r.shareWhite!==false;
   return {...r,productId:g.productId,available:true,fullCode:shared?'02.0101.010.0201001':`${prefix}.${color}.${project}${r.projectItemId===6&&r.colorId===4&&g.productId===1?'005':'001'}`,sequence:shared?1:r.projectItemId===6&&g.productId===1?5:1,fingerprint:'checked',...(shared?{shared:{origin:'planned',id:90}}:{})};
   })};
 })};}),
 reserveBatchPlan:vi.fn(async(input:any)=>{let id=42;return{results:input.groups.flatMap((g:any)=>g.rows.map((r:any)=>({productId:g.productId,clientId:r.clientId,outcome:r.colorId===7&&r.shareWhite!==false?'shared':'reserved',drawing:{id:id++,origin:'planned',fullCode:r.expectedFullCode,displayName:`SAMKYO-${g.productId===1?'T40':'T60'}-${r.projectItemId===8?'面板':'铭牌'}`}})))};}),
 };
}
export async function choosePlanningProduct(){await screen.findByRole('option',{name:/T40/});fireEvent.change(screen.getByLabelText('产品型号'),{target:{value:'1'}});fireEvent.click(screen.getByRole('button',{name:'下一步'}));}
export function fillPlanningProject(number=1,project='6',color='4'){fireEvent.change(screen.getByLabelText(`第 ${number} 行主类别`),{target:{value:'5'}});fireEvent.change(screen.getByLabelText(`第 ${number} 行项目明细`),{target:{value:project}});fireEvent.change(screen.getByLabelText(`第 ${number} 行颜色`),{target:{value:color}});}
export async function checkPlanning(){fireEvent.click(screen.getByRole('button',{name:'下一步'}));await screen.findByRole('table');await waitFor(()=>expect(screen.queryAllByText('尚未检查')).toHaveLength(0));}
export async function confirmPlanning(){await checkPlanning();fireEvent.click(screen.getByRole('button',{name:'下一步'}));fireEvent.click(screen.getByLabelText('已核对本次占号清单'));fireEvent.click(screen.getByRole('button',{name:'确认批量占号'}));await screen.findByRole('heading',{name:'本次占号结果'});}
