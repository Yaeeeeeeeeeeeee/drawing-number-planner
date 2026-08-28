import { useEffect, useState, type FormEvent } from 'react';

import type {
  DictionaryItemView,
  DrawingDetailView,
  DrawingFileView,
  DrawingView,
  MaterialBatchFileView,
  MaterialBatchView,
  PdfFileView,
  PlannerApi,
} from '../data/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { openIndexedPdfLocation } from '../desktop-files';

const emptyFilters = { drawingNumber: '', model: '', keyword: '', sku: '', productCategory: '', sourcePresence: 'all', outlinedPresence: 'all', brandId: '', mainCategoryId: '', projectItemId: '', colorId: '', status: '', exactDrawingNumber: false };

export function DrawingLibraryPage({ api }: { api: PlannerApi }) {
  const [view, setView] = useState<'drawing' | 'batch'>('drawing');
  const [filters, setFilters] = useState(emptyFilters);
  const [options, setOptions] = useState<Record<string, DictionaryItemView[]>>({});
  const [items, setItems] = useState<DrawingView[]>([]); const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<DrawingDetailView | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [pdfCandidates, setPdfCandidates] = useState<PdfFileView[]>([]); const [pdfKeyword, setPdfKeyword] = useState('');
  const [selectedPdfId, setSelectedPdfId] = useState(''); const [maintaining, setMaintaining] = useState(false);
  const [moreFilters, setMoreFilters] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<MaterialBatchView | null>(null);
  const [batchFiles, setBatchFiles] = useState<MaterialBatchFileView[]>([]);
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
  const loadPdfCandidates = async (keyword = '') => {
    if (!api.searchPdfFiles) return;
    const result = await api.searchPdfFiles({ keyword, presence: 'present', page: 1, pageSize: 100 });
    setPdfCandidates(result.items); setSelectedPdfId(String(result.items[0]?.id ?? ''));
  };
  const openDetail = async (item: DrawingView) => {
    try {
      setError(''); const detail = await api.getDrawing(item.id); setSelected(detail); setPdfKeyword(''); setSelectedPdfId('');
      if (!detail.readOnly) await loadPdfCandidates(); else setPdfCandidates([]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '详情加载失败'); }
  };
  const refreshDetail = async (id: number) => {
    const detail = await api.getDrawing(id); setSelected(detail);
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...detail } : item));
  };
  const changeStatus = async (target: 'active' | 'voided') => {
    if (!selected) return;
    const confirmed = window.confirm(target === 'active'
      ? '确认将该图号变更为正式使用？此操作会记录业务状态。'
      : '确认作废该图号？作废后普通界面无法恢复，但图号仍永久占用。');
    if (!confirmed) return;
    setMaintaining(true); setError('');
    try { if (target === 'active') await api.activateDrawing(selected.id); else await api.voidDrawing(selected.id); await refreshDetail(selected.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '业务状态更新失败'); }
    finally { setMaintaining(false); }
  };
  const associatePdf = async (conversionType: 'source' | 'outlined') => {
    if (!selected || !selectedPdfId) return;
    setMaintaining(true); setError('');
    try { await api.associateDrawingPdf(selected.id, Number(selectedPdfId), conversionType); await refreshDetail(selected.id); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'PDF 关联失败'); }
    finally { setMaintaining(false); }
  };
  const openLocation = async (id: number) => {
    setError(''); const result = await openIndexedPdfLocation(id);
    if (!result.ok) setError(result.error?.message ?? '打开文件位置失败');
  };
  const searchBatches = async () => {
    setLoading(true); setError('');
    try { setBatches(await api.listMaterialBatches({ search: batchSearch })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '资料批次查询失败'); }
    finally { setLoading(false); }
  };
  const openBatch = async (batch: MaterialBatchView) => {
    setError('');
    try { setSelectedBatch(batch); setBatchFiles(await api.getMaterialBatchFiles(batch.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '批次文件加载失败'); }
  };
  const dictionarySelect = (label: string, key: 'brandId' | 'mainCategoryId' | 'projectItemId' | 'colorId', type: string) =>
    <label><span>{label}</span><select aria-label={label} value={filters[key]} onChange={(event) => set(key, event.target.value)}><option value="">全部</option>{(options[type] ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>;

  return <section className="page-surface page-enter">
    <header className="page-header"><div><p className="eyebrow">DRAWING LIBRARY</p><h1>图号库</h1><p>统一检索正式规划与历史扫描图号，并核对文件完整性。</p></div><span className="record-count">{total} 条记录</span></header>
    <nav className="segmented-tabs" aria-label="图号库查看方式">
      <button type="button" aria-selected={view === 'drawing'} onClick={() => { setView('drawing'); setSelectedBatch(null); }}>按图号</button>
      <button type="button" aria-selected={view === 'batch'} onClick={() => { setView('batch'); setSelected(null); }}>按资料批次</button>
    </nav>
    {error && <p className="error-banner">{error}</p>}
    {view === 'drawing' ? <>
    <form className="filter-bar filter-grid" onSubmit={submit}>
      <label><span>完整图号</span><input aria-label="完整图号" value={filters.drawingNumber} onChange={(event) => set('drawingNumber', event.target.value)} /></label>
      <label><span>型号</span><input aria-label="型号" value={filters.model} onChange={(event) => set('model', event.target.value)} /></label>
      <label><span>关键词</span><input aria-label="关键词" value={filters.keyword} onChange={(event) => set('keyword', event.target.value)} /></label>
      {dictionarySelect('品牌', 'brandId', 'brand')}{dictionarySelect('主类别', 'mainCategoryId', 'main_category')}{dictionarySelect('项目明细', 'projectItemId', 'project_item')}{dictionarySelect('颜色', 'colorId', 'color')}
      <label><span>状态</span><select aria-label="状态" value={filters.status} onChange={(event) => set('status', event.target.value)}><option value="">全部</option><option value="reserved">已占号</option><option value="active">已生效</option><option value="voided">已作废</option><option value="historical">历史已用</option></select></label>
      <label className="check-field"><input aria-label="精确图号" type="checkbox" checked={filters.exactDrawingNumber} onChange={(event) => set('exactDrawingNumber', event.target.checked)} /><span>精确图号</span></label>
      <button className="text-button" type="button" onClick={() => setMoreFilters((value) => !value)}>{moreFilters ? '收起筛选' : '更多筛选'}</button>
      {moreFilters && <><label><span>SKU</span><input aria-label="SKU" value={filters.sku} onChange={(event) => set('sku', event.target.value)} /></label>
        <label><span>产品类别</span><input aria-label="产品类别" value={filters.productCategory} onChange={(event) => set('productCategory', event.target.value)} /></label>
        <label><span>源文件</span><select aria-label="源文件" value={filters.sourcePresence} onChange={(event) => set('sourcePresence', event.target.value)}><option value="all">全部</option><option value="present">已有</option><option value="missing">缺失</option></select></label>
        <label><span>转曲后文件</span><select aria-label="转曲后文件" value={filters.outlinedPresence} onChange={(event) => set('outlinedPresence', event.target.value)}><option value="all">全部</option><option value="present">已有</option><option value="missing">缺失</option></select></label></>}
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '检索中…' : '检索'}</button>
    </form>
    {!loading && items.length === 0 ? <EmptyState title="图号库尚无记录" description="Phase 2 完成正式占号后，记录会显示在这里。" /> :
      <DataTable items={items} onRowClick={(item) => void openDetail(item)} columns={[
        { key: 'code', label: '完整图号', render: (item) => <button className="link-button" type="button">{item.fullCode}</button> },
        { key: 'sku', label: 'SKU', render: (item) => item.sku ?? '待补录' }, { key: 'model', label: '型号', render: (item) => item.model },
        { key: 'origin', label: '来源', render: (item) => item.origin === 'planned' ? '正式规划' : '历史扫描' },
        { key: 'brand', label: '品牌', render: (item) => item.dictionaryMappingStatus === 'unmapped' ? `${item.brandName} · 字典待映射` : item.brandName },
        { key: 'item', label: '项目', render: (item) => item.projectItemName }, { key: 'color', label: '颜色', render: (item) => item.colorName },
        { key: 'files', label: '文件完整性', render: (item) => <span>{item.hasSourceFile ? '源文件已有' : '源文件缺失'} · {item.hasOutlinedFile ? '转曲后已有' : '转曲后缺失'}</span> },
        { key: 'batchUsage', label: '资料使用', render: (item) => item.batchUsage
          ? <span>{usageLabel(item.batchUsage.state)} · 出现于 {item.batchUsage.occurrenceCount} 个资料批次</span> : '未建立批次关系' },
        { key: 'status', label: '状态', render: (item) => <span className={`status-text ${item.status}`}>{statusLabel(item.status)}</span> },
      ]} renderExpandedRow={(item) => selected?.id === item.id ? <DrawingDetailPanel selected={selected} maintaining={maintaining}
        pdfKeyword={pdfKeyword} setPdfKeyword={setPdfKeyword} pdfCandidates={pdfCandidates} selectedPdfId={selectedPdfId}
        setSelectedPdfId={setSelectedPdfId} onClose={() => setSelected(null)} onStatus={changeStatus} onOpen={openLocation}
        onSearchPdf={(keyword) => loadPdfCandidates(keyword)} onAssociate={associatePdf} onError={setError} /> : null} />}
    </> : <BatchBrowser search={batchSearch} setSearch={setBatchSearch} loading={loading} batches={batches}
      selected={selectedBatch} files={batchFiles} onSearch={searchBatches} onSelect={openBatch} onOpen={openLocation} />}
  </section>;
}

const statusLabel = (status: DrawingView['status']) => status === 'active' ? '正式使用' : status === 'reserved' ? '已占号' : status === 'historical' ? '历史已用' : '作废';
const usageLabel = (status: 'current' | 'historical' | 'unbatched' | 'indeterminate') =>
  status === 'current' ? '当前使用' : status === 'historical' ? '历史使用' : status === 'indeterminate' ? '待确认' : '未归入批次';

function DrawingDetailPanel({ selected, maintaining, pdfKeyword, setPdfKeyword, pdfCandidates, selectedPdfId,
  setSelectedPdfId, onClose, onStatus, onOpen, onSearchPdf, onAssociate, onError }: {
  selected: DrawingDetailView; maintaining: boolean; pdfKeyword: string; setPdfKeyword(value: string): void;
  pdfCandidates: PdfFileView[]; selectedPdfId: string; setSelectedPdfId(value: string): void; onClose(): void;
  onStatus(target: 'active' | 'voided'): Promise<void>; onOpen(id: number): Promise<void>;
  onSearchPdf(keyword: string): Promise<void>; onAssociate(type: 'source' | 'outlined'): Promise<void>;
  onError(message: string): void;
}) {
  return <aside className="drawing-maintenance inline-drawing-detail panel-enter" aria-label="图号详情"><button className="panel-close" onClick={onClose} type="button">关闭</button>
    <p className="eyebrow">DRAWING DETAIL</p><h2>{selected.fullCode}</h2><p className="detail-name">{selected.displayName}</p>
    <dl><div><dt>产品身份</dt><dd>{selected.sku ?? '待补录'} · {selected.brandName} · {selected.model}</dd></div>
      <div><dt>类别 / 项目</dt><dd>{selected.productCategory} · {selected.mainCategoryName} · {selected.projectItemName}</dd></div>
      <div><dt>业务状态</dt><dd><span className={`status-text ${selected.status}`}>{statusLabel(selected.status)}</span></dd></div></dl>
    {selected.readOnly ? <p className="historical-read-only">{selected.readOnlyMessage}</p> : <div className="drawing-actions">
      {selected.status === 'reserved' && <button className="primary-button" disabled={maintaining} onClick={() => void onStatus('active')} type="button">正式使用</button>}
      {(selected.status === 'reserved' || selected.status === 'active') && <button className="text-button danger" disabled={maintaining} onClick={() => void onStatus('voided')} type="button">作废</button>}</div>}
    <FileSection title="源文件" present={selected.hasSourceFile} files={selected.sourceFiles ?? []} onOpen={onOpen} />
    <FileSection title="转曲后文件" present={selected.hasOutlinedFile} files={selected.outlinedFiles ?? []} onOpen={onOpen} />
    <section className="drawing-detail-section"><h3>资料批次</h3>{!selected.batchUsage || selected.batchUsage.occurrences.length === 0
      ? <p className="muted-text">尚未识别到资料批次</p>
      : <ul>{selected.batchUsage.occurrences.map((occurrence) => <li key={occurrence.batchId}>{occurrence.batchName}{occurrence.usageState === 'current' ? ' · 当前' : ''}<small>{occurrence.productDirectory} · {occurrence.files.length} 个文件实例</small></li>)}</ul>}</section>
    <section className="drawing-detail-section"><h3>当前 BOM 使用</h3>{(selected.currentBomUsage ?? []).length === 0 ? <p className="muted-text">当前 BOM 未使用此图号</p>
      : <ul>{selected.currentBomUsage.map((usage) => <li key={`${usage.bomVersionId}-${usage.projectItemId}`}>{usage.model} · {usage.colorName} · BOM v{usage.versionNumber}<small>{usage.projectItemName} · 数量 {usage.quantity}{usage.usesWhiteMaterial ? ' · 引用白色物料' : ''}</small></li>)}</ul>}</section>
    {!selected.readOnly && <section className="drawing-detail-section pdf-association"><h3>关联现有 PDF 索引</h3>
      <div className="pdf-search"><input aria-label="搜索现有 PDF" value={pdfKeyword} onChange={(event) => setPdfKeyword(event.target.value)} placeholder="文件名或相对路径" />
        <button className="secondary-button" onClick={() => void onSearchPdf(pdfKeyword).catch((reason) => onError(reason instanceof Error ? reason.message : 'PDF 搜索失败'))} type="button">搜索 PDF</button></div>
      <label><span>现有 PDF 索引</span><select aria-label="现有 PDF 索引" value={selectedPdfId} onChange={(event) => setSelectedPdfId(event.target.value)}><option value="">请选择当前存在的 PDF</option>
        {pdfCandidates.map((file) => <option key={file.id} value={file.id}>{file.fileName} · {file.relativePath}</option>)}</select></label>
      <div className="drawing-actions"><button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('source')} type="button">关联为源文件</button>
        <button className="secondary-button" disabled={!selectedPdfId || maintaining} onClick={() => void onAssociate('outlined')} type="button">关联为转曲后文件</button></div>
      <p className="muted-text">仅更新当前资料库索引，不移动、复制、重命名或删除磁盘文件。</p></section>}
  </aside>;
}

function BatchBrowser({ search, setSearch, loading, batches, selected, files, onSearch, onSelect, onOpen }: {
  search: string;
  setSearch(value: string): void;
  loading: boolean;
  batches: MaterialBatchView[];
  selected: MaterialBatchView | null;
  files: MaterialBatchFileView[];
  onSearch(): Promise<void>;
  onSelect(batch: MaterialBatchView): Promise<void>;
  onOpen(id: number): Promise<void>;
}) {
  return <section className="material-batch-browser">
    <form className="filter-bar batch-search" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}>
      <label><span>型号 / SKU / 批次</span><input aria-label="搜索型号或批次" value={search}
        onChange={(event) => setSearch(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={loading}>{loading ? '查询中…' : '查询资料批次'}</button>
    </form>
    {batches.length === 0 ? <EmptyState title="请输入型号查看资料批次" description="例如输入 T40，可查看当前批次和全部历史批次。" /> :
      <div className="material-batch-layout"><div className="material-batch-list">{batches.map((batch) =>
        <article key={batch.id} className={`material-batch-card ${selected?.id === batch.id ? 'selected' : ''}`}>
          <div><strong>{batch.name}</strong><span className={`usage-badge ${batch.currentState}`}>
            {batch.recognitionStatus === 'pending' ? '待确认' : usageLabel(batch.currentState)}</span></div>
          <small>{batch.sku ?? 'SKU待识别'} · {batch.model ?? '型号待识别'} · {batch.fileCount} 个文件实例</small>
          <button className="text-button" type="button" aria-label={`查看批次 ${batch.name}`} onClick={() => void onSelect(batch)}>查看批次</button>
        </article>)}</div>
        {selected && <section className="batch-file-panel" aria-label="资料批次文件">
          <h2>{selected.productDirectory}</h2><p>{selected.name} · {usageLabel(selected.currentState)}</p>
          {files.length === 0 ? <p className="muted-text">该批次暂无 PDF 索引</p> : <ul>{files.map((file) =>
            <li key={file.pdfIndexId} className="drawing-file-row"><span><strong>{file.fileName}</strong>
              <small>{file.fullCode ?? '未可靠识别图号'} · {file.conversionType === 'source' ? '源文件' : '转曲后'}</small>
              <small>{file.relativePath}</small></span>
              <button className="text-button" type="button" disabled={!file.isPresent}
                onClick={() => void onOpen(file.pdfIndexId)}>{file.isPresent ? '打开位置' : '文件缺失'}</button></li>)}</ul>}
        </section>}
      </div>}
  </section>;
}

function FileSection({ title, present, files, onOpen }: { title: string; present: boolean; files: DrawingFileView[]; onOpen(id: number): Promise<void> }) {
  return <section className="drawing-detail-section"><h3>{title}<span className={`presence-label ${present ? 'present' : 'missing'}`}>{present ? '已有' : '缺失'}</span></h3>
    {files.length === 0 ? <p className="muted-text">暂无索引记录</p> : <ul>{files.map((file) => <li key={file.pdfIndexId} className="drawing-file-row">
      <span>{file.fileName}<small>{file.relativePath} · {file.isPresent ? '当前存在' : '当前缺失'}</small></span>
      <button className="text-button" type="button" disabled={!file.isPresent}
        aria-label={`打开${title} ${file.fileName} 的位置`} onClick={() => void onOpen(file.pdfIndexId)}>{file.isPresent ? '打开位置' : '文件缺失'}</button>
    </li>)}</ul>}</section>;
}
