export interface PlanningRowInput {
  clientId: string;
  colorId: number;
  mainCategoryId: number;
  projectItemId: number;
  notes?: string;
}

export interface PlanningInput {
  productId: number;
  appearanceId?: number;
  appearanceVersionId?: number;
  rows: PlanningRowInput[];
}

export interface ResolvedPlanningRow extends PlanningRowInput {
  colorCode: string;
  colorName: string;
  mainCategoryCode: string;
  mainCategoryName: string;
  projectItemCode: string;
  projectItemName: string;
}

export interface PlanningContext {
  appearanceVersionId?: number;
  productId: number;
  model: string;
  productCategory: string;
  brandId: number;
  brandCode: string;
  brandName: string;
  productSizeId: number;
  productSizeCode: string;
  appearanceId: number;
  appearanceCode: string;
  appearanceName: string;
  rows: ResolvedPlanningRow[];
}

export interface PlannedRow {
  clientId: string;
  fullCode: string;
  displayName: string;
  prefix: string;
  sequence: number;
  available: true;
}

export interface PlanningPreview {
  appearanceVersionId?: number;
  productId: number;
  appearanceId: number;
  rows: PlannedRow[];
}

export interface ReservePlanningRowInput extends PlanningRowInput {
  expectedFullCode: string;
}

export interface ReservePlanningInput {
  productId: number;
  appearanceId?: number;
  appearanceVersionId?: number;
  rows: ReservePlanningRowInput[];
}

export interface ReservedDrawing {
  id: number;
  fullCode: string;
  displayName: string;
  status: 'reserved';
}

export type { DrawingCodeParts } from '../drawings/drawing-code.js';
export interface WhiteDrawingIdentity { origin: 'planned' | 'historical'; id: number }
export interface WhiteDrawingBase extends WhiteDrawingIdentity { fullCode: string; displayName: string }
export interface BatchPlanningRow extends PlanningRowInput { shareWhite?: boolean; whiteBase?: WhiteDrawingIdentity }
export interface BatchPlanningInput { groups: Array<{ productId: number; appearanceId?: number; appearanceVersionId?: number; rows: BatchPlanningRow[] }> }
export interface BatchPlanningCheck {
  clientId: string; productId: number; colorId: number; mainCategoryId: number; projectItemId: number;
  available: boolean; fullCode?: string; prefix?: string; sequence?: number;
  parts?: import('../drawings/drawing-code.js').DrawingCodeParts;
  fingerprint?: string; shared?: WhiteDrawingIdentity; error?: { code: string; message: string };
}
export interface BatchPlanningPreview { groups: Array<{ productId: number; model: string; rows: BatchPlanningCheck[] }> }
export interface BatchReservePlanningInput {
  confirmed: true;
  groups: Array<{ productId: number; appearanceId?: number; appearanceVersionId?: number;
    rows: Array<BatchPlanningRow & { expectedFullCode: string; fingerprint: string }> }>;
}
export interface BatchPlanningResult { results: Array<{ productId: number; clientId: string;
  outcome: 'reserved' | 'shared' | 'failed'; drawing?: WhiteDrawingBase; error?: { code: string; message: string } }> }
export interface PlanningWhiteBasesInput { productId: number; appearanceId?: number; appearanceVersionId?: number; mainCategoryId?: number; projectItemId: number }

export type PlanningDraftMode = 'new' | 'batch';
export interface PlanningDraftInput {
  step: 1 | 2 | 3 | 4; activeProductId?: number;
  groups: Array<{ productId: number; appearanceId?: number; appearanceVersionId?: number;
    rows: Array<{ clientId: string; colorId?: number; mainCategoryId?: number; projectItemId?: number;
      notes?: string; shareWhite?: boolean; whiteBase?: WhiteDrawingIdentity }> }>;
}
export interface PlanningDraftRecord { revision: number; updatedAt: string; input: PlanningDraftInput; requiresCheck: true }
