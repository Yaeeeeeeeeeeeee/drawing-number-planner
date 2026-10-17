import { productQrPurposes, type ProductQrTarget } from './products/product-qr-navigation';
import { PageHeader } from '../components/PageHeader';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { DictionaryItemView, HistoricalProductCandidateView, PlannerApi, ProductQrCodeView, ProductView } from '../data/client';
import { ProductCleanupPanel } from '../components/ProductCleanupPanel';
import { DataTable } from '../components/DataTable';
import { QueryFeedback, type QueryState } from '../components/QueryFeedback';
import { EmptyState } from '../components/EmptyState';
import { isProductsMockEnabled } from './products/products-mock';
import { ProductsMockPage } from './products/ProductsMockPage';
import { ProductBomRoundtripMock } from './products/ProductBomRoundtripMock';

const blank = { sku: '', model: '', productCategory: '', brandId: '', productSizeId: '', defaultAppearanceId: '', referenceProductId: '' };
const blankHistorical = { brandId: '', productSizeId: '', defaultAppearanceId: '' };
const sameCandidate = (left: HistoricalProductCandidateView, right: HistoricalProductCandidateView) =>
  left.productCategory === right.productCategory && left.sku === right.sku && left.model === right.model;

export function ProductsPage({ api, onOpenQr, active = true }: { api: PlannerApi; onOpenQr?: (target: ProductQrTarget) => void; active?: boolean }) {
  return isProductsMockEnabled() ? new URLSearchParams(window.location.search).get('flow') === 'bom' ? <ProductBomRoundtripMock/> : <ProductsMockPage/> : <ProductsWorkspace api={api} onOpenQr={onOpenQr} active={active}/>;
}
function ProductsWorkspace({ api, onOpenQr, active = true }: { api: PlannerApi; onOpenQr?: (target: ProductQrTarget) => void; active?: boolean }) {
  const [queryState, setQueryState] = useState<QueryState>('idle');
  const [queryError, setQueryError] = useState('');
  const [queriedFilters, setQueriedFilters] = useState<Record<string, string | number>>({ status: 'all' });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [items, setItems] = useState<ProductView[]>([]);
  const root = useRef<HTMLElement>(null);
  const scroll = useRef({ table: 0, left: 0, workspace: 0 });
  const wasActive = useRef(active);
  const queryGeneration = useRef(0);
  const [cleanupId, setCleanupId] = useState<number | null>(null);
  const [allProducts, setAllProducts] = useState<ProductView[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [brands, setBrands] = useState<DictionaryItemView[]>([]);
  const [sizes, setSizes] = useState<DictionaryItemView[]>([]);
  const [appearances, setAppearances] = useState<DictionaryItemView[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [form, setForm] = useState(blank);
  const [historicalOpen, setHistoricalOpen] = useState(false);
  const [historicalLoading, setHistoricalLoading] = useState(false);
  const [historicalCandidates, setHistoricalCandidates] = useState<HistoricalProductCandidateView[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<HistoricalProductCandidateView | null>(null);
  const [historicalForm, setHistoricalForm] = useState(blankHistorical);
  const [historicalMessage, setHistoricalMessage] = useState('');
  const [qrCodes, setQrCodes] = useState<ProductQrCodeView[]>([]);

  const load = async (filters: Record<string, string | number> = { status: 'all' }) => {
    const generation = ++queryGeneration.current;
    setQueryState('loading'); setQueryError(''); setQueriedFilters(filters);
    try { const result = await api.listProducts(filters); if (generation === queryGeneration.current) { setItems(result); setQueryState('ready'); } }
    catch (reason) { if (generation === queryGeneration.current) { setQueryState('failed'); setQueryError(reason instanceof Error ? reason.message : '产品档案加载失败'); } }
  };
  const refreshProductQrCodes = async (productId: number) => {
    const listQrCodes = (api as Partial<PlannerApi>).listQrCodes;
    if (!listQrCodes) return;
    const result = await listQrCodes({ productId });
    setQrCodes((current) => [...current.filter((item) => item.productId !== productId), ...result.items]);
  };

  const loadInitial = () => {
    setQueryState('loading'); setQueryError('');
    void Promise.all([
      api.listProducts({ status: 'all' }),
      api.listDictionaries('brand', false),
      api.listDictionaries('product_size', false),
      api.listDictionaries('appearance', false),
      typeof (api as Partial<PlannerApi>).listQrCodes === 'function' ? api.listQrCodes() : Promise.resolve({ items: [] as ProductQrCodeView[] }),
    ]).then(([products, brandItems, sizeItems, appearanceItems, qrCodeResult]) => {
      setItems(products); setAllProducts(products); setBrands(brandItems); setSizes(sizeItems); setAppearances(appearanceItems);
      setQrCodes(qrCodeResult.items); setInitialLoaded(true); setQueryState('ready');
    }).catch((reason) => { setQueryState('failed'); setQueryError(reason instanceof Error ? reason.message : '产品档案加载失败'); });
  };
  useEffect(() => { loadInitial(); }, []);
  useEffect(() => {
    if (active && !wasActive.current) {
      void load(queriedFilters);
      if (typeof api.listQrCodes === 'function') void api.listQrCodes().then(result => setQrCodes(result.items)).catch(() => setError('资料状态刷新失败，请重新进入页面核对。'));
    }
    wasActive.current = active;
  }, [active]);
  useEffect(() => {
    if (!active || queryState !== 'ready') return;
    const frame = requestAnimationFrame(() => {
      const table = root.current?.querySelector('.table-wrap');
      if (table) { table.scrollTop = scroll.current.table; table.scrollLeft = scroll.current.left; }
      const workspace = root.current?.closest('.workspace');
      if (workspace) workspace.scrollTop = scroll.current.workspace;
    });
    return () => cancelAnimationFrame(frame);
  }, [active, queryState]);
  const openQr = (item: ProductView, purpose: typeof productQrPurposes[number]) => {
    const table = root.current?.querySelector('.table-wrap');
    scroll.current = { table: table?.scrollTop ?? 0, left: table?.scrollLeft ?? 0, workspace: root.current?.closest('.workspace')?.scrollTop ?? 0 };
    onOpenQr?.({ productId: item.id, sku: item.sku, model: item.model, productCategory: item.productCategory,
      purposeKey: purpose.key, purposeLabel: purpose.label, purposeEnglishName: purpose.englishName });
  };

  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const openCreate = () => { setEditingId(null); setForm(blank); setEditorOpen(true); };
  const openEdit = (item: ProductView) => {
    setCleanupId(null);
    setEditingId(item.id);
    setForm({ sku: item.sku ?? '', model: item.model, productCategory: item.productCategory, brandId: String(item.brandId),
      productSizeId: String(item.productSizeId), defaultAppearanceId: item.defaultAppearanceId ? String(item.defaultAppearanceId) : '',
      referenceProductId: item.referenceProductId ? String(item.referenceProductId) : '' });
    setEditorOpen(true);
  };
  const payload = () => ({ sku: form.sku, model: form.model, productCategory: form.productCategory, brandId: Number(form.brandId),
    productSizeId: Number(form.productSizeId), defaultAppearanceId: form.defaultAppearanceId ? Number(form.defaultAppearanceId) : null,
    referenceProductId: form.referenceProductId ? Number(form.referenceProductId) : null });
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try {
      const product = editingId ? await api.updateProduct(editingId, payload()) : await api.createProduct(payload());
      const replace = (current: ProductView[]) => editingId
        ? current.map((item) => item.id === editingId ? product : item)
        : [...current, product];
      setItems(replace); setAllProducts(replace); setEditorOpen(false);
      if (!editingId) {
        try { await refreshProductQrCodes(product.id); }
        catch { setError('产品已保存，但二维码摘要暂时未能更新。'); }
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : '产品保存失败'); }
  };
  const deactivate = async (item: ProductView) => {
    try {
      const updated = await api.deactivateProduct(item.id);
      const replace = (current: ProductView[]) => current.map((entry) => entry.id === item.id ? updated : entry);
      setItems(replace); setAllProducts(replace);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '产品停用失败'); }
  };
  const activate = async (item: ProductView) => {
    try {
      const updated = await api.activateProduct(item.id);
      const replace = (current: ProductView[]) => current.map((entry) => entry.id === item.id ? updated : entry);
      setItems(replace); setAllProducts(replace);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '产品启用失败'); }
  };

  const cleanupComplete = (id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
    setAllProducts((current) => current.filter((item) => item.id !== id));
    setQrCodes((current) => current.filter((code) => code.productId !== id)); setCleanupId(null);
  };
  const openHistoricalCandidates = async () => {
    setHistoricalOpen(true); setHistoricalLoading(true); setHistoricalMessage(''); setSelectedCandidate(null);
    try { setHistoricalCandidates(await api.listHistoricalProductCandidates()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '历史产品候选加载失败'); }
    finally { setHistoricalLoading(false); }
  };
  const chooseHistoricalCandidate = (candidate: HistoricalProductCandidateView) => {
    setSelectedCandidate(candidate); setHistoricalForm(blankHistorical); setHistoricalMessage('');
  };
  const confirmHistoricalCandidate = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCandidate) return;
    setError(''); setHistoricalMessage('');
    try {
      const result = await api.confirmHistoricalProductCandidate({
        productCategory: selectedCandidate.productCategory, sku: selectedCandidate.sku, model: selectedCandidate.model,
        brandId: Number(historicalForm.brandId), productSizeId: Number(historicalForm.productSizeId),
        defaultAppearanceId: Number(historicalForm.defaultAppearanceId),
      });
      setItems((current) => [...current, result.product]);
      setAllProducts((current) => [...current, result.product]);
      try { await refreshProductQrCodes(result.product.id); }
      catch { setError('产品已建立，但二维码摘要暂时未能更新。'); }
      setHistoricalCandidates((current) => current.filter((candidate) => !sameCandidate(candidate, selectedCandidate)));
      setHistoricalMessage(`已建立 ${result.product.model}，并关联 ${result.linkedHistoricalCount} 个历史图号。`);
      setSelectedCandidate(null); setHistoricalForm(blankHistorical);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '历史产品确认失败'); }
  };
  const productEditor = <form className="editor-strip panel-enter" onSubmit={save}><div className="form-grid">
    <label><span>SKU</span><input aria-label="SKU" value={form.sku} onChange={(event) => set('sku', event.target.value)} required /></label>
    <label><span>型号</span><input aria-label="型号" value={form.model} onChange={(event) => set('model', event.target.value)} required /></label>
    <label><span>产品类别</span><input aria-label="产品类别" value={form.productCategory} onChange={(event) => set('productCategory', event.target.value)} required /></label>
    <label><span>品牌</span><select aria-label="品牌" value={form.brandId} onChange={(event) => set('brandId', event.target.value)} required><option value="">请选择</option>{brands.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label><span>品类尺寸</span><select aria-label="品类尺寸" value={form.productSizeId} onChange={(event) => set('productSizeId', event.target.value)} required><option value="">请选择</option>{sizes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label><span>默认外观</span><select aria-label="默认外观" value={form.defaultAppearanceId} onChange={(event) => set('defaultAppearanceId', event.target.value)}><option value="">不指定</option>{appearances.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
    <label><span>参考来源型号</span><select aria-label="参考来源型号" value={form.referenceProductId} onChange={(event) => set('referenceProductId', event.target.value)}><option value="">不指定</option>{allProducts.filter((item) => item.id !== editingId && item.status === 'active').map((item) => <option value={item.id} key={item.id}>{item.brandName} · {item.model}</option>)}</select></label>
  </div><div className="form-actions"><button className="text-button" onClick={() => setEditorOpen(false)} type="button">取消</button><button className="primary-button" type="submit">{editingId ? '保存修改' : '保存产品'}</button></div></form>;

  const editingProduct = items.find(item => item.id === editingId) ?? allProducts.find(item => item.id === editingId);
  if (editorOpen) return <section className="page-surface products-integrated products-compact product-editor-page">
    <PageHeader title={editingProduct ? `编辑产品 · ${editingProduct.model}` : '新建产品'} description="维护产品基础信息与业务状态，历史身份和关联资料保持原有规则。">
      <button className="secondary-button" type="button" onClick={() => { setEditorOpen(false); setCleanupId(null); }}>返回产品档案</button>
    </PageHeader>
    {error && <p className="error-banner">{error}</p>}
    {productEditor}
    {editingProduct && <section className="product-maintenance" aria-label="产品状态与删除管理"><h2>产品管理</h2>
      <p>当前状态：{editingProduct.status === 'active' ? '启用中' : '已停用'}；退出当前业务仍保留历史身份和快照，不删除实际文件。</p>
      <div className="row-actions"><button className="secondary-button" type="button" aria-label={`${editingProduct.status === 'active' ? '停用' : '启用'} ${editingProduct.model}`} onClick={() => void (editingProduct.status === 'active' ? deactivate(editingProduct) : activate(editingProduct))}>{editingProduct.status === 'active' ? '停用产品' : '重新启用产品'}</button>
      <button className="text-button danger" type="button" aria-label={`删除档案 ${editingProduct.model}`} onClick={() => setCleanupId(editingProduct.id)}>删除档案</button></div>
      {cleanupId === editingProduct.id && <ProductCleanupPanel key={editingProduct.id} api={api} productId={editingProduct.id} confirmLabel="确认删除档案" onCancel={() => setCleanupId(null)} onComplete={() => { cleanupComplete(editingProduct.id); setEditorOpen(false); }}/>}</section>}
  </section>;
  return <section ref={root} className="page-surface page-enter products-integrated products-compact">
    <PageHeader title="产品档案" description="产品档案是图号、BOM 与 PDF 记录共用的产品身份来源。">
      <div className="header-actions"><button className="secondary-button" onClick={() => void openHistoricalCandidates()} type="button">识别历史产品</button><button className="primary-button" onClick={openCreate} type="button">新建产品</button></div>
    </PageHeader>
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); scroll.current = { table: 0, left: 0, workspace: 0 }; void load({ search, status, ...(brandFilter ? { brandId: Number(brandFilter) } : {}), ...(categoryFilter ? { productCategory: categoryFilter } : {}) }); }}>
      <label><span>SKU / 型号</span><input aria-label="搜索产品" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label><span>品牌</span><select aria-label="筛选品牌" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}><option value="">全部</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>产品类别</span><select aria-label="筛选产品类别" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">全部</option>{[...new Set(allProducts.map((item) => item.productCategory))].map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <label><span>状态</span><select aria-label="产品状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部</option><option value="active">启用中</option><option value="inactive">已停用</option></select></label>
      <button className="primary-button" type="submit">筛选</button>
    </form>
    {historicalOpen && <section className="historical-product-panel panel-enter" aria-label="历史产品候选">
      <div className="historical-product-heading"><div><p className="eyebrow">LIBRARY CANDIDATES</p><h2>从资料库识别历史产品</h2><p>这里只列出目录信息完整的候选。系统不会自动建档，确认前请核对 SKU、型号和产品类别。</p></div><button className="text-button" onClick={() => { setHistoricalOpen(false); setSelectedCandidate(null); }} type="button">关闭</button></div>
      {historicalLoading ? <p className="muted-text">正在读取候选…</p> : historicalCandidates.length === 0
        ? <p className="muted-text">没有可确认的历史产品候选。</p>
        : <div className="historical-candidate-list">{historicalCandidates.map((candidate) => <article key={`${candidate.productCategory}\u0000${candidate.sku}\u0000${candidate.model}`} className="historical-candidate-card">
          <div><strong>{candidate.sku}</strong><span>{candidate.model} · {candidate.productCategory}</span><small>{candidate.historicalDrawingCount} 个历史图号</small></div>
          {candidate.ambiguous ? <p className="candidate-warning">目录信息有歧义，请先人工整理或补充确认</p>
            : <button className="secondary-button" type="button" onClick={() => chooseHistoricalCandidate(candidate)}>确认建立 {candidate.model}</button>}
          {selectedCandidate && sameCandidate(candidate, selectedCandidate) && <form className="historical-confirm-form panel-enter" onSubmit={confirmHistoricalCandidate}>
            <div><p className="eyebrow">MANUAL CONFIRMATION</p><h3>{selectedCandidate.sku} · {selectedCandidate.model}</h3><p>确认后将建立正式产品档案，并仅关联这个目录组合对应的历史图号。</p></div>
            <label><span>品牌</span><select aria-label="历史产品品牌" value={historicalForm.brandId} onChange={(event) => setHistoricalForm((current) => ({ ...current, brandId: event.target.value }))} required><option value="">请选择</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>品类尺寸</span><select aria-label="历史产品品类尺寸" value={historicalForm.productSizeId} onChange={(event) => setHistoricalForm((current) => ({ ...current, productSizeId: event.target.value }))} required><option value="">请选择</option>{sizes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <label><span>默认外观</span><select aria-label="历史产品默认外观" value={historicalForm.defaultAppearanceId} onChange={(event) => setHistoricalForm((current) => ({ ...current, defaultAppearanceId: event.target.value }))} required><option value="">请选择</option>{appearances.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
            <div className="form-actions"><button className="text-button" type="button" onClick={() => setSelectedCandidate(null)}>取消</button><button className="primary-button" type="submit" disabled={!historicalForm.brandId || !historicalForm.productSizeId || !historicalForm.defaultAppearanceId}>确认建立产品档案</button></div>
          </form>}
        </article>)}</div>}
      {historicalMessage && <p className="success-banner">{historicalMessage}</p>}
    </section>}
    {error && <p className="error-banner">{error}</p>}
    {queryState !== 'ready' ? <QueryFeedback state={queryState} error={queryError} onRetry={() => initialLoaded ? void load(queriedFilters) : loadInitial()}/> : items.length === 0 ? <EmptyState title={Object.entries(queriedFilters).some(([key,value]) => key === 'status' ? value !== 'all' : Boolean(value)) ? '没有符合筛选条件的产品' : '还没有产品档案'} description="先完成编码字典，再创建首个产品型号。" symbol="品" /> :
      <DataTable fillViewport items={items} columns={[
        { key: 'identity', label: 'SKU / 型号', render: item => <strong>{item.sku ?? '待补录'} · {item.model}</strong> },
        { key: 'brand', label: '品牌 / 类别', render: item => <>{item.brandName} · {item.productCategory}</> },
        { key: 'spec', label: '产品规格', render: item => <>{item.productSizeName} · {item.defaultAppearanceName ?? '不指定外观'}</> },
        { key: 'status', label: '状态', render: item => <span className={`status-text ${item.status}`}>{item.status === 'active' ? '启用中' : '已停用'}</span> },
        ...productQrPurposes.map(purpose => ({ key: purpose.key, label: purpose.label, render: (item: ProductView) => {
          const records = qrCodes.filter(code => code.productId === item.id && code.key === purpose.key);
          const state = !records.length ? 'unconfigured' : records.some(code => code.status === 'active') ? 'active' : 'inactive';
          const label = state === 'unconfigured' ? '未配置' : state === 'active' ? '已启用' : '已停用';
          return <button className={`text-button product-purpose-link product-purpose-${state}`} type="button" aria-label={`${purpose.label} · ${label}`} title={records.length > 1 ? `${records.length} 条记录，点击查看全部；${records.filter(code => code.status === 'active').length} 条已启用` : `管理 ${item.model} 的${purpose.label}`} onClick={() => openQr(item, purpose)} disabled={!onOpenQr}>{label}{records.length > 1 && <small> · {records.length} 条</small>}</button>;
        }})),
        { key: 'actions', label: '操作', render: item => <button className="text-button" aria-label={`编辑 ${item.model}`} onClick={() => openEdit(item)} type="button">编辑</button> },
      ]} />}
  </section>;
}
