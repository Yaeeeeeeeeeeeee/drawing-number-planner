import { useRef } from 'react';
import type { BomItemAssetView } from '../../data/client';
import { BomAssetPreview } from './BomAssetPreview';

/** Presentation only; upload and reuse continue to use the existing row handlers. */
export function BomAttachmentControl({ index, role, asset, canReuse, reuse, disabled, previewOnly, onReuse, onUpload, onPreviewChange }: {
  index: number; role: 'image' | 'diagram'; asset: BomItemAssetView | null; canReuse: boolean; reuse: boolean;
  disabled: boolean; previewOnly: boolean; onReuse(value: boolean): void; onUpload(file: File): void;
  onPreviewChange(assetId: number, failed: boolean): void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const name = role === 'image' ? '图片' : '位置示意图';
  return <div className="bom-attachment-field bom-attachment-control" role="group" aria-label={`第 ${index} 行${name}附件`}>
    <div className="bom-attachment-heading"><span className="bom-field-label">{name}</span>
      <button type="button" className="text-button" disabled={disabled || previewOnly} aria-label={`第 ${index} 行选择${name}文件`} onClick={() => input.current?.click()}>{asset ? '替换' : '选择文件'}</button>
      <input ref={input} className="bom-file-input" tabIndex={-1} aria-label={`第 ${index} 行${name}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || previewOnly} onChange={(event) => { const file = event.target.files?.[0]; if (file && !previewOnly) onUpload(file); }} />
    </div>
    {asset ? <div className="bom-attachment-summary"><BomAssetPreview assetId={asset.assetId} name={asset.originalFileName} onPreviewChange={onPreviewChange} /><span>{asset.originalFileName}</span></div> : <small>未关联{name}</small>}
    {canReuse && <label className="bom-inline-check bom-reuse-control"><input type="checkbox" aria-label={`第 ${index} 行沿用${name}`} checked={reuse} disabled={disabled} onChange={(event) => onReuse(event.target.checked)} />沿用上一 BOM</label>}
  </div>;
}
