import type { DimensionProfile, DimensionProfileInput, PackagingArchivePreview, PackagingCatalog, PackagingProductDirectory, PackagingProjectConfig, PackagingTask, PackagingTaskCreate, PackagingTaskItemInput, PackagingTemplate, PackagingTemplateInput, TemplateRule, TemplateRuleInput } from '../../core/packaging/packaging-types';
import type {PdfScanSummaryView} from './client';

export interface PackagingApi {
  getAutomation(): Promise<{platform:string;available:boolean;message:string;blocked?:boolean}>;
  reconcileAutomation(): Promise<{platform:string;available:boolean;message:string;blocked?:boolean}>;
  getCatalog(): Promise<PackagingCatalog>;
  createTemplate(input: PackagingTemplateInput, file: File): Promise<PackagingTemplate>;
  updateTemplate(id: number, input: PackagingTemplateInput): Promise<PackagingTemplate>;
  replaceTemplateFile(id: number, file: File, input?:PackagingTemplateInput): Promise<PackagingTemplate>;
  inspectTemplate(id: number): Promise<{ fields: Array<{objectName:string;matches:number;editable:boolean}>; fonts:string[]; issues:Array<{severity:'error'|'warning';message:string}>; fontValidation:'declared-and-observed-only' }>;
  saveDimension(input: DimensionProfileInput & { id?: number }): Promise<DimensionProfile>;
  saveRule(input: TemplateRuleInput & { id?: number }): Promise<TemplateRule>;
  saveConfig(input: PackagingProjectConfig): Promise<PackagingProjectConfig>;
  getProductDirectories(productId: number): Promise<PackagingProductDirectory[]>;
  createTemporaryDirectories(productIds: number[]): Promise<{items:Array<{productId:number;relativePath?:string;created?:boolean;error?:string}>}>;
  scanProduct(productId:number):Promise<PdfScanSummaryView>;
  listTasks(productId?: number): Promise<PackagingTask[]>;
  createTask(input: PackagingTaskCreate): Promise<PackagingTask>;
  getTask(id: string): Promise<PackagingTask>;
  updateItem(taskId: string, itemId: number, input: PackagingTaskItemInput): Promise<PackagingTask>;
  generate(taskId: string, input?: {itemIds?: number[]; regenerate?: boolean}): Promise<PackagingTask>;
  discover(taskId: string): Promise<PackagingTask>;
  linkFile(taskId: string, fileId: number, itemId: number): Promise<PackagingTask>;
  reviewItem(taskId: string, itemId: number, sha256: string): Promise<PackagingTask>;
  openItem(taskId: string, itemId: number): Promise<unknown>;
  itemFileUrl(taskId: string, itemId: number): string;
  itemBackupUrl(taskId: string, itemId: number): string;
  archivePreview(taskId: string): Promise<PackagingArchivePreview>;
  archive(taskId: string): Promise<PackagingTask>;
}
export function createPackagingApi(request: <T>(path: string, init?: RequestInit) => Promise<T>): PackagingApi {
  const base='/api/packaging';
  const json=(method:string,body?:unknown):RequestInit=>({method,headers:{'content-type':'application/json'},body:JSON.stringify(body??{})});
  const task=(id:string)=>`${base}/tasks/${encodeURIComponent(id)}`;
  return {
    getAutomation:()=>request(`${base}/automation`),reconcileAutomation:()=>request(`${base}/automation/reconcile`,json('POST')),
    getCatalog:()=>request(`${base}/catalog`),
    createTemplate:(metadata,file)=>{const body=new FormData();body.append('metadata',JSON.stringify(metadata));body.append('file',file);return request(`${base}/templates`,{method:'POST',body});},
    updateTemplate:(id,input)=>request(`${base}/templates/${id}`,json('PUT',input)),
    replaceTemplateFile:(id,file,input)=>{const body=new FormData();if(input)body.append('metadata',JSON.stringify(input));body.append('file',file);return request(`${base}/templates/${id}/file`,{method:'POST',body});},
    inspectTemplate:id=>request(`${base}/templates/${id}/inspect`,json('POST')),
    saveDimension:input=>request(`${base}/dimensions`,json('POST',input)),
    saveRule:input=>request(`${base}/rules`,json('POST',input)),
    saveConfig:input=>request(`${base}/configs`,json('POST',input)),
    getProductDirectories:async productId=>(await request<{items:PackagingProductDirectory[]}>(`${base}/product-directories?productId=${productId}`)).items,
    createTemporaryDirectories:productIds=>request(`${base}/create-temporary-directories`,json('POST',{productIds})),
    scanProduct:productId=>request(`${base}/scan-product`,json('POST',{productId})),
    listTasks:async productId=>(await request<{items:PackagingTask[]}>(`${base}/tasks${productId?`?productId=${productId}`:''}`)).items,
    createTask:input=>request(`${base}/tasks`,json('POST',input)),getTask:id=>request(task(id)),
    updateItem:(id,itemId,input)=>request(`${task(id)}/items/${itemId}`,json('PUT',input)),
    generate:(id,input)=>request(`${task(id)}/generate`,json('POST',input)),
    discover:id=>request(`${task(id)}/discover`,json('POST')),
    linkFile:(id,fileId,itemId)=>request(`${task(id)}/files/${fileId}/link`,json('POST',{itemId})),
    reviewItem:(id,itemId,sha256)=>request(`${task(id)}/items/${itemId}/review`,json('POST',{sha256})),
    openItem:(id,itemId)=>request(`${task(id)}/items/${itemId}/open`,json('POST')),
    itemFileUrl:(id,itemId)=>`${task(id)}/items/${itemId}/file`,
    itemBackupUrl:(id,itemId)=>`${task(id)}/items/${itemId}/backup`,
    archivePreview:id=>request(`${task(id)}/archive-preview`),archive:id=>request(`${task(id)}/archive`,json('POST',{confirmed:true})),
  };
}
