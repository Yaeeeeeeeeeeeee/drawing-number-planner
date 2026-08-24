import { useEffect, useState, type FormEvent } from 'react';

import type { DictionaryItemView, PlannerApi } from '../api/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

const types = [['brand', '品牌'], ['product_size', '品类尺寸'], ['appearance', '外观'], ['color', '颜色'],
  ['main_category', '主类别'], ['project_item', '项目明细'], ['layer_count', '层数']] as const;

export function DictionariesPage({ api }: { api: PlannerApi }) {
  const [type, setType] = useState<string>('brand'); const [items, setItems] = useState<DictionaryItemView[]>([]);
  const [code, setCode] = useState(''); const [name, setName] = useState(''); const [parentId, setParentId] = useState('');
  const [parents, setParents] = useState<DictionaryItemView[]>([]); const [error, setError] = useState('');
  const load = async () => { setError(''); try { setItems(await api.listDictionaries(type, true));
    if (type === 'project_item') setParents(await api.listDictionaries('main_category', false)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '字典加载失败'); } };
  useEffect(() => { void load(); }, [type]);
  const create = async (event: FormEvent) => { event.preventDefault(); setError(''); try {
    const item = await api.createDictionary(type, { code, name, ...(parentId ? { parentId: Number(parentId) } : {}) });
    setItems((current) => [...current, item]); setCode(''); setName('');
  } catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); } };
  const deactivate = async (id: number) => { const updated = await api.deactivateDictionary(id);
    setItems((current) => current.map((item) => item.id === id ? updated : item)); };
  return <section className="page-surface page-enter"><header className="page-header"><div><p className="eyebrow">CODE DICTIONARIES</p><h1>编码字典</h1><p>只增加必要编码；已使用项目通过停用保留历史语义。</p></div></header>
    <div className="segmented-tabs" role="tablist">{types.map(([value, label]) => <button role="tab" aria-selected={type === value} onClick={() => setType(value)} key={value}>{label}</button>)}</div>
    <form className="inline-form" onSubmit={create}><label><span>编码</span><input value={code} onChange={(e) => setCode(e.target.value)} required /></label>
      <label><span>名称</span><input value={name} onChange={(e) => setName(e.target.value)} required /></label>
      {type === 'project_item' && <label><span>所属主类别</span><select value={parentId} onChange={(e) => setParentId(e.target.value)} required><option value="">请选择</option>{parents.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      <button className="primary-button" type="submit">新增编码</button></form>{error && <p className="error-banner">{error}</p>}
    {items.length === 0 ? <EmptyState title="当前字典暂无数据" description="可在上方录入第一条正式编码。" symbol="＋" /> :
      <DataTable items={items} columns={[{ key: 'code', label: '编码', render: (item) => <strong className="mono">{item.code}</strong> },
        { key: 'name', label: '名称', render: (item) => item.name }, { key: 'status', label: '状态', render: (item) => item.status === 'active' ? '启用中' : <span className="status-text inactive">已停用</span> },
        { key: 'action', label: '操作', render: (item) => item.status === 'active' ? <button className="text-button danger" aria-label={`停用 ${item.name}`} onClick={() => void deactivate(item.id)} type="button">停用</button> : '—' }]} />}
  </section>;
}
