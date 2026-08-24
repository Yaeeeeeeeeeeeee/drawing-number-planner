import { useEffect, useState, type FormEvent } from 'react';

import type { DictionaryItemView, PlannerApi, ProductView } from '../data/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

const blank = { model: '', productCategory: '', brandId: '', productSizeId: '', defaultAppearanceId: '', referenceProductId: '' };

export function ProductsPage({ api }: { api: PlannerApi }) {
  const [items, setItems] = useState<ProductView[]>([]); const [editingId, setEditingId] = useState<number | null>(null); const [editorOpen, setEditorOpen] = useState(false);
  const [allProducts, setAllProducts] = useState<ProductView[]>([]);
  const [brands, setBrands] = useState<DictionaryItemView[]>([]); const [sizes, setSizes] = useState<DictionaryItemView[]>([]); const [appearances, setAppearances] = useState<DictionaryItemView[]>([]);
  const [error, setError] = useState(''); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all'); const [brandFilter, setBrandFilter] = useState(''); const [form, setForm] = useState(blank);
  const load = async (filters: Record<string, string | number> = { status: 'all' }) => { try { setItems(await api.listProducts(filters)); } catch (reason) { setError(reason instanceof Error ? reason.message : '产品档案加载失败'); } };
  useEffect(() => { void Promise.all([api.listProducts({ status: 'all' }), api.listDictionaries('brand', false), api.listDictionaries('product_size', false), api.listDictionaries('appearance', false)])
    .then(([products, brandItems, sizeItems, appearanceItems]) => { setItems(products); setAllProducts(products); setBrands(brandItems); setSizes(sizeItems); setAppearances(appearanceItems); })
    .catch((reason) => setError(reason instanceof Error ? reason.message : '产品档案加载失败')); }, []);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const openCreate = () => { setEditingId(null); setForm(blank); setEditorOpen(true); };
  const openEdit = (item: ProductView) => { setEditingId(item.id); setForm({ model: item.model, productCategory: item.productCategory, brandId: String(item.brandId), productSizeId: String(item.productSizeId), defaultAppearanceId: item.defaultAppearanceId ? String(item.defaultAppearanceId) : '', referenceProductId: item.referenceProductId ? String(item.referenceProductId) : '' }); setEditorOpen(true); };
  const payload = () => ({ model: form.model, productCategory: form.productCategory, brandId: Number(form.brandId), productSizeId: Number(form.productSizeId), defaultAppearanceId: form.defaultAppearanceId ? Number(form.defaultAppearanceId) : null, referenceProductId: form.referenceProductId ? Number(form.referenceProductId) : null });
  const save = async (event: FormEvent) => { event.preventDefault(); setError(''); try {
    const product = editingId ? await api.updateProduct(editingId, payload()) : await api.createProduct(payload());
    const replace = (current: ProductView[]) => editingId ? current.map((item) => item.id === editingId ? product : item) : [...current, product];
    setItems(replace); setAllProducts(replace); setEditorOpen(false);
  } catch (reason) { setError(reason instanceof Error ? reason.message : '产品保存失败'); } };
  const deactivate = async (item: ProductView) => { try { const updated = await api.deactivateProduct(item.id); const replace = (current: ProductView[]) => current.map((entry) => entry.id === item.id ? updated : entry); setItems(replace); setAllProducts(replace); } catch (reason) { setError(reason instanceof Error ? reason.message : '产品停用失败'); } };
  return <section className="page-surface page-enter"><header className="page-header"><div><p className="eyebrow">PRODUCT ARCHIVE</p><h1>产品档案</h1><p>维护品牌、型号、品类尺寸与默认外观，为后续占号提供来源。</p></div><button className="primary-button" onClick={openCreate} type="button">新建产品</button></header>
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void load({ search, status, ...(brandFilter ? { brandId: Number(brandFilter) } : {}) }); }}><label><span>搜索产品</span><input aria-label="搜索产品" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span>品牌</span><select aria-label="筛选品牌" value={brandFilter} onChange={(event) => setBrandFilter(event.target.value)}><option value="">全部</option>{brands.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>状态</span><select aria-label="产品状态" value={status} onChange={(event) => setStatus(event.target.value)}><option value="all">全部</option><option value="active">启用中</option><option value="inactive">已停用</option></select></label><button className="primary-button" type="submit">筛选</button></form>
    {editorOpen && <form className="editor-strip panel-enter" onSubmit={save}><div className="form-grid"><label><span>型号</span><input aria-label="型号" value={form.model} onChange={(e) => set('model', e.target.value)} required /></label><label><span>产品类别</span><input aria-label="产品类别" value={form.productCategory} onChange={(e) => set('productCategory', e.target.value)} required /></label>
      <label><span>品牌</span><select aria-label="品牌" value={form.brandId} onChange={(e) => set('brandId', e.target.value)} required><option value="">请选择</option>{brands.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span>品类尺寸</span><select aria-label="品类尺寸" value={form.productSizeId} onChange={(e) => set('productSizeId', e.target.value)} required><option value="">请选择</option>{sizes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span>默认外观</span><select aria-label="默认外观" value={form.defaultAppearanceId} onChange={(e) => set('defaultAppearanceId', e.target.value)}><option value="">不指定</option>{appearances.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span>参考来源型号</span><select aria-label="参考来源型号" value={form.referenceProductId} onChange={(e) => set('referenceProductId', e.target.value)}><option value="">不指定</option>{allProducts.filter((item) => item.id !== editingId && item.status === 'active').map((item) => <option value={item.id} key={item.id}>{item.brandName} · {item.model}</option>)}</select></label></div>
      <div className="form-actions"><button className="text-button" onClick={() => setEditorOpen(false)} type="button">取消</button><button className="primary-button" type="submit">{editingId ? '保存修改' : '保存产品'}</button></div></form>}
    {error && <p className="error-banner">{error}</p>}{items.length === 0 ? <EmptyState title="还没有产品档案" description="先完成编码字典，再创建首个产品型号。" symbol="品" /> :
      <DataTable items={items} columns={[{ key: 'model', label: '型号', render: (item) => <strong>{item.model}</strong> }, { key: 'brand', label: '品牌', render: (item) => item.brandName }, { key: 'category', label: '产品类别', render: (item) => item.productCategory }, { key: 'size', label: '品类尺寸', render: (item) => item.productSizeName }, { key: 'appearance', label: '默认外观', render: (item) => item.defaultAppearanceName ?? '—' }, { key: 'reference', label: '参考型号', render: (item) => item.referenceProductModel ?? '—' }, { key: 'status', label: '状态', render: (item) => item.status === 'active' ? '启用中' : '已停用' }, { key: 'actions', label: '操作', render: (item) => <div className="row-actions"><button className="text-button" aria-label={`编辑 ${item.model}`} onClick={() => openEdit(item)} type="button">编辑</button>{item.status === 'active' && <button className="text-button danger" aria-label={`停用 ${item.model}`} onClick={() => void deactivate(item)} type="button">停用</button>}</div> }]} />}
  </section>;
}
