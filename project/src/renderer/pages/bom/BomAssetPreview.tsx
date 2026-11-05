import { useCallback, useEffect, useRef, useState } from 'react';
import type { BomItemAssetView } from '../../data/client';
import { ImagePreviewDialog } from '../../components/ImagePreviewDialog';
import { bomMockPreviewSource, isBomMockEnabled } from './bom-mock';

export function useBomPreviewFailures() {
  const [failures, setFailures] = useState<Record<number, boolean>>({});
  const onPreviewChange = useCallback((assetId: number, failed: boolean) => setFailures(previous => previous[assetId] === failed ? previous : { ...previous, [assetId]: failed }), []);
  return { failures, onPreviewChange };
}
const errors: Record<string,string> = {
  ASSET_NOT_FOUND:'附件记录不存在，或文件缺失／不可读取', ASSET_PATH_INVALID:'附件路径无效',
  ASSET_CONTENT_INVALID:'附件内容校验失败，不能确认原始文件', ASSET_TYPE_INVALID:'附件格式不支持预览', ASSET_TOO_LARGE:'附件超过预览大小限制',
};
export function BomAssetPreview({ assetId, name, gallery, onPreviewChange }: { assetId: number; name: string; gallery?: BomItemAssetView[]; onPreviewChange?(assetId: number, failed: boolean): void }) {
  const [open,setOpen]=useState(false), [failure,setFailure]=useState<{id:number;label:string}|null>(null);
  const request=useRef<AbortController|null>(null);
  const mock=isBomMockEnabled(), src=mock ? bomMockPreviewSource(assetId) : `/api/boms/assets/${assetId}/preview`;
  const failed=(failure?.id===assetId) || !src;
  useEffect(()=>{onPreviewChange?.(assetId,failed);},[assetId,failed,onPreviewChange]);
  useEffect(()=>()=>request.current?.abort(),[assetId]);
  const diagnose=async()=>{
    setFailure({id:assetId,label:'预览失败，正在核验文件状态…'});
    const controller=new AbortController();request.current?.abort();request.current=controller;
    try {
      const response=await fetch(src!,{signal:controller.signal,cache:'no-store'});
      if(controller.signal.aborted)return;
      if(response.ok){await response.body?.cancel();if(!controller.signal.aborted)setFailure({id:assetId,label:'文件已读取；上次预览未成功'});return;}
      const payload=await response.json();if(!controller.signal.aborted)setFailure({id:assetId,label:errors[payload?.error?.code] ?? `附件状态核验失败（HTTP ${response.status}）`});
    } catch {if(!controller.signal.aborted)setFailure({id:assetId,label:'无法核验附件状态，请重试；未确认文件缺失'});}
  };
  if(failed)return <div className="bom-preview-failure"><small role="status">{failure?.id===assetId ? failure.label : '图片缺失或无法预览'}</small>{!mock && <button type="button" className="text-button" onClick={()=>{request.current?.abort();setFailure(null);}}>重试预览</button>}</div>;
  return <><button type="button" className="bom-preview-thumbnail" title="放大图片" aria-label="放大图片" onClick={()=>setOpen(true)}><img src={src!} alt={name} loading="lazy" style={{display:'block',maxWidth:'100%',width:180,height:120,objectFit:'contain'}} onError={()=>void diagnose()}/></button>{open && <ImagePreviewDialog images={gallery?.length ? gallery.map(asset=>({id:asset.assetId,name:asset.originalFileName,src:mock ? bomMockPreviewSource(asset.assetId) ?? '' : `/api/boms/assets/${asset.assetId}/preview`})) : [{id:assetId,src:src!,name}]} initialIndex={Math.max(0,gallery?.findIndex(asset=>asset.assetId===assetId) ?? 0)} onClose={()=>setOpen(false)}/>}</>;
}
