import './drawing-library.css';
import {plannerQueryCache,queryKey,readPageSize,savePageSize} from '../data/query-cache';
import type {DrawingAssociationPreviewView,DrawingAssociationResult} from '../data/drawing-appearance-client';
import { ProductCatalogNavigation, type CatalogNavigationScope, type CatalogNavigationCounts } from '../components/ProductCatalogNavigation';
import { Copy, X } from 'lucide-react';
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

const cacheApiIds = new WeakMap<object,number>();
let nextCacheApiId=1;
const emptyFilters = { drawingNumber: '', model: '', keyword: '', sku: '', productCategory: '', sourcePresence: 'all', outlinedPresence: 'all', brandId: '', appearanceId: '', mainCategoryId: '', projectItemId: '', colorId: '', materialBatchId: '', status: '', deletionState: 'normal', exactDrawingNumber: false };

export interface DrawingPdfNavigationTarget { productId?: number; materialBatchId?: number; fullCode: string; }
export function DrawingLibraryPage({ api: realApi, active = true, onNavigatePdf, registerLeaveGuard,navigationTarget }: { navigationTarget?:{productId:number;appearanceVersionId?:number;revision?:number}; api: PlannerApi; active?: boolean; registerLeaveGuard?(guard:(() => boolean) | null): void; onNavigatePdf?(target: DrawingPdfNavigationTarget): void }) {
  const mockMode = isDrawingLibraryMockEnabled();
  const api = useMemo(() => mockMode ? createDrawingLibraryMockApi() : realApi, [mockMode, realApi]);
  const cacheApiId=useMemo(()=>{let id=cacheApiIds.get(api);if(!id){id=nextCacheApiId++;cacheApiIds.set(api,id);}return id;},[api]);
  const disclosureButtons = useRef(new Map<number, HTMLButtonElement>());
  const detailRequest = useRef(0);
  const pdfRequest = useRef(0);
  const listRequest = useRef(0);
  const maintainingRef = useRef(false);
  useEffect(() => () => { detailRequest.current++; }, []);
  const [scope, setScope] = useState<CatalogNavigationScope>({kind:'all'});
  const [navigationCounts, setNavigationCounts] = useState<CatalogNavigationCounts | null>(null);
  const countsRequest = useRef(0);
  const [associationResult,setAssociationResult]=useState<DrawingAssociationResult|null>(null);
  const [repairPreview,setRepairPreview]=useState<DrawingAssociationPreviewView|null>(null);
  const [associationProduct,setAssociationProduct]=useState('');
  const [associationReason,setAssociationReason]=useState('');
  const [products, setProducts] = useState<ProductView[]>([]);
  const [navigationBatches, setNavigationBatches] = useState<DrawingNavigationBatchView[]>([]);
  const [editing, setEditing] = useState(false);
  const [staged, setStaged] = useState<Array<{pdfId:number;type:'source'|'outlined'}>>([]);
  useEffect(() => { if (!active) { detailRequest.current++; pdfRequest.current++; setSelected(null); setEditing(false); setStaged([]); setMaintaining(false); } }, [active]);
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState<Record<string, DictionaryItemView[]>>({});
  const [items, setItems] = useState<DrawingView[]>([]); const [total, setTotal] = useState(0);
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(()=>readPageSize('drawings',50));
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
  const appliedQuery = useRef<{values: Record<string, string | number | boolean>; page: number; pageSize: number; scope: CatalogNavigationScope}>({values:emptyFilters,page:1,pageSize:50,scope:{kind:'all'}});
  const scopeFilters = (selectedScope: CatalogNavigationScope, values: Record<string, string | number | boolean>) => ({
    appearanceVersionId: selectedScope.appearanceVersionId ?? '', productId: selectedScope.productId ?? '', usageBatchId: selectedScope.batchId ?? '',
    associationState: selectedScope.kind === 'unassociated' ? 'unassociated' : '',
    ...(selectedScope.kind === 'category' ? { navigationProductCategory: selectedScope.category ?? '' } : {}),
    ...(selectedScope.kind === 'recycle' ? { deletionState: ['deleted-retained', 'deleted-released'].includes(String(values.deletionState)) ? values.deletionState : 'deleted' } : {}),
  });
  const search = async (values: Record<string, string | number | boolean> = filters, requestedPage = page, requestedPageSize = pageSize, selectedScope = scope, preserveRows = false) => {
    appliedQuery.current = {values, page:requestedPage, pageSize:requestedPageSize, scope:selectedScope};
    const request = ++listRequest.current;
    setLoading(true); if (!preserveRows && !items.length) { setQueryState('loading'); setError(''); } setQueryError(''); setQueriedValues(values);
    const countsEpoch = ++countsRequest.current;

    void (api.getDrawingNavigationCounts ? plannerQueryCache.fetch(queryKey('drawing:counts',{api:cacheApiId,...values}),()=>api.getDrawingNavigationCounts!(values)) : Promise.resolve(null))
      .then(result => { if (countsEpoch === countsRequest.current) setNavigationCounts(result); })
      .catch(() => { if (countsEpoch === countsRequest.current) setNavigationCounts(null); });
    try {
      const query = { ...values, ...scopeFilters(selectedScope, values),
        brandId: values.brandId ? Number(values.brandId) : '', appearanceId: values.appearanceId ? Number(values.appearanceId) : '',
        mainCategoryId: values.mainCategoryId ? Number(values.mainCategoryId) : '', projectItemId: values.projectItemId ? Number(values.projectItemId) : '',
        colorId: values.colorId ? Number(values.colorId) : '', materialBatchId: values.materialBatchId ? Number(values.materialBatchId) : '',
        page: requestedPage, pageSize: requestedPageSize,
      };
      const result = await plannerQueryCache.fetch(queryKey('drawing:list',{api:cacheApiId,...query}),()=>api.searchDrawings(query));
      if (request !== listRequest.current) return;
      const lastPage = Math.max(1, Math.ceil(result.total / requestedPageSize));
      if (requestedPage > lastPage) return await search(values, lastPage, requestedPageSize, selectedScope, preserveRows);
      setItems(result.items); setTotal(result.total); setPage(requestedPage); setQueryState('ready');
    }
    catch (reason) { if (request !== listRequest.current) return; setQueryState('failed'); setQueryError(reason instanceof Error ? reason.message : '图号检索失败'); }
    finally { if (request === listRequest.current) setLoading(false); }
  };
  const refreshCurrentQuery = () => {
    plannerQueryCache.invalidate('drawing:');
    const current = appliedQuery.current;
    return search(current.values, current.page, current.pageSize, current.scope, true);
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
  useEffect(()=>{const changed=()=>{void refreshCurrentQuery();};window.addEventListener('planner:data-changed',changed);return()=>window.removeEventListener('planner:data-changed',changed);},[api]);
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
      setEditing(false); setStaged([]); setMaintaining(false); setSelected(detail); setAssociationProduct(detail.productId?String(detail.productId):'');setAssociationReason('');setPdfKeyword(''); setSelectedPdfId('');
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
  };
  const refreshMutationResult = async (id: number, epoch: number) => {
    try { await refreshDetail(id); }
    finally { if (epoch === detailRequest.current) await refreshCurrentQuery(); }
  };
  const changeStatus = async (target: 'active' | 'voided') => {
    if (!selected || maintainingRef.current) return;
    const confirmed = window.confirm(target === 'active'
      ? '确认将该图号变更为正式使用？此操作会记录业务状态。'
      : '确认作废该图号？之后可以恢复使用，作废期间号码继续占用。');
    if (!confirmed) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try { if (target === 'active') await api.activateDrawing(selected.id); else await api.voidDrawing(selected.id); if (request !== detailRequest.current) return; await refreshMutationResult(selected.id, request); }
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
      if (request !== detailRequest.current) return; await refreshMutationResult(selected.id, request);
    } catch (reason) { if (request !== detailRequest.current) return; setError(reason instanceof Error ? reason.message : '历史图号状态更新失败'); }
    finally { if (request === detailRequest.current) setMaintaining(false); }
  };
  const beginDrawingDeletion = async (mode: 'retain_occupied'|'release' = 'retain_occupied') => {
    if (!selected || maintainingRef.current) return;
    const request = detailRequest.current;
    setMaintaining(true); setError('');
    try {
      const preview = await api.getDrawingDeletionPreview(selected.id);
      if (request !== detailRequest.current) return;
      setDeletionPreview(preview); setDeletionMode(selected.deletedAt?'release':mode);
    }
    catch (reason) { if (request === detailRequest.current) setError(reason instanceof Error ? reason.message : '删除引用检查失败'); }
    finally { if (request === detailRequest.current) setMaintaining(false); }
  };
  const confirmDrawingDeletion = async () => {
    if (!selected || !deletionPreview || maintainingRef.current) return;
    if (!deletionPreview.deletable) { setError(deletionPreview.blockers.map((item) => item.message).join('；')); return; }
    if (deletionMode === 'release' && deletionPreview.releaseEligible === false) {setError((deletionPreview.releaseBlockers??[]).map(item=>item.message).join('；'));return;}
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
    if (succeeded) await refreshCurrentQuery();
    if (epoch !== detailRequest.current) return;
    if (failed.length) setError(`已保存 ${succeeded} 项，${failed.length} 项失败；再次保存仅重试失败项。`);
    else setEditing(false);
    setMaintaining(false);
  };
  const navigateScope = (nextScope: CatalogNavigationScope) => {
    if (maintainingRef.current) return;
    detailRequest.current++; pdfRequest.current++; setSelected(null); setEditing(false); setStaged([]);
    setScope(nextScope); setCheckedIds([]); setPage(1); void search(appliedQuery.current.values,1,pageSize,nextScope);
  };
  useEffect(()=>{if(navigationTarget)navigateScope({kind:'product',productId:navigationTarget.productId});},[navigationTarget]);
  const clearFilters = () => { plannerQueryCache.invalidate('drawing:');setFilters(emptyFilters); setCheckedIds([]); setPage(1); void search(emptyFilters,1,pageSize); };
  const scopeProduct = products.find(product => product.id === scope.productId);
  const scopeBatch = navigationBatches.find(batch => batch.id === scope.batchId);
  const scopeTitle = scope.kind === 'all' ? '全部图号' : scope.kind === 'category' ? scope.category : scope.kind === 'unassociated' ? '未关联图号' : scope.kind === 'recycle' ? '回收站' : scope.kind === 'appearance' ? scopeProduct?.model??'产品图号' : scope.kind === 'batch' ? `${scopeProduct?.model ?? ''} / ${scopeBatch ? materialBatchLabel(scopeBatch.name) : '资料批次'}` : scopeProduct?.model ?? '产品图号';
  const catalogBatches = [...new Map([...materialBatchOptions, ...navigationBatches].map(batch => [batch.id, batch])).values()];
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
  const goToPage = (nextPage: number) => void search(appliedQuery.current.values, nextPage, pageSize);

  const associationEditor = !mockMode && editing && selected && api.correctDrawingAssociation && <section className="drawing-association-editor" aria-label="产品关联修正"><h3>产品关联修正</h3>
      <select aria-label="关联产品型号" value={associationProduct} onChange={event=>setAssociationProduct(event.target.value)}><option value="">请选择产品</option>{products.map(p=><option key={p.id} value={p.id}>{p.model}</option>)}</select>
      <input aria-label="关联修正原因" value={associationReason} onChange={event=>setAssociationReason(event.target.value)} placeholder="核对依据与修正原因" />
      <button type="button" disabled={maintaining||!associationProduct||!associationReason.trim()} onClick={()=>{setMaintaining(true);void api.correctDrawingAssociation!({signedId:selected.id,productId:Number(associationProduct),appearanceVersionId:null,reason:associationReason,confirmed:true}).then(async(result)=>{setAssociationResult(result);await refreshDetail(selected.id);await refreshCurrentQuery();setEditing(false);}).catch(reason=>setError(reason instanceof Error?reason.message:'关联修正失败')).finally(()=>setMaintaining(false));}}>确认修正关联</button></section>;
  const detailPanel = selected ? <DrawingDetailPanel key={`${selected.id}-${detailRequest.current}`} associationEditor={associationEditor} selected={selected} contextBatchId={scope.batchId} contextProductId={scope.productId} editing={editing} onManage={() => {setEditing(true); setError('');}} onCancelManage={() => {setEditing(false); setStaged([]); setDeletionPreview(null); setError('');}} onSave={() => void saveAssociations()} staged={staged} onNavigatePdf={onNavigatePdf ? () => onNavigatePdf({fullCode:selected.fullCode,...((scope.productId ?? selected.productId) != null ? {productId:scope.productId ?? selected.productId!} : {}),...(scope.batchId ? {materialBatchId:scope.batchId} : {})}) : undefined} errorMessage={error} previewOnly={mockMode} maintaining={maintaining || mockMode}
        pdfKeyword={pdfKeyword} setPdfKeyword={setPdfKeyword} pdfCandidates={pdfCandidates} selectedPdfId={selectedPdfId}
        setSelectedPdfId={setSelectedPdfId} onClose={() => { if (maintainingRef.current) return; detailRequest.current++; setSelected(null); disclosureButtons.current.get(selected.id)?.focus(); }} onStatus={changeStatus} onOpen={openLocation}
        onSearchPdf={(keyword) => loadPdfCandidates(keyword)} onAssociate={associatePdf} onHistoricalStatus={changeHistoricalStatus}
        onBeginDelete={beginDrawingDeletion} deletionPreview={deletionPreview}
        deletionMode={deletionMode} setDeletionMode={setDeletionMode} deletionReason={deletionReason}
        setDeletionReason={setDeletionReason} deletionConfirmation={deletionConfirmation}
        setDeletionConfirmation={setDeletionConfirmation} onConfirmDelete={confirmDrawingDeletion}
        onCancelDelete={() => setDeletionPreview(null)} onRestore={restoreDrawing} onError={setError} /> : null;

  return <section className="page-surface page-enter drawing-library-page">
    <PageHeader title="图号库" description="按产品查看图号与关联资料。"><span className="record-count">{total} 条记录</span></PageHeader>
    {mockMode && <p className="info-banner preview-only-banner">开发预览 Mock：维护及磁盘操作已禁用，仅展示内存样例。关闭方式：移除 URL 中的 <code>?mock=drawing-library</code>。</p>}
    {error && !selected && <p className="error-banner" role="alert">{error}</p>}

    <div className="drawing-library-tools">{!mockMode && api.classifyDrawingAssociations && <button className="secondary-button" type="button" disabled={maintaining} onClick={()=>{
      if(maintainingRef.current)return;
      setMaintaining(true);setError('');setAssociationResult(null);
      void api.classifyDrawingAssociations!({...(checkedIds.length?{signedIds:checkedIds}:{})})
        .then(async result=>{setAssociationResult(result);setRepairPreview(null);if(selected)await refreshMutationResult(selected.id,detailRequest.current);else await refreshCurrentQuery();})
        .catch(reason=>setError(reason instanceof Error?reason.message:'自动归类失败，未保存，请重试'))
        .finally(()=>setMaintaining(false));
    }}>{maintaining?'正在归类…':'自动归类'}</button>}
    {!mockMode && api.previewDrawingAssociations && <button className="secondary-button" type="button" disabled={maintaining} onClick={()=>void api.previewDrawingAssociations!({...(checkedIds.length?{signedIds:checkedIds}:{})}).then(setRepairPreview).catch(reason=>setError(reason.message))}>诊断图号关联</button>}</div>
    {repairPreview && <section className="drawing-association-preview" aria-label="关联诊断预览"><h3>关联诊断预览</h3>{repairPreview.summary && <p>历史图号已关联 {repairPreview.summary.historicalAssociated} / {repairPreview.summary.historicalTotal} · 正式图号已关联 {repairPreview.summary.plannedAssociated} / {repairPreview.summary.plannedTotal} · 待确认 {repairPreview.summary.ready} · 歧义 {repairPreview.summary.ambiguous} · 冲突 {repairPreview.summary.conflicts}</p>}<div className="drawing-association-records">{repairPreview.records.map(row=><p key={row.signedId}>{row.fullCode} · {{associated:'已确认',ready:'唯一候选，可直接归类','missing-product':'缺少产品依据','missing-version':'缺少关联依据',ambiguous:'候选有歧义',conflict:'依据冲突'}[row.state]} · {row.evidence.join('；')} · {row.targets.map(target=>products.find(product=>product.id===target.productId)?.model??`产品 #${target.productId}`).join('；')}</p>)}</div>
      <button type="button" disabled={maintaining||!repairPreview.records.some(row=>row.state==='ready')} onClick={()=>{if(maintainingRef.current)return;setMaintaining(true);const targets=repairPreview.records.filter(row=>row.state==='ready').flatMap(row=>row.targets);void api.confirmDrawingAssociations?.({targets,fingerprint:repairPreview.fingerprint,reason:'核验诊断证据后批量确认',confirmed:true}).then(async(result)=>{setAssociationResult(result);setRepairPreview(null);await refreshCurrentQuery();}).catch(reason=>setError(reason.message)).finally(()=>setMaintaining(false));}}>人工确认候选关联</button><button type="button" onClick={()=>setRepairPreview(null)}>关闭预览</button></section>}
    {associationResult && <p role="status" className="drawing-association-result">已更新 {associationResult.updated} 条关联{associationResult.before && associationResult.after && <> · 历史已关联 {associationResult.before.historicalAssociated} → {associationResult.after.historicalAssociated} / {associationResult.after.historicalTotal} · 正式已关联 {associationResult.before.plannedAssociated} → {associationResult.after.plannedAssociated} / {associationResult.after.plannedTotal}</>}<button className="text-button" type="button" aria-label="关闭关联结果" onClick={()=>setAssociationResult(null)}>关闭</button></p>}
    <ModuleWorkspace drawingWorkspace resizable navigation={({ collapseControl }) => <ProductCatalogNavigation products={products} batches={catalogBatches} usageBatches={navigationBatches} counts={navigationCounts} scope={scope} onSelect={navigateScope} mode="drawings" collapseControl={collapseControl} />} detail={detailPanel} detailLabel="图号详情" detailIdentity={selected?.id} onCloseDetail={() => {if(maintainingRef.current) return; detailRequest.current++; pdfRequest.current++; setSelected(null);}}>
    <header className="drawing-list-heading">
      <h2 className="drawing-scope-title">{scopeTitle}</h2>
      {scope.kind === 'product' && <p>{products.find(product => product.id === scope.productId)?.sku ?? 'SKU待补录'} · 全部资料批次</p>}
      {scope.kind === 'batch' && <p>{(() => {const batch=navigationBatches.find(item=>item.id===scope.batchId);const state=scope.productId ? batch?.usageProducts.find(item=>item.productId===scope.productId)?.state : batch?.currentState;return state==='current'?'当前批次实际使用图号':state==='historical'?'历史批次实际使用图号':'当前使用关系未确定';})()}</p>}
    </header>
    <form className="filter-bar filter-grid drawing-search-bar" onSubmit={submit}>
      <label><span>关键词</span><input aria-label="关键词" value={filters.keyword} onChange={(event) => set('keyword', event.target.value)} /></label>
      {dictionarySelect('主类别', 'mainCategoryId', 'main_category')}
      <label><span>状态</span><select aria-label="状态" value={filters.status} onChange={event => set('status',event.target.value)}><option value="">全部</option><option value="reserved">已占号</option><option value="active">使用中</option><option value="voided">已作废</option><option value="inactive">已停用</option></select></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '查询中…' : '查询'}</button>
      <button className="text-button" type="button" onClick={() => setMoreFilters((value) => !value)}>{moreFilters ? '收起筛选' : '更多筛选'}</button>
      <button className="text-button" type="button" onClick={clearFilters} disabled={loading}>清除筛选</button>
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
    {loading && items.length>0 && <p className="muted-text" role="status">正在加载所选范围，表格保留上次结果…</p>}
    {queryError && items.length>0 && <p className="error-banner" role="alert">{queryError} · 当前显示上次成功结果</p>}
    {queryState !== 'ready' && items.length===0 ? <QueryFeedback state={queryState} error={queryError} onRetry={() => void search(queriedValues, page, pageSize)}/> : items.length === 0 ? <EmptyState title={Object.entries(queriedValues).some(([key,value]) => value !== emptyFilters[key as keyof typeof emptyFilters]) ? '没有符合查询条件的图号' : '图号库尚无记录'} description="可调整查询条件后重新检索；新增图号请使用图号规划。" /> :
      <DataTable items={items} onRowClick={(item) => void openDetail(item)} columns={[
        { key: 'select', label: '选择', render: (item) => <input type="checkbox" aria-label={`选择图号 ${item.fullCode}`} disabled={Boolean(item.deletedAt)} checked={checkedIds.includes(item.id)}
          onClick={(event) => event.stopPropagation()} onChange={(event) => setCheckedIds((current) => event.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))} /> },
        { key: 'code', label: '完整图号', render: (item) => <span className="drawing-code-inline"><button className="link-button" type="button"
          ref={(node) => { if (node) disclosureButtons.current.set(item.id, node); else disclosureButtons.current.delete(item.id); }}
          aria-expanded={selected?.id === item.id} aria-controls={`drawing-detail-${item.id}`}>{item.fullCode}</button><CopyDrawingCode code={item.fullCode} /></span> },
        { key: 'category', label: '主类别 / 项目', render: (item) => <span className="drawing-category-project"><span className="drawing-category-badge">{item.mainCategoryName}</span><span className="drawing-project-name">{item.projectItemName}</span></span> },
        { key: 'origin', label: '来源', render: (item) => <span className="drawing-origin-cell">{item.origin === 'planned' ? '正式规划' : '历史扫描'}{item.dictionaryMappingStatus === 'unmapped' && <small className="mapping-warning">字典待映射</small>}</span> },
        {key:'product',label:'关联产品',render:item=>item.productId?item.model:'待关联'}, {key:'version',label:'版本',render:item=>typeof item.version==='string'&&item.version.trim()?item.version:'未记录'},
        { key: 'status', label: '图号状态', render: (item) => <span className="drawing-status-summary"><span className={`status-text ${item.status}`}>{statusLabel(item.origin, item.status)}</span>{item.deletedAt && <span className="mapping-warning">{item.deletionMode === 'retain_occupied' ? '删除·保留占号' : '删除·已释放'}</span>}</span> },
        {key:'actions',label:'操作',render:item => <button className="text-button" type="button" onClick={event => {event.stopPropagation(); void openDetail(item);}}>查看 / 管理</button>},

      ]} />}
    {total > 0 && <nav className="drawing-pagination" aria-label="图号分页"><span>共 {total} 条 · 第 {page} / {totalPages} 页</span>
      <button className="secondary-button" type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>上一页</button>
      <span className="page-number-list">{visiblePages.map((value, index) => <span key={value}>{index > 0 && value - visiblePages[index - 1] > 1 && <i>…</i>}<button type="button" className={value === page ? 'current' : ''} aria-current={value === page ? 'page' : undefined} onClick={() => goToPage(value)}>{value}</button></span>)}</span>
      <button className="secondary-button" type="button" disabled={page >= totalPages} onClick={() => goToPage(page + 1)}>下一页</button>
      <label><span>每页条数</span><select aria-label="每页条数" value={pageSize} onChange={(event) => { const nextSize = Number(event.target.value); setPageSize(nextSize); savePageSize('drawings',nextSize);setPage(1); void search(appliedQuery.current.values, 1, nextSize); }}><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></label>
    </nav>}
    </ModuleWorkspace>
  </section>;
}

const statusLabel = (origin: DrawingView['origin'], status: DrawingView['status']) => {
  if (origin === 'historical') return status === 'inactive' ? '已停用' : '使用中';
  return status === 'active' ? '正式使用' : status === 'reserved' ? '已占号' : '作废';
};

function DrawingDetailPanel({associationEditor, selected, contextBatchId, contextProductId, editing, onManage, onCancelManage, onSave, staged, onNavigatePdf, errorMessage, previewOnly = false, maintaining, pdfKeyword, setPdfKeyword, pdfCandidates, selectedPdfId,
  setSelectedPdfId, onClose, onStatus, onOpen, onSearchPdf, onAssociate, onHistoricalStatus,
  onBeginDelete, deletionPreview, deletionMode, setDeletionMode, deletionReason, setDeletionReason,
  deletionConfirmation, setDeletionConfirmation, onConfirmDelete, onCancelDelete, onRestore, onError }: {
  associationEditor?: import('react').ReactNode; contextBatchId?: number; contextProductId?: number; editing: boolean; onManage(): void; onCancelManage(): void; onSave(): void; staged: Array<{pdfId:number;type:'source'|'outlined'}>; onNavigatePdf?(): void;
  selected: DrawingDetailView; errorMessage: string; previewOnly?: boolean; maintaining: boolean; pdfKeyword: string; setPdfKeyword(value: string): void;
  pdfCandidates: PdfFileView[]; selectedPdfId: string; setSelectedPdfId(value: string): void; onClose(): void;
  onStatus(target: 'active' | 'voided'): Promise<void>; onOpen(id: number): Promise<void>;
  onSearchPdf(keyword: string): Promise<void>; onAssociate(type: 'source' | 'outlined'): Promise<void>;
  onHistoricalStatus(target: 'active' | 'inactive'): Promise<void>;
  onBeginDelete(mode?:'retain_occupied'|'release'): Promise<void>; deletionPreview: DrawingDeletionPreviewView | null;
  deletionMode: 'retain_occupied' | 'release'; setDeletionMode(value: 'retain_occupied' | 'release'): void;
  deletionReason: string; setDeletionReason(value: string): void;
  deletionConfirmation: string; setDeletionConfirmation(value: string): void;
  onConfirmDelete(): Promise<void>; onCancelDelete(): void; onRestore(): Promise<void>;
  onError(message: string): void;
}) {

  return <aside id={`drawing-detail-${selected.id}`} className="drawing-maintenance workspace-drawing-detail panel-enter" aria-label="图号详情"
    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
    <header className="drawing-detail-header">
      <div className="drawing-code-inline"><h2 title={selected.fullCode}>{selected.fullCode}</h2><CopyDrawingCode key={selected.fullCode} code={selected.fullCode} /></div>
      <button className="panel-close drawing-close-icon" aria-label="关闭图号详情" disabled={maintaining} onClick={onClose} type="button"><X size={18} strokeWidth={1.8}/></button>
      <div className="drawing-detail-badges"><span className="drawing-origin-label">{selected.origin === 'planned' ? '正式规划' : '历史扫描'}{selected.dictionaryMappingStatus === 'unmapped' ? ' · 字典待映射' : ''}</span><span className={`status-text ${selected.status}`}>{selected.status==='reserved'?'已占号':selected.status==='active'?'使用中':'历史版本'}</span></div>
      {selected.displayName?.trim() && selected.displayName.trim() !== selected.fullCode && <p className="detail-name">{selected.displayName}</p>}
    </header>
    {errorMessage && <p className="error-banner" role="alert">{errorMessage}</p>}
    <section className="drawing-detail-group"><h3>01 基础信息</h3><dl className="drawing-detail-attributes">
      <div><dt>SKU</dt><dd>{selected.sku ?? '待补录'}</dd></div><div><dt>型号</dt><dd>{selected.model || '待关联'}</dd></div>
      <div><dt>品牌</dt><dd>{selected.brandName || '未记录'}</dd></div><div><dt>产品类别</dt><dd>{selected.productCategory || '未记录'}</dd></div>
      <div><dt>主类别</dt><dd>{selected.mainCategoryName || '未记录'}</dd></div><div><dt>项目明细</dt><dd>{selected.projectItemName || '未记录'}</dd></div>
    </dl></section>
    <section className="drawing-detail-group"><h3>02 文件信息</h3><CurrentOutlinedFiles contextProductId={contextProductId} contextBatchId={contextBatchId} key={`${selected.origin}-${selected.id}`} selected={selected} onOpen={onOpen} previewOnly={previewOnly} />    {editing && !selected.readOnly && !selected.deletedAt && <section className="drawing-detail-section pdf-association" aria-label="文件维护 / 索引维护"><h3>文件维护<span>关联现有 PDF 索引</span></h3>
      <div className="pdf-search"><input aria-label="搜索现有 PDF" value={pdfKeyword} onChange={(event) => setPdfKeyword(event.target.value)} placeholder="文件名或相对路径" />
        <button className="secondary-button" onClick={() => void onSearchPdf(pdfKeyword).catch((reason) => onError(reason instanceof Error ? reason.message : 'PDF 搜索失败'))} type="button">搜索 PDF</button></div>
      <label><span>现有 PDF 索引</span><select aria-label="现有 PDF 索引" value={selectedPdfId} onChange={(event) => setSelectedPdfId(event.target.value)}><option value="">请选择当前存在的 PDF</option>
        {pdfCandidates.map((file) => <option key={file.id} value={file.id}>{file.fileName} · {file.relativePath}</option>)}</select></label>
      <div className="drawing-actions"><button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('source')} type="button">关联为源文件</button>
        <button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('outlined')} type="button">关联为转曲后文件</button></div>
      {staged.length > 0 && <ul aria-label="待保存 PDF 关联">{staged.map(item => <li key={`${item.pdfId}-${item.type}`}>{pdfCandidates.find(file => file.id === item.pdfId)?.fileName ?? `PDF #${item.pdfId}`} · {item.type === 'source' ? '源文件' : '转曲后文件'} · 待保存</li>)}</ul>}
</section>}</section>
    <section className="drawing-detail-group"><h3>03 业务关联</h3><dl className="drawing-business-summary">
      <div><dt>出现批次</dt><dd>{selected.firstOccurrenceBatch ? materialBatchLabel(selected.firstOccurrenceBatch.name) : selected.firstBatchAmbiguous ? '待核实' : '未记录'}</dd></div>
      <div><dt>首次 BOM</dt><dd>{selected.firstBom ? `${selected.firstBom.model} · BOM ${selected.firstBom.versionNumber}${selected.firstBom.businessDate ? ' · '+selected.firstBom.businessDate : ''}` : '未进入 BOM'}</dd></div>
    </dl></section>
    <section className="drawing-detail-group"><h3>04 状态与操作</h3>
      <label className="drawing-business-status"><span>业务状态</span><select aria-label="图号业务状态" disabled={maintaining||Boolean(selected.deletedAt)} value={selected.status==='reserved'?'reserved':selected.status==='active'?'active':'historical'} onChange={event=>{
        if(selected.origin==='historical')void onHistoricalStatus(event.target.value==='active'?'active':'inactive');
        else void onStatus(event.target.value==='active'?'active':'voided');
      }}>{selected.status==='reserved'&&<option value="reserved" disabled hidden>仅占号，未正式使用</option>}<option value="active">使用中</option><option value="historical">历史版本</option></select></label>{associationEditor}
    <div className="drawing-detail-toolbar">{editing ? <><button className="primary-button" disabled={maintaining} onClick={onSave} type="button">保存并返回详情</button><button className="secondary-button" disabled={maintaining} onClick={onCancelManage} type="button">取消编辑</button></> : <button className="secondary-button" disabled={previewOnly} onClick={onManage} type="button">改变产品所属</button>}{onNavigatePdf && <button className="text-button" type="button" onClick={onNavigatePdf}>查看 PDF 文件</button>}</div>    {<section className={`drawing-detail-section danger-zone${!selected.deletedAt && !deletionPreview ? ' danger-compact' : ''}`}>
      {selected.deletedAt ? <><p>删除方式：{selected.deletionMode === 'release' ? '彻底删除并释放图号' : '删除记录并保留占号'}</p>
        {selected.deletedReason && <p className="muted-text">原因：{selected.deletedReason}</p>}
        <button className="secondary-button" disabled={maintaining} onClick={() => void onRestore()} type="button">恢复记录</button>
        {selected.deletionMode === 'retain_occupied' && !deletionPreview && <button className="text-button danger" disabled={maintaining} onClick={() => void onBeginDelete()} type="button">检查引用并释放占号</button>}</> : null}
      {(!selected.deletedAt || selected.deletionMode === 'retain_occupied') && (!deletionPreview ? !selected.deletedAt && <>
          <button className="text-button danger" disabled={maintaining} onClick={() => void onBeginDelete('retain_occupied')} type="button">删除图号（保留占号）</button><button className="text-button danger" disabled={maintaining} onClick={()=>void onBeginDelete('release')} type="button">取消占号并删除</button></>
          : <div className="drawing-delete-panel">
            <p>{deletionPreview.origin === 'planned' ? '正式规划' : '历史扫描'}</p>
            <DeletionReferenceSummary preview={deletionPreview} />
            {deletionMode==='release'&&deletionPreview.releaseEligible===false ? <><div role="alert" className="error-banner">{(deletionPreview.releaseBlockers??[]).map(item=><p key={item.kind}>{item.message}</p>)}</div>{deletionPreview.deletable&&<button type="button" className="text-button" onClick={()=>setDeletionMode('retain_occupied')}>改为删除图号（保留占号）</button>}<button type="button" className="secondary-button" onClick={onCancelDelete}>取消</button></> : deletionPreview.blockers.length > 0 ? <div className="error-banner">{deletionPreview.blockers.map((item) => <p key={item.kind}>{item.message}</p>)}</div>
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

function CurrentOutlinedFiles({ selected, contextBatchId, contextProductId, onOpen, previewOnly = false }: { selected: DrawingDetailView; contextBatchId?: number; contextProductId?: number; previewOnly?: boolean; onOpen(id: number): Promise<void> }) {
  const [directory, setDirectory] = useState('');
  const [inspectedBatch,setInspectedBatch]=useState('');
  const effectiveBatchId=contextBatchId??(inspectedBatch?Number(inspectedBatch):undefined);
  const occurrences = (selected.batchUsage?.occurrences ?? []).filter((occurrence) =>
    effectiveBatchId != null ? occurrence.batchId === effectiveBatchId : (contextProductId ?? selected.productId) == null || occurrence.productId === (contextProductId ?? selected.productId));
  const directories = [...new Set(occurrences.map((occurrence) => occurrence.productDirectory))];
  const effectiveDirectory = directories.length === 1 ? directories[0] : directory;
  const scopedOccurrences = occurrences.filter(occurrence => effectiveBatchId != null ? occurrence.batchId === effectiveBatchId :
    directories.length === 1 || (directory !== '' && occurrence.productDirectory === effectiveDirectory));
  const currentIds = new Set(scopedOccurrences.flatMap(occurrence => occurrence.files.filter(file => effectiveBatchId != null ||
    (selected.batchUsage?.effectiveCurrentFileIds !== undefined ? selected.batchUsage.effectiveCurrentFileIds.includes(file.pdfIndexId) : occurrence.usageState === 'current')).map(file => file.pdfIndexId)));
  const current = (selected.outlinedFiles ?? []).filter(file => currentIds.has(file.pdfIndexId));
  const history = (selected.outlinedFiles ?? []).filter(file => !currentIds.has(file.pdfIndexId));
  const allOccurrences = selected.batchUsage?.occurrences ?? [];
  const knownBatchedFileIds = new Set(allOccurrences.flatMap(occurrence => occurrence.files.map(file => file.pdfIndexId)));
  const allowUnbatchedSource = effectiveBatchId == null && (contextProductId == null || contextProductId === selected.productId);
  const source = (selected.sourceFiles ?? []).filter(file => currentIds.has(file.pdfIndexId)
    || allowUnbatchedSource && !knownBatchedFileIds.has(file.pdfIndexId));
  const sourceHistory = (selected.sourceFiles ?? []).filter(file => !source.some(instance => instance.pdfIndexId === file.pdfIndexId));
  return <>
    {(selected.batchUsage?.occurrences.length??0)>1 && <label>查看资料批次<select aria-label="查看资料批次" value={inspectedBatch} onChange={event=>setInspectedBatch(event.target.value)}><option value="">当前有效资料</option>{(selected.batchUsage?.occurrences??[]).filter(occurrence=>(contextProductId??selected.productId)==null||occurrence.productId===(contextProductId??selected.productId)).map(occurrence=><option key={occurrence.batchId} value={occurrence.batchId}>{materialBatchLabel(occurrence.batchName)} · {occurrence.productDirectory}</option>)}</select></label>}
    {effectiveBatchId == null && directories.length > 1 && <label>当前文件所属资料目录<select aria-label="当前文件所属资料目录" value={directory} onChange={(event) => setDirectory(event.target.value)}>
      <option value="">存在多个资料目录，请选择</option>{directories.map((path) => <option key={path} value={path}>{path}</option>)}
    </select></label>}
    <FileSection title="转曲前文件" present={source.some(file => file.isPresent)} files={source} onOpen={onOpen} previewOnly={previewOnly} />
    <FileSection title="转曲后文件" present={current.some((file) => file.isPresent)} files={current} onOpen={onOpen} previewOnly={previewOnly} />
    {(history.length > 0 || sourceHistory.length > 0) && <details key={selected.id} className="drawing-detail-section">
      <summary>查看历史文件</summary>
      <FileSection title="转曲前文件" present={sourceHistory.some(file => file.isPresent)} files={sourceHistory} onOpen={onOpen} previewOnly={previewOnly} />
      <FileSection title="转曲后文件" present={history.some((file) => file.isPresent)} files={history} onOpen={onOpen} previewOnly={previewOnly} />
    </details>}
  </>;
}

function FileSection({ title, present, files, onOpen, previewOnly = false }: { title: string; present: boolean; files: DrawingFileView[]; previewOnly?: boolean; onOpen(id: number): Promise<void> }) {
  return <section className="drawing-detail-section drawing-file-section"><h3>{title}<span className={`drawing-file-presence ${present?'present':'missing'}`}>{present?'存在':'缺失'}</span></h3>
    {files.length === 0 ? <p className="muted-text">暂无{title}</p> : <ul>{files.map((file) => <li key={file.pdfIndexId} className="drawing-file-row">
      <span className="drawing-file-identity"><strong className="drawing-file-name" title={file.fileName}>{file.fileName}</strong></span>
      <button className="text-button" type="button" disabled={previewOnly || !file.isPresent} title={previewOnly ? 'Mock 不支持磁盘操作' : undefined}
        aria-label={`打开${title} ${file.fileName} 的位置`} onClick={() => void onOpen(file.pdfIndexId)}>打开位置</button>
    </li>)}</ul>}</section>;
}

function CopyDrawingCode({ code }: { code: string }) {
  const [error, setError] = useState('');
  return <span className="drawing-copy-control" onClick={event => event.stopPropagation()}>
    <button aria-label="复制完整图号" title="复制完整图号" type="button" className="copy-icon-button" onClick={() => {
      void (async () => { try { await navigator.clipboard.writeText(code); setError(''); }
        catch { setError('复制不可用，请选中完整图号复制'); } })();
    }}><Copy size={18} strokeWidth={1.8} aria-hidden="true" /></button>
    {error && <span role="alert" className="drawing-copy-error">{error}</span>}
  </span>;
}
