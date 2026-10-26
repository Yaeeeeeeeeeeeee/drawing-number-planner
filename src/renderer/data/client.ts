import type { DrawingForceReleasePreview } from '../../core/drawings/drawing-force-release-types';
import { createAppearanceApi, type AppearanceApi, type AppearanceVersion } from './appearance-client';
import { createBomAppearanceApi, type BomAppearanceApi } from './bom-appearance-client';
import { createDrawingAppearanceApi, type DrawingAppearanceApi } from './drawing-appearance-client';
import { createPdfManagementApi, type PdfManagementApi } from './pdf-management-client';
import { createQrManualApi, type QrManualApi } from './qr-manual-client';
import { notifyPlannerMutation } from './query-cache';
export type AppearanceVersionView = AppearanceVersion;
import type { DrawingNavigationCounts } from '../../core/drawings/drawing-types.js';
import type { FileNavigationResult } from '../../core/files/file-types.js';
export type PdfNavigationCounts = FileNavigationResult;
import type { ProductCleanupPreview, ProductCleanupSelection } from '../../core/products/product-cleanup-service.js';
export type { ProductCleanupSelection } from '../../core/products/product-cleanup-service.js';
import type { DictionaryDeletionPreview, PermanentDictionaryDeletionInput } from '../../core/dictionaries/dictionary-types.js';
export type { DictionaryDeletionPreview } from '../../core/dictionaries/dictionary-types.js';
import type { OutboundBomContext } from '../../core/outbound/outbound-bom-context.js';
export type ProductCleanupPreviewView = ProductCleanupPreview;
export interface DictionaryItemView {
  id: number; type?: string; code: string; name: string;
  parentId?: number | null; status: 'active' | 'inactive';
  deletedAt?: string | null;
}

export interface ProductView {
  appearanceVersions?: AppearanceVersion[]; currentAppearanceVersionId?: number | null; identityRevision?: number;
  id: number; sku: string | null; brandId: number; brandName: string; productSizeId: number; productSizeName: string;
  defaultAppearanceId: number | null; defaultAppearanceName: string | null;
  model: string; productCategory: string; referenceProductId: number | null;
  referenceProductModel: string | null; status: 'active' | 'inactive';
}

export interface HistoricalProductCandidateView {
  productCategory: string; sku: string; model: string; historicalDrawingCount: number; ambiguous: boolean;
}

export interface ConfirmHistoricalProductCandidateView {
  productCategory: string; sku: string; model: string;
  brandId: number; productSizeId: number; defaultAppearanceId: number;
}

export interface DrawingView {
  appearanceVersionId?: number | null; appearanceVersionLabel?: string | null; associationEvidence?: string[];
  id: number; origin: 'planned' | 'historical'; sku: string | null; fullCode: string; displayName: string;
  productId: number | null; model: string; productCategory: string; brandName: string;
  colorName: string; mainCategoryName: string; projectItemName: string;
  status: 'reserved' | 'active' | 'voided' | 'inactive'; hasSourceFile: boolean; hasOutlinedFile: boolean;
  dictionaryMappingStatus: 'mapped' | 'unmapped'; batchUsage?: DrawingBatchUsageView; [key: string]: unknown;
  deletedAt: string | null; deletionMode: 'retain_occupied' | 'release' | null;
  deletedPreviousStatus: string | null; deletedReason: string | null; occupied: boolean;
}
export interface DrawingFileView {
  presenceStatus?: import('../../core/files/pdf-presence.js').PdfPresenceStatus;
  presenceMessage?: string;
  indexedIsPresent?: boolean;
  pdfIndexId: number; fileName: string; relativePath: string; isPresent: boolean; conversionType: 'source' | 'outlined'; materialBatchId?: number | null;
}
export interface DrawingBomUsageView {
  bomVersionId: number; productId: number; model: string; colorId: number; colorName: string; versionNumber: number;
  projectItemId: number; projectItemName: string; quantity: number; usesWhiteMaterial: boolean;
}
export interface DrawingDetailView extends DrawingView {
  firstOccurrenceBatch?:{id:number;name:string}|null;firstBatchAmbiguous?:boolean;
  firstBom?:{id:number;versionNumber:number;businessDate:string|null;model:string}|null;
  associationHistory?: unknown[];
  sourceFiles: DrawingFileView[]; outlinedFiles: DrawingFileView[]; currentBomUsage: DrawingBomUsageView[];
  businessUsage?: DrawingBusinessUsageView[];
  readOnly: boolean; readOnlyMessage: string | null;
}

export interface DrawingBusinessUsageView {
  origin: 'planned' | 'historical'; recordId: number; productId: number; batchId: number | null; batchName: string | null;
  source: 'bom' | 'outbound'; sourceId: number; current: boolean; sku: string; model: string;
}
export interface DrawingNavigationBatchView extends MaterialBatchView {
  confirmedDrawingCount: number; usageProducts: Array<{productId: number; state: 'current' | 'historical'; drawingCount: number}>;
}
export type BatchUsageStateView = 'current' | 'historical' | 'unbatched' | 'indeterminate';
export interface DrawingBatchUsageView {
  effectiveCurrentFileIds?: number[];
  state: BatchUsageStateView; occurrenceCount: number; currentProductCount: number; historicalProductCount: number;
  conflictWithBusinessStatus: boolean;
  occurrences: Array<{
    batchId: number; productId?: number | null; productDirectory: string; batchName: string; sequenceNumber: number | null;
    recognitionStatus: 'recognized' | 'pending'; usageState: BatchUsageStateView; files: DrawingFileView[];
  }>;
}
export interface MaterialBatchView {
  displayName?: string | null; displayRevision?: number; originalName?: string;
  id: number; relativePath: string; productDirectory: string; productId: number | null;
  productCategory: string | null; sku: string | null; model: string | null; name: string;
  sequenceNumber: number | null; businessDate: string | null; recognitionStatus: 'recognized' | 'pending';
  classificationWarning: string | null; isPresent: boolean; currentState: BatchUsageStateView; fileCount: number;
}
export interface MaterialBatchFileView extends DrawingFileView {
  fullCode: string | null; matchStatus: 'matched' | 'pending' | 'unmatched' | 'conflict';
  classificationWarning: string | null;
}

export interface ImportReportView {
  candidates: Array<{ id: string; type: string; code: string; name: string; sourceCell: string; parentName?: string }>;
  issues: Array<{ code: string; dictionaryType: string; sourceCell: string; message: string; value?: string; candidateIds?: string[] }>;
}

export interface PlanningRowInputView {
  clientId: string; colorId: number; mainCategoryId: number; projectItemId: number; notes?: string;
}
export interface PlanningPreviewView {
  appearanceVersionId?: number;
  productId: number; appearanceId: number;
  rows: Array<{ clientId: string; fullCode: string; displayName: string; prefix: string; sequence: number; available: true }>;
}
export interface ReservedDrawingView {
  id: number; fullCode: string; displayName: string; status: 'reserved';
}

export type BomEntryModeView = 'current' | 'historical';
export type BomDrawingReferenceView = { origin: 'planned'; drawingId: number }
  | { origin: 'historical'; historicalDrawingId: number };
export type BomCandidateView = BomDrawingReferenceView & {
  fullCode: string; displayName: string; projectItemId: number; projectItemName: string;
  status: 'reserved' | 'active' | 'inactive';
};
export interface DrawingReferenceSummaryView {
  pdfCount: number; bomCount: number; previousDrawingCount: number; successorCount: number;
  sourceDrawingCount: number; sourceReferenceCount: number;
}
export interface DrawingDeletionPreviewView {
  signedId: number; origin: 'planned' | 'historical'; fullCode: string; status: DrawingView['status']; deletable: boolean;
  releaseEligible?: boolean; releaseBlockers?: Array<{kind:string;count:number;message:string}>;
  references: Record<string, number>;
  blockers: Array<{ kind: 'current_bom' | 'current_material' | 'lineage'; count: number; message: string }>;
}

export interface ProductReferenceSummaryView {
  referenceProductCount: number; plannedDrawingCount: number; historicalDrawingCount: number;
  materialBatchCount: number; bomCount: number; configuredQrCount: number;
}
export interface BomAssetView {
  id: number; relativePath: string; originalFileName: string; mimeType: string; sizeBytes: number;
  contentSha256: string; createdAt: string;
}
export interface BomItemAssetView extends BomAssetView { assetId: number; role: 'image' | 'diagram'; inheritedFromBomItemAssetId: number | null; inherited?: boolean; }
export interface BomArchiveCandidateView { linkId: number; assetId: number; model: string; businessDate: string | null; project: string; role: 'image' | 'diagram'; relativePath: string; versionId: number; }
export interface BomQrCodeView { id: number; name: string; purposeDisplayName: string; status: 'active' | 'inactive'; }
export interface BomQrCandidateView extends BomQrCodeView { status: 'active'; }
export type BomItemView = BomDrawingReferenceView & {
  bomItemId: number; fullCode: string; displayName: string;
  projectItemId: number; projectItemName: string; status: 'reserved' | 'active' | 'inactive' | 'voided';
  effectiveMaterialBatchId: number | null; effectiveBatchRelativePath: string | null; effectiveBatchName: string | null;
  material: string | null; dimensions: string | null; position: string | null; notes: string | null; usesWhiteMaterial: boolean;
  changeDetails: string | null; assets: BomItemAssetView[]; qrCodes: BomQrCodeView[];
};
export interface BomVersionSummaryView {
  appearanceVersionId?: number | null;
  id: number; productId: number; model: string; versionNumber: number; previousVersionId: number | null;
  businessChangeDate: string | null; businessChangeDateLabel: string; notes: string | null; createdAt: string;
  updatedAt: string; editRevision: number;
}
export interface BomVersionDeletionPreviewView {
  versionId: number; productId: number; model: string; versionNumber: number; isCurrent: boolean;
  fallbackVersionId: number | null; fallbackVersionNumber: number | null;
}
export interface BomVersionDeletionResultView {
  deletedVersionId: number; productId: number; wasCurrent: boolean;
  currentVersionId: number | null; currentVersionNumber: number | null;
}
export interface BomVersionView extends BomVersionSummaryView { items: BomItemView[] }
export interface BomDiffView {
  type: 'added' | 'replaced' | 'removed' | 'unchanged'; projectItemId: number; projectItemName: string;
  previousDrawingId: number | null; previousDrawingReference: BomDrawingReferenceView | null; previousFullCode: string | null;
  drawingId: number | null; drawingReference: BomDrawingReferenceView | null; fullCode: string | null;
}
export interface SaveBomView {
  appearanceVersionId?: number; copyFromVersionId?: number;
  productId: number; entryMode?: BomEntryModeView; businessChangeDate: string; expectedCurrentVersionId: number | null; notes?: string;
  items: Array<{ projectItemId: number; drawingReference: BomDrawingReferenceView; usesWhiteMaterial: boolean; effectiveMaterialBatchId?: number | null;
    material?: string; dimensions?: string; position?: string; notes?: string; changeDetails?: string;
    assets?: Array<{ role: 'image' | 'diagram'; assetId?: number; reusePrevious?: boolean }>; qrCodeIds?: number[] }>;
}

export interface WorkspaceSettingsView {
  workspaceRoot: string | null; configured: boolean; available: boolean;
}
export interface PdfScanSummaryView {
  total: number; matched: number; pending: number; historicalRegistered: number; unmatched: number;
  conflict: number; source: number; outlined: number; missing: number; scanId: number; currentTotal: number;
  comparison: FileScanComparisonView; scannedAt: string;
}
export type QrBusinessStatus = 'active' | 'inactive';
export type QrFileStatus = 'present' | 'missing' | 'none' | 'all';
export interface QrFileView {
  externalFileId?: string;
  id: number; relativePath: string; fileName: string; mimeType: string; isPresent: boolean;
  matchStatus: 'matched' | 'pending' | 'unmatched';
  detectedIdentifier: string | null;
}
export interface QrPurposeView { id: number; key: string; englishName: string; displayName: string;
  defaultForAll: boolean; status: QrBusinessStatus; productCategories: string[] }
export interface ProductQrCodeView {
  canonicalProductId?: number; appearanceVersionId?: number | null; appearanceName?: string | null;
  id: number; productId: number; sku: string | null; model: string; productCategory: string;
  purposeId: number; key: string; englishName: string; displayName: string; purposeStatus: QrBusinessStatus;
  name: string; targetUrl: string | null; status: QrBusinessStatus; createdAt: string; updatedAt: string;
  files: QrFileView[]; pendingFiles: QrFileView[];
}
export interface ProductQrCodeFilters {
  appearanceVersionId?: number;
  productId?: number; purposeId?: number; status?: QrBusinessStatus | 'all'; search?: string;
  productCategory?: string; fileStatus?: QrFileStatus;
}
export type OutboundReferenceStatusView = 'active' | 'inactive';
export type OutboundRecipientTypeView = 'to' | 'cc';
export type OutboundMaterialTypeView = 'initial' | 'update';
export interface OutboundContactView {
  id: number; company: string; contactName: string; email: string; defaultRecipientType: OutboundRecipientTypeView;
  status: OutboundReferenceStatusView; notes: string | null; createdAt: string; updatedAt: string;
}
export interface OutboundContactInputView {
  company: string; contactName: string; email: string; defaultRecipientType: OutboundRecipientTypeView; notes?: string | null;
}
export interface OutboundTemplateBlockView {
  id: number; templateId: number; key: string; name: string; bodyTemplate: string; displayOrder: number;
  status: OutboundReferenceStatusView; createdAt: string; updatedAt: string;
}
export interface OutboundEmailTemplateView {
  manufacturer?: string | null; scenario?: string | null;
  id: number; key: string; name: string; materialType: OutboundMaterialTypeView;
  subjectTemplate: string; bodyTemplate: string; status: OutboundReferenceStatusView;
  createdAt: string; updatedAt: string; blocks: OutboundTemplateBlockView[];
}
export interface OutboundEmailTemplateInputView {
  manufacturer?: string | null; scenario?: string | null;
  key: string; name: string; materialType: OutboundMaterialTypeView; subjectTemplate: string; bodyTemplate: string;
}
export interface OutboundTemplateBlockInputView {
  key: string; name: string; bodyTemplate: string; displayOrder: number;
}
export interface OutboundSignatureView {
  id: number; name: string; content: string; isDefault: boolean; status: OutboundReferenceStatusView;
  createdAt: string; updatedAt: string;
}
export interface OutboundSignatureInputView { name: string; content: string; isDefault: boolean }
export type OutboundPackageModeView = 'change_only' | 'current_complete';
export interface OutboundPackageRequestView {
  regeneratedFromPackageId?:number;workflowVersion?:2; baselineBatchId?:number; baselineConfirmationReason?:string; extraPdfFileIds?:number[];fileConfirmations?:Array<{pdfFileId:number;reason:string;contentSha256?:string}>;
  appearanceVersionId?: number; bomVersionId?: number;
  bomSelections?: Record<string, number>;
  productId: number; selectedMaterialBatchId: number; materialType: OutboundMaterialTypeView; packageMode: OutboundPackageModeView;
}
export interface OutboundPackagePreviewItemView {
  presenceStatus?: import('../../core/files/pdf-presence.js').PdfPresenceStatus;
  contentSha256?:string|null;sizeBytes?:number|null;defaultSelected?:boolean;source?:string;confirmationReason?:string|null;detail?:string|null;
  conversionType?:'source'|'outlined';appearanceVersionId?:number;
  comparison?:{batchId:number;batchName:string;files:Array<{pdfFileId:number;fileName:string;relativePath:string;fullCode:string|null;contentSha256:string|null}>};
  bomContext?: OutboundBomContext;
  slotKey: string; fullCode: string | null; projectItemId: number | null; projectItemName: string;
  pdfFileId: number | null; fileName: string | null; relativePath: string | null; sourceBatchId: number;
  sourceBatchName: string; status: 'normal' | 'carried_forward' | 'needs_confirmation' | 'conflict' | 'missing';
  change: 'new' | 'replaced' | 'copied' | 'carried_forward' | 'same_code_changed' | 'conflict' | 'removed';
  selectable: boolean; conflictFullCodes: string[];
}
export interface OutboundBatchScopeView {id:number;productId:number;name:string;originalName:string;relativePath:string;sequenceNumber:number|null;businessDate:string|null;appearanceVersionId:number|null;completeness:'pending'|'complete'|'partial';revision:number;baselineBatchId:number|null}
export interface OutboundPackagePreviewView { warnings?:string[];baselineBatchId?:number|null;batchCompleteness?:'pending'|'complete'|'partial';bomCheck?:{status:'missing'|'matched'|'partial';missingFullCodes:string[];extraPdfFileIds:number[]};previewToken: string; packageName: string; items: OutboundPackagePreviewItemView[] }
export interface CreatedOutboundPackageView { id: number; packageName: string; zipRelativePath: string; fileCount: number; createdAt: string;
  parts?: Array<{ partNumber: number; zipRelativePath: string; sizeBytes: number;fileCount?:number;contentSha256?:string;files?:Array<{fileName:string;contentSha256:string;pdfFileId:number}> }> }
export interface OutboundHistoryFiltersView {
  brand?:string; model?:string; sku?:string; appearanceVersionId?:number; batchId?:number;
  materialType?:OutboundMaterialTypeView; dateFrom?:string; dateTo?:string;
}
export interface OutboundPreflightView {
  previewToken:string; packageName:string; selectedCount:number; normalCount:number; warningCount:number;
  blockingErrors:Array<{code:string;message:string;pdfFileId?:number}>; warnings:string[]; context:unknown;
}
export interface OutboundHistoryDetailView {
  id:number; context:Record<string,unknown>; files:Array<Record<string,unknown>>; parts:Array<Record<string,unknown>>;
}
export interface OutboundRegenerationView {
  sourcePackageId:number; request:OutboundPackageRequestView; preview:OutboundPackagePreviewView; selectedPdfFileIds:number[];
}
export interface MaterialBatchLogicalMaterialView {
  fullCode: string | null; outlinedFiles: MaterialBatchFileView[]; sourceFiles: MaterialBatchFileView[];
}
export interface FileScanComparisonView { added: number; missing: number; moved: number; changed: number; unchanged: number }
export interface FileScanRunView extends FileScanComparisonView { id: number; completedAt: string; currentTotal: number }
export interface FileScanChangeView { id: number; type: 'added' | 'missing' | 'moved' | 'changed'; relativePath: string;
  indexKind: 'pdf' | 'qr'; previousRelativePath: string | null; fileName: string; fullCode: string | null }
export interface FileScanChangesView { scan: FileScanRunView;
  changes: { added: FileScanChangeView[]; missing: FileScanChangeView[]; changed: FileScanChangeView[] } }
export interface FileIndexClearResultView { pdfFiles: number; qrCodeFiles: number; materialBatches: number; scanChanges: number; scanRuns: number }
export interface FileIndexClearPreviewView { workspaceRoot: string | null; counts: FileIndexClearResultView }
export interface PdfFileView {
  presenceStatus?: import('../../core/files/pdf-presence.js').PdfPresenceStatus;
  presenceMessage?: string;
  contentSha256?:string|null;
  managementState?: 'included' | 'ignored' | 'needs_review';
  id: number; relativePath: string; fileName: string; drawingId: number | null; historicalDrawingId: number | null;
  historicalFullCode: string | null; fullCode: string | null;
  displayName: string | null; productId: number | null; sku: string | null; model: string | null;
  productCategory: string | null; brandName: string | null; projectItemName: string | null;
  colorName: string | null; matchStatus: 'matched' | 'pending' | 'unmatched' | 'conflict'; detectedCodes: string[];
  classificationWarning: string | null;
  conversionType: 'source' | 'outlined'; sizeBytes: number; modifiedAt: string; scannedAt: string; isPresent: boolean;
  pathKey?: string; materialBatchId?: number | null; materialBatchName?: string | null;
  materialBatchStatus?: 'recognized' | 'pending' | null;
}

export type LocalTaskStatusView = 'queued' | 'running' | 'finalizing' | 'completed' | 'failed' | 'cancelled';
export interface LocalTaskView {
  id: string; kind: string; status: LocalTaskStatusView; cancelRequested: boolean; createdAt: string;
  progress: { processed: number; total: number | null; phase: string; message: string };
  startedAt?: string; finishedAt?: string; result?: unknown; error?: { code: string; message: string };
}

export interface PlannerApi extends AppearanceApi, BomAppearanceApi, Partial<DrawingAppearanceApi>, PdfManagementApi, QrManualApi {
  getDrawingNavigationCounts?(filters?: Record<string, string | number | boolean | undefined>): Promise<DrawingNavigationCounts>;
  getDrawingNavigation?(): Promise<{ batches: DrawingNavigationBatchView[];mainCategories?: DrawingNavigationCounts['mainCategories'] }>;
  searchDrawings(filters?: Record<string, string | number | boolean | undefined>): Promise<{ items: DrawingView[]; total: number; page: number; pageSize: number }>;
  getDrawing(id: number): Promise<DrawingDetailView>;
  activateDrawing(id: number): Promise<DrawingDetailView>;
  voidDrawing(id: number): Promise<DrawingDetailView>;
  getDrawingDeletionPreview(id: number): Promise<DrawingDeletionPreviewView>;
  deleteDrawings(items: Array<{ signedId: number; mode: 'retain_occupied' | 'release'; confirmedCode: string }>):
    Promise<{ items: Array<{ signedId: number; status: 'deleted' | 'skipped' | 'failed'; message?: string }> }>;
  getDrawingForceReleasePreview?(id: number): Promise<DrawingForceReleasePreview>;
  forceReleaseDrawing?(id: number, input: {fingerprint:string;confirmed:true;reason?:string}): Promise<{outcome:'force_released';fullCode:string;occupied:false;releaseId:number}>;
  deleteDrawing(id: number, input: { mode: 'retain_occupied' | 'release'; confirmedCode: string; reason?: string }):
    Promise<{ outcome: 'deleted_retained' | 'deleted_released'; fullCode: string; occupied: boolean }>;
  restoreDrawing(id: number): Promise<DrawingDetailView>;
  resolveDeletedDrawingScan(id: number, resolution: 'reimport' | 'ignore'): Promise<unknown>;
  activateHistoricalDrawing(id: number): Promise<DrawingDetailView>;
  deactivateHistoricalDrawing(id: number): Promise<DrawingDetailView>;
  associateDrawingPdf(id: number, pdfIndexId: number, conversionType: 'source' | 'outlined'): Promise<DrawingDetailView>;
  listMaterialBatches(filters?: { search?: string; productId?: number }): Promise<MaterialBatchView[]>;
  getMaterialBatchFiles(id: number): Promise<MaterialBatchFileView[]>;
  getMaterialBatchMaterials(id: number): Promise<MaterialBatchLogicalMaterialView[]>;
  listDictionaries(type: string, includeInactive?: boolean, includeDeleted?: boolean): Promise<DictionaryItemView[]>;
  createDictionary(type: string, input: { code: string; name: string; parentId?: number }): Promise<DictionaryItemView>;
  updateDictionaryName(id: number, name: string): Promise<DictionaryItemView>;
  deactivateDictionary(id: number): Promise<DictionaryItemView>;
  activateDictionary(id: number): Promise<DictionaryItemView>;
  deleteDictionary(id: number): Promise<void>;
  previewPermanentDictionaryDeletion(id: number): Promise<DictionaryDeletionPreview>;
  permanentlyDeleteDictionary(id: number, input: PermanentDictionaryDeletionInput): Promise<void>;
  listProducts(filters?: Record<string, string | number | undefined>): Promise<ProductView[]>;
  createProduct(input: Record<string, unknown>): Promise<ProductView>;
  updateProduct(id: number, input: Record<string, unknown>): Promise<ProductView>;
  deactivateProduct(id: number): Promise<ProductView>;
  activateProduct(id: number): Promise<ProductView>;
  deleteProduct(id: number): Promise<{ deleted: true }>;
  previewProductCleanup(id: number): Promise<ProductCleanupPreviewView>;
  cleanupProduct(id: number, confirmedModel: string, selection?: ProductCleanupSelection): Promise<ProductCleanupPreviewView>;
  listQrCodes(filters?: ProductQrCodeFilters): Promise<{ items: ProductQrCodeView[] }>;
  listQrPurposes(): Promise<{ items: QrPurposeView[] }>;
  createQrPurpose(input: { key: string; englishName: string; displayName: string; defaultForAll: boolean;
    productCategories: string[] }): Promise<QrPurposeView>;
  createQrCode(input: { productId: number; purposeId: number; name: string; targetUrl: string | null;
    status: QrBusinessStatus; qrFileId?: number | null }): Promise<ProductQrCodeView>;
  listPendingQrFiles(productId: number, purposeId: number): Promise<{ items: QrFileView[] }>;
  getQrCode(id: number): Promise<ProductQrCodeView>;
  updateQrCode(id: number, input: { name: string; targetUrl: string | null }): Promise<ProductQrCodeView>;
  activateQrCode(id: number): Promise<ProductQrCodeView>;
  deactivateQrCode(id: number): Promise<ProductQrCodeView>;
  deleteQrCode(id: number): Promise<{ deleted: true }>;
  associateQrFile(id: number, qrFileId: number): Promise<ProductQrCodeView>;
  listOutboundContacts(status?: OutboundReferenceStatusView | 'all'): Promise<OutboundContactView[]>;
  getOutboundContact(id: number): Promise<OutboundContactView>;
  createOutboundContact(input: OutboundContactInputView): Promise<OutboundContactView>;
  updateOutboundContact(id: number, input: OutboundContactInputView): Promise<OutboundContactView>;
  activateOutboundContact(id: number): Promise<OutboundContactView>;
  deactivateOutboundContact(id: number): Promise<OutboundContactView>;
  deleteOutboundContact(id: number): Promise<{ deleted: true }>;
  listOutboundTemplates(status?: OutboundReferenceStatusView | 'all'): Promise<OutboundEmailTemplateView[]>;
  getOutboundTemplate(id: number): Promise<OutboundEmailTemplateView>;
  createOutboundTemplate(input: OutboundEmailTemplateInputView): Promise<OutboundEmailTemplateView>;
  updateOutboundTemplate(id: number, input: OutboundEmailTemplateInputView): Promise<OutboundEmailTemplateView>;
  activateOutboundTemplate(id: number): Promise<OutboundEmailTemplateView>;
  deactivateOutboundTemplate(id: number): Promise<OutboundEmailTemplateView>;
  deleteOutboundTemplate(id: number): Promise<{ deleted: true }>;
  renderOutboundTemplate(id: number, variables: Record<string, string>): Promise<{ subject: string; body: string }>;
  createOutboundTemplateBlock(templateId: number, input: OutboundTemplateBlockInputView): Promise<OutboundTemplateBlockView>;
  updateOutboundTemplateBlock(id: number, input: Omit<OutboundTemplateBlockInputView, 'key'>): Promise<OutboundTemplateBlockView>;
  activateOutboundTemplateBlock(id: number): Promise<OutboundTemplateBlockView>;
  deactivateOutboundTemplateBlock(id: number): Promise<OutboundTemplateBlockView>;
  deleteOutboundTemplateBlock(id: number): Promise<{ deleted: true }>;
  listOutboundSignatures(status?: OutboundReferenceStatusView | 'all'): Promise<OutboundSignatureView[]>;
  getOutboundSignature(id: number): Promise<OutboundSignatureView>;
  createOutboundSignature(input: OutboundSignatureInputView): Promise<OutboundSignatureView>;
  updateOutboundSignature(id: number, input: OutboundSignatureInputView): Promise<OutboundSignatureView>;
  activateOutboundSignature(id: number): Promise<OutboundSignatureView>;
  deactivateOutboundSignature(id: number): Promise<OutboundSignatureView>;
  deleteOutboundSignature(id: number): Promise<{ deleted: true }>;
  listOutboundPackages(productId?: number, filters?:OutboundHistoryFiltersView): Promise<Array<Omit<CreatedOutboundPackageView, 'parts'> & {
    parts: Array<{ partNumber: number; zipRelativePath: string; sizeBytes: number | null; fileCount?:number; contentSha256?:string }> ;
    brand?:string|null;model?:string|null;sku?:string|null;appearanceVersionId?:number|null;appearanceLabel?:string|null;selectedMaterialBatchId?:number;batchName?:string|null;materialType?:OutboundMaterialTypeView;
  }>>;
  getOutboundPackageDetails?(id:number):Promise<OutboundHistoryDetailView>;
  prepareOutboundRegeneration?(id:number):Promise<OutboundRegenerationView>;
  preflightOutboundPackage?(input:OutboundPackageRequestView & {previewToken:string;selectedPdfFileIds:number[]}):Promise<OutboundPreflightView>;
  getOutboundBatchScopes?(productId:number,appearanceVersionId?:number):Promise<OutboundBatchScopeView[]>;
  setOutboundBatchScope?(batchId:number,input:import('../../core/outbound/outbound-batch-workflow').BatchScopeInput):Promise<unknown>;
  previewOutboundPackage(input: OutboundPackageRequestView): Promise<OutboundPackagePreviewView>;
  createOutboundPackage(input: OutboundPackageRequestView & { previewToken: string; selectedPdfFileIds: number[] }): Promise<CreatedOutboundPackageView>;
  listHistoricalProductCandidates(): Promise<HistoricalProductCandidateView[]>;
  confirmHistoricalProductCandidate(input: ConfirmHistoricalProductCandidateView): Promise<{ product: ProductView; linkedHistoricalCount: number }>;
  auditWorkbook(file: File): Promise<{ auditId: string; report: ImportReportView }>;
  confirmImport(auditId: string, selections: string[]): Promise<{ imported: number; skipped: number }>;
  previewPlan(input: { productId: number; appearanceId?: number; appearanceVersionId?: number; rows: PlanningRowInputView[] }): Promise<PlanningPreviewView>;
  reservePlan(input: { productId: number; appearanceId?: number; appearanceVersionId?: number;
    rows: Array<PlanningRowInputView & { expectedFullCode: string }> }): Promise<ReservedDrawingView[]>;
  getCurrentBom(productId: number): Promise<BomVersionView | null>;
  listBomVersions(productId: number): Promise<BomVersionSummaryView[]>;
  queryBomVersions(filters?: { productCategory?: string; productId?: number; mainCategoryId?: number; businessDateFrom?: string; businessDateTo?: string; model?: string; businessChangeDate?: string; effectiveBatchRelativePath?: string; projectItemId?: number; fullCode?: string }): Promise<BomVersionSummaryView[]>;
  getBomVersion(id: number): Promise<BomVersionView>;
  previewBomVersionDeletion(id: number): Promise<BomVersionDeletionPreviewView>;
  deleteBomVersion(id: number, confirmed: boolean): Promise<BomVersionDeletionResultView>;
  deleteProductBom(productId: number, modelConfirmation: string): Promise<{ productId: number; deletedCount: number; currentVersionId: null }>;
  listBomCandidates(input: { productId: number; projectItemId: number; usesWhiteMaterial: boolean; entryMode: BomEntryModeView }): Promise<BomCandidateView[]>;
  listBomQrCandidates(productId: number): Promise<BomQrCandidateView[]>;
  uploadBomAsset(productId: number, file: File): Promise<BomAssetView>;
  previewBomAssetArchive(): Promise<BomArchiveCandidateView[]>;
  archiveBomAssetLink(linkId: number): Promise<{ linkId: number; status: 'archived' | 'unchanged' }>;
  relinkBomMaterialBatch(id: number): Promise<{ relinked: number }>;
  saveBomVersion(input: SaveBomView): Promise<{ version: BomVersionView; diff: BomDiffView[] }>;
  updateBomVersion(id: number, input: Omit<SaveBomView, 'businessChangeDate'> & { businessChangeDate?: string }, expectedRevision: number): Promise<{ version: BomVersionView; diff: BomDiffView[] }>;
  getWorkspaceSettings(): Promise<WorkspaceSettingsView>;
  updateWorkspaceSettings(workspaceRoot: string): Promise<WorkspaceSettingsView>;
  scanPdfFiles(): Promise<PdfScanSummaryView>;
  getLatestFileScan(): Promise<FileScanRunView | null>;
  getFileScanChanges(id: number): Promise<FileScanChangesView>;
  cleanupPdfFiles(ids: number[]): Promise<{ cleaned: number }>;
  getFileIndexClearPreview(): Promise<FileIndexClearPreviewView>;
  clearFileIndex(confirmation: string): Promise<FileIndexClearResultView>;
  getPdfFileNavigation?(filters?: Record<string, string | number | undefined>): Promise<PdfNavigationCounts>;
  searchPdfFiles(filters?: Record<string, string | number | undefined>): Promise<{
    items: PdfFileView[]; total: number; page: number; pageSize: number;
  }>;
  checkServiceHealth(): Promise<{ status: 'ok' }>;
  listLocalTasks(): Promise<LocalTaskView[]>;
  cancelLocalTask(id: string): Promise<LocalTaskView>;
}

export class ApiError extends Error {
  constructor(public readonly code: string, message: string,
    public readonly referenceSummary?: ProductReferenceSummaryView | DrawingReferenceSummaryView | Record<string, number>,
    public readonly variableNames?: string[]) { super(message); }
}

type ResponseBody =
  | { kind: 'empty' }
  | { kind: 'json'; value: any }
  | { kind: 'text'; value: string };

async function fetchLocal(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch {
    throw new ApiError('SERVICE_UNAVAILABLE', '无法连接本地服务，请确认桌面版正在运行');
  }
}

async function readResponseBody(response: Response): Promise<ResponseBody> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiError('INVALID_RESPONSE', '本地服务返回了无法识别的数据');
  }
  if (!text.trim()) return { kind: 'empty' };

  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  const trimmed = text.trim();
  const isJson = contentType.includes('application/json') || contentType.includes('+json')
    || trimmed.startsWith('{') || trimmed.startsWith('[');
  if (!isJson) return { kind: 'text', value: trimmed };
  try {
    return { kind: 'json', value: JSON.parse(text) };
  } catch {
    throw new ApiError('INVALID_RESPONSE', '本地服务返回了无法识别的数据');
  }
}

function responseError(response: Response, body: ResponseBody): ApiError {
  const value = body.kind === 'json' ? body.value : undefined;
  const backendError = value && typeof value === 'object' ? value.error : undefined;
  if (backendError?.code || backendError?.message) {
    return new ApiError(backendError.code ?? 'REQUEST_FAILED', backendError.message ?? '请求失败',
      backendError.referenceSummary, Array.isArray(backendError.variableNames) ? backendError.variableNames : undefined);
  }
  const jsonMessage = value && typeof value === 'object' && typeof value.message === 'string'
    ? value.message
    : undefined;
  if ([502, 503, 504].includes(response.status)) {
    return new ApiError('SERVICE_UNAVAILABLE', body.kind === 'text' ? body.value : jsonMessage ?? '本地服务暂时不可用，请稍后重试');
  }
  return new ApiError('REQUEST_FAILED', body.kind === 'text' ? body.value : jsonMessage ?? `请求失败（HTTP ${response.status}）`);
}

const queryString = (values: object) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method?.toUpperCase() ?? 'GET';
  const write = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const dataMutation = write && !path.includes('preview') && !path.includes('preflight') && !/\/render(?:[?]|$)/.test(path) && !path.startsWith('/api/tasks/');
  const send = async (token = ''): Promise<{ response: Response; body: ResponseBody }> => {
    const headers = { ...(init?.headers as Record<string, string> | undefined), ...(write && token ? { 'x-planner-token': token } : {}) };
    const response = await fetchLocal(path, { ...init, headers });
    return { response, body: await readResponseBody(response) };
  };
  const tokenRequest = write ? sessionToken() : undefined;
  const first = await send(tokenRequest ? await tokenRequest : '');
  const firstValue = first.body.kind === 'json' ? first.body.value : undefined;
  if (!first.response.ok && write && first.response.status === 401 && firstValue?.error?.code === 'INVALID_TOKEN') {
    if (currentSessionToken === tokenRequest) currentSessionToken = undefined;
    const replay = await send(await sessionToken());
    if (!replay.response.ok) throw responseError(replay.response, replay.body);
    if (replay.body.kind === 'text') throw new ApiError('INVALID_RESPONSE', '本地服务返回了无法识别的数据');
    if (dataMutation) notifyPlannerMutation();
    return (replay.body.kind === 'json' ? replay.body.value : undefined) as T;
  }
  if (!first.response.ok) throw responseError(first.response, first.body);
  if (first.body.kind === 'text') throw new ApiError('INVALID_RESPONSE', '本地服务返回了无法识别的数据');
  if (dataMutation) notifyPlannerMutation();
  return (first.body.kind === 'json' ? first.body.value : undefined) as T;
}

let currentSessionToken: Promise<string> | undefined;
export function resetApiSession(): void { currentSessionToken = undefined; }
function sessionToken(): Promise<string> {
  if (currentSessionToken) return currentSessionToken;
  const pending = fetchLocal('/api/session', { method: 'POST' })
    .then(async (response) => {
      const body = await readResponseBody(response);
      if (!response.ok) throw responseError(response, body);
      const value = body.kind === 'json' ? body.value : undefined;
      if (!value || typeof value !== 'object' || typeof value.token !== 'string' || !value.token) {
        throw new ApiError('INVALID_RESPONSE', '本地服务返回了无法识别的数据');
      }
      return value.token;
    });
  currentSessionToken = pending;
  void pending.catch(() => {
    if (currentSessionToken === pending) currentSessionToken = undefined;
  });
  return pending;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body ?? {}),
});

const taskInProgress = (status: LocalTaskStatusView) => ['queued', 'running', 'finalizing'].includes(status);

async function runLocalTask<T>(kind: 'workspace_scan' | 'index_clear' | 'excel_import' | 'outbound_package', payload: unknown): Promise<T> {
  let task = await request<LocalTaskView>(`/api/tasks/${kind}`, json('POST', payload));
  while (taskInProgress(task.status)) {
    task = await request<LocalTaskView>(`/api/tasks/${task.id}`);
    if (taskInProgress(task.status)) await new Promise((resolve) => window.setTimeout(resolve, 200));
  }
  if (task.status === 'completed') { notifyPlannerMutation(); return task.result as T; }
  if (task.status === 'failed') throw new ApiError(task.error?.code ?? 'TASK_FAILED', task.error?.message ?? '任务执行失败');
  throw new ApiError('TASK_CANCELLED', '任务已取消');
}

export const apiClient: PlannerApi = {
  ...createAppearanceApi(request), ...createBomAppearanceApi(request), ...createDrawingAppearanceApi(request),
  ...createPdfManagementApi(request), ...createQrManualApi(request),
  searchDrawings: (filters = {}) => request(`/api/drawings${queryString(filters)}`),
  getDrawingNavigation: () => request('/api/drawings/navigation'),
  getDrawingNavigationCounts: (filters = {}) => request(`/api/drawings/navigation-counts${queryString(filters)}`),
  getDrawing: (id) => request(`/api/drawings/${id}`),
  activateDrawing: (id) => request(`/api/drawings/${id}/activate`, json('POST', { confirmed: true })),
  voidDrawing: (id) => request(`/api/drawings/${id}/void`, json('POST', { confirmed: true })),
  getDrawingForceReleasePreview: (id) => request(`/api/drawings/${id}/force-release-preview`),
  forceReleaseDrawing: (id, input) => request(`/api/drawings/${id}/force-release`, json('POST', input)),
  getDrawingDeletionPreview: (id) => request(`/api/drawings/${id}/deletion-preview`),
  deleteDrawing: (id, input) => request(`/api/drawings/${id}/delete`, json('POST', input)),
  deleteDrawings: (items) => request('/api/drawings/batch-delete', json('POST', { confirmed: true, items })),
  restoreDrawing: (id) => request(`/api/drawings/${id}/restore`, json('POST', { confirmed: true })),
  resolveDeletedDrawingScan: (id, resolution) => request(`/api/drawings/${id}/scan-resolution`, json('POST', { resolution })),
  activateHistoricalDrawing: (id) => request(`/api/historical-drawings/${Math.abs(id)}/activate`, json('POST', { confirmed: true })),
  deactivateHistoricalDrawing: (id) => request(`/api/historical-drawings/${Math.abs(id)}/deactivate`, json('POST', { confirmed: true })),
  associateDrawingPdf: (id, pdfIndexId, conversionType) => request(`/api/drawings/${id}/associate-pdf`,
    json('POST', { pdfIndexId, conversionType })),
  listMaterialBatches: async (filters = {}) => (await request<{ items: MaterialBatchView[] }>(
    `/api/material-batches${queryString(filters)}`)).items,
  getMaterialBatchFiles: async (id) => (await request<{ items: MaterialBatchFileView[] }>(
    `/api/material-batches/${id}/files`)).items,
  getMaterialBatchMaterials: async (id) => (await request<{ items: MaterialBatchLogicalMaterialView[] }>(
    `/api/material-batches/${id}/materials`)).items,
  listDictionaries: async (type, includeInactive = true, includeDeleted = false) => {
    const result = await request<{ items: DictionaryItemView[] }>(`/api/dictionaries/${type}?includeInactive=${includeInactive}${includeDeleted ? '&includeDeleted=true' : ''}`);
    return result.items;
  },
  createDictionary: (type, input) => request(`/api/dictionaries/${type}`, json('POST', input)),
  updateDictionaryName: (id, name) => request(`/api/dictionaries/items/${id}`, json('PATCH', { name })),
  deactivateDictionary: (id) => request(`/api/dictionaries/items/${id}/deactivate`, json('POST')),
  activateDictionary: (id) => request(`/api/dictionaries/items/${id}/activate`, json('POST')),
  deleteDictionary: (id) => request(`/api/dictionaries/items/${id}`, { method: 'DELETE' }),
  previewPermanentDictionaryDeletion: (id) => request(`/api/dictionaries/items/${id}/permanent-deletion`),
  permanentlyDeleteDictionary: (id,input) => request(`/api/dictionaries/items/${id}/permanent`, json('DELETE',input)),
  listProducts: async (filters = {}) => (await request<{ items: ProductView[] }>(`/api/products${queryString(filters)}`)).items,
  createProduct: (input) => request('/api/products', json('POST', input)),
  updateProduct: (id, input) => request(`/api/products/${id}`, json('PUT', input)),
  deactivateProduct: (id) => request(`/api/products/${id}/deactivate`, json('POST')),
  activateProduct: (id) => request(`/api/products/${id}/activate`, json('POST')),
  deleteProduct: (id) => request(`/api/products/${id}`, { method: 'DELETE' }),
  previewProductCleanup: (id) => request(`/api/products/${id}/cleanup-preview`),
  cleanupProduct: (id, confirmedModel, selection) => request(`/api/products/${id}/cleanup`, json('POST', { confirmed: true, confirmedModel, ...(selection ? {selection} : {}) })),
  listQrCodes: (filters = {}) => request(`/api/qr-codes${queryString(filters)}`),
  listQrPurposes: () => request('/api/qr-purposes'),
  createQrPurpose: (input) => request('/api/qr-purposes', json('POST', input)),
  createQrCode: (input) => request('/api/qr-codes', json('POST', input)),
  listPendingQrFiles: (productId, purposeId) => request(`/api/qr-files/pending${queryString({ productId, purposeId })}`),
  getQrCode: (id) => request(`/api/qr-codes/${id}`),
  updateQrCode: (id, input) => request(`/api/qr-codes/${id}`, json('PUT', input)),
  activateQrCode: (id) => request(`/api/qr-codes/${id}/activate`, json('POST')),
  deactivateQrCode: (id) => request(`/api/qr-codes/${id}/deactivate`, json('POST')),
  deleteQrCode: (id) => request(`/api/qr-codes/${id}`, { method: 'DELETE' }),
  associateQrFile: (id, qrFileId) => request(`/api/qr-codes/${id}/associate-file`, json('POST', { qrFileId })),
  listOutboundContacts: async (status = 'all') => (await request<{ items: OutboundContactView[] }>(
    `/api/outbound-reference/contacts${queryString({ status })}`)).items,
  getOutboundContact: (id) => request(`/api/outbound-reference/contacts/${id}`),
  createOutboundContact: (input) => request('/api/outbound-reference/contacts', json('POST', input)),
  updateOutboundContact: (id, input) => request(`/api/outbound-reference/contacts/${id}`, json('PUT', input)),
  activateOutboundContact: (id) => request(`/api/outbound-reference/contacts/${id}/activate`, json('POST')),
  deactivateOutboundContact: (id) => request(`/api/outbound-reference/contacts/${id}/deactivate`, json('POST')),
  deleteOutboundContact: (id) => request(`/api/outbound-reference/contacts/${id}`, { method: 'DELETE' }),
  listOutboundTemplates: async (status = 'all') => (await request<{ items: OutboundEmailTemplateView[] }>(
    `/api/outbound-reference/templates${queryString({ status })}`)).items,
  getOutboundTemplate: (id) => request(`/api/outbound-reference/templates/${id}`),
  createOutboundTemplate: (input) => request('/api/outbound-reference/templates', json('POST', input)),
  updateOutboundTemplate: (id, input) => request(`/api/outbound-reference/templates/${id}`, json('PUT', input)),
  activateOutboundTemplate: (id) => request(`/api/outbound-reference/templates/${id}/activate`, json('POST')),
  deactivateOutboundTemplate: (id) => request(`/api/outbound-reference/templates/${id}/deactivate`, json('POST')),
  deleteOutboundTemplate: (id) => request(`/api/outbound-reference/templates/${id}`, { method: 'DELETE' }),
  renderOutboundTemplate: (id, variables) => request(`/api/outbound-reference/templates/${id}/render`, json('POST', { variables })),
  createOutboundTemplateBlock: (templateId, input) => request(`/api/outbound-reference/templates/${templateId}/blocks`, json('POST', input)),
  updateOutboundTemplateBlock: (id, input) => request(`/api/outbound-reference/blocks/${id}`, json('PUT', input)),
  activateOutboundTemplateBlock: (id) => request(`/api/outbound-reference/blocks/${id}/activate`, json('POST')),
  deactivateOutboundTemplateBlock: (id) => request(`/api/outbound-reference/blocks/${id}/deactivate`, json('POST')),
  deleteOutboundTemplateBlock: (id) => request(`/api/outbound-reference/blocks/${id}`, { method: 'DELETE' }),
  listOutboundSignatures: async (status = 'all') => (await request<{ items: OutboundSignatureView[] }>(
    `/api/outbound-reference/signatures${queryString({ status })}`)).items,
  getOutboundSignature: (id) => request(`/api/outbound-reference/signatures/${id}`),
  createOutboundSignature: (input) => request('/api/outbound-reference/signatures', json('POST', input)),
  updateOutboundSignature: (id, input) => request(`/api/outbound-reference/signatures/${id}`, json('PUT', input)),
  activateOutboundSignature: (id) => request(`/api/outbound-reference/signatures/${id}/activate`, json('POST')),
  deactivateOutboundSignature: (id) => request(`/api/outbound-reference/signatures/${id}/deactivate`, json('POST')),
  deleteOutboundSignature: (id) => request(`/api/outbound-reference/signatures/${id}`, { method: 'DELETE' }),
  listOutboundPackages: (productId, filters={}) => request(`/api/outbound-packages${queryString({productId,...filters})}`),
  getOutboundPackageDetails:id=>request(`/api/outbound-packages/${id}`),
  prepareOutboundRegeneration:id=>request(`/api/outbound-packages/${id}/regeneration-preview`,json('POST')),
  preflightOutboundPackage:input=>request('/api/outbound-packages/preflight',json('POST',input)),
  getOutboundBatchScopes:(productId,appearanceVersionId)=>request(`/api/outbound-batch-scopes${queryString({productId,appearanceVersionId})}`),
  setOutboundBatchScope:(id,input)=>request(`/api/outbound-batch-scopes/${id}`,json('PATCH',input)),
  previewOutboundPackage: (input) => request('/api/outbound-packages/preview', json('POST', input)),
  createOutboundPackage: (input) => runLocalTask('outbound_package', input),
  listHistoricalProductCandidates: async () => (await request<{ items: HistoricalProductCandidateView[] }>(
    '/api/products/historical-candidates')).items,
  confirmHistoricalProductCandidate: (input) => request('/api/products/historical-candidates/confirm', json('POST', input)),
  auditWorkbook: async (file) => {
    const form = new FormData(); form.append('file', file);
    return request('/api/import/excel/audit', { method: 'POST', body: form });
  },
  confirmImport: (auditId, selections) => runLocalTask('excel_import', { auditId, selections }),
  previewPlan: (input) => request('/api/planning/preview', json('POST', input)),
  reservePlan: async (input) => (await request<{ items: ReservedDrawingView[] }>('/api/planning/reserve', json('POST', input))).items,
  getCurrentBom: async (productId) => (await request<{ version: BomVersionView | null }>(
    `/api/boms/current${queryString({ productId })}`)).version,
  listBomVersions: async (productId) => (await request<{ items: BomVersionSummaryView[] }>(
    `/api/boms/versions${queryString({ productId })}`)).items,
  queryBomVersions: async (filters = {}) => (await request<{ items: BomVersionSummaryView[] }>(
    `/api/boms/query${queryString(filters)}`)).items,
  getBomVersion: (id) => request(`/api/boms/versions/${id}`),
  previewBomVersionDeletion: (id) => request(`/api/boms/versions/${id}/delete-preview`),
  previewBomAssetArchive: async () => (await request<{ items: BomArchiveCandidateView[] }>('/api/boms/assets/archive-preview')).items,
  archiveBomAssetLink: (id) => request(`/api/boms/assets/${id}/archive`, { method: 'POST', body: JSON.stringify({ confirmed: true }) }),
  deleteBomVersion: (id, confirmed) => request(`/api/boms/versions/${id}`, json('DELETE', { confirmed })),
  deleteProductBom: (productId, modelConfirmation) => request(`/api/boms/products/${productId}`, json('DELETE', { modelConfirmation })),
  listBomCandidates: async (input) => (await request<{ items: BomCandidateView[] }>(
    `/api/boms/candidates${queryString(input)}`)).items,
  listBomQrCandidates: async (productId) => (await request<{ items: BomQrCandidateView[] }>(
    `/api/boms/qr-candidates${queryString({ productId })}`)).items,
  uploadBomAsset: async (productId, file) => {
    const body = new FormData(); body.append('productId', String(productId)); body.append('file', file);
    return (await request<{ asset: BomAssetView }>('/api/boms/assets', { method: 'POST', body })).asset;
  },
  relinkBomMaterialBatch: (id) => request(`/api/boms/material-batches/${id}/relink`, { method: 'POST' }),
  saveBomVersion: (input) => request('/api/boms/versions', json('POST', input)),
  updateBomVersion: (id, input, expectedRevision) => request(`/api/boms/versions/${id}`, json('PUT', { input, expectedRevision })),
  getWorkspaceSettings: () => request('/api/files/settings'),
  updateWorkspaceSettings: (workspaceRoot) => request('/api/files/settings', json('PUT', { workspaceRoot })),
  scanPdfFiles: () => runLocalTask('workspace_scan', {}),
  getLatestFileScan: () => request('/api/files/scans/latest'),
  getFileScanChanges: (id) => request(`/api/files/scans/${id}/changes`),
  cleanupPdfFiles: (ids) => request('/api/files/cleanup', json('POST', { ids })),
  getFileIndexClearPreview: () => request('/api/files/index/clear-preview'),
  clearFileIndex: (confirmation) => runLocalTask('index_clear', { confirmation }),
  getPdfFileNavigation: (filters = {}) => request(`/api/files/navigation${queryString(filters)}`),
  searchPdfFiles: (filters = {}) => request(`/api/files${queryString(filters)}`),
  checkServiceHealth: () => request('/api/health'),
  listLocalTasks: async () => (await request<{ tasks: LocalTaskView[] }>('/api/tasks')).tasks,
  cancelLocalTask: (id) => request(`/api/tasks/${id}/cancel`, json('POST')),
};

export type {PdfClassificationInput, PdfClassificationApplyInput, PdfClassificationPreview, PdfClassificationEntry, PdfClassificationResult} from './pdf-management-client';
