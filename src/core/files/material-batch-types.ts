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
