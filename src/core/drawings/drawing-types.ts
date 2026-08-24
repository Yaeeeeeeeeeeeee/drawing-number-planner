export type DrawingStatus = 'reserved' | 'active' | 'voided';

export interface DrawingRecord {
  id: number;
  fullCode: string;
  displayName: string;
  productId: number;
  model: string;
  productCategory: string;
  brandId: number;
  brandName: string;
  colorId: number;
  colorName: string;
  mainCategoryId: number;
  mainCategoryName: string;
  projectItemId: number;
  projectItemName: string;
  sequence: number;
  status: DrawingStatus;
  previousDrawingId: number | null;
  previousFullCode: string | null;
  changeReason: string | null;
  sourceProductId: number | null;
  sourceProductModel: string | null;
  sourceDrawingId: number | null;
  sourceDrawingFullCode: string | null;
  createdAt: string;
}

export interface DrawingSearchFilters {
  drawingNumber?: string;
  exactDrawingNumber?: boolean;
  model?: string;
  brandId?: number;
  mainCategoryId?: number;
  projectItemId?: number;
  colorId?: number;
  status?: DrawingStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface PagedDrawingResult {
  items: DrawingRecord[];
  total: number;
  page: number;
  pageSize: number;
}
