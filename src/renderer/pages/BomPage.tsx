import { useEffect, useMemo, useRef, useState } from 'react';

import type { BomCandidateView, BomDiffView, BomItemAssetView, BomItemView, BomQrCandidateView, BomVersionSummaryView, BomVersionView, DictionaryItemView, MaterialBatchView, PlannerApi, ProductView } from '../data/client';
import { ApiError } from '../data/client';
import { BomEditor, type DraftCandidate, type DraftRow } from './bom/BomEditor';
import { BomQuery } from './bom/BomQuery';

export const localBusinessDateToday = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const blankRow = (id: number): DraftRow => ({ clientId: `bom-row-${id}`, projectItemId: '', drawingId: '', usesWhiteMaterial: false,
  effectiveMaterialBatchId: '', material: '', dimensions: '', position: '', notes: '', imageAsset: null, diagramAsset: null,
  reuseImage: false, reuseDiagram: false, previousImageName: null, previousDiagramName: null, qrCodeIds: [], inactiveQrCodes: [], candidates: [], candidatesLoaded: false });
const assetForRole = (assets: BomItemAssetView[], role: 'image' | 'diagram') => assets.find((asset) => asset.role === role) ?? null;
const fromItem = (item: BomItemView, clientId: string): DraftRow => ({ clientId, projectItemId: String(item.projectItemId), drawingId: String(item.drawingId),
  usesWhiteMaterial: item.usesWhiteMaterial, effectiveMaterialBatchId: item.effectiveMaterialBatchId === null ? '' : String(item.effectiveMaterialBatchId),
  material: item.material ?? '', dimensions: item.dimensions ?? '', position: item.position ?? '', notes: item.notes ?? '',
  imageAsset: assetForRole(item.assets, 'image'), diagramAsset: assetForRole(item.assets, 'diagram'), reuseImage: Boolean(assetForRole(item.assets, 'image')), reuseDiagram: Boolean(assetForRole(item.assets, 'diagram')),
  previousImageName: assetForRole(item.assets, 'image')?.originalFileName ?? null, previousDiagramName: assetForRole(item.assets, 'diagram')?.originalFileName ?? null,
  qrCodeIds: item.qrCodes.map((qr) => qr.id), inactiveQrCodes: item.qrCodes.filter((qr) => qr.status === 'inactive'), candidates: [{ id: item.drawingId, fullCode: item.fullCode, displayName: item.displayName,
    projectItemId: item.projectItemId, projectItemName: item.projectItemName, status: item.status }], candidatesLoaded: true });

const includeCurrentVoidedCandidate = (row: DraftRow, candidates: BomCandidateView[]): DraftCandidate[] => {
  const selected = row.candidates.find((candidate) => candidate.id === Number(row.drawingId));
  return selected?.status === 'voided' && !candidates.some((candidate) => candidate.id === selected.id) ? [selected, ...candidates] : candidates;
};

export function BomPage({ api }: { api: PlannerApi }) {
  const [mode, setMode] = useState<'add' | 'query'>('add'); const [products, setProducts] = useState<ProductView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]); const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [productId, setProductId] = useState(''); const [businessChangeDate, setBusinessChangeDate] = useState(localBusinessDateToday());
  const [base, setBase] = useState<BomVersionView | null>(null); const [rows, setRows] = useState<DraftRow[]>([]);
  const [qrCandidates, setQrCandidates] = useState<BomQrCandidateView[]>([]); const [diff, setDiff] = useState<BomDiffView[]>([]);
  const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState(''); const [needsRefresh, setNeedsRefresh] = useState(false); const [reloadNonce, setReloadNonce] = useState(0);
  const [historyDetail, setHistoryDetail] = useState<BomVersionView | null>(null); const [queryModel, setQueryModel] = useState('');
  const [queryDate, setQueryDate] = useState(''); const [queryBatch, setQueryBatch] = useState(''); const [queryProjectId, setQueryProjectId] = useState('');
  const [queryFullCode, setQueryFullCode] = useState(''); const [queryResults, setQueryResults] = useState<BomVersionSummaryView[]>([]);
  const nextRow = useRef(1); const requestId = useRef(0); const historyRequest = useRef(0); const candidateRequests = useRef<Record<string, number>>({});

  useEffect(() => { void Promise.all([api.listProducts({ status: 'active' }), api.listDictionaries('project_item', false), api.listMaterialBatches()])
    .then(([productItems, projectItems, batchItems]) => { setProducts(productItems); setProjects(projectItems); setBatches(batchItems); })
    .catch((reason) => setError(reason instanceof Error ? reason.message : 'BOM 基础资料加载失败')); }, [api]);

  useEffect(() => {
    const currentRequest = ++requestId.current; setBase(null); setRows([]); setQrCandidates([]); setLoaded(false); setDiff([]); setSavedMessage(''); setNeedsRefresh(false); setError('');
    if (!productId) return;
    setBusy(true); void Promise.all([api.getCurrentBom(Number(productId)), api.listBomQrCandidates(Number(productId))]).then(async ([current, qrs]) => {
      const draftRows = current?.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`)) ?? [];
      await Promise.all(draftRows.map((row) => loadCandidatesFor(row, Number(productId), row.projectItemId, row.usesWhiteMaterial).then((items) => { row.candidates = includeCurrentVoidedCandidate(row, items); row.candidatesLoaded = true; })));
      if (requestId.current !== currentRequest) return; setBase(current); setRows(draftRows); setQrCandidates(qrs); setLoaded(true);
    }).catch((reason) => { if (requestId.current === currentRequest) setError(reason instanceof Error ? reason.message : 'BOM 加载失败'); })
      .finally(() => { if (requestId.current === currentRequest) setBusy(false); });
  }, [api, productId, reloadNonce]);

  const loadCandidatesFor = (row: DraftRow, currentProductId: number, projectItemId: string, usesWhiteMaterial: boolean) => projectItemId
    ? api.listBomCandidates({ productId: currentProductId, projectItemId: Number(projectItemId), usesWhiteMaterial }) : Promise.resolve([] as BomCandidateView[]);
  const invalidate = () => { setDiff([]); setSavedMessage(''); setNeedsRefresh(false); setError(''); };
  const loadCandidates = (row: DraftRow, projectItemId: string, usesWhiteMaterial: boolean) => {
    if (!productId || !projectItemId) return; const serial = (candidateRequests.current[row.clientId] ?? 0) + 1; candidateRequests.current[row.clientId] = serial;
    void loadCandidatesFor(row, Number(productId), projectItemId, usesWhiteMaterial).then((candidates) => { if (candidateRequests.current[row.clientId] === serial) setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, candidates: includeCurrentVoidedCandidate(item, candidates), candidatesLoaded: true } : item)); }).catch((reason) => setError(reason instanceof Error ? reason.message : '候选图号加载失败'));
  };
  const changeProject = (row: DraftRow, value: string) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, projectItemId: value, drawingId: '', candidates: [], candidatesLoaded: false, imageAsset: null, diagramAsset: null, reuseImage: false, reuseDiagram: false, previousImageName: null, previousDiagramName: null, qrCodeIds: [], inactiveQrCodes: [] } : item)); invalidate(); loadCandidates(row, value, row.usesWhiteMaterial); };
  const changeWhite = (row: DraftRow, value: boolean) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, usesWhiteMaterial: value, drawingId: '', candidates: [], candidatesLoaded: false } : item)); invalidate(); loadCandidates(row, row.projectItemId, value); };
  const complete = useMemo(() => Boolean(productId && businessChangeDate && rows.length > 0 && rows.every((row) => {
    const selected = row.candidates.find((candidate) => candidate.id === Number(row.drawingId));
    return row.projectItemId && row.drawingId && selected?.status !== 'voided' && !row.inactiveQrCodes.some((qr) => row.qrCodeIds.includes(qr.id));
  })), [productId, businessChangeDate, rows]);
  const changeField = (row: DraftRow, field: keyof DraftRow, value: string | boolean) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, [field]: value } : item)); invalidate(); };
  const upload = async (row: DraftRow, role: 'image' | 'diagram', file: File) => { if (!productId) return; setBusy(true); setError(''); try { const asset = await api.uploadBomAsset(Number(productId), file); setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, [role === 'image' ? 'imageAsset' : 'diagramAsset']: { ...asset, assetId: asset.id, role, inheritedFromBomItemAssetId: null }, [role === 'image' ? 'reuseImage' : 'reuseDiagram']: false } : item)); } catch (reason) { setError(reason instanceof Error ? reason.message : '附件上传失败'); } finally { setBusy(false); } };
  const save = async () => { if (!complete) return; setBusy(true); setError(''); setNeedsRefresh(false); try {
    const saved = await api.saveBomVersion({ productId: Number(productId), businessChangeDate, expectedCurrentVersionId: base?.id ?? null, items: rows.map((row) => ({ projectItemId: Number(row.projectItemId), drawingId: Number(row.drawingId), usesWhiteMaterial: row.usesWhiteMaterial, ...(row.effectiveMaterialBatchId ? { effectiveMaterialBatchId: Number(row.effectiveMaterialBatchId) } : {}), ...(row.material.trim() ? { material: row.material.trim() } : {}), ...(row.dimensions.trim() ? { dimensions: row.dimensions.trim() } : {}), ...(row.position.trim() ? { position: row.position.trim() } : {}), ...(row.notes.trim() ? { notes: row.notes.trim() } : {}), assets: ([row.reuseImage ? { role: 'image' as const, reusePrevious: true } : row.imageAsset ? { role: 'image' as const, assetId: row.imageAsset.assetId } : null, row.reuseDiagram ? { role: 'diagram' as const, reusePrevious: true } : row.diagramAsset ? { role: 'diagram' as const, assetId: row.diagramAsset.assetId } : null].filter(Boolean) as Array<{ role: 'image' | 'diagram'; assetId?: number; reusePrevious?: boolean }>), qrCodeIds: row.qrCodeIds })) });
    const savedRows = saved.version.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`));
    const candidateLists = await Promise.allSettled(savedRows.map((row) => loadCandidatesFor(row, Number(productId), row.projectItemId, row.usesWhiteMaterial)));
    candidateLists.forEach((result, index) => { if (result.status === 'fulfilled') { savedRows[index].candidates = includeCurrentVoidedCandidate(savedRows[index], result.value); savedRows[index].candidatesLoaded = true; } });
    setBase(saved.version); setDiff(saved.diff); setRows(savedRows); setSavedMessage('当前 BOM 已保存');
  } catch (reason) { setError(reason instanceof Error ? reason.message : 'BOM 保存失败'); setNeedsRefresh(reason instanceof ApiError && reason.code === 'BOM_STALE'); } finally { setBusy(false); } };
  const query = async () => { historyRequest.current += 1; setBusy(true); setError(''); setHistoryDetail(null); try { setQueryResults(await api.queryBomVersions({ ...(queryModel ? { model: queryModel } : {}), ...(queryDate ? { businessChangeDate: queryDate } : {}), ...(queryBatch ? { effectiveBatchRelativePath: queryBatch } : {}), ...(queryProjectId ? { projectItemId: Number(queryProjectId) } : {}), ...(queryFullCode ? { fullCode: queryFullCode } : {}) })); } catch (reason) { setError(reason instanceof Error ? reason.message : 'BOM 查询失败'); } finally { setBusy(false); } };

  return <section className="page-surface page-enter bom-page"><header className="page-header"><div><p className="eyebrow">BILL OF MATERIALS</p><h1>BOM 管理</h1><p>按产品维护 BOM；附件、资料批次和二维码均作为版本快照保存。</p></div>{mode === 'add' && <span className="record-count">{base ? `当前 BOM · 业务日期 ${base.businessChangeDateLabel}` : '尚无当前 BOM'}</span>}</header><nav className="segmented-tabs" aria-label="BOM 管理方式"><button type="button" aria-selected={mode === 'add'} onClick={() => setMode('add')}>添加 BOM</button><button type="button" aria-selected={mode === 'query'} onClick={() => { setMode('query'); void query(); }}>查询 BOM</button></nav>
    {mode === 'add' && <><div className="form-grid bom-basics"><label><span>产品型号</span><select aria-label="BOM 产品型号" disabled={busy} value={productId} onChange={(e) => setProductId(e.target.value)}><option value="">请选择</option>{products.map((item) => <option key={item.id} value={item.id}>{item.brandName} · {item.model}</option>)}</select></label><label><span>业务变更日期</span><input aria-label="业务变更日期" type="date" disabled={busy} value={businessChangeDate} onChange={(e) => setBusinessChangeDate(e.target.value)} /></label></div>{loaded && <BomEditor base={base} rows={rows} projects={projects} batches={batches.filter((batch) => batch.productId === Number(productId))} qrCandidates={qrCandidates} busy={busy} complete={complete} needsRefresh={needsRefresh} savedMessage={savedMessage} diff={diff} onAdd={() => { setRows((current) => [...current, blankRow(nextRow.current++)]); invalidate(); }} onDelete={(clientId) => { setRows((current) => current.filter((item) => item.clientId !== clientId)); invalidate(); }} onProject={changeProject} onWhite={changeWhite} onDrawing={(row, value) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, drawingId: value } : item)); invalidate(); }} onChange={changeField} onUpload={upload} onQr={(row, id, checked) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, qrCodeIds: checked ? [...item.qrCodeIds, id] : item.qrCodeIds.filter((currentId) => currentId !== id) } : item)); invalidate(); }} onSave={save} onRefresh={() => setReloadNonce((value) => value + 1)} />}</>}
    {mode === 'query' && <BomQuery model={queryModel} businessChangeDate={queryDate} effectiveBatchRelativePath={queryBatch} projectItemId={queryProjectId} fullCode={queryFullCode} projects={projects} busy={busy} history={queryResults} detail={historyDetail} setModel={setQueryModel} setBusinessChangeDate={setQueryDate} setEffectiveBatchRelativePath={setQueryBatch} setProjectItemId={setQueryProjectId} setFullCode={setQueryFullCode} onSearch={query} onView={async (id) => { const detailRequest = ++historyRequest.current; try { const detail = await api.getBomVersion(id); if (historyRequest.current === detailRequest) setHistoryDetail(detail); } catch (reason) { if (historyRequest.current === detailRequest) setError(reason instanceof Error ? reason.message : 'BOM 历史加载失败'); } }} />}
    {error && <p className="error-banner" role="alert">{error}</p>}</section>;
}
