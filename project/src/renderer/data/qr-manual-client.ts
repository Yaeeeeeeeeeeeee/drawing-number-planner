import { notifyPlannerMutation } from './query-cache';
import type { QrManualInput, QrManualPreview, QrManualSelection } from '../../core/qr/qr-manual-service';
import type { ProductQrCodeView } from './client';
export interface QrManualHistory { legacyItems?: Array<{id:number;fileName:string;relativePath:string;mimeType:string;isPresent:number}>; revision: string; items: Array<{id:number;file_id:string;file_name:string;absolute_path:string;linked_at:string;unlinked_at:string|null;exception_reason:string|null}> }
export interface QrManualApi {
  qrManualPreview?(input: QrManualInput): Promise<QrManualPreview>;
  qrManualCommit?(previewId: string, exception?: {confirmed:boolean;reason:string}): Promise<ProductQrCodeView>;
  qrManualHistory?(id: number): Promise<QrManualHistory>;
  qrManualUnlink?(id: number, revision: string): Promise<ProductQrCodeView>;
}
declare global { interface PlannerDesktop {
  qrManualSelectFile?(): Promise<QrManualSelection | null>;
  qrManualAction?(action:string,input:unknown): Promise<unknown>;
} }
export function createQrManualApi(request: <T>(path:string, init?:RequestInit)=>Promise<T>): QrManualApi {
  async function desktop<T>(action:string,input:unknown):Promise<T> {
    if (!window.plannerDesktop?.qrManualAction) throw new Error('请在 Windows 桌面版选择本地PDF');
    return await window.plannerDesktop.qrManualAction(action,input) as T;
  }
  return {
    qrManualPreview: input => desktop('preview',input),
    qrManualCommit: async (previewId,exception) => { const code=await desktop<ProductQrCodeView>('commit',{previewId,exception});notifyPlannerMutation();return code; },
    qrManualHistory: id => request(`/api/qr-codes/${id}/manual-history`),
    qrManualUnlink: async (id,revision) => {const code=await request<ProductQrCodeView>(`/api/qr-codes/${id}/manual-link`,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision})});notifyPlannerMutation();return code;},
  };
}
