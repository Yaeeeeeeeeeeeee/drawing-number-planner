import type { ParsedDrawingCode } from '../drawings/drawing-code.js';
import type { DirectoryProductContext } from './directory-policy.js';
import type { ParsedMaterialBatch } from './material-batch-types.js';

export type FileMatchStatus = 'matched' | 'pending' | 'unmatched' | 'conflict';
export type ConversionType = 'source' | 'outlined';
export type FilePresence = 'present' | 'missing' | 'all';

export interface DrawingCodeReference { id: number; fullCode: string }

export interface FileScanRecord {
  relativePath: string;
  pathKey?: string;
  fileName: string;
  drawingId: number | null;
  historicalFullCode?: string | null;
  matchStatus: FileMatchStatus;
  detectedCodes: string[];
  conversionType: ConversionType;
  classificationWarning?: string | null;
  sizeBytes: number;
  modifiedAt: string;
  contentSha256?: string | null;
  materialBatch?: ParsedMaterialBatch | null;
}

export interface HistoricalDrawingScanRecord extends ParsedDrawingCode {
  directoryContext: DirectoryProductContext | null;
}

export interface FileSearchFilters {
  materialSource?: boolean;
  managementState?: 'included' | 'ignored' | 'needs_review' | 'all';
  keyword?: string;
  productId?: number;
  appearanceVersionId?: number;
  materialBatchId?: number;
  productCategory?: string;
  unassociatedProduct?: boolean;
  matchStatus?: FileMatchStatus;
  conversionType?: ConversionType;
  presence?: FilePresence;
  page?: number;
  pageSize?: number;
}

export interface PdfFileView extends FileScanRecord {
  presenceStatus?: import('./pdf-presence.js').PdfPresenceStatus;
  presenceMessage?: string;
  id: number;
  managementState?: 'included' | 'ignored' | 'needs_review';
  historicalDrawingId: number | null;
  historicalFullCode: string | null;
  classificationWarning: string | null;
  fullCode: string | null;
  displayName: string | null;
  productId: number | null;
  sku: string | null;
  model: string | null;
  productCategory: string | null;
  brandName: string | null;
  projectItemName: string | null;
  colorName: string | null;
  scannedAt: string;
  isPresent: boolean;
  pathKey: string;
  materialBatchId: number | null;
  materialBatchName: string | null;
  materialBatchStatus: 'recognized' | 'pending' | null;
}

export interface FileSearchResult {
  items: PdfFileView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FileScanComparison {
  added: number; missing: number; moved: number; changed: number; unchanged: number;
}

export interface FileScanRunView extends FileScanComparison {
  id: number; completedAt: string; currentTotal: number;
}

export interface FileScanChangeView {
  id: number; type: 'added' | 'missing' | 'moved' | 'changed'; relativePath: string;
  indexKind: 'pdf' | 'qr'; previousRelativePath: string | null; fileName: string; fullCode: string | null;
}

export interface FileScanChangesView {
  scan: FileScanRunView;
  changes: { added: FileScanChangeView[]; missing: FileScanChangeView[]; changed: FileScanChangeView[] };
}

/** Manual filters shared by the file list and navigation counts; navigation scope is excluded. */
export type FileNavigationFilters = Pick<FileSearchFilters, 'keyword' | 'matchStatus' | 'conversionType' | 'presence' | 'managementState'>;

export interface FileNavigationResult {
  sources?: Array<{productId:number;count:number}>;
  /** Stable ownership of indexed batches, independent of the current manual filters. */
  batchProducts?: Array<{materialBatchId:number;productId:number|null}>;
  appearances?: Array<{appearanceVersionId:number;count:number}>;
  appearanceBatches?: Array<{appearanceVersionId:number;materialBatchId:number;productId:number|null;count:number}>;
  total: number;
  unassociatedProducts: number;
  categories: Array<{ name: string; count: number }>;
  products: Array<{ productId: number; count: number }>;
  batches: Array<{ materialBatchId: number; productId: number | null; count: number }>;
}

export type {PdfClassificationInput, PdfClassificationApplyInput, PdfClassificationPreview, PdfClassificationEntry, PdfClassificationResult} from './pdf-classification.js';
