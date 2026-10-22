import type { MaterialBatchView, DrawingBatchUsage } from '../files/material-batch-types.js';

export type PlannedDrawingStatus = 'reserved' | 'active' | 'voided';
export type HistoricalDrawingStatus = 'active' | 'inactive';
export type DrawingStatus = PlannedDrawingStatus | HistoricalDrawingStatus | 'historical';
export type DrawingOrigin = 'planned' | 'historical';
export type FilePresenceFilter = 'present' | 'missing' | 'all';
export type DrawingDeletionState = 'normal' | 'deleted' | 'deleted-retained' | 'deleted-released' | 'all';

export interface DrawingRecord {
  id: number;
  origin: DrawingOrigin;
  sku: string | null;
  fullCode: string;
  displayName: string;
  productId: number | null;
  model: string;
  productCategory: string;
  appearanceVersionId?: number | null;
  appearanceVersionLabel?: string | null;
  associationEvidence?: string[];
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
  deletedAt: string | null;
  deletionMode: 'retain_occupied' | 'release' | null;
  deletedPreviousStatus: string | null;
  deletedReason: string | null;
  occupied: boolean;
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

export interface DrawingBusinessUsage {
  origin: DrawingOrigin;
  recordId: number;
  productId: number;
  batchId: number | null;
  batchName: string | null;
  source: 'bom' | 'outbound';
  sourceId: number;
  current: boolean;
  sku: string;
  model: string;
}

export interface DrawingNavigationBatch extends MaterialBatchView {
  confirmedDrawingCount: number;
  usageProducts: Array<{ productId: number; state: 'current' | 'historical'; drawingCount: number }>;
}

export interface DrawingDetailRecord extends DrawingRecord {
  firstOccurrenceBatch?: {id:number;name:string}|null;
  firstBatchAmbiguous?: boolean;
  firstBom?: {id:number;versionNumber:number;businessDate:string|null;model:string}|null;
  associationHistory?: unknown[];
  sourceFiles: DrawingFileRecord[];
  outlinedFiles: DrawingFileRecord[];
  currentBomUsage: DrawingBomUsage[];
  businessUsage?: DrawingBusinessUsage[];
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
  navigationProductCategory?: string;
  brandId?: number;
  appearanceId?: number;
  appearanceVersionId?: number;
  mainCategoryId?: number;
  projectItemId?: number;
  colorId?: number;
  materialBatchId?: number;
  productId?: number;
  usageBatchId?: number;
  associationState?: 'pending' | 'unassociated';
  status?: DrawingStatus;
  sourcePresence?: FilePresenceFilter;
  outlinedPresence?: FilePresenceFilter;
  keyword?: string;
  deletionState?: DrawingDeletionState;
  page?: number;
  pageSize?: number;
}

export interface PagedDrawingResult {
  items: DrawingRecord[];
  total: number;
  page: number;
  pageSize: number;
}

/** Counts use the same read-only record identity and predicates as the list. */
export interface DrawingNavigationCounts {
  appearances: Array<{appearanceVersionId:number;count:number}>;
  total: number;
  categories: Array<{ name: string; count: number }>;
  products: Array<{ productId: number; count: number }>;
  batches: Array<{ materialBatchId: number; productId: number; count: number }>;
  unassociated: number;
  recycle: number;
}
