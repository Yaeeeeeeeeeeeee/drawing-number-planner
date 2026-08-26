import { useEffect, useMemo, useRef, useState } from 'react';

import type { BomCandidateView, BomDiffView, BomItemView, BomVersionSummaryView, BomVersionView,
  DictionaryItemView, PlannerApi, ProductView } from '../data/client';
import { ApiError } from '../data/client';

interface DraftRow {
  clientId: string; projectItemId: string; drawingId: string; quantity: string; notes: string;
  usesWhiteMaterial: boolean; candidates: BomCandidateView[];
}

const blankRow = (id: number): DraftRow => ({ clientId: `bom-row-${id}`, projectItemId: '', drawingId: '',
  quantity: '1', notes: '', usesWhiteMaterial: false, candidates: [] });

const fromItem = (item: BomItemView, clientId: string): DraftRow => ({
  clientId, projectItemId: String(item.projectItemId), drawingId: String(item.drawingId), quantity: String(item.quantity),
  notes: item.notes ?? '', usesWhiteMaterial: item.usesWhiteMaterial,
  candidates: [{ id: item.drawingId, fullCode: item.fullCode, displayName: item.displayName,
    colorId: item.colorId, colorName: item.colorName, projectItemId: item.projectItemId,
    projectItemName: item.projectItemName, status: item.status }],
});

const describeDiff = (item: BomDiffView): string => {
  if (item.type === 'added') return `${item.projectItemName}：新增 ${item.fullCode}`;
  if (item.type === 'removed') return `${item.projectItemName}：移除 ${item.previousFullCode}`;
  if (item.type === 'replaced') return `${item.projectItemName}：${item.previousFullCode} → ${item.fullCode}`;
  return `${item.projectItemName}：未变化`;
};

export function BomPage({ api }: { api: PlannerApi }) {
  const [products, setProducts] = useState<ProductView[]>([]);
  const [colors, setColors] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]);
  const [productId, setProductId] = useState(''); const [colorId, setColorId] = useState('');
  const [base, setBase] = useState<BomVersionView | null>(null);
  const [historyDetail, setHistoryDetail] = useState<BomVersionView | null>(null);
  const [history, setHistory] = useState<BomVersionSummaryView[]>([]);
  const [rows, setRows] = useState<DraftRow[]>([]); const [diff, setDiff] = useState<BomDiffView[]>([]);
  const [loaded, setLoaded] = useState(false); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [savedMessage, setSavedMessage] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false); const [reloadNonce, setReloadNonce] = useState(0);
  const nextRow = useRef(1); const loadRequest = useRef(0); const historyRequest = useRef(0);
  const candidateRequests = useRef<Record<string, number>>({});

  useEffect(() => { void Promise.all([api.listProducts({ status: 'active' }), api.listDictionaries('color', false),
    api.listDictionaries('project_item', false)]).then(([productItems, colorItems, projectItems]) => {
      setProducts(productItems); setColors(colorItems); setProjects(projectItems);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'BOM 基础资料加载失败')); }, [api]);

  useEffect(() => {
    const request = ++loadRequest.current; historyRequest.current += 1; setHistoryDetail(null);
    setDiff([]); setSavedMessage(''); setNeedsRefresh(false); setError('');
    if (!productId || !colorId) { setBase(null); setHistory([]); setRows([]); setLoaded(false); return; }
    setBusy(true); setLoaded(false);
    void (async () => {
      const [current, versions] = await Promise.all([api.getCurrentBom(Number(productId), Number(colorId)),
        api.listBomVersions(Number(productId), Number(colorId))]);
      const draftRows = current?.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`)) ?? [];
      if (current) {
        const candidateLists = await Promise.all(current.items.map((item) => api.listBomCandidates({
          productId: Number(productId), bomColorId: Number(colorId), projectItemId: item.projectItemId,
          usesWhiteMaterial: item.usesWhiteMaterial,
        })));
        candidateLists.forEach((items, index) => { draftRows[index].candidates = items; });
      }
      if (request !== loadRequest.current) return;
      setBase(current); setHistory(versions); setRows(draftRows); setLoaded(true);
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
      setRows((current) => current.map((row) => row.clientId === clientId ? { ...row, candidates: items } : row));
    }).catch((reason) => setError(reason instanceof Error ? reason.message : '候选图号加载失败'));
  };
  const changeProject = (row: DraftRow, value: string) => {
    setRows((current) => current.map((item) => item.clientId === row.clientId
      ? { ...item, projectItemId: value, drawingId: '', candidates: [] } : item));
    invalidateResult(); loadCandidates(row.clientId, value, row.usesWhiteMaterial);
  };
  const changeWhite = (row: DraftRow, value: boolean) => {
    setRows((current) => current.map((item) => item.clientId === row.clientId
      ? { ...item, usesWhiteMaterial: value, drawingId: '', candidates: [] } : item));
    invalidateResult(); loadCandidates(row.clientId, row.projectItemId, value);
  };
  const complete = useMemo(() => Boolean(productId && colorId && rows.every((row) => row.projectItemId && row.drawingId
    && Number.isInteger(Number(row.quantity)) && Number(row.quantity) > 0)), [productId, colorId, rows]);

  const save = async () => {
    if (!complete) return; setBusy(true); setError(''); setNeedsRefresh(false);
    const input = { productId: Number(productId), colorId: Number(colorId), expectedCurrentVersionId: base?.id ?? null,
      items: rows.map((row) => ({ projectItemId: Number(row.projectItemId), drawingId: Number(row.drawingId),
        quantity: Number(row.quantity), ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
        usesWhiteMaterial: row.usesWhiteMaterial })) };
    try {
      const saved = await api.saveBomVersion(input); setBase(saved.version); setDiff(saved.diff);
      const savedRows = saved.version.items.map((item) => fromItem(item, `bom-row-${nextRow.current++}`));
      const candidateLists = await Promise.allSettled(saved.version.items.map((item) => api.listBomCandidates({
        productId: Number(productId), bomColorId: Number(colorId), projectItemId: item.projectItemId,
        usesWhiteMaterial: item.usesWhiteMaterial,
      })));
      candidateLists.forEach((result, index) => {
        if (result.status === 'fulfilled') savedRows[index].candidates = result.value;
      });
      setRows(savedRows);
      setHistory((current) => [saved.version, ...current.filter((item) => item.id !== saved.version.id)]);
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

  return <section className="page-surface page-enter bom-page">
    <header className="page-header"><div><p className="eyebrow">BILL OF MATERIALS</p><h1>BOM 管理</h1><p>维护某型号和颜色当前实际使用的图号；其他颜色可明确引用同型号白色图号。</p></div>
      <span className="record-count">{base ? `当前 BOM · ${new Date(base.createdAt).toLocaleDateString('zh-CN')}` : '尚无当前 BOM'}</span></header>
    <div className="form-grid bom-basics">
      <label><span>产品型号</span><select aria-label="BOM 产品型号" disabled={busy} value={productId}
        onChange={(event) => setProductId(event.target.value)}><option value="">请选择</option>
        {products.map((item) => <option key={item.id} value={item.id}>{item.brandName} · {item.model}</option>)}</select></label>
      <label><span>BOM 颜色</span><select aria-label="BOM 颜色" disabled={busy} value={colorId}
        onChange={(event) => setColorId(event.target.value)}><option value="">请选择</option>
        {colors.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
    </div>
    {loaded && <>
      <div className="batch-toolbar"><div><h2>当前 BOM</h2><small>保存后自动记录本次变更</small></div>
        <button className="secondary-button" type="button" disabled={busy} onClick={() => { setRows((current) => [...current, blankRow(nextRow.current++)]); invalidateResult(); }}>添加 BOM 项目</button></div>
      {!base && rows.length === 0 && <div className="bom-empty"><strong>尚未建立 BOM</strong><span>添加项目后保存为当前 BOM。</span></div>}
      <div className="planning-rows">{rows.map((row, index) => <article className="planning-row bom-row" key={row.clientId}>
        <div className="planning-row-title"><strong>项目 {index + 1}</strong><button className="link-button" type="button"
          disabled={busy} aria-label={`删除 BOM 项目 ${index + 1}`} onClick={() => { setRows((current) => current.filter((item) => item.clientId !== row.clientId)); invalidateResult(); }}>删除</button></div>
        <div className="form-grid bom-row-fields">
          <label><span>项目</span><select aria-label={`第 ${index + 1} 行项目`} disabled={busy} value={row.projectItemId}
            onChange={(event) => changeProject(row, event.target.value)}><option value="">请选择</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          <label className="bom-white-toggle"><span>颜色共用</span><span><input type="checkbox" aria-label={`第 ${index + 1} 行引用白色图号`}
            disabled={busy || colors.find((item) => item.id === Number(colorId))?.code === '0'} checked={row.usesWhiteMaterial}
            onChange={(event) => changeWhite(row, event.target.checked)} /> 引用白色图号</span></label>
          <label className="bom-drawing-field"><span>正式图号</span><select aria-label={`第 ${index + 1} 行图号`} disabled={busy || !row.projectItemId}
            value={row.drawingId} onChange={(event) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, drawingId: event.target.value } : item)); invalidateResult(); }}>
            <option value="">请选择</option>{row.candidates.map((item) => <option key={item.id} value={item.id}>{item.fullCode} · {item.displayName}</option>)}</select></label>
          <label><span>数量</span><input aria-label={`第 ${index + 1} 行数量`} type="number" min="1" step="1" disabled={busy}
            value={row.quantity} onChange={(event) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, quantity: event.target.value } : item)); invalidateResult(); }} /></label>
          <label><span>备注</span><input aria-label={`第 ${index + 1} 行备注`} disabled={busy} value={row.notes}
            onChange={(event) => { setRows((current) => current.map((item) => item.clientId === row.clientId ? { ...item, notes: event.target.value } : item)); invalidateResult(); }} /></label>
        </div>
      </article>)}</div>
      <div className="bom-actions"><button className="primary-button" type="button" disabled={busy || !complete} onClick={() => void save()}>{busy ? '保存中…' : '保存当前 BOM'}</button>
        {needsRefresh && <button className="secondary-button" type="button" disabled={busy} onClick={() => setReloadNonce((value) => value + 1)}>刷新当前 BOM</button>}</div>
      {error && <p className="error-banner">{error}</p>}{savedMessage && <p className="success-banner"><strong>{savedMessage}</strong></p>}
      {diff.length > 0 && <section className="bom-diff"><p className="eyebrow">LATEST CHANGE</p><h2>本次变更</h2>
        <div className="bom-diff-list">{diff.filter((item) => item.type !== 'unchanged').map((item) => <span className={`bom-diff-${item.type}`} key={item.projectItemId}>{describeDiff(item)}</span>)}</div></section>}
      <section className="bom-history"><div className="batch-toolbar"><div><p className="eyebrow">CHANGE HISTORY</p><h2>最近变更</h2></div><span>{history.length} 条记录</span></div>
        {history.length === 0 ? <p className="muted-text">保存后将在这里保留简单的变更记录。</p> : <table><thead><tr><th>变更日期</th><th>型号</th><th>颜色</th><th>查看</th></tr></thead>
          <tbody>{history.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{item.model}</td><td>{item.colorName}</td>
            <td><button className="text-button" type="button" aria-label="查看变更" onClick={() => void viewHistory(item.id)}>查看变更</button></td></tr>)}</tbody></table>}
        {historyDetail && <div className="bom-history-detail"><div className="batch-toolbar"><h3>{new Date(historyDetail.createdAt).toLocaleString('zh-CN')} 使用明细</h3><span>{historyDetail.items.length} 个项目</span></div>
          <table><thead><tr><th>项目</th><th>图号</th><th>颜色</th><th>数量</th><th>共用</th></tr></thead><tbody>
            {historyDetail.items.map((item) => <tr key={item.bomItemId}><td>{item.projectItemName}</td><td className="code-cell">{item.fullCode}</td><td>{item.colorName}</td><td>{item.quantity}</td><td>{item.usesWhiteMaterial ? '引用白色' : '本色'}</td></tr>)}
          </tbody></table></div>}
      </section>
    </>}
  </section>;
}
