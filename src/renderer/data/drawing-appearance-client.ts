import type {DrawingReuseInput,DrawingReusePreview} from '../../core/drawings/drawing-reuse-service';
import type { DrawingAssociationDiagnosis, DrawingAssociationTarget } from '../../core/drawings/drawing-association-service';
export interface DrawingAssociationPreviewView { records:DrawingAssociationDiagnosis[]; fingerprint:string }
export interface DrawingAppearanceApi {
  previewDrawingReuse(input:DrawingReuseInput):Promise<DrawingReusePreview>;
  confirmDrawingReuse(input:DrawingReuseInput&{fingerprint:string;confirmed:true}):Promise<{updated:number}>;
  previewDrawingAssociations(input?:{productId?:number;signedIds?:number[]}):Promise<DrawingAssociationPreviewView>;
  confirmDrawingAssociations(input:{targets:DrawingAssociationTarget[];fingerprint:string;reason:string;confirmed:true}):Promise<{updated:number}>;
  correctDrawingAssociation(input:DrawingAssociationTarget&{reason:string;confirmed:true}):Promise<{updated:number}>;
}
export function createDrawingAppearanceApi(request:<T>(path:string,init?:RequestInit)=>Promise<T>):DrawingAppearanceApi {
  const post=<T>(path:string,input:unknown)=>request<T>(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
  return {previewDrawingReuse:input=>post('/api/drawings/reuse-preview',input),confirmDrawingReuse:input=>post('/api/drawings/reuse-confirm',input),previewDrawingAssociations:(input={})=>post('/api/drawings/association-preview',input),confirmDrawingAssociations:input=>post('/api/drawings/association-confirm',input),correctDrawingAssociation:input=>post('/api/drawings/association-correct',input)};
}
