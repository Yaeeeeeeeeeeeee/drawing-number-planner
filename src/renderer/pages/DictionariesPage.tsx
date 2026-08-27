import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { DictionaryItemView, PlannerApi } from '../data/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

const rootTypes = [['brand', '品牌'], ['product_size', '品类尺寸'], ['appearance', '外观'], ['color', '颜色'],
  ['main_category', '主类别']] as const;
type RootDictionaryType = (typeof rootTypes)[number][0];

const statusCell = (item: DictionaryItemView) => item.status === 'active'
  ? '启用中' : <span className="status-text inactive">已停用</span>;

export function DictionariesPage({ api }: { api: PlannerApi }) {
  const [type, setType] = useState<RootDictionaryType>('brand');
  const [items, setItems] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]);
  const [layers, setLayers] = useState<DictionaryItemView[]>([]);
  const [selectedMainId, setSelectedMainId] = useState<number | null>(null);
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [projectCode, setProjectCode] = useState(''); const [projectName, setProjectName] = useState('');
  const [layerCode, setLayerCode] = useState(''); const [layerName, setLayerName] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<DictionaryItemView | null>(null); const [editingName, setEditingName] = useState('');

  const load = async () => {
    setError('');
    try {
      if (type === 'main_category') {
        const [mainCategories, projectItems, layerCounts] = await Promise.all([
          api.listDictionaries('main_category', true), api.listDictionaries('project_item', true), api.listDictionaries('layer_count', true),
        ]);
        setItems(mainCategories); setProjects(projectItems); setLayers(layerCounts);
        setSelectedMainId((current) => mainCategories.some((item) => item.id === current) ? current : null);
        return;
      }
      setItems(await api.listDictionaries(type, true)); setProjects([]); setLayers([]); setSelectedMainId(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '字典加载失败'); }
  };
  useEffect(() => { void load(); }, [type]);

  const selectedMain = useMemo(() => items.find((item) => item.id === selectedMainId) ?? null, [items, selectedMainId]);
  const selectedProjects = useMemo(() => projects.filter((item) => item.parentId === selectedMainId), [projects, selectedMainId]);
  const updateStoredItem = (updated: DictionaryItemView) => {
    const replace = (current: DictionaryItemView[]) => current.map((item) => item.id === updated.id ? updated : item);
    if (updated.type === 'project_item') setProjects(replace);
    else if (updated.type === 'layer_count') setLayers(replace);
    else setItems(replace);
  };
  const createRoot = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try { const item = await api.createDictionary(type, { code, name }); setItems((current) => [...current, item]); setCode(''); setName(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
  };
  const createProject = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (!selectedMain || selectedMain.status !== 'active') { setError('请选择启用中的主类别后再新增项目明细'); return; }
    try { const item = await api.createDictionary('project_item', { code: projectCode, name: projectName, parentId: selectedMain.id }); setProjects((current) => [...current, item]); setProjectCode(''); setProjectName(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
  };
  const createLayer = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    try { const item = await api.createDictionary('layer_count', { code: layerCode, name: layerName }); setLayers((current) => [...current, item]); setLayerCode(''); setLayerName(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '保存失败'); }
  };
  const deactivate = async (id: number) => {
    try { updateStoredItem(await api.deactivateDictionary(id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '停用失败'); }
  };
  const saveName = async (event: FormEvent) => {
    event.preventDefault(); if (!editing) return;
    try { updateStoredItem(await api.updateDictionaryName(editing.id, editingName)); setEditing(null); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '名称保存失败'); }
  };
  const itemActions = (item: DictionaryItemView) => item.status === 'active'
    ? <div className="row-actions"><button className="text-button" aria-label={`修改 ${item.name}`} onClick={() => { setEditing(item); setEditingName(item.name); }} type="button">修改</button><button className="text-button danger" aria-label={`停用 ${item.name}`} onClick={() => void deactivate(item.id)} type="button">停用</button></div>
    : '—';
  const dictionaryTable = (source: DictionaryItemView[], options?: { selectMain?: boolean }) => <DataTable items={source} columns={[
    { key: 'code', label: '编码', render: (item) => <strong className="mono">{item.code}</strong> },
    { key: 'name', label: '名称', render: (item) => item.name }, { key: 'status', label: '状态', render: statusCell },
    ...(options?.selectMain ? [{ key: 'detail', label: '项目明细', render: (item: DictionaryItemView) => <button className="text-button" aria-label={`查看 ${item.name} 的项目明细`} onClick={() => setSelectedMainId(item.id)} type="button">查看</button> }] : []),
    { key: 'action', label: '操作', render: itemActions },
  ]} />;
  const mainCategoryView = <div className="dictionary-hierarchy">
    <section className="dictionary-master"><h2>主类别</h2><p>电子元件类、铭牌类、提示贴纸类、印刷件类、包装类等在这里维护。</p><form className="inline-form" onSubmit={createRoot}><label><span>主类别编码</span><input aria-label="主类别编码" value={code} onChange={(event) => setCode(event.target.value)} required /></label><label><span>主类别名称</span><input aria-label="主类别名称" value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="primary-button" type="submit">新增主类别</button></form>{items.length === 0 ? <EmptyState title="还没有主类别" description="先建立业务分类，再维护其项目明细。" symbol="＋" /> : dictionaryTable(items, { selectMain: true })}</section>
    <section className="dictionary-detail"><h2>项目明细{selectedMain ? ` · ${selectedMain.name}` : ''}</h2>{selectedMain ? <><p>项目明细按所选主类别归属；停用类别仍可查阅历史项目，但不能新增。</p><form className="inline-form" onSubmit={createProject}><label><span>项目明细编码</span><input aria-label="项目明细编码" value={projectCode} onChange={(event) => setProjectCode(event.target.value)} disabled={selectedMain.status !== 'active'} required /></label><label><span>项目明细名称</span><input aria-label="项目明细名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={selectedMain.status !== 'active'} required /></label><button className="primary-button" type="submit" disabled={selectedMain.status !== 'active'}>新增项目明细</button></form>{selectedProjects.length === 0 ? <p className="muted-text">该主类别暂无项目明细。</p> : dictionaryTable(selectedProjects)}</> : <p className="muted-text">请在左侧主类别中选择一项，查看并维护对应项目明细。</p>}</section>
    <section className="dictionary-auxiliary"><h2>层数</h2><p>层数为主类别业务区的辅助字典，不隶属于任何主类别。</p><form className="inline-form" onSubmit={createLayer}><label><span>层数编码</span><input aria-label="层数编码" value={layerCode} onChange={(event) => setLayerCode(event.target.value)} required /></label><label><span>层数名称</span><input aria-label="层数名称" value={layerName} onChange={(event) => setLayerName(event.target.value)} required /></label><button className="primary-button" type="submit">新增层数</button></form>{layers.length === 0 ? <p className="muted-text">暂未维护层数。</p> : dictionaryTable(layers)}</section>
  </div>;
  return <section className="page-surface page-enter"><header className="page-header"><div><p className="eyebrow">CODE DICTIONARIES</p><h1>编码字典</h1><p>只增加必要编码；已使用项目通过停用保留历史语义。</p></div></header><div className="segmented-tabs" role="tablist">{rootTypes.map(([value, label]) => <button role="tab" aria-selected={type === value} onClick={() => setType(value)} key={value}>{label}</button>)}</div>{type === 'main_category' ? mainCategoryView : <><form className="inline-form" onSubmit={createRoot}><label><span>编码</span><input value={code} onChange={(event) => setCode(event.target.value)} required /></label><label><span>名称</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="primary-button" type="submit">新增编码</button></form>{items.length === 0 ? <EmptyState title="当前字典暂无数据" description="可在上方录入第一条正式编码。" symbol="＋" /> : dictionaryTable(items)}</>}{error && <p className="error-banner">{error}</p>}{editing && <form className="editor-strip" onSubmit={saveName}><label><span>修改名称</span><input aria-label="修改名称" value={editingName} onChange={(event) => setEditingName(event.target.value)} required /></label><div className="form-actions"><button className="text-button" type="button" onClick={() => setEditing(null)}>取消</button><button className="primary-button" type="submit">保存名称</button></div></form>}</section>;
}
