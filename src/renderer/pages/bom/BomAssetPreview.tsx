import { useState } from 'react';

export function BomAssetPreview({ assetId, name }: { assetId: number; name: string }) {
  const [failedId, setFailedId] = useState<number | null>(null);
  if (failedId === assetId) return <small className="muted-text">图片缺失或无法预览</small>;
  return <img src={`/api/boms/assets/${assetId}/preview`} alt={name} loading="lazy"
    style={{ display: 'block', maxWidth: '100%', width: 180, height: 120, objectFit: 'contain' }}
    onError={() => setFailedId(assetId)} />;
}
