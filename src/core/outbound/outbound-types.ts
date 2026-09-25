import type { OutboundBomContext } from './outbound-bom-context.js';
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

export type OutboundPackageMode = 'change_only' | 'current_complete';
export type OutboundPackageMaterialType = 'initial' | 'update';

export interface OutboundPackageRequest {
  bomSelections?: Record<string, number>;
  productId: number;
  selectedMaterialBatchId: number;
  materialType: OutboundPackageMaterialType;
  packageMode: OutboundPackageMode;
}

export interface OutboundPackagePreviewItem {
  bomContext?: OutboundBomContext;
  slotKey: string;
  fullCode: string | null;
  projectItemId: number | null;
  projectItemName: string;
  pdfFileId: number | null;
  fileName: string | null;
  relativePath: string | null;
  sourceBatchId: number;
  sourceBatchName: string;
  status: OutboundMaterialStatus;
  change: OutboundMaterialChange;
  selectable: boolean;
  conflictFullCodes: string[];
}

export interface OutboundPackagePreview {
  previewToken: string;
  packageName: string;
  items: OutboundPackagePreviewItem[];
}

export interface CreateOutboundPackageInput extends OutboundPackageRequest {
  previewToken: string;
  selectedPdfFileIds: number[];
}

export interface CreatedOutboundPackage {
  id: number;
  packageName: string;
  zipRelativePath: string;
  fileCount: number;
  createdAt: string;
}
