export interface DictionaryItemView {
  id: number; type?: string; code: string; name: string;
  parentId?: number | null; status: 'active' | 'inactive';
}

export interface ProductView {
  id: number; brandId: number; brandName: string; productSizeId: number; productSizeName: string;
  defaultAppearanceId: number | null; defaultAppearanceName: string | null;
  model: string; productCategory: string; referenceProductId: number | null;
  referenceProductModel: string | null; status: 'active' | 'inactive';
}

export interface DrawingView {
  id: number; fullCode: string; displayName: string; model: string; brandName: string;
  colorName: string; mainCategoryName: string; projectItemName: string;
  status: 'reserved' | 'active' | 'voided'; [key: string]: unknown;
}

export interface ImportReportView {
  candidates: Array<{ id: string; type: string; code: string; name: string; sourceCell: string; parentName?: string }>;
  issues: Array<{ code: string; dictionaryType: string; sourceCell: string; message: string; value?: string; candidateIds?: string[] }>;
}

export interface PlannerApi {
  searchDrawings(filters?: Record<string, string | number | boolean | undefined>): Promise<{ items: DrawingView[]; total: number; page: number; pageSize: number }>;
  getDrawing(id: number): Promise<DrawingView>;
  listDictionaries(type: string, includeInactive?: boolean): Promise<DictionaryItemView[]>;
  createDictionary(type: string, input: { code: string; name: string; parentId?: number }): Promise<DictionaryItemView>;
  deactivateDictionary(id: number): Promise<DictionaryItemView>;
  listProducts(filters?: Record<string, string | number | undefined>): Promise<ProductView[]>;
  createProduct(input: Record<string, unknown>): Promise<ProductView>;
  updateProduct(id: number, input: Record<string, unknown>): Promise<ProductView>;
  deactivateProduct(id: number): Promise<ProductView>;
  auditWorkbook(file: File): Promise<{ auditId: string; report: ImportReportView }>;
  confirmImport(auditId: string, selections: string[]): Promise<{ imported: number; skipped: number }>;
}

class ApiError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
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
  const response = await fetch(path, init);
  const body = await response.json();
  if (!response.ok) throw new ApiError(body.error?.code ?? 'REQUEST_FAILED', body.error?.message ?? '请求失败');
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

export const apiClient: PlannerApi = {
  searchDrawings: (filters = {}) => request(`/api/drawings${queryString(filters)}`),
  getDrawing: (id) => request(`/api/drawings/${id}`),
  listDictionaries: async (type, includeInactive = true) => {
    const result = await request<{ items: DictionaryItemView[] }>(`/api/dictionaries/${type}?includeInactive=${includeInactive}`);
    return result.items;
  },
  createDictionary: (type, input) => request(`/api/dictionaries/${type}`, json('POST', input)),
  deactivateDictionary: (id) => request(`/api/dictionaries/items/${id}/deactivate`, json('POST')),
  listProducts: async (filters = {}) => (await request<{ items: ProductView[] }>(`/api/products${queryString(filters)}`)).items,
  createProduct: (input) => request('/api/products', json('POST', input)),
  updateProduct: (id, input) => request(`/api/products/${id}`, json('PUT', input)),
  deactivateProduct: (id) => request(`/api/products/${id}/deactivate`, json('POST')),
  auditWorkbook: async (file) => {
    const form = new FormData(); form.append('file', file);
    return request('/api/import/excel/audit', { method: 'POST', body: form });
  },
  confirmImport: (auditId, selections) => request('/api/import/excel/confirm', json('POST', { auditId, selections })),
};
