import { ProductExitWorksheet } from './ProductExitWorksheet';
import { useEffect, useRef, useState } from 'react';
import type { PlannerApi, ProductCleanupPreviewView } from '../data/client';

export function ProductCleanupPanel({ api, productId, onCancel, onComplete, confirmLabel = '确认退出当前业务' }: {
  api: PlannerApi; productId: number; onCancel: () => void; onComplete: () => void; confirmLabel?: string;
}) {
  const [preview, setPreview] = useState<ProductCleanupPreviewView | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const [reload,setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setPreview(null); setConfirmation(''); setError('');
    void api.previewProductCleanup(productId).then((value) => { if (current) setPreview(value); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : '清理预检失败'); });
    return () => { current = false; };
  }, [api, productId, reload]);
  const execute = async () => {
    if (sending.current || !preview || preview.blockers.length || confirmation !== preview.model) return;
    if (!window.confirm(`确认让 ${preview.model} 退出当前业务？所属图号保留占号，历史身份和快照保留，不删除任何磁盘文件。`)) return;
    sending.current = true; setBusy(true); setError('');
    try { await api.cleanupProduct(productId, confirmation); onComplete(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '集中清理失败'); }
    finally { sending.current = false; setBusy(false); }
  };
  return <section className="editor-panel" aria-label="产品删除检查与清理">
    <h3>产品删除检查与清理</h3>
    <button type="button" className="secondary-button" disabled={busy} onClick={() => setReload(value=>value+1)}>重新检查</button>
    <p>退出当前业务，保留历史身份和快照。不会删除资料根目录中的任何实际文件。</p>
    {!preview && !error && <p>正在检查关联…</p>}
    {preview && <>
      <ProductExitWorksheet preview={preview}/>
      {preview.blockers.map((blocker) => <p className="error-banner" key={blocker}>{blocker}</p>)}
      <label>输入型号确认<input value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} placeholder={preview.model} /></label>
      <button type="button" className="text-button danger" disabled={busy || preview.blockers.length > 0 || confirmation !== preview.model}
        onClick={() => void execute()}>{busy ? '正在集中清理…' : confirmLabel}</button>
    </>}
    {error && <p className="error-banner" role="alert">{error}{!preview && ' · 检查失败，禁止继续退出。'}</p>}
    <button type="button" disabled={busy} onClick={onCancel}>取消</button>
  </section>;
}
