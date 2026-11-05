import type { AppearanceResources, AppearanceActivationInput, AppearanceDraftInput, AppearanceDraftUpdate, AppearanceList, AppearanceVersion, ProductMergeConfirm, ProductMergeInput, ProductMergePreview } from '../../core/products/appearance-types';
export type { AppearanceList, AppearanceVersion };
export interface AppearanceApi {
  getAppearanceResources?(id: number): Promise<AppearanceResources>;
  listAppearanceVersions?(productId: number): Promise<AppearanceList>;
  getAppearanceVersion?(id: number): Promise<AppearanceVersion>;
  createAppearanceDraft?(productId: number, input: AppearanceDraftInput): Promise<AppearanceVersion>;
  updateAppearanceDraft?(id: number, input: AppearanceDraftUpdate): Promise<AppearanceVersion>;
  activateAppearanceVersion?(id: number, input: AppearanceActivationInput): Promise<AppearanceVersion>;
  previewProductMerge?(input: ProductMergeInput): Promise<ProductMergePreview>;
  confirmProductMerge?(input: ProductMergeConfirm): Promise<unknown>;
}
export function createAppearanceApi(request: <T>(path: string, init?: RequestInit) => Promise<T>): AppearanceApi {
  const json = (method: string, body: unknown): RequestInit => ({method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
  return {
    getAppearanceResources: id => request(`/api/appearances/${id}/resources`),
    listAppearanceVersions: id => request(`/api/products/${id}/appearances`),
    getAppearanceVersion: id => request(`/api/appearances/${id}`),
    createAppearanceDraft: (id,input) => request(`/api/products/${id}/appearances`,json('POST',input)),
    updateAppearanceDraft: (id,input) => request(`/api/appearances/${id}`,json('PUT',input)),
    activateAppearanceVersion: (id,input) => request(`/api/appearances/${id}/activate`,json('POST',input)),
    previewProductMerge: input => request('/api/products/merge-preview',json('POST',input)),
    confirmProductMerge: input => request('/api/products/merge-confirm',json('POST',input)),
  };
}
