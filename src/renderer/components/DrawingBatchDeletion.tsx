import { useEffect, useRef, useState } from 'react';
import type { DrawingDeletionPreviewView, PlannerApi } from '../data/client';

export function DrawingBatchDeletion({ ids, api, onComplete }: {
  ids: number[]; api: PlannerApi; onComplete(): Promise<void>;
}) {
  const [previews, setPreviews] = useState<DrawingDeletionPreviewView[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [resultIssues, setResultIssues] = useState<string[]>([]);
  const inspection = useRef(0);
  const executing = useRef(false);
  const cancelled = useRef(false);
  const [cancelling, setCancelling] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'retain_occupied' | 'release'>('retain_occupied');
  const [confirmation, setConfirmation] = useState('');
  const [report, setReport] = useState('');
  const selectionKey = ids.join(',');
  useEffect(() => {
    inspection.current += 1;
    setPreviews([]); setIssues([]); setConfirmation('');
    if (!executing.current) setBusy(false);
    return () => { inspection.current += 1; cancelled.current = true; };
  }, [selectionKey]);
  const inspect = async () => {
    const request = ++inspection.current;
    setBusy(true); setReport(''); setResultIssues([]);
    const result = await Promise.allSettled(ids.map((id) => api.getDrawingDeletionPreview(id)));
    if (request !== inspection.current) return;
    setPreviews(result.flatMap((item) => item.status === 'fulfilled' ? [item.value] : []));
    setIssues(result.flatMap((item, index) => item.status === 'rejected' ? [`记录 ${ids[index]}：${item.reason instanceof Error ? item.reason.message : '检查失败'}`] : []));
    setBusy(false);
  };
  const execute = async () => {
    if (executing.current) return;
    const eligible = previews.filter((item) => item.deletable);
    if (!eligible.length || (mode === 'release' && confirmation !== '释放图号')) return;
    if (!window.confirm(`确认删除 ${eligible.length} 个可删除图号，跳过阻塞项？${mode === 'release' ? '号码将释放，未来可以重新规划使用。' : '号码继续保留占用。'}磁盘文件不受影响。`)) return;
    setBusy(true);
    executing.current = true; cancelled.current = false; setCancelling(false);
    let completed = 0; let deleted = 0;
    let skipped = previews.length - eligible.length;
    const failures: string[] = [];
    try {
      // Send one atomic item at a time so cancellation never interrupts an in-flight transaction.
      for (const item of eligible) {
        if (cancelled.current) break;
        setReport(`正在处理 ${completed + 1} / ${eligible.length}`);
        const result = await api.deleteDrawings([{ signedId: item.signedId, confirmedCode: item.fullCode, mode }]);
        completed += 1;
        deleted += result.items.filter((entry) => entry.status === 'deleted').length;
        skipped += result.items.filter((entry) => entry.status !== 'deleted').length;
        failures.push(...result.items.flatMap((entry) => entry.message ? [`记录 ${entry.signedId}：${entry.message}`] : []));
      }
      setReport(`已删除 ${deleted} 项；跳过/失败 ${skipped} 项；未执行 ${eligible.length - completed} 项`);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : '请求失败');
      setReport(`已确认删除 ${deleted} 项；当前请求结果未确认，已停止后续操作，请刷新核对。`);
    }
    try {
      setResultIssues(failures); setPreviews([]); await onComplete();
    } catch (error) { setResultIssues([...failures, `刷新失败：${error instanceof Error ? error.message : '请手动刷新'}`]); }
    finally { executing.current = false; setBusy(false); }
  };
  return <section className="drawing-batch-delete" aria-label="批量删除图号">
    <button type="button" className="text-button danger" disabled={busy || !ids.length} onClick={() => void inspect()}>批量删除（已选 {ids.length} 项）</button>
    {busy && executing.current && <button type="button" className="secondary-button" disabled={cancelling} onClick={() => { cancelled.current = true; setCancelling(true); }}>{cancelling ? '等待当前项完成…' : '取消剩余任务'}</button>}
    {previews.length > 0 && <div className="danger-zone">
      <p>可删除 {previews.filter((item) => item.deletable).length} 项 · 当前业务引用阻塞 {previews.filter((item) => !item.deletable).length} 项 · 存在文件 {previews.filter((item) => item.references.presentPdf > 0).length} 项</p>
      {previews.filter((item) => !item.deletable).map((item) => <p key={item.signedId}>{item.fullCode}：{item.blockers.map((blocker) => blocker.message).join('；')}</p>)}
      <label>删除方式<select disabled={busy} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}><option value="retain_occupied">删除记录并保留占号</option><option value="release">彻底删除并释放图号</option></select></label>
      {mode === 'release' && <label>释放后号码可能重新规划使用。输入“释放图号”确认<input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>}
      <button type="button" className="text-button danger" disabled={busy || !previews.some((item) => item.deletable) || (mode === 'release' && confirmation !== '释放图号')} onClick={() => void execute()}>删除可删除项 / 跳过阻塞项</button>
      <button type="button" className="text-button" disabled={busy} onClick={() => setPreviews([])}>取消</button>
    </div>}
    {report && <p role="status">{report}</p>}{[...issues, ...resultIssues].map((issue) => <p key={issue} className="error-banner">{issue}</p>)}
  </section>;
}
