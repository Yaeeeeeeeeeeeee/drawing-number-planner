import { CopyButton } from '../../components/CopyButton';
import { useEffect, useRef, useState } from 'react';
import type { BomArchiveCandidateView, PlannerApi } from '../../data/client';
export function BomArchivePanel({ api, previewOnly = false }: { api: PlannerApi; previewOnly?: boolean }) {
  const [items, setItems] = useState<BomArchiveCandidateView[]>([]);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const running = useRef(false); const cancelled = useRef(false);
  useEffect(() => () => { cancelled.current = true; }, []);
  const inspect = async () => {
    if (previewOnly || running.current) return; setBusy(true); setMessage('');
    try { setItems(await api.previewBomAssetArchive()); }
    catch (error) { setMessage(error instanceof Error ? error.message : '检查失败'); }
    finally { setBusy(false); }
  };
  const migrate = async () => {
    if (previewOnly || running.current || !window.confirm('将复制并校验附件后更新 BOM 关联。旧文件不会移动或删除。是否继续？')) return;
    running.current = true; cancelled.current = false; setBusy(true);
    let completed = 0; const errors: string[] = [];
    try {
      for (const item of items) {
        if (cancelled.current) break;
        try { await api.archiveBomAssetLink(item.linkId); completed++; }
        catch (error) { errors.push(`${item.model} / ${item.project}：${error instanceof Error ? error.message : '迁移失败'}`); }
        setMessage(`正在迁移 ${completed + errors.length} / ${items.length}`);
      }
      setMessage(`${cancelled.current ? '已停止' : '处理结束'}：完成 ${completed}，失败 ${errors.length}${errors.length ? `；${errors.join('；')}` : ''}`);
    } finally { running.current = false; setBusy(false); }
  };
  return <details className="bom-archive-panel"><summary>旧 BOM 附件归档</summary>
    <p>复制 → 校验 → 更新关联。保留原文件；缺少业务日期或文件的项目不会切换关联。</p>
    <button type="button" disabled={busy || previewOnly} onClick={() => void inspect()}>检查旧附件归档</button>
    {items.length > 0 && <><ul>{items.map((item) => <li key={item.linkId}>{item.model} · {item.businessDate ?? '日期未补录'} · {item.project}<div style={{ overflowWrap: 'anywhere' }}>{item.relativePath}</div></li>)}</ul>
      <CopyButton kind="files" label={`开始复制并归档 ${items.length} 项`} disabled={busy || previewOnly} onClick={() => void migrate()} /></>}
    {busy && running.current && <button type="button" onClick={() => { cancelled.current = true; }}>取消剩余迁移</button>}
    {message && <p role="status">{message}</p>}
  </details>;
}
