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
