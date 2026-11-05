import type {BatchPlanningInput,PlanningDraftInput} from '../../../core/planning/planning-types';
import type {ProductView} from '../../data/client';

export type DraftGroup=PlanningDraftInput['groups'][number];
export type DraftProject=DraftGroup['rows'][number];
export const emptyPlanningDraft=():PlanningDraftInput=>({step:1,groups:[]});
export const newPlanningProject=():DraftProject=>({clientId:crypto.randomUUID(),notes:'',shareWhite:true});
export const newPlanningGroup=(product:ProductView):DraftGroup=>({productId:product.id,appearanceId:product.defaultAppearanceId??undefined,rows:[newPlanningProject()]});
export function batchInput(draft:PlanningDraftInput):BatchPlanningInput {
  return {groups:draft.groups.map(group=>({...group,rows:group.rows.map(row=>({...row,shareWhite:row.shareWhite!==false,colorId:row.colorId??0,mainCategoryId:row.mainCategoryId??0,projectItemId:row.projectItemId??0}))}))};
}
export const planningRowKey=(productId:number,clientId:string)=>`${productId}:${clientId}`;
export const whiteColorName=(name:string)=>/^(白色?|white)$/iu.test(name.trim());
