import { ProductBatchNavigation } from '../components/ProductBatchNavigation';
import './drawing-library.css';
import { CopyButton } from '../components/CopyButton';
import { PageHeader } from '../components/PageHeader';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { materialBatchLabel } from '../../core/files/material-batch-label';

import { ModuleWorkspace } from '../components/ModuleWorkspace';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import type { FileIndexClearPreviewView, FileScanChangesView, MaterialBatchView, PdfFileView, PdfScanSummaryView, PlannerApi, ProductView, WorkspaceSettingsView } from '../data/client';
import { openIndexedPdfLocation } from '../desktop-files';
import { createFilesMockApi, filesScenarios, initialFilesScenario, isFilesMockEnabled, type FilesScenario } from './files-mock';

const initialFilters = { keyword: '', productId: '', materialBatchId: '', matchStatus: '', conversionType: '', presence: 'present' };
const pageSize = 50;
export interface DrawingPdfNavigationTarget { productId?: number; materialBatchId?: number; fullCode: string; }

function FilePath({ path, name, onClose }: { path: string; name: string; onClose?: () => void }) {
  const [feedback, setFeedback] = useState('');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setFeedback('已复制');
    } catch { setFeedback('复制不可用，请选中完整路径复制'); }
  };
  return <div className="files-path-row"><span className="files-path-full">{path}</span>
      <div className="files-path-actions"><CopyButton label="复制路径" type="button" className="text-button" aria-label={`复制 ${name} 的完整相对路径`} onClick={() => void copy()} />
      {onClose && <button type="button" className="text-button" onClick={onClose}>收起路径</button>}
      {feedback && <small role="status">{feedback}</small>}</div>
  </div>;
}

function FileBatch({ item, batches }: { item: PdfFileView; batches: MaterialBatchView[] }) {
  const batch = batches.find(value => value.id === item.materialBatchId);
  const state = batch?.isPresent === false ? 'missing'
    : item.materialBatchStatus === 'pending' ? 'pending' : batch?.currentState ?? 'indeterminate';
  const labels = { current: '当前批次', historical: '历史批次', pending: '待确认',
    missing: '批次缺失', unbatched: '未分批', indeterminate: '当前关系未确定' };
  return item.materialBatchName ? <span className={`files-batch ${state}`}><small className="files-status">{labels[state]}</small></span>
    : <span className="muted-text">未归入批次</span>;
}

function searchInput(values: typeof initialFilters, page: number) {
  return { keyword: values.keyword, matchStatus: values.matchStatus, conversionType: values.conversionType, presence: values.presence,
    ...(values.productId ? { productId: Number(values.productId) } : {}),
    ...(values.materialBatchId ? { materialBatchId: Number(values.materialBatchId) } : {}), page, pageSize };
}

export function FilesPage({ api, initialTarget }: { api: PlannerApi; initialTarget?: DrawingPdfNavigationTarget | null }) {
  const mock = isFilesMockEnabled();
  const [scenario, setScenario] = useState<FilesScenario>(initialFilesScenario);
  const mockApi = useMemo(() => createFilesMockApi(scenario), [scenario]);
  return <>
    {mock && <section className="info-banner files-preview" aria-label="PDF 开发预览"><span><strong>开发预览 Mock</strong> · 仅内存数据，扫描、清理、任务与定位均已隔离。移除 ?mock=files 退出。</span>
      <label>压力场景<select aria-label="PDF 压力场景" value={scenario} onChange={event => setScenario(event.target.value as FilesScenario)}>{Object.entries(filesScenarios).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></section>}
    <FilesWorkspace key={mock ? scenario : 'live'} api={mock ? mockApi : api} mock={mock} initialTarget={initialTarget} />
  </>;
}

function FilesWorkspace({ api, mock, initialTarget }: { api: PlannerApi; mock: boolean; initialTarget?: DrawingPdfNavigationTarget | null }) {
  const [detailFile, setDetailFile] = useState<PdfFileView | null>(null);
  const [expandedPathId, setExpandedPathId] = useState<number | null>(null);
  const [settings, setSettings] = useState<WorkspaceSettingsView>({ workspaceRoot: null, configured: false, available: false });
  const [rootInput, setRootInput] = useState(''); const [files, setFiles] = useState<PdfFileView[]>([]);
  const [products, setProducts] = useState<ProductView[]>([]);
  const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [total, setTotal] = useState(0); const [page, setPage] = useState(1); const [filters, setFilters] = useState(() => initialTarget ? { ...initialFilters, keyword: initialTarget.fullCode, productId: initialTarget.productId ? String(initialTarget.productId) : '', materialBatchId: initialTarget.materialBatchId ? String(initialTarget.materialBatchId) : '', presence: 'all' } : initialFilters);
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
      setDetailFile(current => current ? result.items.find(item => item.id === current.id) ?? null : null);
    } catch (reason) {
      if (request === searchRequest.current) setError(reason instanceof Error ? reason.message : 'PDF 文件加载失败');
    } finally { if (request === searchRequest.current) setLoading(false); }
  };

  useEffect(() => {
    const request = ++searchRequest.current; setLoading(true); setError('');
    void Promise.all([api.getWorkspaceSettings(), api.searchPdfFiles(searchInput(filters, 1)),
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
      setDetailFile(null); setExpandedPathId(null);
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
    if (mock) { setMessage('Mock：文件定位已隔离，不访问桌面或磁盘文件。'); return; }
    const result = await openIndexedPdfLocation(id);
    if (!result.ok) setError(result.error?.message ?? '打开文件位置失败');
  };

  const navigate = (productId: string, materialBatchId = '') => {
    const next = { ...filters, productId, materialBatchId }; setFilters(next); setSelectedIds([]); setDetailFile(null); setError(''); void search(next, 1);
  };
  const navigation = <ProductBatchNavigation mode="files" products={products} batches={batches}
    scope={{kind: filters.materialBatchId ? 'batch' : filters.productId ? 'product' : 'all', productId: filters.productId ? Number(filters.productId) : undefined, batchId: filters.materialBatchId ? Number(filters.materialBatchId) : undefined, title:''}}
    onSelect={scope => {
      if (scope.kind !== 'all') { navigate(scope.productId ? String(scope.productId) : '', scope.batchId ? String(scope.batchId) : ''); return; }
      const next = {...initialFilters, presence:'all'}; setFilters(next); setSelectedIds([]); setDetailFile(null); setError(''); setMessage(''); void search(next,1);
    }} footer={<section className="drawing-query-navigation" aria-label="文件查询"><h3>文件查询</h3>
      <button className="secondary-button" type="button" onClick={() => { const next = { ...initialFilters, presence: 'all', matchStatus: 'pending' }; setFilters(next); setSelectedIds([]); setDetailFile(null); setError(''); void search(next, 1); }}>待确认文件</button>
    </section>} />;
  const detail = detailFile ? <aside className="file-detail" aria-label="文件详情">
    <button className="secondary-button panel-close" type="button" onClick={() => { setDetailFile(null); document.getElementById(`file-detail-toggle-${detailFile.id}`)?.focus(); }}>关闭文件详情</button>
    <h2>文件详情</h2><p className="file-primary">{detailFile.fileName}</p>
    {error && <p className="error-banner" role="alert">{error}</p>}
    <dl>{[
      ['完整图号', detailFile.fullCode ?? detailFile.historicalFullCode ?? '未可靠匹配'],
      ['产品', detailFile.productId ? `${detailFile.sku ?? '待补录'} · ${detailFile.model}` : '待关联'],
      ['资料批次', detailFile.materialBatchName ? materialBatchLabel(detailFile.materialBatchName) : '未归入批次'],
      ['转曲类型', detailFile.conversionType === 'outlined' ? '转曲后' : '转曲前'],
      ['文件状态', detailFile.isPresent ? '存在' : '缺失'],
      ['匹配状态', detailFile.matchStatus === 'matched' ? '已匹配' : detailFile.matchStatus === 'pending' ? '待确认' : detailFile.matchStatus === 'conflict' ? '冲突' : '未匹配'],
      ['文件大小', `${detailFile.sizeBytes} B`], ['修改时间', detailFile.modifiedAt], ['索引扫描时间', detailFile.scannedAt],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    {detailFile.classificationWarning && <p className="info-banner">{detailFile.classificationWarning}</p>}
    <h3>完整相对路径</h3><FilePath key={detailFile.id} path={detailFile.relativePath} name={detailFile.fileName} />
    <button className="secondary-button" type="button" disabled={!detailFile.isPresent} onClick={() => void openLocation(detailFile.id)}>打开文件位置</button>
    {!detailFile.isPresent && <p className="muted-text">文件已缺失，不能定位；索引清理仍使用列表中的独立确认操作。</p>}
  </aside> : null;
  return <section className="page-surface page-enter files-page">
    <PageHeader title="PDF 文件中心" description="只读扫描本地资料库，可靠图号自动登记，异常候选留待确认。">
      <span className="record-count">{total} 个索引文件</span></PageHeader>
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
    {error && !detailFile && <p className="error-banner" role="alert">{error}</p>}{message && <p className="success-banner" role="status"><strong>{message}</strong></p>}
    {mock && scanning && <section className="scan-comparison" role="status"><span>正在模拟扫描 · 仅处理内存样例，不读取文件</span><button type="button" className="secondary-button" onClick={() => void api.listLocalTasks().then(tasks => { const task = tasks.find(item => item.status === 'running'); if (task) return api.cancelLocalTask(task.id); }).catch(reason => setError(String(reason)))}>取消模拟扫描</button></section>}
    {summary && <>
      <section className="scan-summary" aria-label="当前资料库状态"><strong>当前索引统计</strong><span>{summary.currentTotal} 个索引文件（PDF / 二维码）</span>
        <span className="files-stat-scope">PDF：{summary.total} 个本次扫描文件</span>
        <span>{summary.matched} 已匹配</span><span>{summary.pending} 待确认</span>
        <span>{summary.historicalRegistered} 个历史图号已登记</span><span>{summary.unmatched} 未匹配</span>
        <span>{summary.conflict} 冲突</span><span>{summary.source} 转曲前</span><span>{summary.outlined} 转曲后</span></section>
      <section className="scan-comparison" aria-label="与上一次扫描相比"><div><strong>本次扫描变化（PDF / 二维码）</strong>
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
      <label><span>资料批次</span><select aria-label="资料批次" value={filters.materialBatchId} onChange={(event) => setFilter('materialBatchId', event.target.value)}><option value="">全部</option>{batches.map((batch) => <option value={batch.id} key={batch.id}>{batch.sku ?? 'SKU待识别'} · {batch.model ?? '型号待识别'} · {materialBatchLabel(batch.name)}</option>)}</select></label>
      <label><span>匹配状态</span><select aria-label="匹配状态" value={filters.matchStatus} onChange={(event) => setFilter('matchStatus', event.target.value)}>
        <option value="">全部</option><option value="matched">已匹配</option><option value="pending">待确认</option><option value="unmatched">未匹配</option><option value="conflict">冲突</option></select></label>
      <label><span>转曲类型</span><select aria-label="转曲类型" value={filters.conversionType} onChange={(event) => setFilter('conversionType', event.target.value)}>
        <option value="">全部</option><option value="source">转曲前</option><option value="outlined">转曲后</option></select></label>
      <label><span>存在状态</span><select aria-label="存在状态" value={filters.presence} onChange={(event) => setFilter('presence', event.target.value)}>
        <option value="present">当前存在</option><option value="missing">已缺失</option><option value="all">全部</option></select></label>
      <button className="primary-button" type="submit" disabled={loading || scanning}>{loading ? '加载中…' : '筛选 PDF'}</button>
    </form>
    <ModuleWorkspace fileWorkspace resizable navigation={navigation} detail={detail} detailLabel="文件详情" detailIdentity={detailFile?.id} onCloseDetail={() => { setDetailFile(null); }}>
    <p className="files-selection-note">仅缺失记录可选，存在文件的选择控件已禁用。{mock && ' Mock：选择与清理仅作用于内存预览。'}</p>
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
    {loading && <p className="info-banner" role="status">正在加载 PDF 文件索引…</p>}
    {!loading && !error && files.length === 0 ? <EmptyState symbol="P" title={settings.configured ? '没有符合条件的 PDF' : '请先设置资料根目录'}
      description={settings.configured ? '调整筛选条件，或重新扫描资料库。' : '设置后扫描，PDF 索引将显示在这里。'} /> :
      <DataTable items={files} renderExpandedRow={item => expandedPathId === item.id
        ? <div id={`file-path-${item.id}`}><FilePath path={item.relativePath} name={item.fileName} onClose={() => {
          setExpandedPathId(null);
          document.getElementById(`file-path-toggle-${item.id}`)?.focus();
        }} /></div> : null} columns={[
        { key: 'select', label: '选择', render: (item) => <input type="checkbox"
          aria-label={`选择 ${item.fileName}`} checked={selectedIds.includes(item.id)} disabled={cleaning || item.isPresent}
          onChange={() => toggleSelection(item.id)} /> },
        { key: 'name', label: '文件名', render: (item) => <div className="files-name-row"><button id={`file-detail-toggle-${item.id}`} className="files-name-button" type="button" aria-label={`文件详情 ${item.fileName}`} aria-expanded={detailFile?.id === item.id} onClick={() => setDetailFile(item)}><span className="file-primary">{item.fileName.replace(/\.pdf$/i, '')}</span></button></div> },
        { key: 'batch', label: '资料批次', render: (item) => <span className="files-batch-code">{item.materialBatchName ?? '未归入批次'}</span> },
        { key: 'batchStatus', label: '批次状态', render: (item) => <FileBatch item={item} batches={batches} /> },
        { key: 'product', label: '产品', render: (item) => item.productId ? <span className="file-product"><strong>{item.productCategory} · {item.model}</strong><small>SKU：{item.sku ?? '待补录'}</small></span> : <span className="muted-text">待关联</span> },
        { key: 'drawing', label: '匹配图号', render: (item) => item.fullCode ? <span className="file-match matched">
          <span className="code-cell">{item.fullCode}</span>
          {item.classificationWarning && <span className="file-warning">{item.classificationWarning === 'conversion-conflict'
            ? '目录与文件名的转曲标记冲突' : item.classificationWarning}</span>}
        </span>
          : item.matchStatus === 'pending' ? <span className="file-match pending">
            <span className="code-cell">{item.detectedCodes.join(' / ')}</span>
            {item.classificationWarning && <small className="files-match-reason">{item.classificationWarning}</small>}
          </span>
            : <span className="muted-text">—</span> },
        { key: 'matchStatus', label: '匹配状态', render: item => <span className={`file-match ${item.fullCode ? 'matched' : item.matchStatus}`}>
          <span className="files-match-badge">{item.fullCode ? '已匹配' : item.matchStatus === 'pending' ? '待确认' : item.matchStatus === 'conflict' ? '多图号冲突' : '未匹配'}</span></span> },
        { key: 'conversion', label: '类型', render: (item) => <span className={`conversion-label ${item.conversionType}`}>{item.conversionType === 'outlined' ? '转曲后' : '转曲前'}</span> },
        { key: 'presence', label: '文件状态', render: (item) => <span className={`presence-label ${item.isPresent ? 'present' : 'missing'}`}>{item.isPresent ? '存在' : '缺失'}</span> },
        { key: 'actions', label: '操作', render: (item) => <div className="file-row-actions">
          <button id={`file-path-toggle-${item.id}`} type="button" className="files-path-button" aria-label={`查看 ${item.fileName} 的完整相对路径`}
            aria-expanded={expandedPathId === item.id} aria-controls={`file-path-${item.id}`}
            onClick={() => setExpandedPathId(expandedPathId === item.id ? null : item.id)}>{expandedPathId === item.id ? '收起路径' : '查看路径'}</button>
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
    </ModuleWorkspace>
    <details className="files-index-maintenance"><summary>索引维护</summary><section className="file-cleanup-toolbar" aria-label="资料库索引清空">
      <div><strong>清空资料库索引</strong><p>影响 PDF、二维码、资料批次与扫描记录；不删除磁盘原始文件，不会释放任何已占用图号。</p></div>
      <button className="text-button danger" type="button" disabled={scanning || clearingIndex || !settings.configured} onClick={() => void requestIndexClear()}>清空资料库索引</button>
    </section></details>
  </section>;
}
