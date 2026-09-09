import { useEffect, useRef, useState, type FormEvent } from 'react';

import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import type { FileIndexClearPreviewView, FileScanChangesView, MaterialBatchView, PdfFileView, PdfScanSummaryView, PlannerApi, ProductView, WorkspaceSettingsView } from '../data/client';
import { openIndexedPdfLocation } from '../desktop-files';

const initialFilters = { keyword: '', productId: '', materialBatchId: '', matchStatus: '', conversionType: '', presence: 'present' };
const pageSize = 50;

function searchInput(values: typeof initialFilters, page: number) {
  return { keyword: values.keyword, matchStatus: values.matchStatus, conversionType: values.conversionType, presence: values.presence,
    ...(values.productId ? { productId: Number(values.productId) } : {}),
    ...(values.materialBatchId ? { materialBatchId: Number(values.materialBatchId) } : {}), page, pageSize };
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function FilesPage({ api }: { api: PlannerApi }) {
  const [settings, setSettings] = useState<WorkspaceSettingsView>({ workspaceRoot: null, configured: false, available: false });
  const [rootInput, setRootInput] = useState(''); const [files, setFiles] = useState<PdfFileView[]>([]);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [filters, setFilters] = useState(initialFilters);
  const [summary, setSummary] = useState<PdfScanSummaryView | null>(null);
  const [scanChanges, setScanChanges] = useState<FileScanChangesView | null>(null);
  const [showChanges, setShowChanges] = useState(false);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [scanning, setScanning] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]); const [pendingCleanupIds, setPendingCleanupIds] = useState<number[] | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [indexClearPreview, setIndexClearPreview] = useState<FileIndexClearPreviewView | null>(null);
  const [indexClearConfirming, setIndexClearConfirming] = useState(false); const [indexClearPhrase, setIndexClearPhrase] = useState('');
  const [clearingIndex, setClearingIndex] = useState(false);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const searchRequest = useRef(0);

  const search = async (values = filters, requestedPage = 1) => {
    const request = ++searchRequest.current; setLoading(true);
    try {
      const result = await api.searchPdfFiles(searchInput(values, requestedPage));
      if (request !== searchRequest.current) return;
      setFiles(result.items); setTotal(result.total); setPage(result.page);
    } catch (reason) {
      if (request === searchRequest.current) setError(reason instanceof Error ? reason.message : 'PDF 文件加载失败');
    } finally { if (request === searchRequest.current) setLoading(false); }
  };

  useEffect(() => {
    const request = ++searchRequest.current; setLoading(true); setError('');
    void Promise.all([api.getWorkspaceSettings(), api.searchPdfFiles(searchInput(initialFilters, 1)),
      api.listProducts({ status: 'all' }).catch(() => []), api.listMaterialBatches({}).catch(() => [])])
      .then(([nextSettings, result, productItems, batchItems]) => {
        if (request !== searchRequest.current) return;
        setSettings(nextSettings); setRootInput(nextSettings.workspaceRoot ?? ''); setFiles(result.items); setTotal(result.total); setPage(result.page);
        setProducts(productItems); setBatches(batchItems);
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
    try {
      const result = await api.scanPdfFiles(); setSummary(result); setScanChanges(null); setShowChanges(false); setMessage('资料库扫描完成');
      const [, batchItems] = await Promise.all([search(), api.listMaterialBatches({})]);
      setBatches(batchItems);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : '资料库扫描失败'); }
    finally { setScanning(false); }
  };
  const viewChanges = async () => {
    if (!summary) return;
    if (scanChanges) { setShowChanges((visible) => !visible); return; }
    setLoadingChanges(true); setError('');
    try { setScanChanges(await api.getFileScanChanges(summary.scanId)); setShowChanges(true); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '扫描变化加载失败'); }
    finally { setLoadingChanges(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); setError(''); void search(filters, 1); };
  const setFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }));
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const missingOnPage = files.filter((file) => !file.isPresent);
  const toggleSelection = (id: number) => setSelectedIds((current) => current.includes(id)
    ? current.filter((selected) => selected !== id) : [...current, id]);
  const requestCleanup = (ids: number[]) => {
    if (!ids.length) return;
    setError(''); setMessage(''); setPendingCleanupIds([...new Set(ids)]);
  };
  const confirmCleanup = async () => {
    if (!pendingCleanupIds) return;
    const ids = pendingCleanupIds; setCleaning(true); setError('');
    try {
      const result = await api.cleanupPdfFiles(ids);
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      setPendingCleanupIds(null); setMessage(`已清理 ${result.cleaned} 条缺失 PDF 索引记录`);
      await search(filters, page);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'PDF 索引清理失败'); }
    finally { setCleaning(false); }
  };
  const requestIndexClear = async () => {
    setError(''); setMessage(''); setClearingIndex(true);
    try { setIndexClearPreview(await api.getFileIndexClearPreview()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '清空资料库索引信息加载失败'); }
    finally { setClearingIndex(false); }
  };
  const cancelIndexClear = () => { if (!clearingIndex) { setIndexClearPreview(null); setIndexClearConfirming(false); setIndexClearPhrase(''); } };
  const refreshAfterIndexClear = async (nextFilters: typeof filters) => {
    const request = ++searchRequest.current; setLoading(true);
    try {
      const [result, batchItems] = await Promise.all([
        api.searchPdfFiles(searchInput(nextFilters, 1)), api.listMaterialBatches({}),
      ]);
      if (request !== searchRequest.current) return;
      setFiles(result.items); setTotal(result.total); setPage(result.page); setBatches(batchItems);
    } catch (reason) {
      if (request === searchRequest.current) {
        const detail = reason instanceof Error ? reason.message : '请重新加载列表';
        setError(`索引已清空，但列表刷新失败：${detail}`);
      }
    } finally { if (request === searchRequest.current) setLoading(false); }
  };
  const confirmIndexClear = async () => {
    if (indexClearPhrase !== '清空资料库索引') return;
    setClearingIndex(true); setError('');
    try {
      const result = await api.clearFileIndex(indexClearPhrase);
      const nextFilters = { ...filters, materialBatchId: '' };
      setIndexClearPreview(null); setIndexClearConfirming(false); setIndexClearPhrase(''); setSelectedIds([]); setPendingCleanupIds(null);
      setFilters(nextFilters);
      setFiles([]); setTotal(0); setBatches([]); setPage(1);
      setSummary(null); setScanChanges(null); setShowChanges(false);
      setMessage(`已清空 ${result.pdfFiles} 条 PDF 索引、${result.qrCodeFiles} 条二维码索引、${result.materialBatches} 个资料批次、${result.scanChanges} 条扫描变化和 ${result.scanRuns} 次扫描记录`);
      await refreshAfterIndexClear(nextFilters);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '清空资料库索引失败'); }
    finally { setClearingIndex(false); }
  };
  const openLocation = async (id: number) => {
    setError(''); setMessage('');
    const result = await openIndexedPdfLocation(id);
    if (!result.ok) setError(result.error?.message ?? '打开文件位置失败');
  };

  return <section className="page-surface page-enter files-page">
    <header className="page-header"><div><p className="eyebrow">PDF WORKSPACE</p><h1>PDF 文件中心</h1><p>只读扫描本地资料库，可靠图号自动登记，异常候选留待确认。</p></div>
      <span className="record-count">{total} 个索引文件</span></header>
    <p className="info-banner">同一图号出现在不同资料批次属于正常历史快照；只有规范化后的同一相对路径重复建立索引才是扫描重复。</p>
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
    <section className="file-cleanup-toolbar" aria-label="资料库索引清空">
      <span>仅清空扫描生成的数据库索引，不会释放任何已占用图号。</span>
      <button className="text-button danger" type="button" disabled={scanning || clearingIndex || !settings.configured}
        onClick={() => void requestIndexClear()}>清空资料库索引</button>
    </section>
    {error && <p className="error-banner">{error}</p>}{message && <p className="success-banner"><strong>{message}</strong></p>}
    {summary && <>
      <section className="scan-summary" aria-label="当前资料库状态"><strong>当前资料库状态</strong><span>{summary.currentTotal} 个索引文件（PDF / 二维码）</span>
        <span>{summary.matched} 已匹配</span><span>{summary.pending} 待确认</span>
        <span>{summary.historicalRegistered} 个历史图号已登记</span><span>{summary.unmatched} 未匹配</span>
        <span>{summary.conflict} 冲突</span><span>{summary.source} 转曲前</span><span>{summary.outlined} 转曲后</span></section>
      <section className="scan-comparison" aria-label="与上一次扫描相比"><div><strong>与上一次扫描相比</strong>
        <span>{summary.comparison.added} 新增</span><span>{summary.comparison.missing} 删除/缺失</span>
        <span>{summary.comparison.moved} 路径变化</span><span>{summary.comparison.changed} 内容变化</span>
        <span>{summary.comparison.unchanged} 无变化</span></div>
        <button className="text-button" type="button" disabled={loadingChanges} aria-expanded={showChanges}
          aria-controls="scan-change-details" onClick={() => void viewChanges()}>{loadingChanges ? '加载变化中…' : showChanges ? '收起本次变化' : '查看本次变化'}</button></section>
      {showChanges && scanChanges && <section id="scan-change-details" className="scan-change-details" aria-label="本次扫描变化详情">
        {([['新增', scanChanges.changes.added], ['删除/缺失', scanChanges.changes.missing], ['变化', scanChanges.changes.changed]] as const)
          .map(([label, items]) => <div className="scan-change-group" key={label}><strong>{label}</strong>
            {items.length ? <ul>{items.map((item) => <li key={`${label}-${item.id}`}><span>{item.indexKind === 'qr' ? '二维码' : 'PDF'} · {item.fileName}</span><small className="mono">{item.relativePath}{item.previousRelativePath ? ` ← ${item.previousRelativePath}` : ''}</small></li>)}</ul>
              : <p className="muted-text">无</p>}</div>)}
      </section>}
    </>}
    <form className="filter-bar files-filter" onSubmit={submit}>
      <label><span>文件关键词</span><input aria-label="文件关键词" value={filters.keyword} onChange={(event) => setFilter('keyword', event.target.value)} /></label>
      <label><span>产品档案</span><select aria-label="产品档案" value={filters.productId} onChange={(event) => setFilter('productId', event.target.value)}><option value="">全部</option>{products.map((product) => <option value={product.id} key={product.id}>{product.sku ?? '待补录'} · {product.model}</option>)}</select></label>
      <label><span>资料批次</span><select aria-label="资料批次" value={filters.materialBatchId} onChange={(event) => setFilter('materialBatchId', event.target.value)}><option value="">全部</option>{batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.sku ?? 'SKU待识别'} · {batch.model ?? '型号待识别'} · {batch.name}</option>)}</select></label>
      <label><span>匹配状态</span><select aria-label="匹配状态" value={filters.matchStatus} onChange={(event) => setFilter('matchStatus', event.target.value)}>
        <option value="">全部</option><option value="matched">已匹配</option><option value="pending">待确认</option><option value="unmatched">未匹配</option><option value="conflict">冲突</option></select></label>
      <label><span>转曲类型</span><select aria-label="转曲类型" value={filters.conversionType} onChange={(event) => setFilter('conversionType', event.target.value)}>
        <option value="">全部</option><option value="source">转曲前</option><option value="outlined">转曲后</option></select></label>
      <label><span>存在状态</span><select aria-label="存在状态" value={filters.presence} onChange={(event) => setFilter('presence', event.target.value)}>
        <option value="present">当前存在</option><option value="missing">已缺失</option><option value="all">全部</option></select></label>
      <button className="primary-button" type="submit" disabled={loading || scanning}>{loading ? '加载中…' : '筛选 PDF'}</button>
    </form>
    {missingOnPage.length > 0 && <section className="file-cleanup-toolbar" aria-label="缺失 PDF 索引清理">
      <span>本页有 {missingOnPage.length} 条缺失索引记录</span>
      <div>
        <button className="secondary-button" type="button" disabled={cleaning}
          onClick={() => setSelectedIds(missingOnPage.map((file) => file.id))}>全选本页缺失记录</button>
        <button className="secondary-button" type="button" disabled={cleaning || selectedIds.length === 0}
          onClick={() => setSelectedIds([])}>取消选择</button>
        <button className="text-button danger" type="button" disabled={cleaning || selectedIds.length === 0}
          onClick={() => requestCleanup(selectedIds)}>清理已选索引记录 ({selectedIds.length})</button>
      </div>
    </section>}
    {pendingCleanupIds && <section className="file-cleanup-confirmation" role="dialog" aria-label="确认清理 PDF 索引记录">
      <strong>请再次确认清理 {pendingCleanupIds.length} 条缺失 PDF 索引记录</strong>
      <p>此操作只清理数据库索引记录，不会删除磁盘文件，也不会释放历史图号。</p>
      <div><button className="secondary-button" type="button" disabled={cleaning} onClick={() => setPendingCleanupIds(null)}>取消</button>
        <button className="primary-button" type="button" disabled={cleaning} onClick={() => void confirmCleanup()}>{cleaning ? '清理中…' : '确认清理索引记录'}</button></div>
    </section>}
    {indexClearPreview && !indexClearConfirming && <section className="file-cleanup-confirmation" role="dialog" aria-label="确认清空资料库索引">
      <strong>清空资料库索引</strong>
      <p>资料根目录：{indexClearPreview.workspaceRoot ?? '未配置'}</p>
      <ul><li>PDF 索引：{indexClearPreview.counts.pdfFiles}</li><li>二维码索引：{indexClearPreview.counts.qrCodeFiles}</li><li>资料批次：{indexClearPreview.counts.materialBatches}</li>
        <li>扫描变化：{indexClearPreview.counts.scanChanges}</li><li>扫描记录：{indexClearPreview.counts.scanRuns}</li></ul>
      <p>不会删除 {indexClearPreview.workspaceRoot ?? '当前资料根目录'} 中的任何实际文件。</p>
      <div><button className="secondary-button" type="button" disabled={clearingIndex} onClick={cancelIndexClear}>取消</button>
        <button className="primary-button" type="button" disabled={clearingIndex} onClick={() => setIndexClearConfirming(true)}>继续</button></div>
    </section>}
    {indexClearPreview && indexClearConfirming && <section className="file-cleanup-confirmation" role="dialog" aria-label="最终确认清空资料库索引">
      <strong>请输入“清空资料库索引”以继续</strong>
      <p>不会删除 {indexClearPreview.workspaceRoot ?? '当前资料根目录'} 中的任何实际文件，也不会释放历史图号。</p>
      <label><span>确认短语</span><input aria-label="确认短语" value={indexClearPhrase} disabled={clearingIndex}
        onChange={(event) => setIndexClearPhrase(event.target.value)} /></label>
      <div><button className="secondary-button" type="button" disabled={clearingIndex} onClick={cancelIndexClear}>取消</button>
        <button className="primary-button" type="button" disabled={clearingIndex || indexClearPhrase !== '清空资料库索引'}
          onClick={() => void confirmIndexClear()}>{clearingIndex ? '清空中…' : '确认清空资料库索引'}</button></div>
    </section>}
    {!loading && files.length === 0 ? <EmptyState symbol="P" title={settings.configured ? '没有符合条件的 PDF' : '请先设置资料根目录'}
      description={settings.configured ? '调整筛选条件，或重新扫描资料库。' : '设置后扫描，PDF 索引将显示在这里。'} /> :
      <DataTable items={files} columns={[
        { key: 'select', label: '选择', render: (item) => item.isPresent ? <span className="muted-text">—</span> : <input type="checkbox"
          aria-label={`选择 ${item.fileName}`} checked={selectedIds.includes(item.id)} disabled={cleaning}
          onChange={() => toggleSelection(item.id)} /> },
        { key: 'name', label: '文件名', render: (item) => <span className="file-primary">{item.fileName}</span> },
        { key: 'path', label: '相对路径', render: (item) => <span className="file-relative mono">{item.relativePath}</span> },
        { key: 'batch', label: '资料批次', render: (item) => item.materialBatchName
          ? <span>{item.materialBatchName}{item.materialBatchStatus === 'pending' ? ' · 待确认' : ''}</span>
          : <span className="muted-text">未归入批次</span> },
        { key: 'product', label: '产品', render: (item) => item.productId ? <span className="file-product"><strong>{item.sku ?? '待补录'} · {item.model}</strong><small>{item.productCategory}</small></span> : <span className="muted-text">待关联</span> },
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
        { key: 'actions', label: '操作', render: (item) => <div className="file-row-actions">
          <button className="text-button" type="button" disabled={!item.isPresent}
            aria-label={`打开 ${item.fileName} 的位置`} onClick={() => void openLocation(item.id)}>{item.isPresent ? '打开位置' : '文件缺失'}</button>
          {!item.isPresent && <button className="text-button danger" type="button" disabled={cleaning}
            aria-label={`清理 ${item.fileName} 的索引记录`} onClick={() => requestCleanup([item.id])}>清理索引</button>}
        </div> },
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
