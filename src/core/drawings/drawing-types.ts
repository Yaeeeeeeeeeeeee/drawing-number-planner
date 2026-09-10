import type { DrawingBatchUsage } from '../files/material-batch-types.js';

export type PlannedDrawingStatus = 'reserved' | 'active' | 'voided';
export type HistoricalDrawingStatus = 'active' | 'inactive';
export type DrawingStatus = PlannedDrawingStatus | HistoricalDrawingStatus | 'historical';
export type DrawingOrigin = 'planned' | 'historical';
export type FilePresenceFilter = 'present' | 'missing' | 'all';

export interface DrawingRecord {
  id: number;
  origin: DrawingOrigin;
  sku: string | null;
  fullCode: string;
  displayName: string;
  productId: number | null;
  model: string;
  productCategory: string;
  appearanceId: number | null;
  appearanceName: string;
  brandId: number | null;
  brandName: string;
  colorId: number | null;
  colorName: string;
  mainCategoryId: number | null;
  mainCategoryName: string;
  projectItemId: number | null;
  projectItemName: string;
  brandCode: string;
  productSizeCode: string;
  appearanceCode: string;
  colorCode: string;
  mainCategoryCode: string;
  projectItemCode: string;
  sequence: number;
  status: DrawingStatus;
  previousDrawingId: number | null;
  previousFullCode: string | null;
  changeReason: string | null;
  sourceProductId: number | null;
  sourceProductModel: string | null;
  sourceDrawingId: number | null;
  sourceDrawingFullCode: string | null;
  notes: string | null;
  createdAt: string;
  hasSourceFile: boolean;
  hasOutlinedFile: boolean;
  dictionaryMappingStatus: 'mapped' | 'unmapped';
  batchUsage?: DrawingBatchUsage;
}

export interface DrawingFileRecord {
  pdfIndexId: number;
  fileName: string;
  relativePath: string;
  isPresent: boolean;
  conversionType: 'source' | 'outlined';
}

export interface DrawingBomUsage {
  bomVersionId: number;
  productId: number;
  model: string;
  colorId: number;
  colorName: string;
  versionNumber: number;
  projectItemId: number;
  projectItemName: string;
  quantity: number;
  usesWhiteMaterial: boolean;
}

export interface DrawingDetailRecord extends DrawingRecord {
  sourceFiles: DrawingFileRecord[];
  outlinedFiles: DrawingFileRecord[];
  currentBomUsage: DrawingBomUsage[];
  readOnly: boolean;
  readOnlyMessage: string | null;
  batchUsage: DrawingBatchUsage;
}

export interface DrawingSearchFilters {
  drawingNumber?: string;
  exactDrawingNumber?: boolean;
  model?: string;
  sku?: string;
  productCategory?: string;
  brandId?: number;
  appearanceId?: number;
  mainCategoryId?: number;
  projectItemId?: number;
  colorId?: number;
  materialBatchId?: number;
  status?: DrawingStatus;
  sourcePresence?: FilePresenceFilter;
  outlinedPresence?: FilePresenceFilter;
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
