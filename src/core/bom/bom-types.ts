export type BomDiffType = 'added' | 'replaced' | 'removed' | 'unchanged';
export type BomAssetRole = 'image' | 'diagram';

export interface BomItemAssetInput { role: BomAssetRole; assetId?: number; reusePrevious?: boolean }
export interface BomItemAssetRecord {
  id: number; assetId: number; role: BomAssetRole; inheritedFromBomItemAssetId: number | null;
  relativePath: string; originalFileName: string; mimeType: string;
}
export interface BomQrCodeRecord { id: number; name: string; status: 'active' | 'inactive'; purposeDisplayName: string }

export interface BomItemInput {
  projectItemId: number;
  drawingId: number;
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
  usesWhiteMaterial: boolean;
}

export interface SaveBomInput {
  productId: number;
  businessChangeDate?: string;
  /** Deprecated compatibility field; product-level BOMs do not use it. */
  colorId?: number;
  expectedCurrentVersionId: number | null;
  notes?: string;
  items: BomItemInput[];
}

export interface BomCandidate {
  id: number;
  fullCode: string;
  displayName: string;
  colorId: number;
  colorName: string;
  projectItemId: number;
  projectItemName: string;
  status: 'reserved' | 'active';
}

export interface BomItemRecord {
  bomItemId: number;
  drawingId: number;
  fullCode: string;
  displayName: string;
  colorId: number;
  colorName: string;
  projectItemId: number;
  projectItemName: string;
  status: 'reserved' | 'active' | 'voided';
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
  usesWhiteMaterial: boolean;
}

export interface BomVersionSummary {
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

export interface BomQueryFilters {
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
  previousFullCode: string | null;
  drawingId: number | null;
  fullCode: string | null;
}

export interface SavedBomVersion {
  version: BomVersionDetail;
  diff: BomDiffEntry[];
}

export interface BomCandidateInput {
  productId: number;
  /** Deprecated compatibility field; candidate color is determined by the drawing. */
  bomColorId?: number;
  projectItemId: number;
  usesWhiteMaterial: boolean;
}
