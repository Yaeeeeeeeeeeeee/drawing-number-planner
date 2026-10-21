export type BomDiffType = 'added' | 'replaced' | 'removed' | 'unchanged';
export type BomAssetRole = 'image' | 'diagram';
export type BomEntryMode = 'current' | 'historical';
export type BomDrawingReference = { origin: 'planned'; drawingId: number }
  | { origin: 'historical'; historicalDrawingId: number };

export interface BomItemAssetInput { role: BomAssetRole; assetId?: number; reusePrevious?: boolean }
export interface BomItemAssetRecord {
  inherited: boolean;
  id: number; assetId: number; role: BomAssetRole; inheritedFromBomItemAssetId: number | null;
  relativePath: string; originalFileName: string; mimeType: string; sizeBytes: number; contentSha256: string; createdAt: string;
}
export interface BomQrCodeRecord { id: number; name: string; status: 'active' | 'inactive'; purposeDisplayName: string }

interface BomItemInputFields {
  projectItemId: number;
  /** Compatibility-only. New BOM records always persist quantity as 1. */
  quantity?: number;
  effectiveBatchRelativePath?: string;
  effectiveBatchName?: string;
  effectiveMaterialBatchId?: number | null;
  material?: string;
  dimensions?: string;
  position?: string;
  assets?: BomItemAssetInput[];
  qrCodeIds?: number[];
  notes?: string;
  changeDetails?: string;
  usesWhiteMaterial: boolean;
}
export type BomItemInput = BomItemInputFields & (
  | { drawingReference: BomDrawingReference; drawingId?: never }
  /** Deprecated request compatibility. New clients use drawingReference. */
  | { drawingReference?: never; drawingId: number }
);

export interface SaveBomInput {
  appearanceVersionId?: number;
  copyFromVersionId?: number;
  productId: number;
  entryMode?: BomEntryMode;
  businessChangeDate?: string;
  /** Deprecated compatibility field; product-level BOMs do not use it. */
  colorId?: number;
  expectedCurrentVersionId: number | null;
  notes?: string;
  items: BomItemInput[];
}

interface BomCandidateFields {
  fullCode: string;
  displayName: string;
  colorId: number | null;
  colorName: string;
  projectItemId: number;
  projectItemName: string;
  status: 'reserved' | 'active' | 'inactive';
}
export type BomCandidate = BomCandidateFields & BomDrawingReference;

interface BomItemRecordFields {
  bomItemId: number;
  fullCode: string;
  displayName: string;
  colorId: number | null;
  colorName: string;
  projectItemId: number;
  projectItemName: string;
  status: 'reserved' | 'active' | 'inactive' | 'voided';
  /** Compatibility-only; every newly saved value is 1. */
  quantity: number;
  effectiveBatchRelativePath: string | null;
  effectiveBatchName: string | null;
  effectiveMaterialBatchId: number | null;
  material: string | null;
  dimensions: string | null;
  position: string | null;
  assets: BomItemAssetRecord[];
  qrCodes: BomQrCodeRecord[];
  notes: string | null;
  changeDetails: string | null;
  usesWhiteMaterial: boolean;
}
export type BomItemRecord = BomItemRecordFields & BomDrawingReference;

export interface BomVersionSummary {
  appearanceVersionId: number | null;
  updatedAt: string;
  editRevision: number;
  id: number;
  productId: number;
  model: string;
  versionNumber: number;
  previousVersionId: number | null;
  businessChangeDate: string | null;
  businessChangeDateLabel: string;
  legacyColorId: number | null;
  legacyColorName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface BomVersionDeletionPreview {
  versionId: number;
  productId: number;
  model: string;
  versionNumber: number;
  isCurrent: boolean;
  fallbackVersionId: number | null;
  fallbackVersionNumber: number | null;
}

export interface BomVersionDeletionResult {
  deletedVersionId: number;
  productId: number;
  wasCurrent: boolean;
  currentVersionId: number | null;
  currentVersionNumber: number | null;
}

export interface ProductBomDeletionResult {
  productId: number;
  deletedCount: number;
  currentVersionId: null;
}

export interface BomQueryFilters {
  appearanceVersionId?: number;
  model?: string;
  businessChangeDate?: string;
  effectiveBatchRelativePath?: string;
  projectItemId?: number;
  fullCode?: string;
}

export interface BomVersionDetail extends BomVersionSummary {
  items: BomItemRecord[];
}

export interface BomDiffEntry {
  type: BomDiffType;
  projectItemId: number;
  projectItemName: string;
  previousDrawingId: number | null;
  previousDrawingReference: BomDrawingReference | null;
  previousFullCode: string | null;
  drawingId: number | null;
  drawingReference: BomDrawingReference | null;
  fullCode: string | null;
}

export interface SavedBomVersion {
  version: BomVersionDetail;
  diff: BomDiffEntry[];
}

export interface BomCandidateInput {
  appearanceVersionId?: number;
  includeReusableMaterials?: boolean;
  productId: number;
  entryMode?: BomEntryMode;
  /** Deprecated compatibility field; candidate color is determined by the drawing. */
  bomColorId?: number;
  projectItemId: number;
  usesWhiteMaterial: boolean;
}
