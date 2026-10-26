import { useId, useRef } from 'react';
import type { BomItemAssetView } from '../../data/client';
import { BomAssetPreview } from './BomAssetPreview';

/** Presentation only; upload and reuse continue to use the existing row handlers. */
export function BomAttachmentControl({ index, role, asset, gallery, canReuse, reuse, disabled, previewOnly, onReuse, onUpload, onPreviewChange }: {
  index: number; role: 'image' | 'diagram'; asset: BomItemAssetView | null; gallery?: BomItemAssetView[]; canReuse: boolean; reuse: boolean;
  disabled: boolean; previewOnly: boolean; onReuse(value: boolean): void; onUpload(file: File): void;
  onPreviewChange(assetId: number, failed: boolean): void;
}) {
  const groupId = useId();
  const input = useRef<HTMLInputElement>(null);
  const name = role === 'image' ? '图片' : '位置示意图';
  return <div className="bom-attachment-field bom-attachment-control" role="group" aria-label={`第 ${index} 行${name}附件`}>
    <div className="bom-attachment-heading"><span className="bom-field-label">{name}</span>
      <button type="button" className="text-button" disabled={disabled || previewOnly} aria-label={`第 ${index} 行选择${name}文件`} onClick={() => input.current?.click()}>更换图片</button>
      <input ref={input} className="bom-file-input" tabIndex={-1} aria-label={`第 ${index} 行${name}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || previewOnly} onChange={(event) => { const file = event.target.files?.[0]; if (file && !previewOnly) { onReuse(false); onUpload(file); } }} />
    </div>
    {asset ? <div className="bom-attachment-summary"><BomAssetPreview assetId={asset.assetId} name={asset.originalFileName} gallery={gallery} onPreviewChange={onPreviewChange} /></div> : <small>未关联{name}</small>}
    <div className="bom-attachment-sources">
      <label><input type="radio" name={groupId} aria-label="使用上一版图片" checked={reuse} disabled={disabled || !canReuse} onChange={()=>onReuse(true)} />使用上一版图片</label>
      <label><input type="radio" name={groupId} aria-label="更换图片" checked={!reuse} disabled={disabled || previewOnly} onChange={()=>{onReuse(false); input.current?.click();}} />更换图片</label>
    </div>
  </div>;
}
