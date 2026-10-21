import type { MaterialBatchView } from './client';
import type { PdfManagementInput, PdfManagementApplyInput, PdfManagementPreview, PdfManagementEntry } from '../../core/files/pdf-management';
export type { PdfManagementInput, PdfManagementApplyInput, PdfManagementPreview, PdfManagementEntry };
export interface PdfManagementApi {
 previewPdfManagement?(input: PdfManagementInput): Promise<PdfManagementPreview>;
 applyPdfManagement?(input: PdfManagementApplyInput): Promise<{changed:number; blocked:PdfManagementEntry[]}>;
 renameMaterialBatch?(id:number, input:{displayName:string;revision?:number}):Promise<MaterialBatchView>;
 diagnoseMaterialBatches?():Promise<{batches:Array<{id:number;relativePath:string;name:string;sameDisplayNameIds:number[]}>;duplicatePaths:unknown[]}>;
}
export function createPdfManagementApi(request:<T>(path:string,init?:RequestInit)=>Promise<T>):Required<PdfManagementApi> {
 return {
  previewPdfManagement:input=>request('/api/files/management/preview',{method:'POST',body:JSON.stringify(input)}),
  applyPdfManagement:input=>request('/api/files/management/apply',{method:'POST',body:JSON.stringify(input)}),
  renameMaterialBatch:(id,input)=>request(`/api/material-batches/${id}`,{method:'PATCH',body:JSON.stringify(input)}),
  diagnoseMaterialBatches:()=>request('/api/material-batches/diagnostics'),
 };
}
