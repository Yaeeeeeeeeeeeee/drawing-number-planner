import type {PdfClassificationInput,PdfClassificationApplyInput,PdfClassificationPreview,PdfClassificationResult} from '../../core/files/pdf-classification';
export type {PdfClassificationInput,PdfClassificationApplyInput,PdfClassificationPreview,PdfClassificationResult,PdfClassificationEntry} from '../../core/files/pdf-classification';
import type { MaterialBatchView } from './client';
import type { PdfManagementInput, PdfManagementApplyInput, PdfManagementPreview, PdfManagementEntry } from '../../core/files/pdf-management';
export type { PdfManagementInput, PdfManagementApplyInput, PdfManagementPreview, PdfManagementEntry };
export interface PdfManagementApi {
 previewPdfClassification?(input:PdfClassificationInput):Promise<PdfClassificationPreview>;
 applyPdfClassification?(input:PdfClassificationApplyInput):Promise<PdfClassificationResult>;
 previewPdfManagement?(input: PdfManagementInput): Promise<PdfManagementPreview>;
 applyPdfManagement?(input: PdfManagementApplyInput): Promise<{changed:number; blocked:PdfManagementEntry[]}>;
 renameMaterialBatch?(id:number, input:{displayName:string;revision?:number}):Promise<MaterialBatchView>;
 diagnoseMaterialBatches?():Promise<{batches:Array<{id:number;relativePath:string;name:string;sameDisplayNameIds:number[]}>;duplicatePaths:unknown[]}>;
}
export function createPdfManagementApi(request:<T>(path:string,init?:RequestInit)=>Promise<T>):Required<PdfManagementApi> {
 const json=(method:string,body:unknown):RequestInit=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 return {
  previewPdfClassification:input=>request('/api/files/classification/preview',json('POST',input)),
  applyPdfClassification:input=>request('/api/files/classification/apply',json('POST',input)),
  previewPdfManagement:input=>request('/api/files/management/preview',json('POST',input)),
  applyPdfManagement:input=>request('/api/files/management/apply',json('POST',input)),
  renameMaterialBatch:(id,input)=>request(`/api/material-batches/${id}`,json('PATCH',input)),
  diagnoseMaterialBatches:()=>request('/api/material-batches/diagnostics'),
 };
}
