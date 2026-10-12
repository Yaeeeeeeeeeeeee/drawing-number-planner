import { useCallback, useEffect, useState } from 'react';
import { bomMockPreviewSource, isBomMockEnabled } from './bom-mock';

export function useBomPreviewFailures() {
  const [failures, setFailures] = useState<Record<number, boolean>>({});
  const onPreviewChange = useCallback((assetId: number, failed: boolean) => setFailures((previous) => previous[assetId] === failed ? previous : { ...previous, [assetId]: failed }), []);
  return { failures, onPreviewChange };
}

export function BomAssetPreview({ assetId, name, onPreviewChange }: { assetId: number; name: string; onPreviewChange?(assetId: number, failed: boolean): void }) {
  const [failedId, setFailedId] = useState<number | null>(null);
  const mock = isBomMockEnabled();
  const failed = mock ? !bomMockPreviewSource(assetId) : failedId === assetId;
  useEffect(() => { onPreviewChange?.(assetId, failed); }, [assetId, failed, onPreviewChange]);
  if (mock) {
    const src = bomMockPreviewSource(assetId);
    return src ? <img src={src} alt={`${name}（开发示意）`} className="bom-local-preview" /> : <small className="bom-preview-failure" title="预览失败（Mock）；附件记录保留">预览失败</small>;
  }
  if (failedId === assetId) return <small className="muted-text">图片缺失或无法预览</small>;
  return <img src={`/api/boms/assets/${assetId}/preview`} alt={name} loading="lazy"
    style={{ display: 'block', maxWidth: '100%', width: 180, height: 120, objectFit: 'contain' }}
    onError={() => setFailedId(assetId)} />;
}
