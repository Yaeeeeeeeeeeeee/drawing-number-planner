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
export type OutboundMaterialChange = 'new' | 'replaced' | 'copied' | 'carried_forward' | 'same_code_changed' | 'conflict' | 'removed';

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
  regeneratedFromPackageId?:number;workflowVersion?: 2; extraPdfFileIds?:number[]; baselineBatchId?:number; baselineConfirmationReason?:string; fileConfirmations?:Array<{pdfFileId:number;reason:string;contentSha256?:string}>;
  appearanceVersionId?: number;
  bomVersionId?: number;
  bomSelections?: Record<string, number>;
  productId: number;
  selectedMaterialBatchId: number;
  materialType: OutboundPackageMaterialType;
  packageMode: OutboundPackageMode;
}

export interface OutboundPackagePreviewItem {
  contentSha256?:string|null;sizeBytes?:number|null;defaultSelected?:boolean;source?:string;confirmationReason?:string|null;detail?:string|null;
  comparison?:{batchId:number;batchName:string;files:Array<{pdfFileId:number;fileName:string;relativePath:string;fullCode:string|null;contentSha256:string|null}>};
  conversionType?:'source'|'outlined';appearanceVersionId?:number;
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
  warnings?:string[];baselineBatchId?:number|null;batchCompleteness?:'pending'|'complete'|'partial';
  bomCheck?:{status:'missing'|'matched'|'partial';missingFullCodes:string[];extraPdfFileIds:number[]};
  previewToken: string;
  packageName: string;
  items: OutboundPackagePreviewItem[];
}

export interface CreateOutboundPackageInput extends OutboundPackageRequest {
  previewToken: string;
  selectedPdfFileIds: number[];
}

export interface CreatedOutboundPackage {
  parts?: Array<{ partNumber: number; zipRelativePath: string; sizeBytes: number; fileCount?:number;contentSha256?:string;files?:Array<{fileName:string;contentSha256:string;pdfFileId:number}> }>;
  id: number;
  packageName: string;
  zipRelativePath: string;
  fileCount: number;
  createdAt: string;
}

export interface OutboundHistoryFilters {
  brand?:string;model?:string;sku?:string;appearanceVersionId?:number;batchId?:number;
  materialType?:OutboundPackageMaterialType;dateFrom?:string;dateTo?:string;
}

export interface OutboundPreflightResult {
  previewToken:string;packageName:string;selectedCount:number;normalCount:number;warningCount:number;
  blockingErrors:Array<{code:string;message:string;pdfFileId?:number}>;warnings:string[];context:unknown;
}
