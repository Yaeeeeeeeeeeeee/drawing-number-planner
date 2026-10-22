import type { AppearanceApi } from '../data/appearance-client';
import type { BomAppearanceApi } from '../data/bom-appearance-client';
import { PageHeader } from '../components/PageHeader';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { BomCandidateView, BomDiffView, BomDrawingReferenceView, BomEntryModeView, BomItemAssetView, BomItemView, BomQrCandidateView, BomVersionSummaryView, BomVersionView, DictionaryItemView, MaterialBatchView, PlannerApi, ProductView } from '../data/client';
import { ApiError } from '../data/client';
import { BomEditor, candidateKey, type DraftCandidate, type DraftRow } from './bom/BomEditor';
import { BomQuery } from './bom/BomQuery';
import { BomArchivePanel } from './bom/BomArchivePanel';
import { bomScenarios, createBomMockApi, initialBomScenario, isBomMockEnabled, type BomScenario } from './bom/bom-mock';

export const localBusinessDateToday = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const blankRow = (id: number): DraftRow => ({ clientId: `bom-row-${id}`, mainCategoryId: '', projectItemId: '', drawingId: '', usesWhiteMaterial: false,
  effectiveMaterialBatchId: '', material: '', dimensions: '', position: '', notes: '', changeDetails: '', imageAsset: null, diagramAsset: null,
  reuseImage: false, reuseDiagram: false, previousImageName: null, previousDiagramName: null, qrCodeIds: [], inactiveQrCodes: [], showQrCodes: false,
  candidates: [], candidatesLoaded: false });
const assetForRole = (assets: BomItemAssetView[], role: 'image' | 'diagram') => assets.find((asset) => asset.role === role) ?? null;
const referenceKey = (reference: BomDrawingReferenceView) => reference.origin === 'planned'
  ? `planned:${reference.drawingId}` : `historical:${reference.historicalDrawingId}`;
const parseReferenceKey = (value: string): BomDrawingReferenceView => {
  const [origin, rawId] = value.split(':'); const id = Number(rawId);
  return origin === 'historical' ? { origin, historicalDrawingId: id } : { origin: 'planned', drawingId: id };
};
const fromItem = (item: BomItemView, clientId: string, projects: DictionaryItemView[] = []): DraftRow => ({ clientId, originalItemId: item.bomItemId,
  mainCategoryId: String(projects.find((project) => project.id === item.projectItemId)?.parentId ?? ''),
  projectItemId: String(item.projectItemId), drawingId: referenceKey(item),
  usesWhiteMaterial: item.usesWhiteMaterial, effectiveMaterialBatchId: item.effectiveMaterialBatchId === null ? '' : String(item.effectiveMaterialBatchId),
  material: item.material ?? '', dimensions: item.dimensions ?? '', position: item.position ?? '', notes: item.notes ?? '', changeDetails: item.changeDetails ?? '',
  imageAsset: assetForRole(item.assets, 'image'), diagramAsset: assetForRole(item.assets, 'diagram'), reuseImage: Boolean(assetForRole(item.assets, 'image')), reuseDiagram: Boolean(assetForRole(item.assets, 'diagram')),
  previousImageName: assetForRole(item.assets, 'image')?.originalFileName ?? null, previousDiagramName: assetForRole(item.assets, 'diagram')?.originalFileName ?? null,
  qrCodeIds: item.qrCodes.map((qr) => qr.id), inactiveQrCodes: item.qrCodes.filter((qr) => qr.status === 'inactive'),
  showQrCodes: item.qrCodes.length > 0, candidates: [{ ...(item.origin === 'planned'
    ? { origin: 'planned' as const, drawingId: item.drawingId } : { origin: 'historical' as const, historicalDrawingId: item.historicalDrawingId }),
    fullCode: item.fullCode, displayName: item.displayName, projectItemId: item.projectItemId,
    projectItemName: item.projectItemName, status: item.status }], candidatesLoaded: true });

const includeCurrentVoidedCandidate = (row: DraftRow, candidates: BomCandidateView[]): DraftCandidate[] => {
  const selected = row.candidates.find((candidate) => candidateKey(candidate) === row.drawingId);
  return selected && !candidates.some((candidate) => candidateKey(candidate) === candidateKey(selected)) ? [selected, ...candidates] : candidates;
};

export function BomPage({ api: realApi, target }: { api: PlannerApi; target?:{productId:number;appearanceVersionId?:number;bomVersionId?:number} }) {
  const previewOnly = isBomMockEnabled();
  const [scenario, setScenario] = useState<BomScenario>(initialBomScenario);
  const api = useMemo(() => (previewOnly ? createBomMockApi(scenario) : realApi) as PlannerApi & AppearanceApi & BomAppearanceApi, [previewOnly, scenario, realApi]);
  const simulateConflict = previewOnly && scenario === 'conflict';
  const [mode, setMode] = useState<'add' | 'query'>(target?.bomVersionId !== undefined ? 'query' : 'add'); const [products, setProducts] = useState<ProductView[]>([]);
  const [mainCategories, setMainCategories] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]); const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [appearanceVersionId,setAppearanceVersionId]=useState('');
  const [productId, setProductId] = useState(''); const [businessChangeDate, setBusinessChangeDate] = useState(localBusinessDateToday());
  const [entryMode, setEntryMode] = useState<BomEntryModeView>('current');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [base, setBase] = useState<BomVersionView | null>(null); const [rows, setRows] = useState<DraftRow[]>([]);
  const [qrCandidates, setQrCandidates] = useState<BomQrCandidateView[]>([]); const [diff, setDiff] = useState<BomDiffView[]>([]);
  const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState(''); const [needsRefresh, setNeedsRefresh] = useState(false); const [reloadNonce, setReloadNonce] = useState(0);
  const [historyDetail, setHistoryDetail] = useState<BomVersionView | null>(null); const [queryModel, setQueryModel] = useState('');
  const [queryDate, setQueryDate] = useState(''); const [queryBatch, setQueryBatch] = useState('');
  const [queryMainCategoryId, setQueryMainCategoryId] = useState(''); const [queryProjectId, setQueryProjectId] = useState('');
  const [queryFullCode, setQueryFullCode] = useState(''); const [queryResults, setQueryResults] = useState<BomVersionSummaryView[]>([]);
  const saving = useRef(false);
  const nextRow = useRef(1); const requestId = useRef(0); const historyRequest = useRef(0); const candidateRequests = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!target || previewOnly) return;
    const detailRequest = ++historyRequest.current;
    requestId.current += 1;
    setEditingId(null); setHistoryDetail(null); setQueryResults([]); setError('');
    setProductId(String(target.productId));
    setAppearanceVersionId(target.appearanceVersionId !== undefined ? String(target.appearanceVersionId) : '');
    if (target.bomVersionId === undefined) { setMode('add'); return; }
    setMode('query'); setBusy(true);
    void (async () => {
      const detail = await api.getBomVersion(target.bomVersionId!);
      if (detail.id !== target.bomVersionId || (target.appearanceVersionId !== undefined && detail.appearanceVersionId !== target.appearanceVersionId))
        throw Error('所选 BOM 记录与产品或外观版本不匹配');
      if (detail.productId !== target.productId) {
        if (!api.listAppearanceVersions) throw Error('无法核对所选 BOM 的产品归属');
        const [owner, selected] = await Promise.all([api.listAppearanceVersions(detail.productId), api.listAppearanceVersions(target.productId)]);
        if (!Number.isSafeInteger(owner.productId) || !Number.isSafeInteger(selected.productId) || owner.productId !== selected.productId) throw Error('所选 BOM 记录与产品或外观版本不匹配');
      }
      if (historyRequest.current !== detailRequest) return;
      setHistoryDetail(detail); setQueryResults([detail]); setQueryModel(detail.model);
    })().catch(reason => { if (historyRequest.current === detailRequest) setError(reason instanceof Error ? reason.message : 'BOM 历史加载失败'); })
      .finally(() => { if (historyRequest.current === detailRequest) setBusy(false); });
    return () => { historyRequest.current += 1; };
  }, [api, previewOnly, target?.productId, target?.appearanceVersionId, target?.bomVersionId]);
  useEffect(() => { void Promise.all([api.listProducts({ status: 'active' }), api.listDictionaries('main_category', false),
    api.listDictionaries('project_item', false), api.listMaterialBatches()])
    .then(([productItems, categoryItems, projectItems, batchItems]) => { setProducts(productItems); setMainCategories(categoryItems); setProjects(projectItems); setBatches(batchItems); if (previewOnly) setProductId(scenario === 'unselected' ? '' : '-101'); })
    .catch((reason) => setError(reason instanceof Error ? reason.message : 'BOM 基础资料加载失败')); }, [api]);

  useEffect(() => {
    if (mode !== 'add') return;
    const currentRequest = ++requestId.current; setBase(null); setRows([]); setQrCandidates([]); setLoaded(false); setDiff([]); setSavedMessage(''); setNeedsRefresh(false); setError('');
    if (!productId || mode !== 'add') return;
    setBusy(true); void Promise.all([editingId !== null ? api.getBomVersion(editingId) : (appearanceVersionId && api.getAppearanceBom ? api.getAppearanceBom(Number(productId),Number(appearanceVersionId)) : api.getCurrentBom(Number(productId))), (appearanceVersionId && api.listAppearanceBomQrCandidates ? api.listAppearanceBomQrCandidates(Number(productId),Number(appearanceVersionId)) : api.listBomQrCandidates(Number(productId)))]).then(async ([current, qrs]) => {
      if (editingId !== null && (!current || current.id !== editingId || current.productId !== Number(productId) || !Number.isSafeInteger(current.editRevision) || current.editRevision < 0)) throw Error('所选 BOM 记录不匹配或已不可读取，未进入新增流程');
      const draftRows = current?.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`, projects)) ?? [];
      await Promise.all(draftRows.map((row) => loadCandidatesFor(row, Number(productId), row.projectItemId, row.usesWhiteMaterial).then((items) => { row.candidates = includeCurrentVoidedCandidate(row, items); row.candidatesLoaded = true; })));
      if (requestId.current !== currentRequest) return; setBase(current); setRows(draftRows); setQrCandidates(qrs); setLoaded(true);
      if (editingId !== null && current) setBusinessChangeDate(current.businessChangeDate ?? '');
    }).catch((reason) => { if (requestId.current === currentRequest) setError(reason instanceof Error ? reason.message : 'BOM 加载失败'); })
      .finally(() => { if (requestId.current === currentRequest) setBusy(false); });
  }, [api, entryMode, productId, appearanceVersionId, projects, reloadNonce, editingId, mode]);

  const loadCandidatesFor = (row: DraftRow, currentProductId: number, projectItemId: string, usesWhiteMaterial: boolean) => projectItemId
    ? appearanceVersionId && api.listAppearanceBomCandidates ? api.listAppearanceBomCandidates({productId:currentProductId,appearanceVersionId:Number(appearanceVersionId),projectItemId:Number(projectItemId),usesWhiteMaterial,entryMode,includeReusableMaterials:false}) : api.listBomCandidates({ productId: currentProductId, projectItemId: Number(projectItemId), usesWhiteMaterial, entryMode }) : Promise.resolve([] as BomCandidateView[]);
  const invalidate = () => { setDiff([]); setSavedMessage(''); setNeedsRefresh(false); setError(''); };
  const loadCandidates = (row: DraftRow, projectItemId: string, usesWhiteMaterial: boolean) => {
    if (!productId || !projectItemId) return; const serial = (candidateRequests.current[row.clientId] ?? 0) + 1; candidateRequests.current[row.clientId] = serial;
    void loadCandidatesFor(row, Number(productId), projectItemId, usesWhiteMaterial).then((candidates) => { if (candidateRequests.current[row.clientId] === serial) setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, candidates: includeCurrentVoidedCandidate(item, candidates), candidatesLoaded: true } : item)); }).catch((reason) => setError(reason instanceof Error ? reason.message : '候选图号加载失败'));
  };
  const changeProject = (row: DraftRow, value: string) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, projectItemId: value, drawingId: '', candidates: [], candidatesLoaded: false, imageAsset: null, diagramAsset: null, reuseImage: false, reuseDiagram: false, previousImageName: null, previousDiagramName: null, qrCodeIds: [], inactiveQrCodes: [] } : item)); invalidate(); loadCandidates(row, value, row.usesWhiteMaterial); };
  const changeMainCategory = (row: DraftRow, value: string) => { setRows((current) => current.map((item) => item.clientId === row.clientId
    ? { ...item, mainCategoryId: value, projectItemId: '', drawingId: '', candidates: [], candidatesLoaded: false,
      imageAsset: null, diagramAsset: null, reuseImage: false, reuseDiagram: false,
      previousImageName: null, previousDiagramName: null, qrCodeIds: [], inactiveQrCodes: [] } : item)); invalidate(); };
  const changeWhite = (row: DraftRow, value: boolean) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, usesWhiteMaterial: value, drawingId: '', candidates: [], candidatesLoaded: false } : item)); invalidate(); loadCandidates(row, row.projectItemId, value); };
  const complete = useMemo(() => Boolean(loaded && productId && (editingId !== null ? base?.id === editingId && base.productId === Number(productId) : businessChangeDate) && rows.length > 0 && rows.every((row) => {
    const selected = row.candidates.find((candidate) => candidateKey(candidate) === row.drawingId);
    const retained = editingId !== null && base?.items.some((item) => String(item.projectItemId) === row.projectItemId
      && candidateKey(item) === row.drawingId && item.usesWhiteMaterial === row.usesWhiteMaterial);
    return row.mainCategoryId && row.projectItemId && row.drawingId && (selected?.status !== 'voided' || retained)
      && (entryMode === 'historical' || selected?.origin !== 'historical')
      ;
  })), [loaded, productId, businessChangeDate, entryMode, rows, editingId, base]);
  const changeField = (row: DraftRow, field: keyof DraftRow, value: string | boolean) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, [field]: value } : item)); invalidate(); };
  // Presentation only: mirror the existing complete predicate, without adding validation.
  const blockers = rows.flatMap((row, index) => {
    const selected = row.candidates.find((item) => candidateKey(item) === row.drawingId);
    const retained = editingId !== null && base?.items.some((item) => String(item.projectItemId) === row.projectItemId && candidateKey(item) === row.drawingId && item.usesWhiteMaterial === row.usesWhiteMaterial);
    const fields = [!row.mainCategoryId && '主类别：请选择', !row.projectItemId && '项目：请选择', !row.drawingId && '图号：请选择', selected?.status === 'voided' && !retained && '图号：原引用已作废，请选择可用图号', entryMode !== 'historical' && selected?.origin === 'historical' && '图号：当前录入不能引用历史图号'].filter(Boolean);
    return fields.map((reason) => `项目 ${index + 1} · ${reason}`);
  });
  if (editingId === null && !businessChangeDate) blockers.unshift('业务变更日期：请选择');
  if (!rows.length) blockers.unshift('项目：请添加至少一个 BOM 项目');
  const upload = async (row: DraftRow, role: 'image' | 'diagram', file: File) => { if (previewOnly || !productId) return; setBusy(true); setError(''); try { const asset = await api.uploadBomAsset(Number(productId), file); setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, [role === 'image' ? 'imageAsset' : 'diagramAsset']: { ...asset, assetId: asset.id, role, inheritedFromBomItemAssetId: null }, [role === 'image' ? 'reuseImage' : 'reuseDiagram']: false } : item)); } catch (reason) { setError(reason instanceof Error ? reason.message : '附件上传失败'); } finally { setBusy(false); } };
  const save = async () => { if (saving.current || busy || !complete || (previewOnly && !simulateConflict)) return;
    if (editingId !== null && (!base || base.id !== editingId || base.productId !== Number(productId))) { setError('所选 BOM 记录不匹配，禁止改为新增'); return; }
    saving.current = true; setBusy(true); setError(''); setNeedsRefresh(false); try {
    const input = ({ ...(appearanceVersionId ? {appearanceVersionId:Number(appearanceVersionId)} : {}), productId: Number(productId), entryMode, businessChangeDate, expectedCurrentVersionId: base?.id ?? null, items: rows.map((row) => ({ projectItemId: Number(row.projectItemId), drawingReference: parseReferenceKey(row.drawingId), usesWhiteMaterial: row.usesWhiteMaterial, ...(row.effectiveMaterialBatchId ? { effectiveMaterialBatchId: Number(row.effectiveMaterialBatchId) } : editingId && base?.items.some((old) => old.projectItemId === Number(row.projectItemId) && old.effectiveMaterialBatchId !== null) ? { effectiveMaterialBatchId: null } : {}), ...(row.material.trim() ? { material: row.material.trim() } : {}), ...(row.dimensions.trim() ? { dimensions: row.dimensions.trim() } : {}), ...(row.position.trim() ? { position: row.position.trim() } : {}), ...(row.notes.trim() ? { notes: row.notes.trim() } : {}), ...(row.changeDetails.trim() ? { changeDetails: row.changeDetails.trim() } : {}), assets: ([row.reuseImage && !editingId ? { role: 'image' as const, reusePrevious: true } : row.imageAsset ? { role: 'image' as const, assetId: row.imageAsset.assetId } : null, row.reuseDiagram && !editingId ? { role: 'diagram' as const, reusePrevious: true } : row.diagramAsset ? { role: 'diagram' as const, assetId: row.diagramAsset.assetId } : null].filter(Boolean) as Array<{ role: 'image' | 'diagram'; assetId?: number; reusePrevious?: boolean }>) })) });
    const saved = editingId !== null ? await api.updateBomVersion(editingId, { ...input, businessChangeDate: base!.businessChangeDate ?? undefined }, base!.editRevision) : await api.saveBomVersion(input);
    if (editingId !== null && (saved.version.id !== editingId || saved.version.productId !== base!.productId || saved.version.createdAt !== base!.createdAt || saved.version.businessChangeDate !== base!.businessChangeDate)) throw Error('保存返回的 BOM 身份或原始日期不匹配，请重新查询核对；未调用新增');
    const savedRows = saved.version.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`, projects));
    const candidateLists = await Promise.allSettled(savedRows.map((row) => loadCandidatesFor(row, Number(productId), row.projectItemId, row.usesWhiteMaterial)));
    candidateLists.forEach((result, index) => { if (result.status === 'fulfilled') { savedRows[index].candidates = includeCurrentVoidedCandidate(savedRows[index], result.value); savedRows[index].candidatesLoaded = true; } });
    setBase(saved.version); setDiff(saved.diff); setRows(savedRows);
    if (editingId !== null) {
      historyRequest.current += 1; setBase(saved.version); setHistoryDetail(saved.version); setSavedMessage('BOM 修改已保存'); setMode('query');
      try { setQueryResults(await api.queryBomVersions(queryFilters())); } catch { setError('BOM 修改已保存，但列表刷新失败，请重新查询；不要重复保存'); }
      return;
    }
    setSavedMessage('当前 BOM 已保存');
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'BOM 保存失败'); setNeedsRefresh(reason instanceof ApiError && reason.code === 'BOM_STALE'); } finally { saving.current = false; setBusy(false); } };
  const queryFilters = () => ({ ...(appearanceVersionId ? {appearanceVersionId:Number(appearanceVersionId)} : {}), ...(queryModel ? { model: queryModel } : {}), ...(queryDate ? { businessChangeDate: queryDate } : {}), ...(queryBatch ? { effectiveBatchRelativePath: queryBatch } : {}), ...(queryProjectId ? { projectItemId: Number(queryProjectId) } : {}), ...(queryFullCode ? { fullCode: queryFullCode } : {}) });
  const query = async () => { const serial = ++historyRequest.current; setBusy(true); setError(''); setHistoryDetail(null); try { const results = await (api.queryAppearanceBoms ? api.queryAppearanceBoms(queryFilters()) : api.queryBomVersions(queryFilters())); if (historyRequest.current === serial) setQueryResults(results); } catch (reason) { if (historyRequest.current === serial) setError(reason instanceof Error ? reason.message : 'BOM 查询失败'); } finally { if (historyRequest.current === serial) setBusy(false); } };
  const deleteVersion = async (id: number) => { if (previewOnly) return; setBusy(true); setError(''); try {
    const preview = await api.previewBomVersionDeletion(id);
    const impact = preview.isCurrent ? preview.fallbackVersionNumber === null
      ? '这是当前 BOM，删除后该型号将没有当前 BOM。' : `这是当前 BOM，删除后将回退到上一条有效变更记录（记录 ${preview.fallbackVersionId}）。`
      : '这是一条历史变更记录，删除不会改变当前 BOM。';
    if (!window.confirm(`${impact}\n确认只删除选中的变更记录 ${id} 吗？`)) return;
    await api.deleteBomVersion(id, true); setHistoryDetail((current) => current?.id === id ? null : current); await query();
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'BOM 删除失败'); } finally { setBusy(false); } };
  const deleteProductBom = async (selectedProductId: number, confirmation: string) => {
    if (previewOnly) return;
    if (!window.confirm('此操作将删除整个型号的全部 BOM 变更记录，确认继续吗？')) return;
    setBusy(true); setError(''); try { await api.deleteProductBom(selectedProductId, confirmation); setHistoryDetail(null); await query(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '整型号 BOM 删除失败'); } finally { setBusy(false); }
  };

  return <section className="page-surface page-enter bom-page"><PageHeader title="BOM 管理" description="按产品维护项目、图号、资料批次与附件；查询并编辑所选 BOM 记录。">{mode === 'add' && <span className="record-count">{base ? `${editingId !== null ? '正在编辑所选 BOM' : '当前 BOM'} · 业务日期 ${base.businessChangeDateLabel}` : '尚无当前 BOM'}</span>}</PageHeader><nav className="segmented-tabs" aria-label="BOM 管理方式"><button type="button" disabled={busy} aria-selected={mode === 'add'} onClick={() => { if (mode !== 'add') setMode('add'); }}>{editingId !== null ? '编辑 BOM' : '添加 BOM'}</button><button type="button" disabled={busy} aria-selected={mode === 'query'} onClick={() => { setMode('query'); void query(); }}>查询 BOM</button></nav>
    {editingId !== null && <button className="text-button" type="button" disabled={busy} onClick={() => { setEditingId(null); setEntryMode('current'); setBusinessChangeDate(localBusinessDateToday()); setMode('add'); }}>新增 BOM</button>}
    {mode === 'query' && savedMessage && <p role="status">{savedMessage}</p>}
    {previewOnly && <div className="bom-mock-toolbar" role="region" aria-label="BOM 开发预览"><p><strong>开发预览 Mock</strong> · 仅内存样例，不连接数据库或附件服务。上传、删除、归档和文件位置均禁用；移除 URL 中的 ?mock=bom 退出。</p><label><span>压力场景</span><select aria-label="BOM Mock 场景" value={scenario} onChange={(event) => { const next = event.target.value as BomScenario; setScenario(next); setProductId(next === 'unselected' ? '' : '-101'); setEditingId(null); setEntryMode('current'); setHistoryDetail(null); setQueryResults([]); setMode('add'); setBusy(false); }}>{Object.entries(bomScenarios).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>}
    {busy && <p role="status" className="bom-loading">正在加载 BOM…</p>}
    {mode === 'add' && !productId && <p className="bom-empty">请选择产品型号，查看或维护 BOM。</p>}
    {mode === 'add' && <><div className="form-grid bom-basics"><label><span>录入类型</span><select aria-label="BOM 录入类型" disabled={busy || editingId !== null} value={entryMode} onChange={(e) => setEntryMode(e.target.value as BomEntryModeView)}><option value="current">当前 BOM</option><option value="historical">历史 BOM</option></select></label><label><span>产品型号</span><select aria-label="BOM 产品型号" disabled={busy || editingId !== null} value={productId} onChange={(e) => { setProductId(e.target.value); setAppearanceVersionId(''); }}><option value="">请选择</option>{editingId !== null && base && !products.some(item => item.id === base.productId) && <option value={base.productId}>{base.model}（原始记录归属）</option>}{products.map((item) => <option key={item.id} value={item.id}>{item.brandName} · {item.model}</option>)}</select></label><label><span>业务变更日期</span><input aria-label="业务变更日期" type="date" disabled={busy || editingId !== null} title={editingId !== null ? '编辑已有记录时保留原业务变更日期' : undefined} value={businessChangeDate} onChange={(e) => setBusinessChangeDate(e.target.value)} /></label></div>{editingId !== null && base?.businessChangeDate === null && <p className="muted-text">历史业务日期未补录，本次保留原值；附件保留实际关联，不自动生成按日期归档的文件。</p>}{loaded && <BomEditor previewOnly={previewOnly} simulateConflict={simulateConflict} blockers={blockers} editing={editingId !== null} base={base} rows={rows} mainCategories={mainCategories} projects={projects} batches={batches.filter((batch) => batch.productId === Number(productId))} qrCandidates={qrCandidates} busy={busy} complete={complete} needsRefresh={needsRefresh} savedMessage={savedMessage} diff={diff} onAdd={() => { setRows((current) => [...current, blankRow(nextRow.current++)]); invalidate(); }} onDelete={(clientId) => { setRows((current) => current.filter((item) => item.clientId !== clientId)); invalidate(); }} onMainCategory={changeMainCategory} onProject={changeProject} onWhite={changeWhite} onDrawing={(row, value) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, drawingId: value } : item)); invalidate(); }} onChange={changeField} onUpload={upload} onQr={(row, id, checked) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, qrCodeIds: checked ? [...item.qrCodeIds, id] : item.qrCodeIds.filter((currentId) => currentId !== id) } : item)); invalidate(); }} onSave={save} onRefresh={() => setReloadNonce((value) => value + 1)} />}</>}
    {mode === 'query' && <BomQuery readVersion={api.getBomVersion} batches={batches} previewOnly={previewOnly} model={queryModel} businessChangeDate={queryDate} effectiveBatchRelativePath={queryBatch} mainCategoryId={queryMainCategoryId} projectItemId={queryProjectId} fullCode={queryFullCode} mainCategories={mainCategories} projects={projects} busy={busy} history={queryResults} detail={historyDetail} setModel={setQueryModel} setBusinessChangeDate={setQueryDate} setEffectiveBatchRelativePath={setQueryBatch} setMainCategoryId={(value) => { setQueryMainCategoryId(value); setQueryProjectId(''); }} setProjectItemId={setQueryProjectId} setFullCode={setQueryFullCode} onSearch={query} onEdit={(item) => { historyRequest.current += 1; setProductId(String(item.productId)); setAppearanceVersionId(String((item as BomVersionSummaryView & {appearanceVersionId?:number|null}).appearanceVersionId??'')); setEntryMode('historical'); setEditingId(item.id); setReloadNonce((value) => value + 1); setMode('add'); }} onDelete={deleteVersion} onDeleteProduct={deleteProductBom} onView={async (id) => { const detailRequest = ++historyRequest.current; setBusy(true); setError(''); try { const detail = await api.getBomVersion(id); if (historyRequest.current === detailRequest) setHistoryDetail(detail); } catch (reason) { if (historyRequest.current === detailRequest) setError(reason instanceof Error ? reason.message : 'BOM 历史加载失败'); } finally { if (historyRequest.current === detailRequest) setBusy(false); } }} />}
    {mode === 'query' && <BomArchivePanel api={api} previewOnly={previewOnly} />}
    {error && <p className="error-banner" role="alert">{error}</p>}</section>;
}
