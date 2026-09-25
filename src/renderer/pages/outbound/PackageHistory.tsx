import { useEffect, useState } from 'react';
import type { PlannerApi } from '../../data/client';
import { openOutboundPackageLocation } from '../../desktop-files';

export function PackageHistory({ api, productId, refreshId }: {
  api: PlannerApi; productId: number; refreshId?: number;
}) {
  const [packages, setPackages] = useState<Awaited<ReturnType<PlannerApi['listOutboundPackages']>>>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setPackages([]); setError('');
    void api.listOutboundPackages(productId).then((items) => { if (current) setPackages(items); })
      .catch((failure) => { if (current) setError(failure instanceof Error ? failure.message : '外发历史加载失败'); });
    return () => { current = false; };
  }, [api, productId, refreshId]);
  return <details className="outbound-panel">
    <summary>已生成的压缩包</summary>
    {error && <p className="error-banner">{error}</p>}
    {!packages.length && !error && <p className="muted-text">暂无已生成记录</p>}
    {packages.map((item) => <section key={item.id} className="outbound-result">
      <strong>{item.packageName}</strong>
      <span>{item.createdAt} · {item.fileCount} 个文件</span>
      {item.parts.map((part) => <div key={part.partNumber}>
        <span className="file-primary">{part.zipRelativePath}</span>
        <span> · {part.sizeBytes === null ? '大小未记录' : `${(part.sizeBytes / 1_000_000).toFixed(2)} MB`}</span>
        <button type="button" className="text-button" aria-label={`打开${item.packageName}第${part.partNumber}份位置`}
          onClick={async () => {
            const result = await openOutboundPackageLocation(item.id, part.partNumber);
            if (!result.ok) setError(result.error?.message ?? '打开位置失败');
          }}>打开第{part.partNumber}份位置</button>
      </div>)}
    </section>)}
  </details>;
}
