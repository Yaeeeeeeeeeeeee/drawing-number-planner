import type {DrawingReuseInput,DrawingReusePreview} from '../../core/drawings/drawing-reuse-service';
import type { DrawingAssociationDiagnosis, DrawingAssociationTarget } from '../../core/drawings/drawing-association-service';
export interface DrawingAssociationSummary { historicalTotal:number; historicalAssociated:number; historicalConfirmedBindings?:number; plannedTotal:number; plannedAssociated:number; plannedConfirmedBindings?:number; ready:number; automaticReady:number; ambiguous:number; conflicts:number; missingProduct:number }
export interface DrawingAssociationResult { updated:number; before?:DrawingAssociationSummary; after?:DrawingAssociationSummary; backupPath?:string }
export interface DrawingAssociationPreviewView { records:DrawingAssociationDiagnosis[]; fingerprint:string; summary?:DrawingAssociationSummary }
export interface DrawingAppearanceApi {
  previewDrawingReuse(input:DrawingReuseInput):Promise<DrawingReusePreview>;
  confirmDrawingReuse(input:DrawingReuseInput&{fingerprint:string;confirmed:true}):Promise<{updated:number}>;
  previewDrawingAssociations(input?:{productId?:number;signedIds?:number[]}):Promise<DrawingAssociationPreviewView>;
  classifyDrawingAssociations(input?:{signedIds?:number[]}):Promise<DrawingAssociationResult>;
  confirmDrawingAssociations(input:{targets:DrawingAssociationTarget[];fingerprint:string;reason:string;confirmed:true}):Promise<DrawingAssociationResult>;
  correctDrawingAssociation(input:DrawingAssociationTarget&{reason:string;confirmed:true}):Promise<DrawingAssociationResult>;
}
export function createDrawingAppearanceApi(request:<T>(path:string,init?:RequestInit)=>Promise<T>):DrawingAppearanceApi {
  const post=<T>(path:string,input:unknown)=>request<T>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  return {classifyDrawingAssociations:(input={})=>post('/api/drawings/association-classify',input),previewDrawingReuse:input=>post('/api/drawings/reuse-preview',input),confirmDrawingReuse:input=>post('/api/drawings/reuse-confirm',input),previewDrawingAssociations:(input={})=>post('/api/drawings/association-preview',input),confirmDrawingAssociations:input=>post('/api/drawings/association-confirm',input),correctDrawingAssociation:input=>post('/api/drawings/association-correct',input)};
}
