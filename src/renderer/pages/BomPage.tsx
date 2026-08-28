import { useEffect, useMemo, useRef, useState } from 'react';

import type { BomCandidateView, BomDiffView, BomItemView, BomVersionSummaryView, BomVersionView,
  DictionaryItemView, PlannerApi, ProductView } from '../data/client';
import { ApiError } from '../data/client';
import { BomEditor, type DraftCandidate, type DraftRow } from './bom/BomEditor';
import { BomQuery } from './bom/BomQuery';

const blankRow = (id: number): DraftRow => ({ clientId: `bom-row-${id}`, projectItemId: '', drawingId: '',
  quantity: '1', notes: '', usesWhiteMaterial: false, candidates: [], candidatesLoaded: false });

const fromItem = (item: BomItemView, clientId: string): DraftRow => ({
  clientId, projectItemId: String(item.projectItemId), drawingId: String(item.drawingId), quantity: String(item.quantity),
  notes: item.notes ?? '', usesWhiteMaterial: item.usesWhiteMaterial,
  candidates: [{ id: item.drawingId, fullCode: item.fullCode, displayName: item.displayName,
    colorId: item.colorId, colorName: item.colorName, projectItemId: item.projectItemId,
    projectItemName: item.projectItemName, status: item.status }], candidatesLoaded: true,
});

const withCurrentVoidedReference = (row: DraftRow, eligible: BomCandidateView[]): DraftCandidate[] => {
  const current = row.candidates.find((item) => item.id === Number(row.drawingId));
  return current?.status === 'voided' && !eligible.some((item) => item.id === current.id)
    ? [current, ...eligible] : eligible;
};

export function BomPage({ api }: { api: PlannerApi }) {
  const [mode, setMode] = useState<'add' | 'query'>('add');
  const [products, setProducts] = useState<ProductView[]>([]);
  const [colors, setColors] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]);
  const [productId, setProductId] = useState(''); const [colorId, setColorId] = useState('');
  const [base, setBase] = useState<BomVersionView | null>(null);
  const [historyDetail, setHistoryDetail] = useState<BomVersionView | null>(null);
  const [rows, setRows] = useState<DraftRow[]>([]); const [diff, setDiff] = useState<BomDiffView[]>([]);
  const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [savedMessage, setSavedMessage] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false); const [reloadNonce, setReloadNonce] = useState(0);
  const [queryModel, setQueryModel] = useState(''); const [queryProjectId, setQueryProjectId] = useState('');
  const [queryFullCode, setQueryFullCode] = useState(''); const [queryResults, setQueryResults] = useState<BomVersionSummaryView[]>([]);
  const nextRow = useRef(1); const loadRequest = useRef(0); const historyRequest = useRef(0);
  const candidateRequests = useRef<Record<string, number>>({});

  useEffect(() => { void Promise.all([api.listProducts({ status: 'active' }), api.listDictionaries('color', false),
    api.listDictionaries('project_item', false)]).then(([productItems, colorItems, projectItems]) => {
      setProducts(productItems); setColors(colorItems); setProjects(projectItems);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'BOM 基础资料加载失败')); }, [api]);

  useEffect(() => {
    const request = ++loadRequest.current; historyRequest.current += 1; setHistoryDetail(null);
    setDiff([]); setSavedMessage(''); setNeedsRefresh(false); setError('');
    if (!productId || !colorId) { setBase(null); setRows([]); setLoaded(false); return; }
    setBusy(true); setLoaded(false);
    void (async () => {
      const current = await api.getCurrentBom(Number(productId), Number(colorId));
      const draftRows = current?.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`)) ?? [];
      if (current) {
        const candidateLists = await Promise.all(current.items.map((item) => api.listBomCandidates({
          productId: Number(productId), bomColorId: Number(colorId), projectItemId: item.projectItemId,
          usesWhiteMaterial: item.usesWhiteMaterial,
        })));
        candidateLists.forEach((items, index) => {
          draftRows[index].candidates = withCurrentVoidedReference(draftRows[index], items);
          draftRows[index].candidatesLoaded = true;
        });
      }
      if (request !== loadRequest.current) return;
      setBase(current); setRows(draftRows); setLoaded(true);
    })().catch((reason) => { if (request === loadRequest.current) setError(reason instanceof Error ? reason.message : 'BOM 加载失败'); })
      .finally(() => { if (request === loadRequest.current) setBusy(false); });
  }, [api, productId, colorId, reloadNonce]);

  const invalidateResult = () => { setDiff([]); setSavedMessage(''); setNeedsRefresh(false); setError(''); };
  const loadCandidates = (clientId: string, projectItemId: string, usesWhiteMaterial: boolean) => {
    if (!productId || !colorId || !projectItemId) return;
    const request = (candidateRequests.current[clientId] ?? 0) + 1; candidateRequests.current[clientId] = request;
    void api.listBomCandidates({ productId: Number(productId), bomColorId: Number(colorId),
      projectItemId: Number(projectItemId), usesWhiteMaterial }).then((items) => {
      if (candidateRequests.current[clientId] !== request) return;
      setRows((current) => current.map((row) => row.clientId === clientId
        ? { ...row, candidates: items, candidatesLoaded: true } : row));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '候选图号加载失败'));
  };
  const changeProject = (row: DraftRow, value: string) => {
    setRows((current) => current.map((item) => item.clientId === row.clientId
      ? { ...item, projectItemId: value, drawingId: '', candidates: [], candidatesLoaded: false } : item));
    invalidateResult(); loadCandidates(row.clientId, value, row.usesWhiteMaterial);
  };
  const changeWhite = (row: DraftRow, value: boolean) => {
    setRows((current) => current.map((item) => item.clientId === row.clientId
      ? { ...item, usesWhiteMaterial: value, drawingId: '', candidates: [], candidatesLoaded: false } : item));
    invalidateResult(); loadCandidates(row.clientId, row.projectItemId, value);
  };
  const complete = useMemo(() => Boolean(productId && colorId && rows.length > 0 && rows.every((row) => {
    const selected = row.candidates.find((item) => item.id === Number(row.drawingId));
    return row.projectItemId && row.drawingId && selected?.status !== 'voided';
  })), [productId, colorId, rows]);

  const save = async () => {
    if (!complete) return; setBusy(true); setError(''); setNeedsRefresh(false);
    const input = { productId: Number(productId), colorId: Number(colorId), expectedCurrentVersionId: base?.id ?? null,
      items: rows.map((row) => ({ projectItemId: Number(row.projectItemId), drawingId: Number(row.drawingId),
        quantity: 1, ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
        usesWhiteMaterial: row.usesWhiteMaterial })) };
    try {
      const saved = await api.saveBomVersion(input); setBase(saved.version); setDiff(saved.diff);
      const savedRows = saved.version.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`));
      const candidateLists = await Promise.allSettled(saved.version.items.map((item) => api.listBomCandidates({
        productId: Number(productId), bomColorId: Number(colorId), projectItemId: item.projectItemId,
        usesWhiteMaterial: item.usesWhiteMaterial,
      })));
      candidateLists.forEach((result, index) => {
        if (result.status === 'fulfilled') { savedRows[index].candidates = result.value; savedRows[index].candidatesLoaded = true; }
      });
      setRows(savedRows);
      setSavedMessage('当前 BOM 已保存');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'BOM 保存失败');
      setNeedsRefresh(reason instanceof ApiError && reason.code === 'BOM_STALE');
    } finally { setBusy(false); }
  };
  const viewHistory = async (id: number) => {
    const request = ++historyRequest.current; setError('');
    try { const version = await api.getBomVersion(id); if (request === historyRequest.current) setHistoryDetail(version); }
    catch (reason) { if (request === historyRequest.current) setError(reason instanceof Error ? reason.message : 'BOM 历史加载失败'); }
  };
  const queryBoms = async () => {
    setBusy(true); setError(''); setHistoryDetail(null);
    try { setQueryResults(await api.queryBomVersions({ model: queryModel,
      ...(queryProjectId ? { projectItemId: Number(queryProjectId) } : {}), fullCode: queryFullCode })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'BOM 查询失败'); }
    finally { setBusy(false); }
  };

  return <section className="page-surface page-enter bom-page">
    <header className="page-header"><div><p className="eyebrow">BILL OF MATERIALS</p><h1>BOM 管理</h1><p>添加和查询分开操作；当前仍使用既有 BOM 数据结构。</p></div>
      {mode === 'add' && <span className="record-count">{base ? `当前 BOM · 保存于 ${new Date(base.createdAt).toLocaleDateString('zh-CN')}` : '尚无当前 BOM'}</span>}</header>
    <nav className="segmented-tabs" aria-label="BOM 管理方式"><button type="button" aria-selected={mode === 'add'} onClick={() => setMode('add')}>添加 BOM</button>
      <button type="button" aria-selected={mode === 'query'} onClick={() => { setMode('query'); void queryBoms(); }}>查询 BOM</button></nav>
    {mode === 'add' && <><div className="form-grid bom-basics">
      <label><span>产品型号</span><select aria-label="BOM 产品型号" disabled={busy} value={productId}
        onChange={(event) => setProductId(event.target.value)}><option value="">请选择</option>{products.map((item) => <option key={item.id} value={item.id}>{item.brandName} · {item.model}</option>)}</select></label>
      <label><span>BOM 颜色</span><select aria-label="BOM 颜色" disabled={busy} value={colorId}
        onChange={(event) => setColorId(event.target.value)}><option value="">请选择</option>{colors.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
    </div>{loaded && <BomEditor base={base} rows={rows} projects={projects} colors={colors} colorId={colorId} busy={busy}
      complete={complete} needsRefresh={needsRefresh} savedMessage={savedMessage} diff={diff}
      onAdd={() => { setRows((current) => [...current, blankRow(nextRow.current++)]); invalidateResult(); }}
      onDelete={(clientId) => { setRows((current) => current.filter((item) => item.clientId !== clientId)); invalidateResult(); }}
      onProject={changeProject} onWhite={changeWhite}
      onDrawing={(row, value) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, drawingId: value } : item)); invalidateResult(); }}
      onNotes={(row, value) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, notes: value } : item)); invalidateResult(); }}
      onSave={save} onRefresh={() => setReloadNonce((value) => value + 1)} />}</>}
    {mode === 'query' && <BomQuery model={queryModel} projectItemId={queryProjectId} fullCode={queryFullCode} projects={projects}
      busy={busy} history={queryResults} detail={historyDetail} setModel={setQueryModel} setProjectItemId={setQueryProjectId}
      setFullCode={setQueryFullCode} onSearch={queryBoms} onView={viewHistory} />}
    {error && <p className="error-banner">{error}</p>}
  </section>;
}
