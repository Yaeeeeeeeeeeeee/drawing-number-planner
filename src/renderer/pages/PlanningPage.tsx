import { useEffect, useMemo, useRef, useState } from 'react';

import type { DictionaryItemView, PlannerApi, PlanningPreviewView, PlanningRowInputView, ProductView, ReservedDrawingView } from '../data/client';
import { isPlanningMock, PlanningMockPage } from './planning-mock';

interface DraftRow { clientId: string; colorId: string; mainCategoryId: string; projectItemId: string; notes: string }
interface ApprovedInput { productId: number; appearanceId: number; rows: PlanningRowInputView[] }
const blankRow = (id: number): DraftRow => ({ clientId: `row-${id}`, colorId: '', mainCategoryId: '', projectItemId: '', notes: '' });

export function PlanningPage({ api }: { api: PlannerApi }) {
  return isPlanningMock() ? <PlanningMockPage/> : <PlanningWorkspace api={api}/>;
}
function PlanningWorkspace({ api }: { api: PlannerApi }) {
  const [products, setProducts] = useState<ProductView[]>([]);
  const [appearances, setAppearances] = useState<DictionaryItemView[]>([]);
  const [colors, setColors] = useState<DictionaryItemView[]>([]);
  const [mains, setMains] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]);
  const [productId, setProductId] = useState('');
  const [appearanceId, setAppearanceId] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([blankRow(1)]);
  const [preview, setPreview] = useState<PlanningPreviewView | null>(null);
  const [approvedInput, setApprovedInput] = useState<ApprovedInput | null>(null);
  const [reserved, setReserved] = useState<ReservedDrawingView[]>([]);
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const nextRow = useRef(2);
  const draftVersion = useRef(0);

  useEffect(() => { void Promise.all([
    api.listProducts({ status: 'active' }), api.listDictionaries('appearance', false),
    api.listDictionaries('color', false), api.listDictionaries('main_category', false),
    api.listDictionaries('project_item', false),
  ]).then(([productItems, appearanceItems, colorItems, mainItems, projectItems]) => {
    setProducts(productItems); setAppearances(appearanceItems); setColors(colorItems);
    setMains(mainItems); setProjects(projectItems);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : '基础资料加载失败')); }, [api]);

  const invalidate = () => {
    draftVersion.current += 1;
    setPreview(null); setApprovedInput(null); setReserved([]); setNeedsRefresh(false); setError('');
  };
  const selectProduct = (value: string) => {
    setProductId(value); const product = products.find((item) => item.id === Number(value));
    setAppearanceId(product?.defaultAppearanceId ? String(product.defaultAppearanceId) : ''); invalidate();
  };
  const updateRow = (clientId: string, field: keyof Omit<DraftRow, 'clientId'>, value: string) => {
    setRows((current) => current.map((row) => row.clientId === clientId
      ? { ...row, [field]: value, ...(field === 'mainCategoryId' ? { projectItemId: '' } : {}) } : row));
    invalidate();
  };
  const complete = useMemo(() => Boolean(productId && appearanceId && rows.length
    && rows.every((row) => row.colorId && row.mainCategoryId && row.projectItemId)), [productId, appearanceId, rows]);
  const planningRows = () => rows.map((row) => ({
    clientId: row.clientId, colorId: Number(row.colorId), mainCategoryId: Number(row.mainCategoryId),
    projectItemId: Number(row.projectItemId), ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
  }));
  const check = async () => {
    if (!complete) return; setBusy(true); setError(''); setNeedsRefresh(false); setReserved([]);
    const version = draftVersion.current;
    const input: ApprovedInput = { productId: Number(productId), appearanceId: Number(appearanceId), rows: planningRows() };
    try {
      const result = await api.previewPlan(input);
      if (version === draftVersion.current) { setPreview(result); setApprovedInput(input); }
    }
    catch (reason) {
      if (version === draftVersion.current) setError(reason instanceof Error ? reason.message : '图号查重失败');
    }
    finally { setBusy(false); }
  };
  const reserve = async () => {
    if (!preview || !approvedInput) return;
    const currentInput: ApprovedInput = {
      productId: Number(productId), appearanceId: Number(appearanceId), rows: planningRows(),
    };
    if (JSON.stringify(currentInput) !== JSON.stringify(approvedInput)) {
      setPreview(null); setApprovedInput(null); setNeedsRefresh(true); setError('规划条件已变化，请重新查重');
      return;
    }
    const expectedByClientId = new Map(preview.rows.map((row) => [row.clientId, row.fullCode]));
    if (approvedInput.rows.some((row) => !expectedByClientId.has(row.clientId))) {
      setPreview(null); setApprovedInput(null); setNeedsRefresh(true); setError('占号预览与当前项目不一致，请重新查重');
      return;
    }
    const reservationRows = approvedInput.rows.map((row) => {
      const expectedFullCode = expectedByClientId.get(row.clientId)!;
      return { ...row, expectedFullCode };
    });
    setBusy(true); setError('');
    try {
      const items = await api.reservePlan({ ...approvedInput, rows: reservationRows });
      setReserved(items); setPreview(null); setApprovedInput(null); setRows([blankRow(nextRow.current++)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量占号失败'); setPreview(null); setApprovedInput(null); setNeedsRefresh(true);
    } finally { setBusy(false); }
  };

  return <section className="page-surface page-enter planning-page planning-real-page">
    <header className="page-header"><div><h1>图号规划</h1><p>先统一查重预览，再一次性永久占用整批图号。</p></div><span className="record-count">{rows.length} 个项目</span></header>
    <div className="planning-basics form-grid">
      <label><span>产品型号</span><select aria-label="产品型号" disabled={busy} value={productId} onChange={(event) => selectProduct(event.target.value)}><option value="">请选择</option>{products.map((item) => <option value={item.id} key={item.id}>{item.brandName} · {item.model}</option>)}</select></label>
      <label><span>外观</span><select aria-label="外观" disabled={busy} value={appearanceId} onChange={(event) => { setAppearanceId(event.target.value); invalidate(); }}><option value="">请选择</option>{appearances.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
    </div>
    {products.find(item => item.id === Number(productId)) && <div className="planning-selection-summary">{products.filter(item => item.id === Number(productId)).map(item => <span key={item.id}>SKU：{item.sku ?? '待补录'} · 品牌：{item.brandName} · 品类尺寸：{item.productSizeName}</span>)}</div>}
    <div className="batch-toolbar"><h2>批量项目</h2><button className="secondary-button" type="button" disabled={busy} onClick={() => { setRows((current) => [...current, blankRow(nextRow.current++)]); invalidate(); }}>添加项目</button></div>
    <div className="planning-rows">{rows.map((row, index) => <article className="planning-row" key={row.clientId}>
      <div className="planning-row-title"><strong>项目 {index + 1}</strong>{rows.length > 1 && <button className="link-button" aria-label={`删除项目 ${index + 1}`} type="button" disabled={busy} onClick={() => { setRows((current) => current.filter((item) => item.clientId !== row.clientId)); invalidate(); }}>删除</button>}</div>
      <div className="form-grid planning-row-fields">
        <label><span>主类别</span><select aria-label={`第 ${index + 1} 行主类别`} disabled={busy} value={row.mainCategoryId} onChange={(event) => updateRow(row.clientId, 'mainCategoryId', event.target.value)}><option value="">请选择</option>{mains.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>项目明细</span><select aria-label={`第 ${index + 1} 行项目明细`} disabled={busy || !row.mainCategoryId} value={row.projectItemId} onChange={(event) => updateRow(row.clientId, 'projectItemId', event.target.value)}><option value="">请选择</option>{projects.filter((item) => item.parentId === Number(row.mainCategoryId)).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>颜色</span><select aria-label={`第 ${index + 1} 行颜色`} disabled={busy} value={row.colorId} onChange={(event) => updateRow(row.clientId, 'colorId', event.target.value)}><option value="">请选择</option>{colors.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>备注</span><input aria-label={`第 ${index + 1} 行备注`} disabled={busy} value={row.notes} onChange={(event) => updateRow(row.clientId, 'notes', event.target.value)} /></label>
      </div>
      {projects.find(item => item.id === Number(row.projectItemId)) && <p className="planning-full-name">所选项目明细：{projects.find(item => item.id === Number(row.projectItemId))?.code} · {projects.find(item => item.id === Number(row.projectItemId))?.name}</p>}
    </article>)}</div>
    <button className="primary-button planning-check" type="button" disabled={!complete || busy} onClick={() => void check()}>{busy ? '处理中…' : needsRefresh ? '重新查重' : '查重并预览'}</button>
    {error && <p className="error-banner">{error}</p>}
    {preview && <section className="planning-preview"><div className="batch-toolbar"><div><h2>预览图号 · 尚未正式保存</h2><p>核对完整图号及资料名称，确认后按原规则永久占号。</p></div><button className="primary-button" type="button" disabled={busy} onClick={() => void reserve()}>确认批量占号</button></div>
      <table><thead><tr><th>完整预览图号</th><th>对应资料名称</th><th>推荐流水号</th><th>查重</th></tr></thead><tbody>{preview.rows.map((item) => <tr key={item.clientId}><td className="code-cell">{item.fullCode}</td><td>{item.displayName}</td><td>{String(item.sequence).padStart(3, '0')}</td><td><span className="status-text active">可占用</span></td></tr>)}</tbody></table>
    </section>}
    {reserved.length > 0 && <section className="success-banner"><strong>已成功占用 {reserved.length} 个图号 · 正式保存</strong><ul>{reserved.map(item => <li key={item.fullCode}><strong>{item.fullCode}</strong></li>)}</ul></section>}
  </section>;
}
