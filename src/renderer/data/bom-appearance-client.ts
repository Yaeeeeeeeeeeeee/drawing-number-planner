import type { BomQrCandidateView, BomCandidateView, BomDiffView, BomEntryModeView, BomVersionSummaryView, BomVersionView } from './client';
export interface BomAppearanceApi {
  listAppearanceBomQrCandidates?(productId:number,appearanceVersionId:number):Promise<BomQrCandidateView[]>;
  getAppearanceBom?(productId:number,appearanceVersionId:number):Promise<BomVersionView|null>;
  listAppearanceBoms?(productId:number,appearanceVersionId:number):Promise<BomVersionSummaryView[]>;
  copyAppearanceBom?(sourceVersionId:number,appearanceVersionId:number,businessChangeDate:string):Promise<{version:BomVersionView;diff:BomDiffView[]}>;
  listAppearanceBomCandidates?(input:{productId:number;appearanceVersionId:number;projectItemId:number;usesWhiteMaterial:boolean;entryMode?:BomEntryModeView;includeReusableMaterials?:boolean}):Promise<BomCandidateView[]>;
  queryAppearanceBoms?(filters:{productCategory?:string;productId?:number;mainCategoryId?:number;businessDateFrom?:string;businessDateTo?:string;appearanceVersionId?:number;model?:string;businessChangeDate?:string;effectiveBatchRelativePath?:string;projectItemId?:number;fullCode?:string}):Promise<BomVersionSummaryView[]>;
}
type Request = <T>(path:string,init?:RequestInit)=>Promise<T>;
export function createBomAppearanceApi(request:Request):Required<BomAppearanceApi> {
  const query=(input:Record<string,unknown>)=>new URLSearchParams(Object.entries(input).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])).toString();
  return {
    listAppearanceBomQrCandidates:async(productId,appearanceVersionId)=>(await request<{items:BomQrCandidateView[]}>(`/api/boms/qr-candidates?${query({productId,appearanceVersionId})}`)).items,
    getAppearanceBom:async(productId,appearanceVersionId)=>(await request<{version:BomVersionView|null}>(`/api/boms/current?${query({productId,appearanceVersionId})}`)).version,
    listAppearanceBoms:async(productId,appearanceVersionId)=>(await request<{items:BomVersionSummaryView[]}>(`/api/boms/versions?${query({productId,appearanceVersionId})}`)).items,
    copyAppearanceBom:(id,appearanceVersionId,businessChangeDate)=>request(`/api/boms/versions/${id}/copy-to-appearance`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({appearanceVersionId,businessChangeDate})}),
    listAppearanceBomCandidates:async input=>(await request<{items:BomCandidateView[]}>(`/api/boms/candidates?${query(input)}`)).items,
    queryAppearanceBoms:async input=>(await request<{items:BomVersionSummaryView[]}>(`/api/boms/query?${query(input)}`)).items,
  };
}
