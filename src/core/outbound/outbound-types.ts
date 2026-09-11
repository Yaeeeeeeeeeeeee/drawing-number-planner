export interface MaterialSetFileInput {
  pdfIndexId: number;
  fullCode: string;
  fileName: string;
  relativePath: string;
  isPresent: boolean;
  contentSha256: string | null;
}

export interface MaterialSetBatchInput {
  id: number;
  name: string;
  sequenceNumber: number;
  businessDate: string | null;
  files: MaterialSetFileInput[];
}

export type OutboundMaterialStatus = 'normal' | 'carried_forward' | 'needs_confirmation' | 'conflict' | 'missing';
export type OutboundMaterialChange = 'new' | 'replaced' | 'copied' | 'carried_forward' | 'same_code_changed' | 'conflict';

export interface OutboundMaterialSelection {
  slotKey: string;
  fullCode: string | null;
  sourceBatchId: number;
  sourceBatchName: string;
  sourceBatchSequence: number;
  pdfIndexId: number | null;
  fileName: string | null;
  relativePath: string | null;
  contentSha256: string | null;
  status: OutboundMaterialStatus;
  change: OutboundMaterialChange;
  conflictFullCodes: string[];
}
