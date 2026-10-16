import { PageHeader } from '../components/PageHeader';
import { useEffect, useState, type FormEvent } from 'react';

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

const standardQrColumns = [{ key: 'user_manual', label: '说明书' }, { key: 'warranty', label: '售后卡' }, { key: 'recipe', label: '菜谱' }];
const qrLabel = (item: ProductQrCodeView) => ({ user_manual: '说明书', warranty: '售后卡', recipe: '菜谱' }[item.key] ?? item.displayName);

export function ProductsPage({ api, onOpenQr }: { api: PlannerApi; onOpenQr?: (id: number) => void }) {
  return isProductsMockEnabled() ? new URLSearchParams(window.location.search).get('flow') === 'bom' ? <ProductBomRoundtripMock/> : <ProductsMockPage/> : <ProductsWorkspace api={api} onOpenQr={onOpenQr}/>;
}
function ProductsWorkspace({ api, onOpenQr }: { api: PlannerApi; onOpenQr?: (id: number) => void }) {
  const [queryState, setQueryState] = useState<QueryState>('idle');
  const [queryError, setQueryError] = useState('');
  const [queriedFilters, setQueriedFilters] = useState<Record<string, string | number>>({ status: 'all' });
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [items, setItems] = useState<ProductView[]>([]);
  const [detailId, setDetailId] = useState<number | null>(null);
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
    setQueryState('loading'); setQueryError(''); setQueriedFilters(filters);
    try { setItems(await api.listProducts(filters)); setQueryState('ready'); }
    catch (reason) { setQueryState('failed'); setQueryError(reason instanceof Error ? reason.message : '产品档案加载失败'); }
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
  const deleteProduct = (item: ProductView) => { setEditorOpen(false); setCleanupId(item.id); };
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

  const productFacts = (item:ProductView) => <><dl>{[['品类尺寸',item.productSizeName],['默认外观',item.defaultAppearanceName ?? '不指定'],['参考型号',item.referenceProductModel ?? '不指定']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><table className="product-detail-qr"><thead><tr><th>用途</th><th>业务状态</th><th>文件状态</th></tr></thead><tbody>{qrCodes.filter(code=>code.productId===item.id).map(code=>{const files=code.files??[];return <tr key={code.id}><td>{qrLabel(code)}</td><td><span className={`status-text ${code.status}`}>{code.status==='active'?'启用中':'已停用'}</span></td><td>{!files.length?'未关联文件':files.every(file=>file.isPresent)?'文件可用':files.some(file=>file.isPresent)?'部分文件缺失':'文件已缺失'}</td></tr>;})}</tbody></table></>;
  return <section className="page-surface page-enter products-integrated">
    <PageHeader title="产品档案" description="产品档案是图号、BOM 与 PDF 记录共用的产品身份来源。">
      <div className="header-actions"><button className="secondary-button" onClick={() => void openHistoricalCandidates()} type="button">从资料库识别历史产品</button><button className="primary-button" onClick={openCreate} type="button">新建产品</button></div>
    </PageHeader>
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void load({ search, status, ...(brandFilter ? { brandId: Number(brandFilter) } : {}), ...(categoryFilter ? { productCategory: categoryFilter } : {}) }); }}>
      <label><span>搜索产品</span><input aria-label="搜索产品" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label><span>品牌</span><select aria-label="筛选品牌" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}><option value="">全部</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>筛选产品类别</span><select aria-label="筛选产品类别" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">全部</option>{[...new Set(allProducts.map((item) => item.productCategory))].map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
      <label><span>状态</span><select aria-label="产品状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部</option><option value="active">启用中</option><option value="inactive">已停用</option></select></label>
      <button className="primary-button" type="submit">筛选</button>
    </form>
    {editorOpen && editingId === null && productEditor}
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
        { key: 'sku', label: 'SKU', render: (item) => <strong>{item.sku ?? '待补录'}</strong> },
        { key: 'model', label: '型号', render: (item) => item.model },
        { key: 'brand', label: '品牌', render: (item) => item.brandName },
        { key: 'category', label: '产品类别', render: (item) => item.productCategory },
        { key: 'status', label: '状态', render: (item) => <span className={`status-text ${item.status}`}>{item.status === 'active' ? '启用中' : '已停用'}</span> },
        ...[
          ...standardQrColumns,
          ...Array.from(new Map(qrCodes.filter(code => !standardQrColumns.some(column => column.key === code.key)).map(code => [code.key, { key: code.key, label: code.displayName }])).values()),
        ].map(column => ({ key: `qr-${column.key}`, label: column.label, render: (item: ProductView) => {
          const records = qrCodes.filter(code => code.productId === item.id && code.key === column.key);
          return records.length === 0 ? '—' : <div className="product-qr-direct" role="group" aria-label={`${column.label}二维码`}>{records.map(code => <button className="text-button" key={code.id} type="button" aria-label={`${column.label} · ${code.status === 'active' ? '已启用' : '已停用'}`} onClick={() => onOpenQr?.(code.id)} disabled={!onOpenQr}><span className={`status-text ${code.status}`}>{code.status === 'active' ? '已启用' : '已停用'}</span></button>)}</div>;
        } })),
        { key: 'actions', label: '操作', render: (item) => <div className="row-actions"><button className="text-button" type="button" aria-label={`详情 ${item.model}`} onClick={() => { setDetailId(detailId === item.id ? null : item.id); setCleanupId(null); setEditorOpen(false); }}>详情</button><button className="text-button" aria-label={`编辑 ${item.model}`} onClick={() => openEdit(item)} type="button">编辑</button>{item.status === 'active'
          ? <button className="text-button product-stop" aria-label={`停用 ${item.model}`} onClick={() => void deactivate(item)} type="button">停用</button>
          : <button className="text-button product-start" aria-label={`启用 ${item.model}`} onClick={() => void activate(item)} type="button">启用</button>}</div> },
      ]} renderExpandedRow={(item) => cleanupId === item.id
        ? <div className="product-integrated-detail">{productFacts(item)}<ProductCleanupPanel key={item.id} api={api} productId={item.id} confirmLabel="确认删除档案" onCancel={() => {setCleanupId(null);setDetailId(item.id);}} onComplete={() => cleanupComplete(item.id)} /></div>
        : editorOpen && editingId === item.id ? productEditor : detailId === item.id ? <div className="product-integrated-detail">{productFacts(item)}<div className="product-exit-entry"><button className="text-button danger" type="button" aria-label={`删除档案 ${item.model}`} onClick={() => void deleteProduct(item)}>删除档案</button><span>退出当前业务，保留历史身份与快照，不删除实际文件。</span></div></div> : null} />}
  </section>;
}
