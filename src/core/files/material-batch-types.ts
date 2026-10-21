import type { DirectoryProductContext } from './directory-policy.js';

export type MaterialBatchRecognitionStatus = 'recognized' | 'pending';

export interface ParsedMaterialBatch {
  relativePath: string;
  productDirectory: string;
  directoryContext: DirectoryProductContext | null;
  name: string;
  sequenceNumber: number | null;
  businessDate: string | null;
  recognitionStatus: MaterialBatchRecognitionStatus;
  classificationWarning: string | null;
}

export type BatchUsageState = 'current' | 'historical' | 'unbatched' | 'indeterminate';
export type CurrentBatchSelection =
  | { status: 'selected'; batchId: number }
  | { status: 'indeterminate' | 'none'; batchId: null };

export interface BatchFileInstance {
  pdfIndexId: number;
  fileName: string;
  relativePath: string;
  isPresent: boolean;
  conversionType: 'source' | 'outlined';
}

export interface DrawingBatchOccurrence {
  batchId: number;
  productId?: number | null;
  productDirectory: string;
  batchName: string;
  sequenceNumber: number | null;
  recognitionStatus: MaterialBatchRecognitionStatus;
  usageState: BatchUsageState;
  files: BatchFileInstance[];
}

export interface DrawingBatchUsage {
  effectiveCurrentFileIds?: number[];
  state: BatchUsageState;
  occurrenceCount: number;
  currentProductCount: number;
  historicalProductCount: number;
  conflictWithBusinessStatus: boolean;
  occurrences: DrawingBatchOccurrence[];
}

export interface MaterialBatchView {
  displayName?: string | null;
  displayRevision?: number;
  originalName?: string;
  id: number;
  relativePath: string;
  productDirectory: string;
  productId: number | null;
  productCategory: string | null;
  sku: string | null;
  model: string | null;
  name: string;
  sequenceNumber: number | null;
  businessDate: string | null;
  recognitionStatus: MaterialBatchRecognitionStatus;
  classificationWarning: string | null;
  isPresent: boolean;
  currentState: BatchUsageState;
  fileCount: number;
}

export interface MaterialBatchFileView extends BatchFileInstance {
  fullCode: string | null;
  matchStatus: 'matched' | 'pending' | 'unmatched' | 'conflict';
  classificationWarning: string | null;
}

export interface MaterialBatchLogicalMaterialView {
  fullCode: string | null;
  outlinedFiles: MaterialBatchFileView[];
  sourceFiles: MaterialBatchFileView[];
}
