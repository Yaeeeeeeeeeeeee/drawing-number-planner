import { useEffect, useState, type FormEvent } from 'react';

import type { DrawingView, PlannerApi } from '../api/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

export function DrawingLibraryPage({ api }: { api: PlannerApi }) {
  const [keyword, setKeyword] = useState('');
  const [items, setItems] = useState<DrawingView[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<DrawingView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const search = async (filters: Record<string, string> = {}) => {
    setLoading(true); setError('');
    try { const result = await api.searchDrawings(filters); setItems(result.items); setTotal(result.total); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '图号检索失败'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void search(); }, []);

  const submit = (event: FormEvent) => { event.preventDefault(); void search({ keyword }); };
  const openDetail = async (item: DrawingView) => {
    try { setSelected(await api.getDrawing(item.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '详情加载失败'); }
  };

  return <section className="page-surface page-enter">
    <header className="page-header"><div><p className="eyebrow">DRAWING LIBRARY</p><h1>图号库</h1><p>组合检索正式图号，并在右侧核对完整编码信息。</p></div><span className="record-count">{total} 条记录</span></header>
    <form className="filter-bar" onSubmit={submit}><label className="search-field"><span>图号或关键词</span>
      <input aria-label="图号或关键词" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="图号、型号、品牌、项目" /></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '检索中…' : '检索'}</button></form>
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
      <dl><div><dt>品牌 / 型号</dt><dd>{selected.brandName} · {selected.model}</dd></div><div><dt>颜色</dt><dd>{selected.colorName}</dd></div>
        <div><dt>类别 / 项目</dt><dd>{selected.mainCategoryName} · {selected.projectItemName}</dd></div></dl></aside>}
  </section>;
}
