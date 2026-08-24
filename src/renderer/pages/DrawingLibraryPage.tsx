import { useEffect, useState, type FormEvent } from 'react';

import type { DictionaryItemView, DrawingView, PlannerApi } from '../data/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

const emptyFilters = { drawingNumber: '', model: '', keyword: '', brandId: '', mainCategoryId: '', projectItemId: '', colorId: '', status: '', exactDrawingNumber: false };

export function DrawingLibraryPage({ api }: { api: PlannerApi }) {
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState<Record<string, DictionaryItemView[]>>({});
  const [items, setItems] = useState<DrawingView[]>([]); const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<DrawingView | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const search = async (values: Record<string, string | number | boolean> = {}) => {
    setLoading(true); setError('');
    try { const result = await api.searchDrawings(values); setItems(result.items); setTotal(result.total); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '图号检索失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    void search();
    void Promise.all(['brand', 'main_category', 'project_item', 'color'].map((type) => api.listDictionaries(type, false)))
      .then(([brand, main_category, project_item, color]) => setOptions({ brand, main_category, project_item, color }))
      .catch((reason) => setError(reason instanceof Error ? reason.message : '筛选项加载失败'));
  }, []);
  const set = (key: keyof typeof filters, value: string | boolean) => setFilters((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void search({ ...filters,
      brandId: filters.brandId ? Number(filters.brandId) : '', mainCategoryId: filters.mainCategoryId ? Number(filters.mainCategoryId) : '',
      projectItemId: filters.projectItemId ? Number(filters.projectItemId) : '', colorId: filters.colorId ? Number(filters.colorId) : '',
    });
  };
  const openDetail = async (item: DrawingView) => { try { setSelected(await api.getDrawing(item.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : '详情加载失败'); } };
  const dictionarySelect = (label: string, key: 'brandId' | 'mainCategoryId' | 'projectItemId' | 'colorId', type: string) =>
    <label><span>{label}</span><select aria-label={label} value={filters[key]} onChange={(event) => set(key, event.target.value)}><option value="">全部</option>{(options[type] ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;

  return <section className="page-surface page-enter">
    <header className="page-header"><div><p className="eyebrow">DRAWING LIBRARY</p><h1>图号库</h1><p>组合检索正式图号，并在右侧核对完整编码信息。</p></div><span className="record-count">{total} 条记录</span></header>
    <form className="filter-bar filter-grid" onSubmit={submit}>
      <label><span>完整图号</span><input aria-label="完整图号" value={filters.drawingNumber} onChange={(event) => set('drawingNumber', event.target.value)} /></label>
      <label><span>型号</span><input aria-label="型号" value={filters.model} onChange={(event) => set('model', event.target.value)} /></label>
      <label><span>关键词</span><input aria-label="关键词" value={filters.keyword} onChange={(event) => set('keyword', event.target.value)} /></label>
      {dictionarySelect('品牌', 'brandId', 'brand')}{dictionarySelect('主类别', 'mainCategoryId', 'main_category')}{dictionarySelect('项目明细', 'projectItemId', 'project_item')}{dictionarySelect('颜色', 'colorId', 'color')}
      <label><span>状态</span><select aria-label="状态" value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="">全部</option><option value="reserved">已占号</option><option value="active">已生效</option><option value="voided">已作废</option></select></label>
      <label className="check-field"><input aria-label="精确图号" type="checkbox" checked={filters.exactDrawingNumber} onChange={(event) => set('exactDrawingNumber', event.target.checked)} /><span>精确图号</span></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '检索中…' : '检索'}</button>
    </form>
    {error && <p className="error-banner">{error}</p>}
    {!loading && items.length === 0 ? <EmptyState title="图号库尚无记录" description="Phase 2 完成正式占号后，记录会显示在这里。" /> :
      <DataTable items={items} onRowClick={(item) => void openDetail(item)} columns={[
        { key: 'code', label: '完整图号', render: (item) => <button className="link-button" type="button">{item.fullCode}</button> },
        { key: 'model', label: '型号', render: (item) => item.model }, { key: 'brand', label: '品牌', render: (item) => item.brandName },
        { key: 'item', label: '项目', render: (item) => item.projectItemName }, { key: 'color', label: '颜色', render: (item) => item.colorName },
        { key: 'status', label: '状态', render: (item) => <span className={`status-text ${item.status}`}>{item.status === 'active' ? '已生效' : item.status === 'reserved' ? '已占号' : '已作废'}</span> },
      ]} />}
    {selected && <aside className="detail-panel panel-enter" aria-label="图号详情"><button className="panel-close" onClick={() => setSelected(null)} type="button">关闭</button>
      <p className="eyebrow">DRAWING DETAIL</p><h2>{selected.fullCode}</h2><p className="detail-name">{selected.displayName}</p>
      <dl><div><dt>品牌 / 型号</dt><dd>{selected.brandName} · {selected.model}</dd></div><div><dt>颜色</dt><dd>{selected.colorName}</dd></div><div><dt>类别 / 项目</dt><dd>{selected.mainCategoryName} · {selected.projectItemName}</dd></div></dl></aside>}
  </section>;
}
