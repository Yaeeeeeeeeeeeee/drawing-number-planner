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
  productDirectory: string;
  batchName: string;
  sequenceNumber: number | null;
  recognitionStatus: MaterialBatchRecognitionStatus;
  usageState: BatchUsageState;
  files: BatchFileInstance[];
}

export interface DrawingBatchUsage {
  state: BatchUsageState;
  occurrenceCount: number;
  currentProductCount: number;
  historicalProductCount: number;
  conflictWithBusinessStatus: boolean;
  occurrences: DrawingBatchOccurrence[];
}
