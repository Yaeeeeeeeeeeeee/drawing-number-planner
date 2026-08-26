import { useEffect, useRef, useState, type FormEvent } from 'react';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import type { PdfFileView, PdfScanSummaryView, PlannerApi, WorkspaceSettingsView } from '../data/client';

const initialFilters = { keyword: '', matchStatus: '', conversionType: '', presence: 'present' };
const pageSize = 50;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FilesPage({ api }: { api: PlannerApi }) {
  const [settings, setSettings] = useState<WorkspaceSettingsView>({ workspaceRoot: null, configured: false, available: false });
  const [rootInput, setRootInput] = useState(''); const [files, setFiles] = useState<PdfFileView[]>([]);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [filters, setFilters] = useState(initialFilters);
  const [summary, setSummary] = useState<PdfScanSummaryView | null>(null);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const searchRequest = useRef(0);

  const search = async (values = filters, requestedPage = 1) => {
    const request = ++searchRequest.current; setLoading(true);
    try {
      const result = await api.searchPdfFiles({ ...values, page: requestedPage, pageSize });
      if (request !== searchRequest.current) return;
      setFiles(result.items); setTotal(result.total); setPage(result.page);
    } catch (reason) {
      if (request === searchRequest.current) setError(reason instanceof Error ? reason.message : 'PDF 文件加载失败');
    } finally { if (request === searchRequest.current) setLoading(false); }
  };

  useEffect(() => {
    const request = ++searchRequest.current; setLoading(true); setError('');
    void Promise.all([api.getWorkspaceSettings(), api.searchPdfFiles({ ...initialFilters, page: 1, pageSize })])
      .then(([nextSettings, result]) => {
        if (request !== searchRequest.current) return;
        setSettings(nextSettings); setRootInput(nextSettings.workspaceRoot ?? ''); setFiles(result.items); setTotal(result.total); setPage(result.page);
      }).catch((reason) => { if (request === searchRequest.current) setError(reason instanceof Error ? reason.message : 'PDF 文件中心加载失败'); })
      .finally(() => { if (request === searchRequest.current) setLoading(false); });
  }, [api]);

  const saveRoot = async () => {
    if (!rootInput.trim()) return; setSaving(true); setError(''); setMessage('');
    try { const saved = await api.updateWorkspaceSettings(rootInput.trim()); setSettings(saved); setRootInput(saved.workspaceRoot ?? rootInput);
      setMessage('资料根目录已保存'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '资料根目录保存失败'); }
    finally { setSaving(false); }
  };
  const scan = async () => {
    setScanning(true); setError(''); setMessage('');
    try { const result = await api.scanPdfFiles(); setSummary(result); setMessage('资料库扫描完成'); await search(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '资料库扫描失败'); }
    finally { setScanning(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); void search(filters, 1); };
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <section className="page-surface page-enter files-page">
    <header className="page-header"><div><p className="eyebrow">PDF WORKSPACE</p><h1>PDF 文件中心</h1><p>只读扫描本地资料库，可靠图号自动登记，异常候选留待确认。</p></div>
      <span className="record-count">{total} 个索引文件</span></header>
    <section className="workspace-strip" aria-label="资料根目录设置">
      <label><span>资料根目录</span><input aria-label="资料根目录" value={rootInput} disabled={saving || scanning}
        placeholder="请输入本机资料库目录" onChange={(event) => { setRootInput(event.target.value); setMessage(''); setError(''); }} /></label>
      <button className="secondary-button" type="button" disabled={saving || scanning || !rootInput.trim()} onClick={() => void saveRoot()}>{saving ? '保存中…' : '保存根目录'}</button>
      <button className="primary-button" type="button" disabled={saving || scanning || !settings.configured || !settings.available}
        onClick={() => void scan()}>{scanning ? '扫描中…' : '扫描资料库'}</button>
      <div className={`workspace-state ${settings.available ? 'ready' : 'waiting'}`}>
        <strong>{settings.configured ? settings.available ? '目录可用' : '目录不可用' : '尚未设置资料根目录'}</strong>
        <span>{settings.configured ? '保存后请手动扫描以更新索引' : '输入资源管理器中的完整目录路径'}</span>
      </div>
    </section>
    {error && <p className="error-banner">{error}</p>}{message && <p className="success-banner"><strong>{message}</strong></p>}
    {summary && <div className="scan-summary" aria-label="扫描统计"><strong>{summary.total} 个 PDF</strong><span>{summary.matched} 已匹配</span>
      <span>{summary.pending} 待确认</span><span>{summary.historicalRegistered} 个历史图号已登记</span>
      <span>{summary.unmatched} 未匹配</span><span>{summary.conflict} 冲突</span><span>{summary.source} 转曲前</span>
      <span>{summary.outlined} 转曲后</span><span>{summary.missing} 已缺失</span></div>}
    <form className="filter-bar files-filter" onSubmit={submit}>
      <label><span>文件关键词</span><input aria-label="文件关键词" value={filters.keyword} onChange={(event) => setFilter('keyword', event.target.value)} /></label>
      <label><span>匹配状态</span><select aria-label="匹配状态" value={filters.matchStatus} onChange={(event) => setFilter('matchStatus', event.target.value)}>
        <option value="">全部</option><option value="matched">已匹配</option><option value="pending">待确认</option><option value="unmatched">未匹配</option><option value="conflict">冲突</option></select></label>
      <label><span>转曲类型</span><select aria-label="转曲类型" value={filters.conversionType} onChange={(event) => setFilter('conversionType', event.target.value)}>
        <option value="">全部</option><option value="source">转曲前</option><option value="outlined">转曲后</option></select></label>
      <label><span>存在状态</span><select aria-label="存在状态" value={filters.presence} onChange={(event) => setFilter('presence', event.target.value)}>
        <option value="present">当前存在</option><option value="missing">已缺失</option><option value="all">全部</option></select></label>
      <button className="primary-button" type="submit" disabled={loading || scanning}>{loading ? '加载中…' : '筛选 PDF'}</button>
    </form>
    {!loading && files.length === 0 ? <EmptyState symbol="P" title={settings.configured ? '没有符合条件的 PDF' : '请先设置资料根目录'}
      description={settings.configured ? '调整筛选条件，或重新扫描资料库。' : '设置后扫描，PDF 索引将显示在这里。'} /> :
      <DataTable items={files} columns={[
        { key: 'name', label: '文件名', render: (item) => <span className="file-primary">{item.fileName}</span> },
        { key: 'path', label: '相对路径', render: (item) => <span className="file-relative mono">{item.relativePath}</span> },
        { key: 'drawing', label: '匹配图号', render: (item) => item.fullCode ? <span className="file-match matched">
          <span className="code-cell">{item.fullCode}</span>
          {item.classificationWarning && <span className="file-warning">{item.classificationWarning === 'conversion-conflict'
            ? '目录与文件名的转曲标记冲突' : item.classificationWarning}</span>}
        </span>
          : item.matchStatus === 'pending' ? <span className="file-match pending">待确认 · {item.detectedCodes.join(' / ')} · {item.classificationWarning}</span>
            : <span className={`file-match ${item.matchStatus}`}>{item.matchStatus === 'conflict' ? '多图号冲突' : '未匹配'}</span> },
        { key: 'conversion', label: '类型', render: (item) => <span className={`conversion-label ${item.conversionType}`}>{item.conversionType === 'outlined' ? '转曲后' : '转曲前'}</span> },
        { key: 'size', label: '大小', render: (item) => formatSize(item.sizeBytes) },
        { key: 'modified', label: '修改时间', render: (item) => new Date(item.modifiedAt).toLocaleString('zh-CN') },
        { key: 'presence', label: '文件状态', render: (item) => <span className={`presence-label ${item.isPresent ? 'present' : 'missing'}`}>{item.isPresent ? '存在' : '缺失'}</span> },
      ]} />}
    {total > pageSize && <nav className="table-pagination" aria-label="PDF 分页">
      <button className="secondary-button" type="button" disabled={loading || page <= 1}
        onClick={() => void search(filters, page - 1)}>上一页</button>
      <span>第 {page} / {pageCount} 页</span>
      <button className="secondary-button" type="button" disabled={loading || page >= pageCount}
        onClick={() => void search(filters, page + 1)}>下一页</button>
    </nav>}
  </section>;
}
