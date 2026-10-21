export type AppearanceStatus = 'draft' | 'current' | 'historical';
export interface AppearanceVersion {
  id: number; productId: number; versionNumber: number; appearanceId: number | null;
  label: string; colorIds: number[]; status: AppearanceStatus; predecessorId: number | null; revision: number;
  createdAt: string; activatedAt: string | null;
}
export interface AppearanceDraftInput { appearanceId?: number | null; label: string; colorIds?: number[]; predecessorId?: number | null; }
export interface AppearanceDraftUpdate extends AppearanceDraftInput { expectedRevision: number; }
export interface AppearanceActivationInput { expectedRevision: number; expectedIdentityRevision: number; }
export interface AppearanceList { items: AppearanceVersion[]; productId: number; revision: number; }
export interface ProductMergeInput { primaryProductId: number; aliasProductIds: number[]; }
export interface ProductMergeReference { table: string; ids: number[]; }
export interface ProductMergePreview extends ProductMergeInput {
  fingerprint: string; revision: number; references: ProductMergeReference[];
  versions: AppearanceVersion[]; qrConflicts: Array<{ purposeId: number; qrCodeIds: number[] }>;
  blockers: string[];
}
export interface ProductMergeConfirm extends ProductMergeInput { confirmed: true; expectedFingerprint: string; expectedRevision: number; }
export interface AppearanceResources {
 appearanceVersionId: number;
 colorIds: number[];
 drawings: Array<{id:number;origin:'planned'|'historical';fullCode:string;source:string}>;
 pdfs: Array<{id:number;fileName:string;relativePath:string;source:'drawing-association'}>;
 qrCodes: Array<{id:number;name:string;targetUrl:string|null;status:string;appearanceVersionId:number|null}>;
 outboundPackages: Array<{id:number;packageName:string;createdAt:string}>;
 unboundCounts: {drawings:number;pdfs:number;qrCodes:number;boms:number;outboundPackages:number};
}
