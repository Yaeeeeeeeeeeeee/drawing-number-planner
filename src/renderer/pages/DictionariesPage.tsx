import { ViewportRegion } from '../components/ViewportRegion';
import { PageHeader } from '../components/PageHeader';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';

import type { DictionaryItemView, PlannerApi } from '../data/client';
import { DataTable } from '../components/DataTable';
import { QueryFeedback } from '../components/QueryFeedback';
import { EmptyState } from '../components/EmptyState';
import { DictionaryPermanentDelete } from './DictionaryPermanentDelete';
import { DictionariesMockPage, isDictionariesMock } from './dictionaries-mock';

const rootTypes = [['brand', '品牌'], ['product_size', '品类尺寸'], ['appearance', '外观'], ['color', '颜色'],
  ['main_category', '主类别']] as const;
type RootDictionaryType = (typeof rootTypes)[number][0];

const statusCell = (item: DictionaryItemView) => <span className={`dm-state ${item.deletedAt ? 'deleted' : item.status}`}>{item.deletedAt ? '已删除 · 历史保留' : item.status === 'active' ? '启用中' : '已停用'}</span>;

export function DictionariesPage({ api }: { api: PlannerApi }) {
  return isDictionariesMock() ? <DictionariesMockPage/> : <DictionariesWorkspace api={api}/>;
}
function DictionariesWorkspace({ api }: { api: PlannerApi }) {
  const [type, setType] = useState<RootDictionaryType>('brand');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [items, setItems] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]);
  const [selectedMainId, setSelectedMainId] = useState<number | null>(null);
  const [creatingRoot, setCreatingRoot] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const visibleItems = items.filter(item => (!search.trim() || `${item.code} ${item.name}`.toLowerCase().includes(search.trim().toLowerCase())) && (statusFilter === 'all' || (statusFilter === 'deleted' ? Boolean(item.deletedAt) : !item.deletedAt && item.status === statusFilter)));
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [projectCode, setProjectCode] = useState(''); const [projectName, setProjectName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing, setEditing] = useState<DictionaryItemView | null>(null); const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<number | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [rowFeedback, setRowFeedback] = useState<{ id: number; kind: 'success' | 'error'; message: string } | null>(null);
  const requestGeneration = useRef(0);

  const load = async () => {
    const generation = ++requestGeneration.current;
    setItems([]); setProjects([]); setSelectedMainId(null); setConfirmRestoreId(null); setPermanentDeleteId(null); setEditing(null); setError(''); setLoadError(''); setLoading(true);
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
      if (generation === requestGeneration.current) setLoadError(reason instanceof Error ? reason.message : '字典加载失败');
    } finally { if (generation === requestGeneration.current) setLoading(false); }
  };
  useEffect(() => { void load(); }, [type, includeDeleted]);

  const selectType = (next: RootDictionaryType) => {
    if (next === type) return;
    ++requestGeneration.current;
    setItems([]); setProjects([]); setSelectedMainId(null); setConfirmRestoreId(null); setPermanentDeleteId(null); setEditing(null); setError(''); setLoading(true);
    setCreatingRoot(false); setCreatingProject(false); setSearch(''); setStatusFilter('all'); setType(next);
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
    if (selectedMainId === deleted.id) setSelectedMainId(null);
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
      if (generation === requestGeneration.current) { updateStoredItem(updated); setConfirmRestoreId(null); setRowFeedback({ id, kind: 'success', message: '已启用，可在新建业务中使用。' }); }
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
  const itemActions = (item: DictionaryItemView) => <div className="row-actions dm-actions">
    <button className="text-button" disabled={pendingId === item.id} aria-label={`修改 ${item.name}`} onClick={() => { setConfirmRestoreId(null); setPermanentDeleteId(null); setEditing(item); setEditingName(item.name); setConfirmDeleteId(null); setRowFeedback(null); }} type="button">修改</button>
    {item.status === 'active' && <button className="text-button dictionary-stop amber" disabled={pendingId === item.id} aria-label={`停用 ${item.name}`} onClick={() => {setPermanentDeleteId(null);void deactivate(item.id);}} type="button">停用</button>}
    {item.status === 'inactive' && <button className="text-button green" disabled={pendingId === item.id} aria-label={`${item.deletedAt ? '恢复' : '启用'} ${item.name}`} onClick={() => { setPermanentDeleteId(null); setEditing(null); setConfirmDeleteId(null); setRowFeedback(null); if (item.deletedAt) setConfirmRestoreId(item.id); else void activate(item.id); }} type="button">{item.deletedAt ? '恢复记录' : '启用'}</button>}
    {!item.deletedAt && <button className="text-button danger" disabled={pendingId === item.id} aria-label={`删除 ${item.name}`} onClick={() => { setConfirmRestoreId(null); setConfirmDeleteId(item.id); setEditing(null); setRowFeedback(null); }} type="button">删除</button>}
    {item.deletedAt && <button className="text-button danger" disabled={pendingId !== null} aria-label={`永久删除 ${item.name}`} onClick={() => {setConfirmRestoreId(null);setPermanentDeleteId(item.id);setEditing(null);setConfirmDeleteId(null);setRowFeedback(null);}} type="button">永久删除</button>}
  </div>;
  const dictionaryEditor = (item: DictionaryItemView) => editing?.id === item.id || confirmDeleteId === item.id || confirmRestoreId === item.id || permanentDeleteId === item.id || rowFeedback?.id === item.id ? <div className="dm-edit-branch">
    {confirmRestoreId === item.id && <div className="inline-confirm dictionary-restore-confirm" role="alert"><p>确认恢复“{item.code} {item.name}”？将重新启用此字典记录，历史引用保持不变。</p><div className="form-actions"><button type="button" disabled={pendingId === item.id} onClick={()=>setConfirmRestoreId(null)}>取消恢复</button><button className="primary-button" type="button" disabled={pendingId === item.id} onClick={()=>void activate(item.id)}>{pendingId === item.id?'恢复中…':'确认恢复'}</button></div></div>}
    {permanentDeleteId === item.id && <DictionaryPermanentDelete api={api} item={item} onCancel={()=>setPermanentDeleteId(null)} onBusy={busy=>setPendingId(busy?item.id:null)} onDeleted={()=>{removeStoredItem(item);setPermanentDeleteId(null);}}/>}
    {editing?.id === item.id && <form className="dm-editor dictionary-name-editor" onSubmit={saveName}>
      <label>编码<input aria-label="编码" value={item.code} disabled /></label>
      <label><span>修改名称</span><input autoFocus aria-label="修改名称" value={editingName} onChange={(event) => setEditingName(event.target.value)} required /></label>
      <button className="primary-button" disabled={pendingId === item.id} type="submit">{pendingId === item.id ? '保存中…' : '保存'}</button><button disabled={pendingId === item.id} type="button" onClick={() => setEditing(null)}>取消</button><small>编码锁定，仅修改名称</small>
    </form>}
    {confirmDeleteId === item.id && <div className="inline-confirm" role="alert"><p>确认删除“{item.code} {item.name}”？未引用的编码会物理删除；已引用的编码退出正常列表并保留历史身份，不改变历史图号或占号。当前接口未提供独立引用预检，实际影响由服务在确认时核对；失败不表示删除成功。</p>
      <div className="form-actions"><button className="text-button" type="button" onClick={() => setConfirmDeleteId(null)}>取消</button><button className="primary-button danger" disabled={pendingId === item.id} type="button" onClick={() => void deleteItem(item)}>{pendingId === item.id ? '删除中…' : '确认删除'}</button></div></div>}
    {rowFeedback?.id === item.id && <p className={rowFeedback.kind === 'error' ? 'error-banner' : 'success-banner'}>{rowFeedback.message}</p>}
  </div> : null;
  const dictionaryTable = (source: DictionaryItemView[], options?: { selectMain?: boolean }) => <DataTable tableId={`dictionaries.${type === 'main_category' ? 'project-items' : type}`} fillViewport items={source} columns={[
    { key: 'code', label: '编码', render: (item) => <strong className="mono">{item.code}</strong> },
    { key: 'name', label: '名称', align:'center', render: (item) => item.name }, { key: 'status', label: '状态', render: statusCell },
    ...(options?.selectMain ? [{ key: 'detail', label: '项目明细', render: (item: DictionaryItemView) => <button className="text-button" aria-label={`查看 ${item.name} 的项目明细`} aria-pressed={selectedMainId === item.id} onClick={() => { setSelectedMainId(item.id); setCreatingProject(false); }} type="button">查看</button> }] : []),
    { key: 'action', label: '操作', render: itemActions },
  ]} renderExpandedRow={dictionaryEditor} />;
  const mainCategoryView = <div className="dictionary-hierarchy approved-dictionary-hierarchy">
    <section className="dictionary-master">{creatingRoot && <form className="dm-editor dictionary-create" onSubmit={createRoot}><label><span>主类别编码</span><input aria-label="主类别编码" value={code} onChange={(event) => setCode(event.target.value)} required /></label><label><span>主类别名称</span><input aria-label="主类别名称" value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="primary-button" type="submit">新增主类别</button><button type="button" onClick={() => setCreatingRoot(false)}>取消新增</button></form>}{items.length === 0 ? <EmptyState title="还没有主类别" description="先建立业务分类，再维护其项目明细。" symbol="＋" /> : <ViewportRegion className="dictionary-parent-list">{visibleItems.map(item => <button type="button" className={`dictionary-parent ${item.code.length>8?'long-code':''}`} key={item.id} aria-label={`查看 ${item.name} 的项目明细`} aria-pressed={selectedMainId === item.id} onClick={() => { setSelectedMainId(item.id); setCreatingProject(false); setEditing(null); setConfirmDeleteId(null); }}><strong>{item.code}</strong><span>{item.name}</span><small className={`dm-state ${item.deletedAt?'deleted':item.status}`}>{item.deletedAt ? '已删除' : item.status === 'active' ? '启用中' : '已停用'}</small></button>)}</ViewportRegion>}</section>
    <section className="dictionary-detail">{selectedMain ? <><header className="dm-child-head"><div><strong>{selectedMain.code} {selectedMain.name}</strong><small>项目明细 · {selectedProjects.length} 项</small></div><div className="dictionary-parent-actions">{itemActions(selectedMain)}</div></header>{dictionaryEditor(selectedMain)}<div className="dm-child-tools"><button type="button" disabled={selectedMain.status !== 'active'} title={selectedMain.status !== 'active' ? '停用主类别不能新增项目明细' : undefined} onClick={() => setCreatingProject(!creatingProject)}>新增项目明细</button>{selectedMain.status!=='active'&&<span>父级停用，不能新增子项</span>}</div>{creatingProject && <form className="dm-editor dictionary-create" onSubmit={createProject}><label><span>项目明细编码</span><input aria-label="项目明细编码" value={projectCode} onChange={(event) => setProjectCode(event.target.value)} disabled={selectedMain.status !== 'active'} required /></label><label><span>项目明细名称</span><input aria-label="项目明细名称" value={projectName} onChange={(event) => setProjectName(event.target.value)} disabled={selectedMain.status !== 'active'} required /></label><button className="primary-button" type="submit" disabled={selectedMain.status !== 'active'}>保存项目明细</button><button type="button" onClick={() => setCreatingProject(false)}>取消新增</button></form>}{selectedProjects.length === 0 ? <p className="muted-text">该主类别暂无项目明细。</p> : dictionaryTable(selectedProjects)}</> : <p className="muted-text">请在主类别列表中选择一项，查看并维护对应项目明细。</p>}
    </section>
  </div>;
  return <section className="page-surface page-enter dictionaries-real-page dm-page"><PageHeader title="编码字典" description="维护编码、名称与启用状态，并按主类别浏览项目明细。"></PageHeader><nav className="dm-tabs" role="tablist">{rootTypes.map(([value, label]) => <button role="tab" aria-selected={type === value} aria-pressed={type === value} onClick={() => selectType(value)} key={value}>{label}</button>)}</nav><div className="dm-toolbar"><input aria-label="搜索编码或名称" placeholder="搜索编码或名称" value={search} onChange={e => setSearch(e.target.value)}/><select aria-label="字典状态" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">全部状态</option><option value="active">启用中</option><option value="inactive">已停用</option><option value="deleted">已删除</option></select><label><input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} />显示已删除</label><span>{visibleItems.length} 项</span><button className="primary-button" disabled={loading || Boolean(loadError)} type="button" onClick={() => setCreatingRoot(!creatingRoot)}>{type === 'main_category' ? '新增主类别' : '新增'}</button></div>{loading || loadError ? <QueryFeedback state={loading ? 'loading' : 'failed'} error={loadError} onRetry={() => void load()}/> : type === 'main_category' ? mainCategoryView : <>{creatingRoot && <form className="dm-editor dictionary-create" onSubmit={createRoot}><label><span>编码</span><input value={code} onChange={(event) => setCode(event.target.value)} required /></label><label><span>名称</span><input value={name} onChange={(event) => setName(event.target.value)} required /></label><button className="primary-button" type="submit">新增编码</button><button type="button" onClick={() => setCreatingRoot(false)}>取消新增</button></form>}{items.length === 0 ? <EmptyState title="当前字典暂无数据" description="可在上方录入第一条正式编码。" symbol="＋" /> : visibleItems.length ? dictionaryTable(visibleItems) : <p>没有符合筛选条件的记录。</p>}</>}{error && <p className="error-banner">{error}</p>}</section>;
}
