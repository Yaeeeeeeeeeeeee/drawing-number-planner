import { useEffect, useState } from 'react';
import type { DrawingDeletionPreviewView, PlannerApi } from '../data/client';

export function DrawingBatchDeletion({ ids, api, onComplete }: {
  ids: number[]; api: PlannerApi; onComplete(): Promise<void>;
}) {
  const [previews, setPreviews] = useState<DrawingDeletionPreviewView[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'retain_occupied' | 'release'>('retain_occupied');
  const [confirmation, setConfirmation] = useState('');
  const [report, setReport] = useState('');
  useEffect(() => { setPreviews([]); setIssues([]); setConfirmation(''); }, [ids]);
  const inspect = async () => {
    setBusy(true); setReport('');
    const result = await Promise.allSettled(ids.map((id) => api.getDrawingDeletionPreview(id)));
    setPreviews(result.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []));
    setIssues(result.flatMap((item, index) => item.status === 'rejected' ? [`记录 ${ids[index]}：${item.reason instanceof Error ? item.reason.message : '检查失败'}`] : []));
    setBusy(false);
  };
  const execute = async () => {
    const eligible = previews.filter((item) => item.deletable);
    if (!eligible.length || (mode === 'release' && confirmation !== '释放图号')) return;
    if (!window.confirm(`确认删除 ${eligible.length} 个可删除图号，跳过阻塞项？${mode === 'release' ? '号码将释放，未来可以重新规划使用。' : '号码继续保留占用。'}磁盘文件不受影响。`)) return;
    setBusy(true);
    try {
      const result = await api.deleteDrawings(eligible.map((item) => ({ signedId: item.signedId, confirmedCode: item.fullCode, mode })));
      setReport(`已删除 ${result.items.filter((item) => item.status === 'deleted').length} 项；跳过/失败 ${result.items.filter((item) => item.status !== 'deleted').length} 项`);
      setIssues(result.items.flatMap((item) => item.message ? [`记录 ${item.signedId}：${item.message}`] : []));
      setPreviews([]); await onComplete();
    } catch (error) { setReport(error instanceof Error ? error.message : '操作失败，请刷新查看实际结果'); }
    finally { setBusy(false); }
  };
  return <section className="drawing-batch-delete" aria-label="批量删除图号">
    <button type="button" className="text-button danger" disabled={busy || !ids.length} onClick={() => void inspect()}>批量删除（已选 {ids.length} 项）</button>
    {previews.length > 0 && <div className="danger-zone">
      <p>可删除 {previews.filter((item) => item.deletable).length} 项 · 当前业务引用阻塞 {previews.filter((item) => !item.deletable).length} 项 · 存在文件 {previews.filter((item) => item.references.presentPdf > 0).length} 项</p>
      {previews.filter((item) => !item.deletable).map((item) => <p key={item.signedId}>{item.fullCode}：{item.blockers.map((blocker) => blocker.message).join('；')}</p>)}
      <label>删除方式<select disabled={busy} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="retain_occupied">删除记录并保留占号</option><option value="release">彻底删除并释放图号</option></select></label>
      {mode === 'release' && <label>释放后号码可能重新规划使用。输入“释放图号”确认<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>}
      <button type="button" className="text-button danger" disabled={busy || !previews.some((item) => item.deletable) || (mode === 'release' && confirmation !== '释放图号')} onClick={() => void execute()}>删除可删除项 / 跳过阻塞项</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => setPreviews([])}>取消</button>
    </div>}
    {report && <p role="status">{report}</p>}{issues.map((issue) => <p key={issue} className="error-banner">{issue}</p>)}
  </section>;
}
