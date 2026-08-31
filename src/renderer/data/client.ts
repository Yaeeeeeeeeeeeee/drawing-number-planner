export interface DictionaryItemView {
  id: number; type?: string; code: string; name: string;
  parentId?: number | null; status: 'active' | 'inactive';
}

export interface ProductView {
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
  id: number; origin: 'planned' | 'historical'; sku: string | null; fullCode: string; displayName: string;
  productId: number | null; model: string; productCategory: string; brandName: string;
  colorName: string; mainCategoryName: string; projectItemName: string;
  status: 'reserved' | 'active' | 'voided' | 'inactive'; hasSourceFile: boolean; hasOutlinedFile: boolean;
  dictionaryMappingStatus: 'mapped' | 'unmapped'; batchUsage?: DrawingBatchUsageView; [key: string]: unknown;
}
export interface DrawingFileView {
  pdfIndexId: number; fileName: string; relativePath: string; isPresent: boolean; conversionType: 'source' | 'outlined';
}
export interface DrawingBomUsageView {
  bomVersionId: number; productId: number; model: string; colorId: number; colorName: string; versionNumber: number;
  projectItemId: number; projectItemName: string; quantity: number; usesWhiteMaterial: boolean;
}
export interface DrawingDetailView extends DrawingView {
  sourceFiles: DrawingFileView[]; outlinedFiles: DrawingFileView[]; currentBomUsage: DrawingBomUsageView[];
  readOnly: boolean; readOnlyMessage: string | null;
}

export type BatchUsageStateView = 'current' | 'historical' | 'unbatched' | 'indeterminate';
export interface DrawingBatchUsageView {
  state: BatchUsageStateView; occurrenceCount: number; currentProductCount: number; historicalProductCount: number;
  conflictWithBusinessStatus: boolean;
  occurrences: Array<{
    batchId: number; productDirectory: string; batchName: string; sequenceNumber: number | null;
    recognitionStatus: 'recognized' | 'pending'; usageState: BatchUsageStateView; files: DrawingFileView[];
  }>;
}
export interface MaterialBatchView {
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
  productId: number; appearanceId: number;
  rows: Array<{ clientId: string; fullCode: string; displayName: string; prefix: string; sequence: number; available: true }>;
}
export interface ReservedDrawingView {
  id: number; fullCode: string; displayName: string; status: 'reserved';
}

export interface BomCandidateView {
  id: number; fullCode: string; displayName: string; colorId: number; colorName: string;
  projectItemId: number; projectItemName: string; status: 'reserved' | 'active';
}
export interface BomItemView {
  bomItemId: number; drawingId: number; fullCode: string; displayName: string; colorId: number; colorName: string;
  projectItemId: number; projectItemName: string; status: 'reserved' | 'active' | 'voided'; quantity: number;
  notes: string | null; usesWhiteMaterial: boolean;
}
export interface BomVersionSummaryView {
  id: number; productId: number; model: string; colorId: number; colorName: string; versionNumber: number;
  previousVersionId: number | null; notes: string | null; createdAt: string;
}
export interface BomVersionView extends BomVersionSummaryView { items: BomItemView[] }
export interface BomDiffView {
  type: 'added' | 'replaced' | 'removed' | 'unchanged'; projectItemId: number; projectItemName: string;
  previousDrawingId: number | null; previousFullCode: string | null; drawingId: number | null; fullCode: string | null;
}
export interface SaveBomView {
  productId: number; colorId: number; expectedCurrentVersionId: number | null; notes?: string;
  items: Array<{ projectItemId: number; drawingId: number; quantity: number; notes?: string; usesWhiteMaterial: boolean }>;
}

export interface WorkspaceSettingsView {
  workspaceRoot: string | null; configured: boolean; available: boolean;
}
export interface PdfScanSummaryView {
  total: number; matched: number; pending: number; historicalRegistered: number; unmatched: number;
  conflict: number; source: number; outlined: number; missing: number; scanId: number; currentTotal: number;
  comparison: FileScanComparisonView; scannedAt: string;
}
export interface FileScanComparisonView { added: number; missing: number; moved: number; changed: number; unchanged: number }
export interface FileScanRunView extends FileScanComparisonView { id: number; completedAt: string; currentTotal: number }
export interface FileScanChangeView { id: number; type: 'added' | 'missing' | 'moved' | 'changed'; relativePath: string;
  previousRelativePath: string | null; fileName: string; fullCode: string | null }
export interface FileScanChangesView { scan: FileScanRunView;
  changes: { added: FileScanChangeView[]; missing: FileScanChangeView[]; changed: FileScanChangeView[] } }
export interface FileIndexClearResultView { pdfFiles: number; materialBatches: number; scanChanges: number; scanRuns: number }
export interface FileIndexClearPreviewView { workspaceRoot: string | null; counts: FileIndexClearResultView }
export interface PdfFileView {
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

export interface PlannerApi {
  searchDrawings(filters?: Record<string, string | number | boolean | undefined>): Promise<{ items: DrawingView[]; total: number; page: number; pageSize: number }>;
  getDrawing(id: number): Promise<DrawingDetailView>;
  activateDrawing(id: number): Promise<DrawingDetailView>;
  voidDrawing(id: number): Promise<DrawingDetailView>;
  activateHistoricalDrawing(id: number): Promise<DrawingDetailView>;
  deactivateHistoricalDrawing(id: number): Promise<DrawingDetailView>;
  associateDrawingPdf(id: number, pdfIndexId: number, conversionType: 'source' | 'outlined'): Promise<DrawingDetailView>;
  listMaterialBatches(filters?: { search?: string; productId?: number }): Promise<MaterialBatchView[]>;
  getMaterialBatchFiles(id: number): Promise<MaterialBatchFileView[]>;
  listDictionaries(type: string, includeInactive?: boolean): Promise<DictionaryItemView[]>;
  createDictionary(type: string, input: { code: string; name: string; parentId?: number }): Promise<DictionaryItemView>;
  updateDictionaryName(id: number, name: string): Promise<DictionaryItemView>;
  deactivateDictionary(id: number): Promise<DictionaryItemView>;
  activateDictionary(id: number): Promise<DictionaryItemView>;
  deleteDictionary(id: number): Promise<void>;
  listProducts(filters?: Record<string, string | number | undefined>): Promise<ProductView[]>;
  createProduct(input: Record<string, unknown>): Promise<ProductView>;
  updateProduct(id: number, input: Record<string, unknown>): Promise<ProductView>;
  deactivateProduct(id: number): Promise<ProductView>;
  listHistoricalProductCandidates(): Promise<HistoricalProductCandidateView[]>;
  confirmHistoricalProductCandidate(input: ConfirmHistoricalProductCandidateView): Promise<{ product: ProductView; linkedHistoricalCount: number }>;
  auditWorkbook(file: File): Promise<{ auditId: string; report: ImportReportView }>;
  confirmImport(auditId: string, selections: string[]): Promise<{ imported: number; skipped: number }>;
  previewPlan(input: { productId: number; appearanceId?: number; rows: PlanningRowInputView[] }): Promise<PlanningPreviewView>;
  reservePlan(input: { productId: number; appearanceId?: number;
    rows: Array<PlanningRowInputView & { expectedFullCode: string }> }): Promise<ReservedDrawingView[]>;
  getCurrentBom(productId: number, colorId: number): Promise<BomVersionView | null>;
  listBomVersions(productId: number, colorId: number): Promise<BomVersionSummaryView[]>;
  queryBomVersions(filters?: { model?: string; projectItemId?: number; fullCode?: string }): Promise<BomVersionSummaryView[]>;
  getBomVersion(id: number): Promise<BomVersionView>;
  listBomCandidates(input: { productId: number; bomColorId: number; projectItemId: number;
    usesWhiteMaterial: boolean }): Promise<BomCandidateView[]>;
  saveBomVersion(input: SaveBomView): Promise<{ version: BomVersionView; diff: BomDiffView[] }>;
  getWorkspaceSettings(): Promise<WorkspaceSettingsView>;
  updateWorkspaceSettings(workspaceRoot: string): Promise<WorkspaceSettingsView>;
  scanPdfFiles(): Promise<PdfScanSummaryView>;
  getLatestFileScan(): Promise<FileScanRunView | null>;
  getFileScanChanges(id: number): Promise<FileScanChangesView>;
  cleanupPdfFiles(ids: number[]): Promise<{ cleaned: number }>;
  getFileIndexClearPreview(): Promise<FileIndexClearPreviewView>;
  clearFileIndex(confirmation: string): Promise<FileIndexClearResultView>;
  searchPdfFiles(filters?: Record<string, string | number | undefined>): Promise<{
    items: PdfFileView[]; total: number; page: number; pageSize: number;
  }>;
}

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
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
    return new ApiError(backendError.code ?? 'REQUEST_FAILED', backendError.message ?? '请求失败');
  }
  const jsonMessage = value && typeof value === 'object' && typeof value.message === 'string'
    ? value.message
    : undefined;
  if ([502, 503, 504].includes(response.status)) {
    return new ApiError('SERVICE_UNAVAILABLE', body.kind === 'text' ? body.value : jsonMessage ?? '本地服务暂时不可用，请稍后重试');
  }
  return new ApiError('REQUEST_FAILED', body.kind === 'text' ? body.value : jsonMessage ?? `请求失败（HTTP ${response.status}）`);
}

const queryString = (values: Record<string, unknown>) => {
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
    return (replay.body.kind === 'json' ? replay.body.value : undefined) as T;
  }
  if (!first.response.ok) throw responseError(first.response, first.body);
  if (first.body.kind === 'text') throw new ApiError('INVALID_RESPONSE', '本地服务返回了无法识别的数据');
  return (first.body.kind === 'json' ? first.body.value : undefined) as T;
}

let currentSessionToken: Promise<string> | undefined;
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

export const apiClient: PlannerApi = {
  searchDrawings: (filters = {}) => request(`/api/drawings${queryString(filters)}`),
  getDrawing: (id) => request(`/api/drawings/${id}`),
  activateDrawing: (id) => request(`/api/drawings/${id}/activate`, json('POST', { confirmed: true })),
  voidDrawing: (id) => request(`/api/drawings/${id}/void`, json('POST', { confirmed: true })),
  activateHistoricalDrawing: (id) => request(`/api/historical-drawings/${Math.abs(id)}/activate`, json('POST', { confirmed: true })),
  deactivateHistoricalDrawing: (id) => request(`/api/historical-drawings/${Math.abs(id)}/deactivate`, json('POST', { confirmed: true })),
  associateDrawingPdf: (id, pdfIndexId, conversionType) => request(`/api/drawings/${id}/associate-pdf`,
    json('POST', { pdfIndexId, conversionType })),
  listMaterialBatches: async (filters = {}) => (await request<{ items: MaterialBatchView[] }>(
    `/api/material-batches${queryString(filters)}`)).items,
  getMaterialBatchFiles: async (id) => (await request<{ items: MaterialBatchFileView[] }>(
    `/api/material-batches/${id}/files`)).items,
  listDictionaries: async (type, includeInactive = true) => {
    const result = await request<{ items: DictionaryItemView[] }>(`/api/dictionaries/${type}?includeInactive=${includeInactive}`);
    return result.items;
  },
  createDictionary: (type, input) => request(`/api/dictionaries/${type}`, json('POST', input)),
  updateDictionaryName: (id, name) => request(`/api/dictionaries/items/${id}`, json('PATCH', { name })),
  deactivateDictionary: (id) => request(`/api/dictionaries/items/${id}/deactivate`, json('POST')),
  activateDictionary: (id) => request(`/api/dictionaries/items/${id}/activate`, json('POST')),
  deleteDictionary: (id) => request(`/api/dictionaries/items/${id}`, { method: 'DELETE' }),
  listProducts: async (filters = {}) => (await request<{ items: ProductView[] }>(`/api/products${queryString(filters)}`)).items,
  createProduct: (input) => request('/api/products', json('POST', input)),
  updateProduct: (id, input) => request(`/api/products/${id}`, json('PUT', input)),
  deactivateProduct: (id) => request(`/api/products/${id}/deactivate`, json('POST')),
  listHistoricalProductCandidates: async () => (await request<{ items: HistoricalProductCandidateView[] }>(
    '/api/products/historical-candidates')).items,
  confirmHistoricalProductCandidate: (input) => request('/api/products/historical-candidates/confirm', json('POST', input)),
  auditWorkbook: async (file) => {
    const form = new FormData(); form.append('file', file);
    return request('/api/import/excel/audit', { method: 'POST', body: form });
  },
  confirmImport: (auditId, selections) => request('/api/import/excel/confirm', json('POST', { auditId, selections })),
  previewPlan: (input) => request('/api/planning/preview', json('POST', input)),
  reservePlan: async (input) => (await request<{ items: ReservedDrawingView[] }>('/api/planning/reserve', json('POST', input))).items,
  getCurrentBom: async (productId, colorId) => (await request<{ version: BomVersionView | null }>(
    `/api/boms/current${queryString({ productId, colorId })}`)).version,
  listBomVersions: async (productId, colorId) => (await request<{ items: BomVersionSummaryView[] }>(
    `/api/boms/versions${queryString({ productId, colorId })}`)).items,
  queryBomVersions: async (filters = {}) => (await request<{ items: BomVersionSummaryView[] }>(
    `/api/boms/query${queryString(filters)}`)).items,
  getBomVersion: (id) => request(`/api/boms/versions/${id}`),
  listBomCandidates: async (input) => (await request<{ items: BomCandidateView[] }>(
    `/api/boms/candidates${queryString(input)}`)).items,
  saveBomVersion: (input) => request('/api/boms/versions', json('POST', input)),
  getWorkspaceSettings: () => request('/api/files/settings'),
  updateWorkspaceSettings: (workspaceRoot) => request('/api/files/settings', json('PUT', { workspaceRoot })),
  scanPdfFiles: () => request('/api/files/scan', { method: 'POST' }),
  getLatestFileScan: () => request('/api/files/scans/latest'),
  getFileScanChanges: (id) => request(`/api/files/scans/${id}/changes`),
  cleanupPdfFiles: (ids) => request('/api/files/cleanup', json('POST', { ids })),
  getFileIndexClearPreview: () => request('/api/files/index/clear-preview'),
  clearFileIndex: (confirmation) => request('/api/files/index/clear', json('POST', { confirmation })),
  searchPdfFiles: (filters = {}) => request(`/api/files${queryString(filters)}`),
};
