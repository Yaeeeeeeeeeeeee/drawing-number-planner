export interface DrawingForceReleaseReferences {
  drawingRecords: number; pdf: number; presentPdf: number; missingPdf: number;
  currentBom: number; historicalBom: number; deletedBom: number; bomSnapshots: number;
  outboundItems: number; outboundSnapshots: number; emailDrafts: number;
  appearanceUsages: number; bindings: number; lineage: number; audits: number; products: number;
}
export interface DrawingForceReleasePreview {
  signedId: number; origin: 'planned'|'historical'; fullCode: string;
  fingerprint: string; references: DrawingForceReleaseReferences;
  affectedProductIds: number[];
  affectedIdentities: Array<{signedId:number;origin:'planned'|'historical'}>;
}
export interface DrawingForceReleaseInput { signedId: number; fingerprint: string; confirmed: boolean; reason?: string }
