import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { DictionaryItemView, PlannerApi } from '../data/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';

const rootTypes = [['brand', '品牌'], ['product_size', '品类尺寸'], ['appearance', '外观'], ['color', '颜色'],
  ['main_category', '主类别']] as const;
type RootDictionaryType = (typeof rootTypes)[number][0];

const statusCell = (item: DictionaryItemView) => item.deletedAt ? <span className="status-text inactive">已删除 · 历史保留</span> : item.status === 'active'
  ? '启用中' : <span className="status-text inactive">已停用</span>;

export function DictionariesPage({ api }: { api: PlannerApi }) {
  const [type, setType] = useState<RootDictionaryType>('brand');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [items, setItems] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]);
  const [selectedMainId, setSelectedMainId] = useState<number | null>(null);
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [projectCode, setProjectCode] = useState(''); const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<DictionaryItemView | null>(null); const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rowFeedback, setRowFeedback] = useState<{ id: number; kind: 'success' | 'error'; message: string } | null>(null);
  const requestGeneration = useRef(0);

  const load = async () => {
    const generation = ++requestGeneration.current;
    setItems([]); setProjects([]); setSelectedMainId(null); setEditing(null); setError(''); setLoading(true);
    try {
      if (type === 'main_category') {
        const [mainCategories, projectItems] = await Promise.all([
          api.listDictionaries('main_category', true, includeDeleted), api.listDictionaries('project_item', true, includeDeleted),
        ]);
        if (generation !== requestGeneration.current) return;
        setItems(mainCategories); setProjects(projectItems);
        return;
      }
      const rootItems = await api.listDictionaries(type, true, includeDeleted);
      if (generation !== requestGeneration.current) return;
      setItems(rootItems);
    } catch (reason) {
      if (generation === requestGeneration.current) setError(reason instanceof Error ? reason.message : '字典加载失败');
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  };
  useEffect(() => { void load(); }, [type, includeDeleted]);

  const selectType = (next: RootDictionaryType) => {
    if (next === type) return;
    ++requestGeneration.current;
    setItems([]); setProjects([]); setSelectedMainId(null); setEditing(null); setError(''); setLoading(true);
    setType(next);
  };

  const selectedMain = useMemo(() => items.find((item) => item.id === selectedMainId) ?? null, [items, selectedMainId]);
  const selectedProjects = useMemo(() => projects.filter((item) => item.parentId === selectedMainId), [projects, selectedMainId]);
  const updateStoredItem = (updated: DictionaryItemView) => {
    const replace = (current: DictionaryItemView[]) => current.map((item) => item.id === updated.id ? updated : item);
    if (updated.type === 'project_item') setProjects(replace);
    else setItems(replace);
  };
  const removeStoredItem = (deleted: DictionaryItemView) => {
    const remove = (current: DictionaryItemView[]) => current.filter((item) => item.id !== deleted.id);
    if (deleted.type === 'project_item') setProjects(remove);
    else setItems(remove);
  };
  const createRoot = async (event: FormEvent) => {
    event.preventDefault(); setError(''); const generation = requestGeneration.current;
    try {
      const item = await api.createDictionary(type, { code, name });
      if (generation !== requestGeneration.current) return;
      setItems((current) => [...current, item]); setCode(''); setName('');
    } catch (reason) {
      if (generation === requestGeneration.current) setError(reason instanceof Error ? reason.message : '保存失败');
    }
  };
  const createProject = async (event: FormEvent) => {
    event.preventDefault(); setError(''); const generation = requestGeneration.current;
    if (!selectedMain || selectedMain.status !== 'active') { setError('请选择启用中的主类别后再新增项目明细'); return; }
    try {
      const item = await api.createDictionary('project_item', { code: projectCode, name: projectName, parentId: selectedMain.id });
      if (generation !== requestGeneration.current) return;
      setProjects((current) => [...current, item]); setProjectCode(''); setProjectName('');
    } catch (reason) {
      if (generation === requestGeneration.current) setError(reason instanceof Error ? reason.message : '保存失败');
    }
  };
  const deactivate = async (id: number) => {
    const generation = requestGeneration.current; setPendingId(id); setRowFeedback(null);
    try {
      const updated = await api.deactivateDictionary(id);
      if (generation === requestGeneration.current) { updateStoredItem(updated); setRowFeedback({ id, kind: 'success', message: '已停用，历史数据仍保留。' }); }
    } catch (reason) {
      if (generation === requestGeneration.current) setRowFeedback({ id, kind: 'error', message: reason instanceof Error ? reason.message : '停用失败' });
    } finally { if (generation === requestGeneration.current) setPendingId(null); }
  };
  const activate = async (id: number) => {
    const generation = requestGeneration.current; setPendingId(id); setRowFeedback(null);
    try {
      const updated = await api.activateDictionary(id);
      if (generation === requestGeneration.current) { updateStoredItem(updated); setRowFeedback({ id, kind: 'success', message: '已启用，可在新建业务中使用。' }); }
    } catch (reason) {
      if (generation === requestGeneration.current) setRowFeedback({ id, kind: 'error', message: reason instanceof Error ? reason.message : '启用失败' });
    } finally { if (generation === requestGeneration.current) setPendingId(null); }
  };
  const saveName = async (event: FormEvent) => {
    event.preventDefault(); if (!editing) return; const generation = requestGeneration.current;
    setPendingId(editing.id); setRowFeedback(null);
    try {
      const updated = await api.updateDictionaryName(editing.id, editingName);
      if (generation !== requestGeneration.current) return;
      updateStoredItem(updated); setEditing(null); setRowFeedback({ id: updated.id, kind: 'success', message: '名称已保存。' });
    } catch (reason) {
      if (generation === requestGeneration.current) setRowFeedback({ id: editing.id, kind: 'error', message: reason instanceof Error ? reason.message : '名称保存失败' });
    } finally { if (generation === requestGeneration.current) setPendingId(null); }
  };
  const deleteItem = async (item: DictionaryItemView) => {
    setPendingId(item.id); setRowFeedback(null);
    try {
      await api.deleteDictionary(item.id); removeStoredItem(item); setConfirmDeleteId(null);
    } catch (reason) {
      setConfirmDeleteId(null); setRowFeedback({ id: item.id, kind: 'error', message: reason instanceof Error ? reason.message : '删除失败' });
    } finally { setPendingId(null); }
  };
  const itemActions = (item: DictionaryItemView) => <div className="row-actions">
    <button className="text-button" disabled={pendingId === item.id} aria-label={`修改 ${item.name}`} onClick={() => { setEditing(item); setEditingName(item.name); setConfirmDeleteId(null); setRowFeedback(null); }} type="button">修改</button>
    {item.status === 'active' && <button className="text-button danger" disabled={pendingId === item.id} aria-label={`停用 ${item.name}`} onClick={() => void deactivate(item.id)} type="button">停用</button>}
    {item.status === 'inactive' && <button className="text-button" disabled={pendingId === item.id} aria-label={`${item.deletedAt ? '恢复' : '启用'} ${item.name}`} onClick={() => { if (!item.deletedAt || window.confirm(`确认恢复字典 ${item.code} ${item.name}？`)) void activate(item.id); }} type="button">{item.deletedAt ? '恢复记录' : '启用'}</button>}
    {!item.deletedAt && <button className="text-button danger" disabled={pendingId === item.id} aria-label={`删除 ${item.name}`} onClick={() => { setConfirmDeleteId(item.id); setEditing(null); setRowFeedback(null); }} type="button">删除</button>}
  </div>;
  const dictionaryEditor = (item: DictionaryItemView) => editing?.id === item.id || confirmDeleteId === item.id || rowFeedback?.id === item.id ? <div className="record-inline-panel panel-enter">
    {editing?.id === item.id && <form className="editor-strip" onSubmit={saveName}>
      <p className="muted-text">编码锁定：{item.code}</p>
      <label><span>修改名称</span><input aria-label="修改名称" value={editingName} onChange={(event) => setEditingName(event.target.value)} required /></label>
      <div className="form-actions"><button className="text-button" type="button" onClick={() => setEditing(null)}>取消</button><button className="primary-button" disabled={pendingId === item.id} type="submit">{pendingId === item.id ? '保存中…' : '保存名称'}</button></div>
    </form>}
    {confirmDeleteId === item.id && <div className="inline-confirm" role="alert"><p>确认删除“{item.code} {item.name}”？未引用的编码会物理删除；已引用的编码退出正常列表并保留历史身份，不改变历史图号或占号。</p>
      <div className="form-actions"><button className="text-button" type="button" onClick={() => setConfirmDeleteId(null)}>取消</button><button className="primary-button danger" disabled={pendingId === item.id} type="button" onClick={() => void deleteItem(item)}>{pendingId === item.id ? '删除中…' : '确认删除'}</button></div></div>}
    {rowFeedback?.id === item.id && <p className={rowFeedback.kind === 'error' ? 'error-banner' : 'success-banner'}>{rowFeedback.message}</p>}
  </div> : null;
  const dictionaryTable = (source: DictionaryItemView[], options?: { selectMain?: boolean }) => <DataTable items={source} columns={[
    { key: 'code', label: '编码', render: (item) => <strong className="mono">{item.code}</strong> },
    { key: 'name', label: '名称', render: (item) => item.name }, { key: 'status', label: '状态', render: statusCell },
    ...(options?.selectMain ? [{ key: 'detail', label: '项目明细', render: (item: DictionaryItemView) => <button className="text-button" aria-label={`查看 ${item.name} 的项目明细`} onClick={() => setSelectedMainId(item.id)} type="button">查看</button> }] : []),
    { key: 'action', label: '操作', render: itemActions },
  ]} renderExpandedRow={dictionaryEditor} />;
  const mainCategoryView = <div className="dictionary-hierarchy">
    <section className="dictionary-master"><h2>主类别</h2><p>电子元件类、铭牌类、提示贴纸类、印刷件类、包装类等在这里维护。</p><form className="inline-form" onSubmit={createRoot}><label><span>主类别编码</span><input aria-label="主类别编码" value={code} onChange={(event) => setCode(event.target.value)} required /></label><label><span>主类别名称</span><input aria-label="主类别名称" value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="primary-button" type="submit">新增主类别</button></form>{items.length === 0 ? <EmptyState title="还没有主类别" description="先建立业务分类，再维护其项目明细。" symbol="＋" /> : dictionaryTable(items, { selectMain: true })}</section>
    <section className="dictionary-detail"><h2>项目明细{selectedMain ? ` · ${selectedMain.name}` : ''}</h2>{selectedMain ? <><p>项目明细按所选主类别归属；停用类别仍可查阅历史项目，但不能新增。</p><form className="inline-form" onSubmit={createProject}><label><span>项目明细编码</span><input aria-label="项目明细编码" value={projectCode} onChange={(event) => setProjectCode(event.target.value)} disabled={selectedMain.status !== 'active'} required /></label><label><span>项目明细名称</span><input aria-label="项目明细名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={selectedMain.status !== 'active'} required /></label><button className="primary-button" type="submit" disabled={selectedMain.status !== 'active'}>新增项目明细</button></form>{selectedProjects.length === 0 ? <p className="muted-text">该主类别暂无项目明细。</p> : dictionaryTable(selectedProjects)}</> : <p className="muted-text">请在左侧主类别中选择一项，查看并维护对应项目明细。</p>}
    </section>
  </div>;
  return <section className="page-surface page-enter"><header className="page-header"><div><p className="eyebrow">CODE DICTIONARIES</p><h1>编码字典</h1><p>删除已引用编码只退出正常列表，历史身份仍保留。</p></div></header><label className="choice-row"><input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />显示已删除字典记录</label><div className="segmented-tabs" role="tablist">{rootTypes.map(([value, label]) => <button role="tab" aria-selected={type === value} onClick={() => selectType(value)} key={value}>{label}</button>)}</div>{loading ? <p className="dictionary-loading" role="status">正在加载字典…</p> : type === 'main_category' ? mainCategoryView : <><form className="inline-form" onSubmit={createRoot}><label><span>编码</span><input value={code} onChange={(event) => setCode(event.target.value)} required /></label><label><span>名称</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="primary-button" type="submit">新增编码</button></form>{items.length === 0 ? <EmptyState title="当前字典暂无数据" description="可在上方录入第一条正式编码。" symbol="＋" /> : dictionaryTable(items)}</>}{error && <p className="error-banner">{error}</p>}</section>;
}
