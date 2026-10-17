import './drawing-library.css';
import { ProductBatchNavigation, type DrawingNavigationScope } from '../components/ProductBatchNavigation';
import { CopyButton } from '../components/CopyButton';
import { PageHeader } from '../components/PageHeader';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { materialBatchLabel } from '../../core/files/material-batch-label';

import type {
  DictionaryItemView,
  DrawingDetailView,
  DrawingDeletionPreviewView,
  DrawingFileView,
  DrawingView,
  DrawingNavigationBatchView, ProductView,
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

export interface DrawingPdfNavigationTarget { productId?: number; materialBatchId?: number; fullCode: string; }
export function DrawingLibraryPage({ api: realApi, active = true, onNavigatePdf, registerLeaveGuard }: { api: PlannerApi; active?: boolean; registerLeaveGuard?(guard:(() => boolean) | null): void; onNavigatePdf?(target: DrawingPdfNavigationTarget): void }) {
  const mockMode = isDrawingLibraryMockEnabled();
  const api = useMemo(() => mockMode ? createDrawingLibraryMockApi() : realApi, [mockMode, realApi]);
  const disclosureButtons = useRef(new Map<number, HTMLButtonElement>());
  const detailRequest = useRef(0);
  const pdfRequest = useRef(0);
  const listRequest = useRef(0);
  const maintainingRef = useRef(false);
  useEffect(() => () => { detailRequest.current++; }, []);
  const [scope, setScope] = useState<DrawingNavigationScope>({kind:'all',title:'全部图号'});
  const [products, setProducts] = useState<ProductView[]>([]);
  const [navigationBatches, setNavigationBatches] = useState<DrawingNavigationBatchView[]>([]);
  const [editing, setEditing] = useState(false);
  const [staged, setStaged] = useState<Array<{pdfId:number;type:'source'|'outlined'}>>([]);
  useEffect(() => { if (!active) { detailRequest.current++; pdfRequest.current++; setSelected(null); setEditing(false); setStaged([]); setMaintaining(false); } }, [active]);
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState<Record<string, DictionaryItemView[]>>({});
  const [items, setItems] = useState<DrawingView[]>([]); const [total, setTotal] = useState(0);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(50);
  useEffect(() => { setCheckedIds([]); }, [filters, page, pageSize, scope]);
  const [productCategories, setProductCategories] = useState<string[]>([]);
  const [materialBatchOptions, setMaterialBatchOptions] = useState<MaterialBatchView[]>([]);
  const [selected, setSelected] = useState<DrawingDetailView | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [queryState, setQueryState] = useState<QueryState>('idle');
  const [queryError, setQueryError] = useState('');
  const [queriedValues, setQueriedValues] = useState<Record<string, string | number | boolean>>(emptyFilters);
  const [pdfCandidates, setPdfCandidates] = useState<PdfFileView[]>([]); const [pdfKeyword, setPdfKeyword] = useState('');
  const [selectedPdfId, setSelectedPdfId] = useState(''); const [maintaining, setMaintainingState] = useState(false);
  const setMaintaining = (value: boolean) => { maintainingRef.current = value; setMaintainingState(value); };
  useEffect(() => { registerLeaveGuard?.(() => !maintainingRef.current && (!staged.length || window.confirm('有未保存的图号文件关联，确认放弃？'))); return () => registerLeaveGuard?.(null); }, [registerLeaveGuard, staged, maintaining]);
  const [moreFilters, setMoreFilters] = useState(false);
  const [deletionPreview, setDeletionPreview] = useState<DrawingDeletionPreviewView | null>(null);
  const [deletionMode, setDeletionMode] = useState<'retain_occupied' | 'release'>('retain_occupied');
  const [deletionReason, setDeletionReason] = useState('');
  const [deletionConfirmation, setDeletionConfirmation] = useState('');
  const search = async (values: Record<string, string | number | boolean> = filters, requestedPage = page, requestedPageSize = pageSize) => {
    const request = ++listRequest.current;
    setLoading(true); setQueryState('loading'); setQueryError(''); setQueriedValues(values); setError('');
    try {
      const result = await api.searchDrawings({ ...values,
        brandId: values.brandId ? Number(values.brandId) : '', appearanceId: values.appearanceId ? Number(values.appearanceId) : '',
        mainCategoryId: values.mainCategoryId ? Number(values.mainCategoryId) : '', projectItemId: values.projectItemId ? Number(values.projectItemId) : '',
        colorId: values.colorId ? Number(values.colorId) : '', materialBatchId: values.materialBatchId ? Number(values.materialBatchId) : '',
        page: requestedPage, pageSize: requestedPageSize,
      });
      if (request !== listRequest.current) return;
      const lastPage = Math.max(1, Math.ceil(result.total / requestedPageSize));
      if (requestedPage > lastPage) return await search(values, lastPage, requestedPageSize);
      setItems(result.items); setTotal(result.total); setPage(requestedPage); setQueryState('ready');
    }
    catch (reason) { if (request !== listRequest.current) return; setQueryState('failed'); setQueryError(reason instanceof Error ? reason.message : '图号检索失败'); }
    finally { if (request === listRequest.current) setLoading(false); }
  };
  useEffect(() => {
    void search();
    void Promise.all([
      Promise.all(['brand', 'appearance', 'main_category', 'project_item', 'color'].map((type) => api.listDictionaries(type, false))),
      api.listProducts?.({ status: 'all' }) ?? Promise.resolve([]), api.listMaterialBatches?.() ?? Promise.resolve([]),
      api.getDrawingNavigation?.() ?? Promise.resolve({batches: []}),
    ])
      .then(([[brand, appearance, main_category, project_item, color], products, materialBatches, navigation]) => {
        setProducts(products); setNavigationBatches(navigation.batches);
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
    if (maintainingRef.current) return;
    // A pending record load must not leave the previous record editable under its new epoch.
    setSelected(null); setEditing(false); setStaged([]);
    const request = ++detailRequest.current;
    pdfRequest.current++;
    try {
      setError(''); const detail = await api.getDrawing(item.id);
      if (request !== detailRequest.current) return;
      setEditing(false); setStaged([]); setMaintaining(false); setSelected(detail); setPdfKeyword(''); setSelectedPdfId('');
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
    const epoch = detailRequest.current; const detail = await api.getDrawing(id); if (epoch !== detailRequest.current) return; setSelected(current => current?.id === id ? detail : current);
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...detail } : item));
  };
  const changeStatus = async (target: 'active' | 'voided') => {
    if (!selected || maintainingRef.current) return;
    const confirmed = window.confirm(target === 'active'
      ? '确认将该图号变更为正式使用？此操作会记录业务状态。'
      : '确认作废该图号？之后可以恢复使用，作废期间号码继续占用。');
    if (!confirmed) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try { if (target === 'active') await api.activateDrawing(selected.id); else await api.voidDrawing(selected.id); if (request !== detailRequest.current) return; await refreshDetail(selected.id); }
    catch (reason) { if (request !== detailRequest.current) return; setError(reason instanceof Error ? reason.message : '业务状态更新失败'); }
    finally { if (request === detailRequest.current) setMaintaining(false); }
  };
  const changeHistoricalStatus = async (target: 'active' | 'inactive') => {
    if (!selected || maintainingRef.current) return;
    const confirmed = window.confirm(target === 'active'
      ? '确认启用该历史图号？启用不会改变文件完整性，也不会释放或重新占用号码。'
      : '确认停用该历史图号？停用不释放号码，也不会改变文件完整性。');
    if (!confirmed) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try {
      if (target === 'active') await api.activateHistoricalDrawing(selected.id);
      else await api.deactivateHistoricalDrawing(selected.id);
      if (request !== detailRequest.current) return; await refreshDetail(selected.id);
    } catch (reason) { if (request !== detailRequest.current) return; setError(reason instanceof Error ? reason.message : '历史图号状态更新失败'); }
    finally { if (request === detailRequest.current) setMaintaining(false); }
  };
  const beginDrawingDeletion = async () => {
    if (!selected || maintainingRef.current) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try {
      const preview = await api.getDrawingDeletionPreview(selected.id);
      if (request !== detailRequest.current) return;
      setDeletionPreview(preview); if (selected.deletedAt) setDeletionMode('release');
    }
    catch (reason) { if (request === detailRequest.current) setError(reason instanceof Error ? reason.message : '删除引用检查失败'); }
    finally { if (request === detailRequest.current) setMaintaining(false); }
  };
  const confirmDrawingDeletion = async () => {
    if (!selected || !deletionPreview || maintainingRef.current) return;
    if (!deletionPreview.deletable) { setError(deletionPreview.blockers.map((item) => item.message).join('；')); return; }
    if (deletionMode === 'release' && deletionConfirmation.trim() !== selected.fullCode) {
      setError('彻底释放前，请完整输入当前图号进行确认'); return;
    }
    const warning = deletionMode === 'release'
      ? `确认彻底删除并释放 ${selected.fullCode}？释放后该号码未来可能被重新规划使用。`
      : `确认删除 ${selected.fullCode} 的正常记录并继续保留占号？`;
    if (!window.confirm(warning)) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try {
      const result = await api.deleteDrawing(selected.id, { mode: deletionMode, confirmedCode: selected.fullCode,
        ...(deletionReason.trim() ? { reason: deletionReason.trim() } : {}) });
      if (request !== detailRequest.current) return;
      window.alert(result.outcome === 'deleted_retained'
        ? '已删除图号记录，该号码继续保留占用。'
        : '已彻底删除图号，该号码已释放，可重新规划使用。');
      setSelected(null); setDeletionPreview(null); await search(filters, 1, pageSize);
    } catch (reason) { if (request !== detailRequest.current) return; setError(reason instanceof Error ? reason.message : '删除图号失败'); }
    finally { if (request === detailRequest.current) setMaintaining(false); }
  };
  const restoreDrawing = async () => {
    if (!selected || maintainingRef.current || !window.confirm(`确认恢复图号 ${selected.fullCode}？`)) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try { await api.restoreDrawing(selected.id); if (request !== detailRequest.current) return; setSelected(null); await search(filters, 1, pageSize); }
    catch (reason) { if (request !== detailRequest.current) return; setError(reason instanceof Error ? reason.message : '恢复图号失败'); }
    finally { if (request === detailRequest.current) setMaintaining(false); }
  };
  const associatePdf = async (conversionType: 'source' | 'outlined') => {
    if (!selected || !selectedPdfId || maintainingRef.current) return;
    const pdfId = Number(selectedPdfId);
    if (staged.some(item => item.pdfId === pdfId && item.type !== conversionType) ||
      (conversionType === 'source' ? selected.outlinedFiles : selected.sourceFiles).some(file => file.pdfIndexId === pdfId)) {
      setError('同一个 PDF 不能同时关联为源文件和转曲后文件'); return;
    }
    setError(''); setStaged(current => [...current.filter(item => !(item.pdfId === pdfId && item.type === conversionType)), {pdfId,type:conversionType}]);
  };
  const saveAssociations = async () => {
    if (!selected || maintainingRef.current) return;
    const epoch = detailRequest.current, id = selected.id;
    setMaintaining(true); setError('');
    const failed: typeof staged = []; let succeeded = 0;
    for (const item of staged) {
      if (epoch !== detailRequest.current) return;
      try { await api.associateDrawingPdf(id,item.pdfId,item.type); succeeded++; }
      catch { failed.push(item); }
    }
    if (epoch !== detailRequest.current) return;
    setStaged(failed);
    try { await refreshDetail(id); } catch { if (epoch === detailRequest.current) setError('关联请求已执行，但详情刷新失败，请重新打开核对。'); }
    if (epoch !== detailRequest.current) return;
    if (failed.length) setError(`已保存 ${succeeded} 项，${failed.length} 项失败；再次保存仅重试失败项。`);
    else setEditing(false);
    setMaintaining(false);
  };
  const navigateScope = (nextScope: DrawingNavigationScope) => {
    if (maintainingRef.current) return;
    const next = {...emptyFilters, productId: nextScope.productId ?? '', usageBatchId:nextScope.batchId ?? '',
      associationState:nextScope.kind === 'pending' ? 'pending' : '', deletionState:nextScope.kind === 'recycle' ? 'deleted-retained' : 'normal'};
    detailRequest.current++; pdfRequest.current++; setSelected(null); setEditing(false); setStaged([]);
    setScope(nextScope); setFilters(next); setCheckedIds([]); setPage(1); void search(next,1,pageSize);
  };
  const openLocation = async (id: number) => {
    if (mockMode) { setError('Mock 预览不支持磁盘操作'); return; }
    const epoch = detailRequest.current; setError(''); const result = await openIndexedPdfLocation(id);
    if (epoch !== detailRequest.current) return;
    if (!result.ok) setError(result.error?.message ?? '打开文件位置失败');
  };
  const dictionarySelect = (label: string, key: 'brandId' | 'appearanceId' | 'mainCategoryId' | 'projectItemId' | 'colorId', type: string) => {
    const items = type === 'project_item' && filters.mainCategoryId
      ? (options[type] ?? []).filter((item) => item.parentId === Number(filters.mainCategoryId)) : options[type] ?? [];
    return <label><span>{label}</span><select aria-label={label} value={filters[key]} onChange={(event) => set(key, event.target.value)}><option value="">全部</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;
  };
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = [...new Set([1, page - 1, page, page + 1, totalPages].filter((value) => value >= 1 && value <= totalPages))].sort((left, right) => left - right);
  const goToPage = (nextPage: number) => void search(filters, nextPage, pageSize);

  const detailPanel = selected ? <DrawingDetailPanel key={`${selected.id}-${detailRequest.current}`} selected={selected} contextBatchId={scope.batchId} contextProductId={scope.productId} editing={editing} onManage={() => {setEditing(true); setError('');}} onCancelManage={() => {setEditing(false); setStaged([]); setDeletionPreview(null); setError('');}} onSave={() => void saveAssociations()} staged={staged} onNavigatePdf={onNavigatePdf ? () => onNavigatePdf({fullCode:selected.fullCode,...((scope.productId ?? selected.productId) != null ? {productId:scope.productId ?? selected.productId!} : {}),...(scope.batchId ? {materialBatchId:scope.batchId} : {})}) : undefined} errorMessage={error} previewOnly={mockMode} maintaining={maintaining || mockMode}
        pdfKeyword={pdfKeyword} setPdfKeyword={setPdfKeyword} pdfCandidates={pdfCandidates} selectedPdfId={selectedPdfId}
        setSelectedPdfId={setSelectedPdfId} onClose={() => { if (maintainingRef.current) return; detailRequest.current++; setSelected(null); disclosureButtons.current.get(selected.id)?.focus(); }} onStatus={changeStatus} onOpen={openLocation}
        onSearchPdf={(keyword) => loadPdfCandidates(keyword)} onAssociate={associatePdf} onHistoricalStatus={changeHistoricalStatus}
        onBeginDelete={beginDrawingDeletion} deletionPreview={deletionPreview}
        deletionMode={deletionMode} setDeletionMode={setDeletionMode} deletionReason={deletionReason}
        setDeletionReason={setDeletionReason} deletionConfirmation={deletionConfirmation}
        setDeletionConfirmation={setDeletionConfirmation} onConfirmDelete={confirmDrawingDeletion}
        onCancelDelete={() => setDeletionPreview(null)} onRestore={restoreDrawing} onError={setError} /> : null;

  return <section className="page-surface page-enter drawing-library-page">
    <PageHeader title="图号库" description="按产品型号及资料批次查看使用图号。"><span className="record-count">{total} 条记录</span></PageHeader>
    {mockMode && <p className="info-banner preview-only-banner">开发预览 Mock：维护及磁盘操作已禁用，仅展示内存样例。关闭方式：移除 URL 中的 <code>?mock=drawing-library</code>。</p>}
    {error && !selected && <p className="error-banner" role="alert">{error}</p>}
    <ModuleWorkspace drawingWorkspace resizable navigation={<ProductBatchNavigation products={products} batches={navigationBatches} scope={scope} onSelect={navigateScope} />} detail={detailPanel} detailLabel="图号详情" detailIdentity={selected?.id} onCloseDetail={() => {if(maintainingRef.current) return; detailRequest.current++; pdfRequest.current++; setSelected(null);}}>
    <h2 className="drawing-scope-title">{scope.title}</h2>
    <form className="filter-bar filter-grid" onSubmit={submit}>
      <label><span>关键词</span><input aria-label="关键词" value={filters.keyword} onChange={(event) => set('keyword', event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '检索中…' : '检索'}</button>
      {dictionarySelect('主类别', 'mainCategoryId', 'main_category')}
      <label><span>状态</span><select aria-label="状态" value={filters.status} onChange={event => set('status',event.target.value)}><option value="">全部</option><option value="reserved">已占号</option><option value="active">使用中</option><option value="voided">已作废</option><option value="inactive">已停用</option></select></label>
      <button className="text-button" type="button" onClick={() => setMoreFilters((value) => !value)}>{moreFilters ? '收起筛选' : '更多筛选'}</button>
      {moreFilters && <div className="drawing-advanced-filters">      <label className="check-field"><input aria-label="精确图号" type="checkbox" checked={filters.exactDrawingNumber} onChange={(event) => set('exactDrawingNumber', event.target.checked)} /><span>精确图号</span></label>
      <label><span>完整图号</span><input aria-label="完整图号" value={filters.drawingNumber} onChange={(event) => set('drawingNumber', event.target.value)} /></label>
      <label><span>型号</span><input aria-label="型号" value={filters.model} onChange={(event) => set('model', event.target.value)} /></label>
      <label><span>SKU</span><input aria-label="SKU" value={filters.sku} onChange={(event) => set('sku', event.target.value)} /></label>
<label><span>产品类别</span><select aria-label="产品类别" value={filters.productCategory} onChange={(event) => set('productCategory', event.target.value)}><option value="">全部</option>{productCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        {dictionarySelect('品牌', 'brandId', 'brand')}{dictionarySelect('项目明细', 'projectItemId', 'project_item')}{dictionarySelect('颜色', 'colorId', 'color')}{dictionarySelect('外观', 'appearanceId', 'appearance')}

        <label><span>删除状态</span><select aria-label="删除状态" value={filters.deletionState} onChange={(event) => set('deletionState', event.target.value)}><option value="normal">正常图号</option><option value="deleted-retained">已删除 / 保留占号</option><option value="deleted-released">已删除 / 已释放</option><option value="all">全部</option></select></label>
        <label><span>源文件</span><select aria-label="源文件" value={filters.sourcePresence} onChange={(event) => set('sourcePresence', event.target.value)}><option value="all">全部</option><option value="present">已有</option><option value="missing">缺失</option></select></label>
        <label><span>转曲后文件</span><select aria-label="转曲后文件" value={filters.outlinedPresence} onChange={(event) => set('outlinedPresence', event.target.value)}><option value="all">全部</option><option value="present">已有</option><option value="missing">缺失</option></select></label></div>}
    </form>
    <div className="batch-toolbar"><label><input type="checkbox" aria-label="全选当前页" checked={items.length > 0 && items.filter((item) => !item.deletedAt).every((item) => checkedIds.includes(item.id))}
      onChange={(event) => setCheckedIds(event.target.checked ? items.filter((item) => !item.deletedAt).map((item) => item.id) : [])} />全选当前页</label>
      {mockMode ? <section className="drawing-batch-delete" aria-label="批量删除图号"><button className="text-button danger" type="button" disabled title="Mock 仅用于只读预览">批量删除（已选 {checkedIds.length} 项）</button></section>
        : <DrawingBatchDeletion ids={checkedIds} api={api} onComplete={async () => { setCheckedIds([]); setSelected(null); await search(filters, page, pageSize); }} />}
    </div>
    {queryState !== 'ready' ? <QueryFeedback state={queryState} error={queryError} onRetry={() => void search(queriedValues, page, pageSize)}/> : items.length === 0 ? <EmptyState title={Object.entries(queriedValues).some(([key,value]) => value !== emptyFilters[key as keyof typeof emptyFilters]) ? '没有符合查询条件的图号' : '图号库尚无记录'} description="可调整查询条件后重新检索；新增图号请使用图号规划。" /> :
      <DataTable items={items} onRowClick={(item) => void openDetail(item)} columns={[
        { key: 'select', label: '选择', render: (item) => <input type="checkbox" aria-label={`选择图号 ${item.fullCode}`} disabled={Boolean(item.deletedAt)} checked={checkedIds.includes(item.id)}
          onClick={(event) => event.stopPropagation()} onChange={(event) => setCheckedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /> },
        { key: 'code', label: '完整图号', render: (item) => <span className="drawing-code-inline"><button className="link-button" type="button"
          ref={(node) => { if (node) disclosureButtons.current.set(item.id, node); else disclosureButtons.current.delete(item.id); }}
          aria-expanded={selected?.id === item.id} aria-controls={`drawing-detail-${item.id}`}>{item.fullCode}</button><small>{item.origin === 'planned' ? '正式规划' : '历史扫描'}{item.dictionaryMappingStatus === 'unmapped' ? ' · 字典待映射' : ''}</small><span onClick={event => event.stopPropagation()}><CopyDrawingCode code={item.fullCode} /></span></span> },
        { key: 'category', label: '主类别 / 项目', render: (item) => <span>{item.mainCategoryName}<small>{item.projectItemName}</small></span> }, {key:'version',label:'版本',render:() => '未记录'},
        { key: 'status', label: '图号状态', render: (item) => <span className="drawing-status-summary"><span className={`status-text ${item.status}`}>{statusLabel(item.origin, item.status)}</span>{item.deletedAt && <span className="mapping-warning">{item.deletionMode === 'retain_occupied' ? '删除·保留占号' : '删除·已释放'}</span>}</span> },
        { key: 'files', label: '文件完整性', render: (item) => <span className="file-integrity-summary"><span>源文件<strong className={item.hasSourceFile ? 'integrity-present' : 'integrity-missing'}>{item.hasSourceFile ? '已有' : '缺失'}</strong></span><span>转曲后<strong className={item.hasOutlinedFile ? 'integrity-present' : 'integrity-missing'}>{item.hasOutlinedFile ? '已有' : '缺失'}</strong></span></span> },
        {key:'actions',label:'操作',render:item => <button className="text-button" type="button" onClick={event => {event.stopPropagation(); void openDetail(item);}}>查看 / 管理</button>},

      ]} />}
    {queryState === 'ready' && !loading && total > 0 && <nav className="drawing-pagination" aria-label="图号分页"><span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
      <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>上一页</button>
      <span className="page-number-list">{visiblePages.map((value, index) => <span key={value}>{index > 0 && value - visiblePages[index - 1] > 1 && <i>…</i>}<button type="button" className={value === page ? 'current' : ''} aria-current={value === page ? 'page' : undefined} onClick={() => goToPage(value)}>{value}</button></span>)}</span>
      <button className="secondary-button" type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>下一页</button>
      <label><span>每页条数</span><select aria-label="每页条数" value={pageSize} onChange={(event) => { const nextSize = Number(event.target.value); setPageSize(nextSize); setPage(1); void search(filters, 1, nextSize); }}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
    </nav>}
    </ModuleWorkspace>
  </section>;
}

const statusLabel = (origin: DrawingView['origin'], status: DrawingView['status']) => {
  if (origin === 'historical') return status === 'inactive' ? '已停用' : '使用中';
  return status === 'active' ? '正式使用' : status === 'reserved' ? '已占号' : '作废';
};

function DrawingDetailPanel({ selected, contextBatchId, contextProductId, editing, onManage, onCancelManage, onSave, staged, onNavigatePdf, errorMessage, previewOnly = false, maintaining, pdfKeyword, setPdfKeyword, pdfCandidates, selectedPdfId,
  setSelectedPdfId, onClose, onStatus, onOpen, onSearchPdf, onAssociate, onHistoricalStatus,
  onBeginDelete, deletionPreview, deletionMode, setDeletionMode, deletionReason, setDeletionReason,
  deletionConfirmation, setDeletionConfirmation, onConfirmDelete, onCancelDelete, onRestore, onError }: {
  contextBatchId?: number; contextProductId?: number; editing: boolean; onManage(): void; onCancelManage(): void; onSave(): void; staged: Array<{pdfId:number;type:'source'|'outlined'}>; onNavigatePdf?(): void;
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
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}><button className="panel-close" disabled={maintaining} onClick={onClose} type="button">关闭图号详情</button>
    <div className="drawing-code-inline"><h2>{selected.fullCode}</h2><CopyDrawingCode key={selected.fullCode} code={selected.fullCode} /></div>
    <span className={`status-text ${selected.status}`}>{statusLabel(selected.origin, selected.status)}</span><p className="detail-name">{selected.displayName}</p><p className="muted-text">{selected.origin === 'planned' ? '正式规划' : '历史扫描'}{selected.dictionaryMappingStatus === 'unmapped' ? ' · 字典待映射' : ''}</p>
    {errorMessage && <p className="error-banner" role="alert">{errorMessage}</p>}
    <dl className="drawing-detail-attributes">
      <div><dt>SKU</dt><dd>{selected.sku ?? '待补录'}</dd></div><div><dt>型号</dt><dd>{selected.model}</dd></div><div><dt>品牌</dt><dd>{selected.brandName}</dd></div>
      <div><dt>产品类别</dt><dd>{selected.productCategory}</dd></div><div><dt>主类别</dt><dd>{selected.mainCategoryName}</dd></div><div><dt>项目明细</dt><dd>{selected.projectItemName}</dd></div>
    </dl>
    {editing && <section className="drawing-state-maintenance" aria-label="状态维护"><h3>业务状态</h3><span className={`status-text ${selected.status}`}>{statusLabel(selected.origin, selected.status)}</span>
    {selected.deletedAt ? <p className="historical-read-only">该图号已删除 · {selected.deletionMode === 'release' ? '号码已释放' : '号码继续占用'} · {selected.deletedAt}</p>
      : selected.origin === 'historical' ? <><p className="historical-read-only">历史扫描来源；编码不可直接修改。</p><div className="drawing-actions">
      {selected.status === 'active'
        ? <button className="text-button danger" disabled={maintaining} onClick={() => void onHistoricalStatus('inactive')} type="button">停用</button>
        : <button className="primary-button" disabled={maintaining} onClick={() => void onHistoricalStatus('active')} type="button">启用</button>}
    </div><p className="muted-text">停用不释放号码</p></> : <div className="drawing-actions">
      {selected.status === 'reserved' && <button className="primary-button" disabled={maintaining} onClick={() => void onStatus('active')} type="button">正式使用</button>}
      {selected.status === 'voided' && <button className="primary-button" disabled={maintaining} onClick={() => void onStatus('active')} type="button">恢复使用</button>}
      {(selected.status === 'reserved' || selected.status === 'active') && <button className="text-button danger" disabled={maintaining} onClick={() => void onStatus('voided')} type="button">作废</button>}
      </div>}{previewOnly && <p className="muted-text mock-maintenance-note">Mock 只读预览，维护和文件定位已禁用。</p>}</section>}
    <div className="drawing-detail-columns"><div className="drawing-detail-files">
    <CurrentOutlinedFiles contextProductId={contextProductId} contextBatchId={contextBatchId} key={`${selected.origin}-${selected.id}`} selected={selected} onOpen={onOpen} previewOnly={previewOnly} />
    </div><div className="drawing-detail-relations">
    <details className="drawing-detail-section"><summary>关联批次（{new Set((selected.businessUsage ?? []).filter(usage => usage.batchId != null).map(usage => usage.batchId)).size}）</summary>
      {(selected.businessUsage ?? []).length ? <ul>{(selected.businessUsage ?? []).map((usage,index) => <li key={`${usage.source}-${usage.sourceId}-${index}`}>{usage.model} · {usage.batchName ? materialBatchLabel(usage.batchName) : '未归批次'} · {usage.current ? '当前使用' : '历史使用'}<small>{usage.source === 'bom' ? 'BOM' : '已完成外发'}</small></li>)}</ul> : <p className="muted-text">暂无实际业务关联</p>}
    </details>
    <details className="drawing-detail-section"><summary>PDF 出现位置（{selected.batchUsage?.occurrences.length ?? 0}）</summary><p className="muted-text">仅表示 PDF 索引出现位置，不等于实际业务使用。</p>{selected.batchUsage?.occurrences.map(occurrence => <p key={occurrence.batchId}>{materialBatchLabel(occurrence.batchName)} · {occurrence.files.length} 个文件实例</p>)}</details>
    <section className="drawing-detail-section"><h3>当前 BOM 使用</h3>{(selected.currentBomUsage ?? []).length === 0 ? <p className="muted-text">当前 BOM 未使用此图号</p>
      : <ul>{selected.currentBomUsage.map((usage) => <li key={`${usage.bomVersionId}-${usage.projectItemId}`}>{usage.model} · {usage.colorName} · 当前 BOM<small>{usage.projectItemName}{usage.usesWhiteMaterial ? ' · 引用白色物料' : ''}</small></li>)}</ul>}</section>
    <details className="drawing-detail-section"><summary>历史 BOM 使用</summary>{(selected.businessUsage ?? []).filter(usage => usage.source === 'bom' && !usage.current).map((usage,index) => <p key={`${usage.sourceId}-${index}`}>{usage.model} · {usage.batchName ? materialBatchLabel(usage.batchName) : '未归批次'}</p>)}{!(selected.businessUsage ?? []).some(usage => usage.source === 'bom' && !usage.current) && <p className="muted-text">暂无历史 BOM 使用</p>}</details>
    </div></div>
    {editing && !selected.readOnly && !selected.deletedAt && <section className="drawing-detail-section pdf-association" aria-label="文件维护 / 索引维护"><h3>文件维护<span>关联现有 PDF 索引</span></h3>
      <div className="pdf-search"><input aria-label="搜索现有 PDF" value={pdfKeyword} onChange={(event) => setPdfKeyword(event.target.value)} placeholder="文件名或相对路径" />
        <button className="secondary-button" onClick={() => void onSearchPdf(pdfKeyword).catch((reason) => onError(reason instanceof Error ? reason.message : 'PDF 搜索失败'))} type="button">搜索 PDF</button></div>
      <label><span>现有 PDF 索引</span><select aria-label="现有 PDF 索引" value={selectedPdfId} onChange={(event) => setSelectedPdfId(event.target.value)}><option value="">请选择当前存在的 PDF</option>
        {pdfCandidates.map((file) => <option key={file.id} value={file.id}>{file.fileName} · {file.relativePath}</option>)}</select></label>
      <div className="drawing-actions"><button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('source')} type="button">关联为源文件</button>
        <button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('outlined')} type="button">关联为转曲后文件</button></div>
      {staged.length > 0 && <ul aria-label="待保存 PDF 关联">{staged.map(item => <li key={`${item.pdfId}-${item.type}`}>{pdfCandidates.find(file => file.id === item.pdfId)?.fileName ?? `PDF #${item.pdfId}`} · {item.type === 'source' ? '源文件' : '转曲后文件'} · 待保存</li>)}</ul>}
      <p className="muted-text">点击保存后更新关联。仅更新当前资料库索引，不移动、复制、重命名或删除磁盘文件。</p></section>}
    {editing && <section className={`drawing-detail-section danger-zone${!selected.deletedAt && !deletionPreview ? ' danger-compact' : ''}`}><h3>危险操作</h3>
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
    </section>}
    <div className="drawing-detail-toolbar">{editing ? <><button className="primary-button" disabled={maintaining} onClick={onSave} type="button">保存并返回详情</button><button className="secondary-button" disabled={maintaining} onClick={onCancelManage} type="button">取消编辑</button></> : <button className="secondary-button" disabled={previewOnly} onClick={onManage} type="button">管理图号</button>}{onNavigatePdf && <button className="text-button" type="button" onClick={onNavigatePdf}>查看 PDF 文件</button>}</div>
  </aside>;
}

function DeletionReferenceSummary({ preview }: { preview: DrawingDeletionPreviewView }) {
  const labels: Array<[string, string]> = [
    ['presentPdf', '当前 PDF'], ['missingPdf', '缺失 PDF'], ['currentBom', '当前 BOM'], ['historicalBom', '历史 BOM'],
    ['currentMaterial', '当前资料'], ['historicalMaterial', '历史批次'], ['lineage', '图号关系'], ['outboundSnapshot', '历史外发'],
  ];
  return <ul className="deletion-reference-list">{labels.map(([key, label]) => <li key={key}>{label}：{preview.references[key] ?? 0}</li>)}</ul>;
}

function CurrentOutlinedFiles({ selected, contextBatchId, contextProductId, onOpen, previewOnly = false }: { selected: DrawingDetailView; contextBatchId?: number; contextProductId?: number; previewOnly?: boolean; onOpen(id: number): Promise<void> }) {
  const [directory, setDirectory] = useState('');
  const occurrences = (selected.batchUsage?.occurrences ?? []).filter((occurrence) =>
    contextBatchId != null ? occurrence.batchId === contextBatchId : (contextProductId ?? selected.productId) == null || occurrence.productId === (contextProductId ?? selected.productId));
  const directories = [...new Set(occurrences.map((occurrence) => occurrence.productDirectory))];
  const effectiveDirectory = directories.length === 1 ? directories[0] : directory;
  const scopedOccurrences = occurrences.filter(occurrence => contextBatchId != null ? occurrence.batchId === contextBatchId :
    directories.length === 1 || (directory !== '' && occurrence.productDirectory === effectiveDirectory));
  const currentIds = new Set(scopedOccurrences.flatMap(occurrence => occurrence.files.filter(file => contextBatchId != null ||
    (selected.batchUsage?.effectiveCurrentFileIds !== undefined ? selected.batchUsage.effectiveCurrentFileIds.includes(file.pdfIndexId) : occurrence.usageState === 'current')).map(file => file.pdfIndexId)));
  const current = (selected.outlinedFiles ?? []).filter(file => currentIds.has(file.pdfIndexId));
  const history = (selected.outlinedFiles ?? []).filter(file => !currentIds.has(file.pdfIndexId));
  const allOccurrences = selected.batchUsage?.occurrences ?? [];
  const knownBatchedFileIds = new Set(allOccurrences.flatMap(occurrence => occurrence.files.map(file => file.pdfIndexId)));
  const allowUnbatchedSource = contextBatchId == null && (contextProductId == null || contextProductId === selected.productId);
  const source = (selected.sourceFiles ?? []).filter(file => currentIds.has(file.pdfIndexId)
    || allowUnbatchedSource && !knownBatchedFileIds.has(file.pdfIndexId));
  const sourceHistory = (selected.sourceFiles ?? []).filter(file => !source.some(instance => instance.pdfIndexId === file.pdfIndexId));
  return <>
    {contextBatchId == null && directories.length > 1 && <label>当前文件所属资料目录<select aria-label="当前文件所属资料目录" value={directory} onChange={(event) => setDirectory(event.target.value)}>
      <option value="">存在多个资料目录，请选择</option>{directories.map((path) => <option key={path} value={path}>{path}</option>)}
    </select></label>}
    <FileSection title="源文件" present={source.some(file => file.isPresent)} files={source} onOpen={onOpen} previewOnly={previewOnly} />
    <FileSection title="转曲后文件" present={current.some((file) => file.isPresent)} files={current} onOpen={onOpen} previewOnly={previewOnly} />
    {current.length === 0 && <p className="muted-text">{contextBatchId != null ? '所选批次没有转曲后文件，不使用其他批次文件替代。' : '未找到当前有效批次的转曲后文件，不使用历史文件替代。'}</p>}
    {current.length > 1 && <p className="info-banner">当前有效批次有多个文件实例，请核对路径后选择。</p>}
    {(history.length > 0 || sourceHistory.length > 0) && <details key={selected.id} className="drawing-detail-section">
      <summary>查看历史文件</summary>
      <p className="muted-text">历史、其他产品及未归入所选目录当前有效批次的实例</p>
      <FileSection title="源文件" present={sourceHistory.some(file => file.isPresent)} files={sourceHistory} onOpen={onOpen} previewOnly={previewOnly} />
      <FileSection title="转曲后文件" present={history.some((file) => file.isPresent)} files={history} onOpen={onOpen} previewOnly={previewOnly} />
    </details>}
  </>;
}

function FileSection({ title, present, files, onOpen, previewOnly = false }: { title: string; present: boolean; files: DrawingFileView[]; previewOnly?: boolean; onOpen(id: number): Promise<void> }) {
  return <section className="drawing-detail-section"><h3>{title}<span className={`presence-label ${present ? 'present' : 'missing'}`}>{present ? '已有' : '缺失'}</span></h3>
    {files.length === 0 ? <p className="muted-text">暂无索引记录</p> : <ul>{files.map((file) => <li key={file.pdfIndexId} className="drawing-file-row">
      <span className="drawing-file-identity"><strong className="drawing-file-name">{file.fileName}</strong><small>{file.isPresent ? '当前存在' : '当前缺失'}</small><details><summary>查看路径</summary><small>{file.relativePath}</small></details></span>
      <button className="text-button" type="button" disabled={previewOnly || !file.isPresent} title={previewOnly ? 'Mock 不支持磁盘操作' : undefined}
        aria-label={`打开${title} ${file.fileName} 的位置`} onClick={() => void onOpen(file.pdfIndexId)}>{file.isPresent ? '打开位置' : '文件缺失'}</button>
    </li>)}</ul>}</section>;
}

function CopyDrawingCode({ code }: { code: string }) {
  const [feedback, setFeedback] = useState('');
  return <div><CopyButton label="复制完整图号" type="button" className="secondary-button" onClick={() => {
    void (async () => { try { await navigator.clipboard.writeText(code); setFeedback('已复制完整图号'); }
      catch { setFeedback('复制不可用，请选中完整图号复制'); } })();
  }} />{feedback && <p role="status">{feedback}</p>}</div>;
}
