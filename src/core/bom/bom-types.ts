export type BomDiffType = 'added' | 'replaced' | 'removed' | 'unchanged';

export interface BomItemInput {
  projectItemId: number;
  drawingId: number;
  quantity: number;
  notes?: string;
  usesWhiteMaterial: boolean;
}

export interface SaveBomInput {
  productId: number;
  colorId: number;
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
  status: 'reserved' | 'active';
  quantity: number;
  notes: string | null;
  usesWhiteMaterial: boolean;
}

export interface BomVersionSummary {
  id: number;
  productId: number;
  model: string;
  colorId: number;
  colorName: string;
  versionNumber: number;
  previousVersionId: number | null;
  notes: string | null;
  createdAt: string;
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
  bomColorId: number;
  projectItemId: number;
  usesWhiteMaterial: boolean;
}
