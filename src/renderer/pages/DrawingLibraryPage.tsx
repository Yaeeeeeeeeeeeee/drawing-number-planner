import { PageHeader } from '../components/PageHeader';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { materialBatchLabel } from '../../core/files/material-batch-label';

import type {
  DictionaryItemView,
  DrawingDetailView,
  DrawingDeletionPreviewView,
  DrawingFileView,
  DrawingView,
  MaterialBatchLogicalMaterialView,
  MaterialBatchView,
  PdfFileView,
  PlannerApi,
} from '../data/client';
import { ModuleWorkspace } from '../components/ModuleWorkspace';
import { DataTable } from '../components/DataTable';
import { QueryFeedback, type QueryState } from '../components/QueryFeedback';
import { EmptyState } from '../components/EmptyState';
import { DrawingBatchDeletion } from '../components/DrawingBatchDeletion';
import { openIndexedPdfLocation } from '../desktop-files';
import { createDrawingLibraryMockApi, isDrawingLibraryMockEnabled } from './drawing-library-mock';

const emptyFilters = { drawingNumber: '', model: '', keyword: '', sku: '', productCategory: '', sourcePresence: 'all', outlinedPresence: 'all', brandId: '', appearanceId: '', mainCategoryId: '', projectItemId: '', colorId: '', materialBatchId: '', status: '', deletionState: 'normal', exactDrawingNumber: false };

export function DrawingLibraryPage({ api: realApi }: { api: PlannerApi }) {
  const mockMode = isDrawingLibraryMockEnabled();
  const api = useMemo(() => mockMode ? createDrawingLibraryMockApi() : realApi, [mockMode, realApi]);
  const disclosureButtons = useRef(new Map<number, HTMLButtonElement>());
  const detailRequest = useRef(0);
  const pdfRequest = useRef(0);
  useEffect(() => () => { detailRequest.current++; }, []);
  const [view, setView] = useState<'drawing' | 'batch'>('drawing');
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState<Record<string, DictionaryItemView[]>>({});
  const [items, setItems] = useState<DrawingView[]>([]); const [total, setTotal] = useState(0);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(50);
  useEffect(() => { setCheckedIds([]); }, [filters, page, pageSize, view]);
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [materialBatchOptions, setMaterialBatchOptions] = useState<MaterialBatchView[]>([]);
  const [selected, setSelected] = useState<DrawingDetailView | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [queryState, setQueryState] = useState<QueryState>('idle');
  const [queryError, setQueryError] = useState('');
  const [queriedValues, setQueriedValues] = useState<Record<string, string | number | boolean>>(emptyFilters);
  const [pdfCandidates, setPdfCandidates] = useState<PdfFileView[]>([]); const [pdfKeyword, setPdfKeyword] = useState('');
  const [selectedPdfId, setSelectedPdfId] = useState(''); const [maintaining, setMaintaining] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [deletionPreview, setDeletionPreview] = useState<DrawingDeletionPreviewView | null>(null);
  const [deletionMode, setDeletionMode] = useState<'retain_occupied' | 'release'>('retain_occupied');
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const [batchSearch, setBatchSearch] = useState('');
  const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<MaterialBatchView | null>(null);
  const [batchMaterials, setBatchMaterials] = useState<MaterialBatchLogicalMaterialView[]>([]);
  const search = async (values: Record<string, string | number | boolean> = filters, requestedPage = page, requestedPageSize = pageSize) => {
    setLoading(true); setQueryState('loading'); setQueryError(''); setQueriedValues(values); setError('');
    try {
      const result = await api.searchDrawings({ ...values,
        brandId: values.brandId ? Number(values.brandId) : '', appearanceId: values.appearanceId ? Number(values.appearanceId) : '',
        mainCategoryId: values.mainCategoryId ? Number(values.mainCategoryId) : '', projectItemId: values.projectItemId ? Number(values.projectItemId) : '',
        colorId: values.colorId ? Number(values.colorId) : '', materialBatchId: values.materialBatchId ? Number(values.materialBatchId) : '',
        page: requestedPage, pageSize: requestedPageSize,
      });
      const lastPage = Math.max(1, Math.ceil(result.total / requestedPageSize));
      if (requestedPage > lastPage) return await search(values, lastPage, requestedPageSize);
      setItems(result.items); setTotal(result.total); setPage(requestedPage); setQueryState('ready');
    }
    catch (reason) { setQueryState('failed'); setQueryError(reason instanceof Error ? reason.message : '图号检索失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void search();
    void Promise.all([
      Promise.all(['brand', 'appearance', 'main_category', 'project_item', 'color'].map((type) => api.listDictionaries(type, false))),
      api.listProducts?.({ status: 'all' }) ?? Promise.resolve([]), api.listMaterialBatches?.() ?? Promise.resolve([]),
    ])
      .then(([[brand, appearance, main_category, project_item, color], products, materialBatches]) => {
        setOptions({ brand, appearance, main_category, project_item, color });
        setProductCategories([...new Set(products.map((product) => product.productCategory).filter(Boolean))].sort());
        setMaterialBatchOptions(materialBatches);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : '筛选项加载失败'));
  }, []);
  const set = (key: keyof typeof filters, value: string | boolean) => setFilters((current) => ({ ...current, [key]: value,
    ...(key === 'mainCategoryId' ? { projectItemId: '' } : {}),
  }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPage(1); void search(filters, 1, pageSize);
  };
  const loadPdfCandidates = async (keyword = '') => {
    if (!api.searchPdfFiles) return;
    const request = ++pdfRequest.current, detail = detailRequest.current;
    try {
      const result = await api.searchPdfFiles({ keyword, presence: 'present', page: 1, pageSize: 100 });
      if (request !== pdfRequest.current || detail !== detailRequest.current) return;
      setPdfCandidates(result.items); setSelectedPdfId(String(result.items[0]?.id ?? ''));
    } catch (reason) { if (request === pdfRequest.current && detail === detailRequest.current) throw reason; }
  };
  const openDetail = async (item: DrawingView) => {
    const request = ++detailRequest.current;
    pdfRequest.current++;
    try {
      setError(''); const detail = await api.getDrawing(item.id);
      if (request !== detailRequest.current) return;
      setSelected(detail); setPdfKeyword(''); setSelectedPdfId('');
      setDeletionPreview(null); setDeletionMode('retain_occupied'); setDeletionReason(''); setDeletionConfirmation('');
      setPdfCandidates([]);
      if (!detail.readOnly && api.searchPdfFiles) {
        const candidateRequest = ++pdfRequest.current;
        const result = await api.searchPdfFiles({ keyword: '', presence: 'present', page: 1, pageSize: 100 });
        if (request === detailRequest.current && candidateRequest === pdfRequest.current) { setPdfCandidates(result.items); setSelectedPdfId(String(result.items[0]?.id ?? '')); }
      }
    } catch (reason) { if (request === detailRequest.current) setError(reason instanceof Error ? reason.message : '详情加载失败'); }
  };
  const refreshDetail = async (id: number) => {
    const detail = await api.getDrawing(id); setSelected(current => current?.id === id ? detail : current);
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...detail } : item));
  };
  const changeStatus = async (target: 'active' | 'voided') => {
    if (!selected) return;
    const confirmed = window.confirm(target === 'active'
      ? '确认将该图号变更为正式使用？此操作会记录业务状态。'
      : '确认作废该图号？之后可以恢复使用，作废期间号码继续占用。');
    if (!confirmed) return;
    setMaintaining(true); setError('');
    try { if (target === 'active') await api.activateDrawing(selected.id); else await api.voidDrawing(selected.id); await refreshDetail(selected.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '业务状态更新失败'); }
    finally { setMaintaining(false); }
  };
  const changeHistoricalStatus = async (target: 'active' | 'inactive') => {
    if (!selected) return;
    const confirmed = window.confirm(target === 'active'
      ? '确认启用该历史图号？启用不会改变文件完整性，也不会释放或重新占用号码。'
      : '确认停用该历史图号？停用不释放号码，也不会改变文件完整性。');
    if (!confirmed) return;
    setMaintaining(true); setError('');
    try {
      if (target === 'active') await api.activateHistoricalDrawing(selected.id);
      else await api.deactivateHistoricalDrawing(selected.id);
      await refreshDetail(selected.id);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '历史图号状态更新失败'); }
    finally { setMaintaining(false); }
  };
  const beginDrawingDeletion = async () => {
    if (!selected) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try {
      const preview = await api.getDrawingDeletionPreview(selected.id);
      if (request !== detailRequest.current) return;
      setDeletionPreview(preview); if (selected.deletedAt) setDeletionMode('release');
    }
    catch (reason) { if (request === detailRequest.current) setError(reason instanceof Error ? reason.message : '删除引用检查失败'); }
    finally { setMaintaining(false); }
  };
  const confirmDrawingDeletion = async () => {
    if (!selected || !deletionPreview) return;
    if (!deletionPreview.deletable) { setError(deletionPreview.blockers.map((item) => item.message).join('；')); return; }
    if (deletionMode === 'release' && deletionConfirmation.trim() !== selected.fullCode) {
      setError('彻底释放前，请完整输入当前图号进行确认'); return;
    }
    const warning = deletionMode === 'release'
      ? `确认彻底删除并释放 ${selected.fullCode}？释放后该号码未来可能被重新规划使用。`
      : `确认删除 ${selected.fullCode} 的正常记录并继续保留占号？`;
    if (!window.confirm(warning)) return;
    setMaintaining(true); setError('');
    try {
      const result = await api.deleteDrawing(selected.id, { mode: deletionMode, confirmedCode: selected.fullCode,
        ...(deletionReason.trim() ? { reason: deletionReason.trim() } : {}) });
      window.alert(result.outcome === 'deleted_retained'
        ? '已删除图号记录，该号码继续保留占用。'
        : '已彻底删除图号，该号码已释放，可重新规划使用。');
      setSelected(null); setDeletionPreview(null); await search(filters, 1, pageSize);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '删除图号失败'); }
    finally { setMaintaining(false); }
  };
  const restoreDrawing = async () => {
    if (!selected || !window.confirm(`确认恢复图号 ${selected.fullCode}？`)) return;
    setMaintaining(true); setError('');
    try { await api.restoreDrawing(selected.id); setSelected(null); await search(filters, 1, pageSize); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '恢复图号失败'); }
    finally { setMaintaining(false); }
  };
  const associatePdf = async (conversionType: 'source' | 'outlined') => {
    if (!selected || !selectedPdfId) return;
    setMaintaining(true); setError('');
    try { await api.associateDrawingPdf(selected.id, Number(selectedPdfId), conversionType); await refreshDetail(selected.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'PDF 关联失败'); }
    finally { setMaintaining(false); }
  };
  const openLocation = async (id: number) => {
    if (mockMode) { setError('Mock 预览不支持磁盘操作'); return; }
    setError(''); const result = await openIndexedPdfLocation(id);
    if (!result.ok) setError(result.error?.message ?? '打开文件位置失败');
  };
  const searchBatches = async () => {
    setLoading(true); setError('');
    try { setBatches(await api.listMaterialBatches({ search: batchSearch })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '资料批次查询失败'); }
    finally { setLoading(false); }
  };
  const openBatch = async (batch: MaterialBatchView) => {
    setError('');
    try { setSelectedBatch(batch); setBatchMaterials(await api.getMaterialBatchMaterials(batch.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批次文件加载失败'); }
  };
  const dictionarySelect = (label: string, key: 'brandId' | 'appearanceId' | 'mainCategoryId' | 'projectItemId' | 'colorId', type: string) => {
    const items = type === 'project_item' && filters.mainCategoryId
      ? (options[type] ?? []).filter((item) => item.parentId === Number(filters.mainCategoryId)) : options[type] ?? [];
    return <label><span>{label}</span><select aria-label={label} value={filters[key]} onChange={(event) => set(key, event.target.value)}><option value="">全部</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = [...new Set([1, page - 1, page, page + 1, totalPages].filter((value) => value >= 1 && value <= totalPages))].sort((left, right) => left - right);
  const goToPage = (nextPage: number) => void search(filters, nextPage, pageSize);

  const detailPanel = selected ? <DrawingDetailPanel selected={selected} errorMessage={error} previewOnly={mockMode} maintaining={maintaining || mockMode}
        pdfKeyword={pdfKeyword} setPdfKeyword={setPdfKeyword} pdfCandidates={pdfCandidates} selectedPdfId={selectedPdfId}
        setSelectedPdfId={setSelectedPdfId} onClose={() => { detailRequest.current++; setSelected(null); disclosureButtons.current.get(selected.id)?.focus(); }} onStatus={changeStatus} onOpen={openLocation}
        onSearchPdf={(keyword) => loadPdfCandidates(keyword)} onAssociate={associatePdf} onHistoricalStatus={changeHistoricalStatus}
        onBeginDelete={beginDrawingDeletion} deletionPreview={deletionPreview}
        deletionMode={deletionMode} setDeletionMode={setDeletionMode} deletionReason={deletionReason}
        setDeletionReason={setDeletionReason} deletionConfirmation={deletionConfirmation}
        setDeletionConfirmation={setDeletionConfirmation} onConfirmDelete={confirmDrawingDeletion}
        onCancelDelete={() => setDeletionPreview(null)} onRestore={restoreDrawing} onError={setError} /> : null;

  return <section className="page-surface page-enter drawing-library-page">
    <PageHeader title="图号库" description="统一检索正式规划与历史扫描图号，并核对文件完整性。"><span className="record-count">{total} 条记录</span></PageHeader>
    {mockMode && <p className="info-banner preview-only-banner">开发预览 Mock：维护及磁盘操作已禁用，仅展示内存样例。关闭方式：移除 URL 中的 <code>?mock=drawing-library</code>。</p>}
    <nav className="segmented-tabs" aria-label="图号库查看方式">
      <button type="button" aria-selected={view === 'drawing' && filters.deletionState === 'normal'} onClick={() => { const next = { ...filters, deletionState: 'normal' }; setFilters(next); setView('drawing'); setSelected(null); setSelectedBatch(null); setPage(1); void search(next, 1, pageSize); }}>按图号</button>
      <button type="button" aria-selected={view === 'batch'} onClick={() => { setView('batch'); setSelected(null); setPage(1); }}>按资料批次</button>
      <button type="button" aria-selected={view === 'drawing' && filters.deletionState.startsWith('deleted')} onClick={() => { const next = { ...emptyFilters, deletionState: 'deleted-retained' }; setFilters(next); setView('drawing'); setSelected(null); setSelectedBatch(null); setMoreFilters(true); setPage(1); void search(next, 1, pageSize); }}>回收站</button>
    </nav>
    {error && !selected && <p className="error-banner" role="alert">{error}</p>}
    {view === 'drawing' ? <>
    <form className="filter-bar filter-grid" onSubmit={submit}>
      <label><span>完整图号</span><input aria-label="完整图号" value={filters.drawingNumber} onChange={(event) => set('drawingNumber', event.target.value)} /></label>
      <label><span>型号</span><input aria-label="型号" value={filters.model} onChange={(event) => set('model', event.target.value)} /></label>
      <label><span>SKU</span><input aria-label="SKU" value={filters.sku} onChange={(event) => set('sku', event.target.value)} /></label>
      <label><span>关键词</span><input aria-label="关键词" value={filters.keyword} onChange={(event) => set('keyword', event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '检索中…' : '检索'}</button>
      <label className="check-field"><input aria-label="精确图号" type="checkbox" checked={filters.exactDrawingNumber} onChange={(event) => set('exactDrawingNumber', event.target.checked)} /><span>精确图号</span></label>
      <button className="text-button" type="button" onClick={() => setMoreFilters((value) => !value)}>{moreFilters ? '收起筛选' : '更多筛选'}</button>
      {moreFilters && <div className="drawing-advanced-filters"><label><span>产品类别</span><select aria-label="产品类别" value={filters.productCategory} onChange={(event) => set('productCategory', event.target.value)}><option value="">全部</option>{productCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        {dictionarySelect('品牌', 'brandId', 'brand')}{dictionarySelect('主类别', 'mainCategoryId', 'main_category')}{dictionarySelect('项目明细', 'projectItemId', 'project_item')}{dictionarySelect('颜色', 'colorId', 'color')}{dictionarySelect('外观', 'appearanceId', 'appearance')}
        <label><span>资料批次</span><select aria-label="资料批次" value={filters.materialBatchId} onChange={(event) => set('materialBatchId', event.target.value)}><option value="">全部</option>{materialBatchOptions.map((batch) => <option key={batch.id} value={batch.id}>{batch.sku ?? 'SKU待识别'} · {batch.model ?? '型号待识别'} · {materialBatchLabel(batch.name)}</option>)}</select></label>
        <label><span>状态</span><select aria-label="状态" value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="">全部</option><option value="reserved">已占号</option><option value="active">使用中</option><option value="voided">已作废</option><option value="inactive">已停用</option></select></label>
        <label><span>删除状态</span><select aria-label="删除状态" value={filters.deletionState} onChange={(event) => set('deletionState', event.target.value)}><option value="normal">正常图号</option><option value="deleted-retained">已删除 / 保留占号</option><option value="deleted-released">已删除 / 已释放</option><option value="all">全部</option></select></label>
        <label><span>源文件</span><select aria-label="源文件" value={filters.sourcePresence} onChange={(event) => set('sourcePresence', event.target.value)}><option value="all">全部</option><option value="present">已有</option><option value="missing">缺失</option></select></label>
        <label><span>转曲后文件</span><select aria-label="转曲后文件" value={filters.outlinedPresence} onChange={(event) => set('outlinedPresence', event.target.value)}><option value="all">全部</option><option value="present">已有</option><option value="missing">缺失</option></select></label></div>}
    </form>
    <div className="batch-toolbar"><label><input type="checkbox" aria-label="全选当前页" checked={items.length > 0 && items.filter((item) => !item.deletedAt).every((item) => checkedIds.includes(item.id))}
      onChange={(event) => setCheckedIds(event.target.checked ? items.filter((item) => !item.deletedAt).map((item) => item.id) : [])} />全选当前页</label>
      {mockMode ? <section className="drawing-batch-delete" aria-label="批量删除图号"><button className="text-button danger" type="button" disabled title="Mock 仅用于只读预览">批量删除（已选 {checkedIds.length} 项）</button></section>
        : <DrawingBatchDeletion ids={checkedIds} api={api} onComplete={async () => { setCheckedIds([]); setSelected(null); await search(filters, page, pageSize); }} />}
    </div>
    <ModuleWorkspace resizable detail={detailPanel} detailLabel="图号详情" detailIdentity={selected?.id} onCloseDetail={() => { detailRequest.current++; setSelected(null); if (selected) disclosureButtons.current.get(selected.id)?.focus(); }}>
    {queryState !== 'ready' ? <QueryFeedback state={queryState} error={queryError} onRetry={() => void search(queriedValues, page, pageSize)}/> : items.length === 0 ? <EmptyState title={Object.entries(queriedValues).some(([key,value]) => value !== emptyFilters[key as keyof typeof emptyFilters]) ? '没有符合查询条件的图号' : '图号库尚无记录'} description="可调整查询条件后重新检索；新增图号请使用图号规划。" /> :
      <DataTable items={items} onRowClick={(item) => void openDetail(item)} columns={[
        { key: 'select', label: '选择', render: (item) => <input type="checkbox" aria-label={`选择图号 ${item.fullCode}`} disabled={Boolean(item.deletedAt)} checked={checkedIds.includes(item.id)}
          onClick={(event) => event.stopPropagation()} onChange={(event) => setCheckedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /> },
        { key: 'code', label: '完整图号', render: (item) => <button className="link-button" type="button"
          ref={(node) => { if (node) disclosureButtons.current.set(item.id, node); else disclosureButtons.current.delete(item.id); }}
          aria-expanded={selected?.id === item.id} aria-controls={`drawing-detail-${item.id}`}>{item.fullCode}</button> },
        { key: 'sku', label: 'SKU', render: (item) => item.sku ?? '待补录' }, { key: 'model', label: '型号', render: (item) => item.model },
        { key: 'origin', label: '来源', render: (item) => item.origin === 'planned' ? '正式规划' : '历史扫描' },
        { key: 'brand', label: '品牌', render: (item) => <span className="brand-summary">{item.brandName}{item.dictionaryMappingStatus === 'unmapped' && <span className="mapping-warning">字典待映射</span>}</span> },
        { key: 'item', label: '项目', render: (item) => item.projectItemName }, { key: 'color', label: '颜色', render: (item) => item.colorName },
        { key: 'files', label: '文件完整性', render: (item) => <span className="file-integrity-summary"><span>源文件<strong className={item.hasSourceFile ? 'integrity-present' : 'integrity-missing'}>{item.hasSourceFile ? '已有' : '缺失'}</strong></span><span>转曲后<strong className={item.hasOutlinedFile ? 'integrity-present' : 'integrity-missing'}>{item.hasOutlinedFile ? '已有' : '缺失'}</strong></span></span> },
        { key: 'batchUsage', label: '资料使用', render: (item) => item.batchUsage
          ? <span className={`usage-summary ${item.batchUsage.state}`} title={`${usageLabel(item.batchUsage.state)} · 出现于 ${item.batchUsage.occurrenceCount} 个资料批次`}><span>{usageLabel(item.batchUsage.state)}</span> · <span>{item.batchUsage.occurrenceCount}批次</span></span> : <span className="usage-summary">未建立批次关系</span> },
        { key: 'status', label: '状态', render: (item) => <span className="drawing-status-summary"><span className={`status-text ${item.status}`}>{statusLabel(item.origin, item.status)}</span>{item.deletedAt && <span className="mapping-warning">{item.deletionMode === 'retain_occupied' ? '删除·保留占号' : '删除·已释放'}</span>}</span> },
      ]} />}
    {queryState === 'ready' && !loading && total > 0 && <nav className="drawing-pagination" aria-label="图号分页"><span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
      <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>上一页</button>
      <span className="page-number-list">{visiblePages.map((value, index) => <span key={value}>{index > 0 && value - visiblePages[index - 1] > 1 && <i>…</i>}<button type="button" className={value === page ? 'current' : ''} aria-current={value === page ? 'page' : undefined} onClick={() => goToPage(value)}>{value}</button></span>)}</span>
      <button className="secondary-button" type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>下一页</button>
      <label><span>每页条数</span><select aria-label="每页条数" value={pageSize} onChange={(event) => { const nextSize = Number(event.target.value); setPageSize(nextSize); setPage(1); void search(filters, 1, nextSize); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
    </nav>}
    </ModuleWorkspace>
    </> : <BatchBrowser key={selectedBatch?.id ?? 'none'} search={batchSearch} setSearch={setBatchSearch} loading={loading} batches={batches}
      selected={selectedBatch} materials={batchMaterials} onSearch={searchBatches} onSelect={openBatch} onOpen={openLocation} />}
  </section>;
}

const statusLabel = (origin: DrawingView['origin'], status: DrawingView['status']) => {
  if (origin === 'historical') return status === 'inactive' ? '已停用' : '使用中';
  return status === 'active' ? '正式使用' : status === 'reserved' ? '已占号' : '作废';
};
const usageLabel = (status: 'current' | 'historical' | 'unbatched' | 'indeterminate') =>
  status === 'current' ? '当前使用' : status === 'historical' ? '历史使用' : status === 'indeterminate' ? '待确认' : '未归入批次';

function DrawingDetailPanel({ selected, errorMessage, previewOnly = false, maintaining, pdfKeyword, setPdfKeyword, pdfCandidates, selectedPdfId,
  setSelectedPdfId, onClose, onStatus, onOpen, onSearchPdf, onAssociate, onHistoricalStatus,
  onBeginDelete, deletionPreview, deletionMode, setDeletionMode, deletionReason, setDeletionReason,
  deletionConfirmation, setDeletionConfirmation, onConfirmDelete, onCancelDelete, onRestore, onError }: {
  selected: DrawingDetailView; errorMessage: string; previewOnly?: boolean; maintaining: boolean; pdfKeyword: string; setPdfKeyword(value: string): void;
  pdfCandidates: PdfFileView[]; selectedPdfId: string; setSelectedPdfId(value: string): void; onClose(): void;
  onStatus(target: 'active' | 'voided'): Promise<void>; onOpen(id: number): Promise<void>;
  onSearchPdf(keyword: string): Promise<void>; onAssociate(type: 'source' | 'outlined'): Promise<void>;
  onHistoricalStatus(target: 'active' | 'inactive'): Promise<void>;
  onBeginDelete(): Promise<void>; deletionPreview: DrawingDeletionPreviewView | null;
  deletionMode: 'retain_occupied' | 'release'; setDeletionMode(value: 'retain_occupied' | 'release'): void;
  deletionReason: string; setDeletionReason(value: string): void;
  deletionConfirmation: string; setDeletionConfirmation(value: string): void;
  onConfirmDelete(): Promise<void>; onCancelDelete(): void; onRestore(): Promise<void>;
  onError(message: string): void;
}) {
  return <aside id={`drawing-detail-${selected.id}`} className="drawing-maintenance workspace-drawing-detail panel-enter" aria-label="图号详情"
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}><button className="panel-close" onClick={onClose} type="button">关闭</button>
    <h2>{selected.fullCode}</h2><CopyDrawingCode key={selected.fullCode} code={selected.fullCode} /><p className="detail-name">{selected.displayName}</p>
    {errorMessage && <p className="error-banner" role="alert">{errorMessage}</p>}
    <dl className="drawing-detail-attributes">
      <div><dt>SKU</dt><dd>{selected.sku ?? '待补录'}</dd></div><div><dt>品牌</dt><dd>{selected.brandName}</dd></div><div><dt>型号</dt><dd>{selected.model}</dd></div>
      <div><dt>产品类别</dt><dd>{selected.productCategory}</dd></div><div><dt>主类别</dt><dd>{selected.mainCategoryName}</dd></div><div><dt>项目</dt><dd>{selected.projectItemName}</dd></div>
    </dl>
    <section className="drawing-state-maintenance" aria-label="状态维护"><h3>业务状态</h3><span className={`status-text ${selected.status}`}>{statusLabel(selected.origin, selected.status)}</span>
    {selected.deletedAt ? <p className="historical-read-only">该图号已删除 · {selected.deletionMode === 'release' ? '号码已释放' : '号码继续占用'} · {selected.deletedAt}</p>
      : selected.origin === 'historical' ? <><p className="historical-read-only">历史扫描来源；编码不可直接修改。</p><div className="drawing-actions">
      {selected.status === 'active'
        ? <button className="text-button danger" disabled={maintaining} onClick={() => void onHistoricalStatus('inactive')} type="button">停用</button>
        : <button className="primary-button" disabled={maintaining} onClick={() => void onHistoricalStatus('active')} type="button">启用</button>}
    </div><p className="muted-text">停用不释放号码</p></> : <div className="drawing-actions">
      {selected.status === 'reserved' && <button className="primary-button" disabled={maintaining} onClick={() => void onStatus('active')} type="button">正式使用</button>}
      {selected.status === 'voided' && <button className="primary-button" disabled={maintaining} onClick={() => void onStatus('active')} type="button">恢复使用</button>}
      {(selected.status === 'reserved' || selected.status === 'active') && <button className="text-button danger" disabled={maintaining} onClick={() => void onStatus('voided')} type="button">作废</button>}
      </div>}{previewOnly && <p className="muted-text mock-maintenance-note">Mock 只读预览，维护和文件定位已禁用。</p>}</section>
    <div className="drawing-detail-columns"><div className="drawing-detail-files">
    <FileSection title="源文件" present={selected.hasSourceFile} files={selected.sourceFiles ?? []} onOpen={onOpen} previewOnly={previewOnly} />
    <CurrentOutlinedFiles key={`${selected.origin}-${selected.id}`} selected={selected} onOpen={onOpen} previewOnly={previewOnly} />
    </div><div className="drawing-detail-relations">
    <section className="drawing-detail-section"><h3>资料批次</h3>{!selected.batchUsage || selected.batchUsage.occurrences.length === 0
      ? <p className="muted-text">尚未识别到资料批次</p>
      : <ul>{selected.batchUsage.occurrences.map((occurrence) => <li key={occurrence.batchId} className={`batch-occurrence ${occurrence.usageState}`}><span>{materialBatchLabel(occurrence.batchName)}</span><span className={`usage-badge ${occurrence.usageState}`}>{usageLabel(occurrence.usageState)}</span><small>{occurrence.productDirectory} · {occurrence.files.length} 个文件实例</small></li>)}</ul>}</section>
    <section className="drawing-detail-section"><h3>当前 BOM 使用</h3>{(selected.currentBomUsage ?? []).length === 0 ? <p className="muted-text">当前 BOM 未使用此图号</p>
      : <ul>{selected.currentBomUsage.map((usage) => <li key={`${usage.bomVersionId}-${usage.projectItemId}`}>{usage.model} · {usage.colorName} · 当前 BOM<small>{usage.projectItemName}{usage.usesWhiteMaterial ? ' · 引用白色物料' : ''}</small></li>)}</ul>}</section>
    </div></div>
    {!selected.readOnly && !selected.deletedAt && <section className="drawing-detail-section pdf-association" aria-label="文件维护 / 索引维护"><h3>文件维护<span>关联现有 PDF 索引</span></h3>
      <div className="pdf-search"><input aria-label="搜索现有 PDF" value={pdfKeyword} onChange={(event) => setPdfKeyword(event.target.value)} placeholder="文件名或相对路径" />
        <button className="secondary-button" onClick={() => void onSearchPdf(pdfKeyword).catch((reason) => onError(reason instanceof Error ? reason.message : 'PDF 搜索失败'))} type="button">搜索 PDF</button></div>
      <label><span>现有 PDF 索引</span><select aria-label="现有 PDF 索引" value={selectedPdfId} onChange={(event) => setSelectedPdfId(event.target.value)}><option value="">请选择当前存在的 PDF</option>
        {pdfCandidates.map((file) => <option key={file.id} value={file.id}>{file.fileName} · {file.relativePath}</option>)}</select></label>
      <div className="drawing-actions"><button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('source')} type="button">关联为源文件</button>
        <button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('outlined')} type="button">关联为转曲后文件</button></div>
      <p className="muted-text">仅更新当前资料库索引，不移动、复制、重命名或删除磁盘文件。</p></section>}
    <section className={`drawing-detail-section danger-zone${!selected.deletedAt && !deletionPreview ? ' danger-compact' : ''}`}><h3>危险操作</h3>
      {selected.deletedAt ? <><p>删除方式：{selected.deletionMode === 'release' ? '彻底删除并释放图号' : '删除记录并保留占号'}</p>
        {selected.deletedReason && <p className="muted-text">原因：{selected.deletedReason}</p>}
        <button className="secondary-button" disabled={maintaining} onClick={() => void onRestore()} type="button">恢复记录</button>
        {selected.deletionMode === 'retain_occupied' && !deletionPreview && <button className="text-button danger" disabled={maintaining} onClick={() => void onBeginDelete()} type="button">检查引用并释放占号</button>}</> : null}
      {(!selected.deletedAt || selected.deletionMode === 'retain_occupied') && (!deletionPreview ? !selected.deletedAt && <><p className="muted-text">删除只处理系统记录和当前关联，不会删除磁盘中的 PDF、AI 或其他文件。</p>
          <button className="text-button danger" disabled={maintaining} onClick={() => void onBeginDelete()} type="button">删除图号</button></>
          : <div className="drawing-delete-panel">
            <p><strong>{deletionPreview.fullCode}</strong> · {deletionPreview.origin === 'planned' ? '正式规划' : '历史扫描'}</p>
            <DeletionReferenceSummary preview={deletionPreview} />
            {deletionPreview.blockers.length > 0 ? <div className="error-banner">{deletionPreview.blockers.map((item) => <p key={item.kind}>{item.message}</p>)}</div>
              : <>{!selected.deletedAt && <label className="choice-row"><input type="radio" name="drawing-delete-mode" checked={deletionMode === 'retain_occupied'}
                onChange={() => setDeletionMode('retain_occupied')} />删除记录并保留占号</label>}
                <label className="choice-row"><input type="radio" name="drawing-delete-mode" checked={deletionMode === 'release'}
                  onChange={() => setDeletionMode('release')} />彻底删除并释放图号</label>
                <label><span>删除原因（可选）</span><input value={deletionReason} onChange={(event) => setDeletionReason(event.target.value)} /></label>
                {deletionMode === 'release' && <label><span>输入完整图号确认释放</span><input aria-label="输入完整图号确认释放"
                  value={deletionConfirmation} onChange={(event) => setDeletionConfirmation(event.target.value)} /></label>}
                {deletionMode === 'release' && <p className="error-banner">释放后，该号码未来可能被重新规划使用。</p>}
                <div className="drawing-actions"><button className="text-button danger" disabled={maintaining}
                  onClick={() => void onConfirmDelete()} type="button">确认删除</button>
                  <button className="secondary-button" disabled={maintaining} onClick={onCancelDelete} type="button">取消</button></div></>}
          </div>)}
    </section>
  </aside>;
}

function DeletionReferenceSummary({ preview }: { preview: DrawingDeletionPreviewView }) {
  const labels: Array<[string, string]> = [
    ['presentPdf', '当前 PDF'], ['missingPdf', '缺失 PDF'], ['currentBom', '当前 BOM'], ['historicalBom', '历史 BOM'],
    ['currentMaterial', '当前资料'], ['historicalMaterial', '历史批次'], ['lineage', '图号关系'], ['outboundSnapshot', '历史外发'],
  ];
  return <ul className="deletion-reference-list">{labels.map(([key, label]) => <li key={key}>{label}：{preview.references[key] ?? 0}</li>)}</ul>;
}

function BatchBrowser({ search, setSearch, loading, batches, selected, materials, onSearch, onSelect, onOpen }: {
  search: string;
  setSearch(value: string): void;
  loading: boolean;
  batches: MaterialBatchView[];
  selected: MaterialBatchView | null;
  materials: MaterialBatchLogicalMaterialView[];
  onSearch(): Promise<void>;
  onSelect(batch: MaterialBatchView): Promise<void>;
  onOpen(id: number): Promise<void>;
}) {
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const desktopAvailable = typeof window !== 'undefined' && Boolean(window.plannerDesktop);
  return <section className="material-batch-browser">
    <form className="filter-bar batch-search" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}>
      <label><span>型号 / SKU / 批次</span><input aria-label="搜索型号或批次" value={search}
        onChange={(event) => setSearch(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '查询中…' : '查询资料批次'}</button>
    </form>
    {batches.length === 0 ? <EmptyState title="请输入型号查看资料批次" description="例如输入 T40，可查看当前批次和全部历史批次。" /> :
      <div className="material-batch-layout"><div className="material-batch-list">{batches.map((batch) =>
        <article key={batch.id} className={`material-batch-card ${selected?.id === batch.id ? 'selected' : ''}`}>
          <div><strong>{materialBatchLabel(batch.name)}</strong><span className={`usage-badge ${batch.currentState}`}>
            {batch.recognitionStatus === 'pending' ? '待确认' : usageLabel(batch.currentState)}</span></div>
          <small>{batch.sku ?? 'SKU待识别'} · {batch.model ?? '型号待识别'} · {batch.fileCount} 个文件实例</small>
          <button className="text-button" type="button" aria-label={`查看批次 ${batch.name}`} onClick={() => void onSelect(batch)}>查看批次</button>
        </article>)}</div>
        {selected && <section className="batch-file-panel" aria-label="资料批次文件">
          <h2>{selected.productDirectory}</h2><p>{selected.name} · {usageLabel(selected.currentState)}</p>
          {!desktopAvailable && <p className="info-banner">浏览器预览不支持打开文件位置，请在 Windows 桌面版操作。</p>}
          {materials.length === 0 ? <p className="muted-text">该批次暂无可靠识别的转曲后文件</p> : <ul className="batch-material-list">{materials.map((material) => {
            const primary = material.outlinedFiles.find((file) => file.isPresent) ?? material.outlinedFiles[0];
            const materialKey = material.fullCode ?? `unpaired-${primary.pdfIndexId}`;
            const expanded = expandedCode === materialKey;
            return <li key={materialKey} className="batch-material-row"><div className="batch-material-summary">
              <span><button className="text-button" type="button" onClick={() => setExpandedCode(expanded ? null : materialKey)}>{primary.fileName}</button>
                <small>{material.fullCode ? `${material.fullCode} · ` : '未可靠识别 · 待确认 · '}{material.outlinedFiles.length} 个转曲后实例</small></span>
              <button className="text-button" type="button" disabled={!primary.isPresent}
                aria-label={`打开转曲后文件 ${primary.fileName} 的位置`} onClick={() => void onOpen(primary.pdfIndexId)}>{primary.isPresent ? '打开位置' : '已缺失'}</button>
            </div>{expanded && <div className="batch-material-details">
              <BatchFileInstances title="转曲后文件" files={material.outlinedFiles} onOpen={onOpen} />
              <BatchFileInstances title="源文件" files={material.sourceFiles} onOpen={onOpen} />
            </div>}</li>;
          })}</ul>}
        </section>}
      </div>}
  </section>;
}

function BatchFileInstances({ title, files, onOpen }: { title: string; files: MaterialBatchLogicalMaterialView['outlinedFiles']; onOpen(id: number): Promise<void> }) {
  return <section className="batch-instance-list"><h3>{title}</h3>{files.length === 0 ? <p className="muted-text">无可靠配对实例</p>
    : <ul>{files.map((file) => <li key={file.pdfIndexId} className="drawing-file-row"><span><strong>{file.fileName}</strong><small>{file.relativePath}</small></span>
      <button className="text-button" type="button" disabled={!file.isPresent}
        aria-label={`打开${title} ${file.fileName} 的位置`} onClick={() => void onOpen(file.pdfIndexId)}>{file.isPresent ? '打开位置' : '已缺失'}</button></li>)}</ul>}</section>;
}

function CurrentOutlinedFiles({ selected, onOpen, previewOnly = false }: { selected: DrawingDetailView; previewOnly?: boolean; onOpen(id: number): Promise<void> }) {
  const [directory, setDirectory] = useState('');
  const occurrences = (selected.batchUsage?.occurrences ?? []).filter((occurrence) =>
    selected.productId == null || occurrence.productId === selected.productId);
  const directories = [...new Set(occurrences.map((occurrence) => occurrence.productDirectory))];
  const effectiveDirectory = directories.length === 1 ? directories[0] : directory;
  const currentIds = new Set(occurrences
    .filter((occurrence) => directories.length === 1 || (directory !== '' && occurrence.productDirectory === effectiveDirectory))
    .flatMap((occurrence) => occurrence.files.filter((file) => file.conversionType === 'outlined'
      && (selected.batchUsage?.effectiveCurrentFileIds !== undefined
        ? selected.batchUsage.effectiveCurrentFileIds.includes(file.pdfIndexId) : occurrence.usageState === 'current'))
      .map((file) => file.pdfIndexId)));
  const current = (selected.outlinedFiles ?? []).filter((file) => currentIds.has(file.pdfIndexId));
  const history = (selected.outlinedFiles ?? []).filter((file) => !currentIds.has(file.pdfIndexId));
  return <>
    {directories.length > 1 && <label>当前文件所属资料目录<select aria-label="当前文件所属资料目录" value={directory} onChange={(event) => setDirectory(event.target.value)}>
      <option value="">存在多个资料目录，请选择</option>{directories.map((path) => <option key={path} value={path}>{path}</option>)}
    </select></label>}
    <FileSection title="转曲后文件" present={current.some((file) => file.isPresent)} files={current} onOpen={onOpen} previewOnly={previewOnly} />
    {current.length === 0 && <p className="muted-text">未找到当前有效批次的转曲后文件，不使用历史文件替代。</p>}
    {current.length > 1 && <p className="info-banner">当前有效批次有多个文件实例，请核对路径后选择。</p>}
    {history.length > 0 && <details key={selected.id} className="drawing-detail-section">
      <summary>查看历史文件</summary>
      <p className="muted-text">历史、其他产品及未归入所选目录当前有效批次的实例</p>
      <FileSection title="转曲后文件" present={history.some((file) => file.isPresent)} files={history} onOpen={onOpen} previewOnly={previewOnly} />
    </details>}
  </>;
}

function FileSection({ title, present, files, onOpen, previewOnly = false }: { title: string; present: boolean; files: DrawingFileView[]; previewOnly?: boolean; onOpen(id: number): Promise<void> }) {
  return <section className="drawing-detail-section"><h3>{title}<span className={`presence-label ${present ? 'present' : 'missing'}`}>{present ? '已有' : '缺失'}</span></h3>
    {files.length === 0 ? <p className="muted-text">暂无索引记录</p> : <ul>{files.map((file) => <li key={file.pdfIndexId} className="drawing-file-row">
      <span className="drawing-file-identity"><strong className="drawing-file-name">{file.fileName}</strong><small>{file.relativePath} · {file.isPresent ? '当前存在' : '当前缺失'}</small></span>
      <button className="text-button" type="button" disabled={previewOnly || !file.isPresent} title={previewOnly ? 'Mock 不支持磁盘操作' : undefined}
        aria-label={`打开${title} ${file.fileName} 的位置`} onClick={() => void onOpen(file.pdfIndexId)}>{file.isPresent ? '打开位置' : '文件缺失'}</button>
    </li>)}</ul>}</section>;
}

function CopyDrawingCode({ code }: { code: string }) {
  const [feedback, setFeedback] = useState('');
  return <div><button type="button" className="secondary-button" onClick={() => {
    void (async () => { try { await navigator.clipboard.writeText(code); setFeedback('已复制完整图号'); }
      catch { setFeedback('复制不可用，请选中完整图号复制'); } })();
  }}>复制完整图号</button>{feedback && <p role="status">{feedback}</p>}</div>;
}
