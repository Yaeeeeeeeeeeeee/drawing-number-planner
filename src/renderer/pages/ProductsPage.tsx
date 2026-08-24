import { useEffect, useState, type FormEvent } from 'react';

import type { DictionaryItemView, PlannerApi, ProductView } from '../data/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

export function ProductsPage({ api }: { api: PlannerApi }) {
  const [items, setItems] = useState<ProductView[]>([]); const [creating, setCreating] = useState(false);
  const [brands, setBrands] = useState<DictionaryItemView[]>([]); const [sizes, setSizes] = useState<DictionaryItemView[]>([]);
  const [appearances, setAppearances] = useState<DictionaryItemView[]>([]); const [error, setError] = useState('');
  const [form, setForm] = useState({ model: '', productCategory: '', brandId: '', productSizeId: '', defaultAppearanceId: '' });
  useEffect(() => { void Promise.all([api.listProducts({ status: 'all' }), api.listDictionaries('brand', false),
    api.listDictionaries('product_size', false), api.listDictionaries('appearance', false)])
    .then(([products, brandItems, sizeItems, appearanceItems]) => { setItems(products); setBrands(brandItems); setSizes(sizeItems); setAppearances(appearanceItems); })
    .catch((reason) => setError(reason instanceof Error ? reason.message : '产品档案加载失败')); }, []);
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const create = async (event: FormEvent) => { event.preventDefault(); setError(''); try { const product = await api.createProduct({
    model: form.model, productCategory: form.productCategory, brandId: Number(form.brandId), productSizeId: Number(form.productSizeId),
    defaultAppearanceId: form.defaultAppearanceId ? Number(form.defaultAppearanceId) : null,
  }); setItems((current) => [...current, product]); setCreating(false); }
  catch (reason) { setError(reason instanceof Error ? reason.message : '产品保存失败'); } };
  return <section className="page-surface page-enter"><header className="page-header"><div><p className="eyebrow">PRODUCT ARCHIVE</p><h1>产品档案</h1><p>维护品牌、型号、品类尺寸与默认外观，为后续占号提供来源。</p></div>
    <button className="primary-button" onClick={() => setCreating(true)} type="button">新建产品</button></header>
    {creating && <form className="editor-strip panel-enter" onSubmit={create}><div className="form-grid"><label><span>型号</span><input aria-label="型号" value={form.model} onChange={(e) => set('model', e.target.value)} required /></label>
      <label><span>产品类别</span><input aria-label="产品类别" value={form.productCategory} onChange={(e) => set('productCategory', e.target.value)} required /></label>
      <label><span>品牌</span><select aria-label="品牌" value={form.brandId} onChange={(e) => set('brandId', e.target.value)} required><option value="">请选择</option>{brands.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span>品类尺寸</span><select aria-label="品类尺寸" value={form.productSizeId} onChange={(e) => set('productSizeId', e.target.value)} required><option value="">请选择</option>{sizes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      <label><span>默认外观</span><select aria-label="默认外观" value={form.defaultAppearanceId} onChange={(e) => set('defaultAppearanceId', e.target.value)}><option value="">不指定</option>{appearances.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>
      <div className="form-actions"><button className="text-button" onClick={() => setCreating(false)} type="button">取消</button><button className="primary-button" type="submit">保存产品</button></div></form>}
    {error && <p className="error-banner">{error}</p>}{items.length === 0 ? <EmptyState title="还没有产品档案" description="先完成编码字典，再创建首个产品型号。" symbol="品" /> :
      <DataTable items={items} columns={[{ key: 'model', label: '型号', render: (item) => <strong>{item.model}</strong> }, { key: 'brand', label: '品牌', render: (item) => item.brandName },
        { key: 'category', label: '产品类别', render: (item) => item.productCategory }, { key: 'size', label: '品类尺寸', render: (item) => item.productSizeName },
        { key: 'appearance', label: '默认外观', render: (item) => item.defaultAppearanceName ?? '—' }, { key: 'status', label: '状态', render: (item) => item.status === 'active' ? '启用中' : '已停用' }]} />}
  </section>;
}
