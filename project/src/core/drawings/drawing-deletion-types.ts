import type { DrawingDetailRecord, DrawingOrigin, DrawingStatus } from './drawing-types.js';

export type DrawingDeletionMode = 'retain_occupied' | 'release';
export type DrawingDeletionOutcome = 'deleted_retained' | 'deleted_released';

export interface DrawingDeletionReferenceCounts {
  presentPdf: number;
  missingPdf: number;
  sourcePdf: number;
  outlinedPdf: number;
  currentBom: number;
  historicalBom: number;
  deletedBom?: number;
  bomSnapshots?: number;
  currentMaterial: number;
  historicalMaterial: number;
  lineage: number;
  outboundSnapshot: number;
  emailDraft: number;
  qrCode: number;
}

export interface DrawingDeletionBlocker {
  kind: 'current_bom' | 'current_material' | 'lineage' | 'appearance_usage' | 'historical_occupation' | 'usage_unproven' | 'protected_history';
  count: number;
  message: string;
}

export interface DrawingDeletionPreview {
  signedId: number;
  origin: DrawingOrigin;
  fullCode: string;
  status: DrawingStatus;
  deletable: boolean;
  releaseEligible: boolean;
  releaseBlockers: DrawingDeletionBlocker[];
  references: DrawingDeletionReferenceCounts;
  blockers: DrawingDeletionBlocker[];
}

export interface DrawingDeletionResult {
  outcome: DrawingDeletionOutcome;
  fullCode: string;
  occupied: boolean;
}

export interface DeleteDrawingInput {
  signedId: number;
  mode: DrawingDeletionMode;
  confirmedCode: string;
  reason?: string;
}

export type RestoredDrawing = DrawingDetailRecord;
