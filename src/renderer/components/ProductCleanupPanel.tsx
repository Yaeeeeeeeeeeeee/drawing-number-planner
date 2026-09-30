import { useEffect, useRef, useState } from 'react';
import type { PlannerApi, ProductCleanupPreviewView } from '../data/client';

export function ProductCleanupPanel({ api, productId, onCancel, onComplete }: {
  api: PlannerApi; productId: number; onCancel: () => void; onComplete: () => void;
}) {
  const [preview, setPreview] = useState<ProductCleanupPreviewView | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  useEffect(() => {
    let current = true;
    void api.previewProductCleanup(productId).then((value) => { if (current) setPreview(value); })
      .catch((reason) => { if (current) setError(reason instanceof Error ? reason.message : '清理预检失败'); });
    return () => { current = false; };
  }, [api, productId]);
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
    <p>退出当前业务，保留历史身份和快照。不会删除资料根目录中的任何实际文件。</p>
    {!preview && !error && <p>正在检查关联…</p>}
    {preview && <>
      <p>正式图号 {preview.owned.drawings} · 历史图号 {preview.owned.historicalDrawings}（均保留占号）</p>
      <p>BOM 记录 {preview.owned.bomRecords} · 二维码 {preview.owned.qrCodes} · 资料批次 {preview.owned.batches}（集中退出或解除关联）</p>
      <p>历史外发快照 {preview.preservedSnapshots}（保留，不阻止退出）</p>
      {preview.classification && <>
        <p>已删除业务记录 {preview.classification.alreadyDeleted}（保留，不作为当前阻塞）</p>
        <p>当前 PDF 索引 {preview.classification.presentPdfIndexes} · 缺失 PDF 索引 {preview.classification.missingPdfIndexes}（保留索引、解除本产品关联，不删除磁盘文件）</p>
        <p>历史邮件草稿 {preview.classification.preservedDrafts}（保留，不阻止退出）</p>
      </>}
      {preview.blockers.map((blocker) => <p className="error-banner" key={blocker}>{blocker}</p>)}
      <label>输入型号确认<input value={confirmation} disabled={busy} onChange={(event) => setConfirmation(event.target.value)} placeholder={preview.model} /></label>
      <button type="button" className="text-button danger" disabled={busy || preview.blockers.length > 0 || confirmation !== preview.model}
        onClick={() => void execute()}>{busy ? '正在集中清理…' : '确认退出当前业务'}</button>
    </>}
    {error && <p className="error-banner">{error}</p>}
    <button type="button" disabled={busy} onClick={onCancel}>取消</button>
  </section>;
}
