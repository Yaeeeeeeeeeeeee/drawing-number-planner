import { ViewportRegion } from '../components/ViewportRegion';
import { PageHeader } from '../components/PageHeader';
import { Fragment, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';

import type { PlannerApi, ProductQrCodeFilters, ProductQrCodeView, ProductView, QrFileView, QrPurposeView } from '../data/client';
import { DataTable } from '../components/DataTable';
import { QueryFeedback, type QueryState } from '../components/QueryFeedback';
import { EmptyState } from '../components/EmptyState';
import { useDesktopQrFile } from '../desktop-qr-files';
import { createQrMockApi, isQrMockEnabled } from './qr-mock';

const matchLabel = (item: ProductQrCodeView) => {
  const statuses = [...new Set([...item.files, ...item.pendingFiles].map(file => file.matchStatus))];
  if (statuses.includes('matched') && statuses.includes('pending')) return `部分已匹配 · 仍有待确认${statuses.includes('unmatched') ? ' · 未匹配' : ''}`;
  return statuses.map(status => status === 'matched' ? '已匹配' : status === 'pending' ? '待确认' : '未匹配').join(' · ') || '未匹配';
};
function QrPath({ file }: { file: QrFileView }) { const [feedback,setFeedback]=useState('');return <details className="qr-path"><summary>查看路径</summary><span>{file.relativePath}</span><button type="button" className="text-button" onClick={async()=>{try {await navigator.clipboard.writeText(file.relativePath);setFeedback('已复制');}catch {setFeedback('请选中路径复制');}}}>复制路径</button><small role="status">{feedback}</small></details>; }


function QrFilesTable({files,pending=false,actions}:{files:QrFileView[];pending?:boolean;actions:(file:QrFileView)=>ReactNode}) {
  const [expanded,setExpanded]=useState<number|null>(null);
  const [feedback,setFeedback]=useState('');
  return <ViewportRegion className="qr-files-table"><table><thead><tr><th>文件名</th><th>文件状态</th><th>来源 / 匹配信息</th><th>操作</th></tr></thead><tbody>{files.map(file=><Fragment key={file.id}>
    <tr><td><strong>{file.fileName}</strong><button id={`qr-path-toggle-${file.id}`} type="button" className="text-button qr-file-path-toggle" aria-expanded={expanded===file.id} aria-controls={`qr-file-path-${file.id}`} onClick={()=>{setExpanded(expanded===file.id?null:file.id);setFeedback('');}}>{expanded===file.id?'收起路径':'查看路径'}</button></td><td><span className={file.isPresent?'qr-good':'qr-danger'}>{file.isPresent?'文件可用':'文件已缺失'}</span></td><td><span className={file.matchStatus==='pending'?'qr-warning':file.matchStatus==='matched'?'qr-good':'qr-brown'}>{file.matchStatus==='matched'?'已匹配':file.matchStatus==='pending'?'待确认':'未匹配'}</span>{file.detectedIdentifier && <small>标识：{file.detectedIdentifier}</small>}{pending && !file.isPresent && <small className="qr-neutral">文件缺失，关联将由现有服务校验拒绝</small>}</td><td><div className="row-actions">{actions(file)}</div></td></tr>
    {expanded===file.id && <tr className="qr-path-expanded-row"><td colSpan={4}><div id={`qr-file-path-${file.id}`} className="qr-path-panel"><span>{file.relativePath}</span><div className="qr-path-copy"><button type="button" className="text-button" onClick={async()=>{try{await navigator.clipboard.writeText(file.relativePath);setFeedback('已复制');}catch{setFeedback('请选中完整路径复制');}}}>复制路径</button><small role="status">{feedback}</small></div></div></td></tr>}
  </Fragment>)}</tbody></table></ViewportRegion>;
}
const purposeLabels: Record<string, string> = { user_manual: '说明书', warranty: '售后', recipe: '菜谱' };
const businessLabel = (status: 'active' | 'inactive') => status === 'active' ? '启用中' : '已停用';
function BusinessStatus({status}:{status:'active'|'inactive'}) { return <span className={`qr-business-status ${status}`}>{businessLabel(status)}</span>; }
const fileLabel = (files: QrFileView[]) => {
  if (files.length === 0) return '未关联文件';
  const present = files.filter((file) => file.isPresent).length;
  if (present === 0) return '文件已缺失';
  return present === files.length ? '文件可用' : '部分缺失';
};
const formatTime = (value: string) => new Date(value).toLocaleString('zh-CN', { hour12: false });
interface QrProductGroup { id: number; sku: string | null; model: string; productCategory: string; codes: ProductQrCodeView[] }

const groupByProduct = (items: ProductQrCodeView[]): QrProductGroup[] => {
  const groups = new Map<number, QrProductGroup>();
  for (const item of items) {
    const group = groups.get(item.productId);
    if (group) group.codes.push(item);
    else groups.set(item.productId, { id: item.productId, sku: item.sku, model: item.model, productCategory: item.productCategory, codes: [item] });
  }
  return [...groups.values()];
};

export function QrCodesPage(props: { api: PlannerApi; initialQrCodeId?: number | null; onOpened?: () => void }) {
  const mock = isQrMockEnabled();
  const mockApi = useMemo(() => mock ? createQrMockApi() : null, [mock]);
  return <>{mock && <p className="info-banner">开发预览 Mock · 仅内存数据；不连接真实 API、数据库、附件或桌面文件系统。</p>}<QrWorkspace {...props} api={mockApi ?? props.api} mock={mock} /></>;
}
function QrWorkspace({ api, initialQrCodeId, onOpened, mock = false }: {
  api: PlannerApi; initialQrCodeId?: number | null; onOpened?: () => void; mock?: boolean;
}) {
  const [queryState, setQueryState] = useState<QueryState>('idle');
  const [queryError, setQueryError] = useState('');
  const [queriedFilters, setQueriedFilters] = useState<ProductQrCodeFilters>({});
  const [items, setItems] = useState<ProductQrCodeView[]>([]);
  const [vocabulary, setVocabulary] = useState<ProductQrCodeView[]>([]);
  const [products, setProducts] = useState<ProductView[]>([]); const [purposeOptions, setPurposeOptions] = useState<QrPurposeView[]>([]);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ProductQrCodeView | null>(null);
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const [purposeId, setPurposeId] = useState(''); const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [fileStatus, setFileStatus] = useState<'all' | 'present' | 'missing' | 'none'>('all');
  const [name, setName] = useState(''); const [targetUrl, setTargetUrl] = useState('');
  const [creating, setCreating] = useState(false); const [managingPurposes, setManagingPurposes] = useState(false);
  const [createProductId, setCreateProductId] = useState(''); const [createPurposeId, setCreatePurposeId] = useState('');
  const [createName, setCreateName] = useState(''); const [createUrl, setCreateUrl] = useState('');
  const [createStatus, setCreateStatus] = useState<'active' | 'inactive'>('inactive');
  const [pendingCreateFiles, setPendingCreateFiles] = useState<QrFileView[]>([]); const [createQrFileId, setCreateQrFileId] = useState('');
  const [newPurposeKey, setNewPurposeKey] = useState(''); const [newPurposeEnglish, setNewPurposeEnglish] = useState('');
  const [newPurposeDisplay, setNewPurposeDisplay] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [preview, setPreview] = useState<string | null>(null);
  const [urlCopyFeedback, setUrlCopyFeedback] = useState('');

  const categories = useMemo(() => [...new Set(vocabulary.map((item) => item.productCategory))], [vocabulary]);
  const purposes = useMemo(() => [...new Map(vocabulary.map((item) => [item.purposeId, item])).values()], [vocabulary]);
  const groups = useMemo(() => groupByProduct(items), [items]);
  const replace = (updated: ProductQrCodeView) => {
    setUrlCopyFeedback('');
    setSelected(updated); setName(updated.name); setTargetUrl(updated.targetUrl ?? '');
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  };
  const load = async (filters: ProductQrCodeFilters = {}, setFilterVocabulary = false) => {
    setQueryState('loading'); setQueryError(''); setQueriedFilters(filters);
    try { setError(''); const result = await api.listQrCodes(filters); setItems(result.items); setQueryState('ready'); if (setFilterVocabulary) setVocabulary(result.items); }
    catch (reason) { setQueryState('failed'); setQueryError(reason instanceof Error ? reason.message : '二维码记录加载失败'); }
  };
  const open = async (id: number) => {
    try { setError(''); const detail = await api.getQrCode(id); replace(detail); setPreview(null); onOpened?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '二维码详情加载失败'); }
  };

  useEffect(() => {
    void load({}, true);
    if (typeof api.listQrPurposes === 'function') void api.listQrPurposes().then((result) => setPurposeOptions(result.items)).catch(() => undefined);
    if (typeof api.listProducts === 'function') void api.listProducts({ status: 'active' }).then(setProducts).catch(() => undefined);
  }, []);
  useEffect(() => { if (initialQrCodeId != null) void open(initialQrCodeId); }, [initialQrCodeId]);
  useEffect(() => {
    if (!creating || typeof api.listPendingQrFiles !== 'function') return;
    const productId = Number(createProductId || products[0]?.id || groups[0]?.id);
    const purposeIdValue = Number(createPurposeId || purposeOptions[0]?.id || purposes[0]?.purposeId);
    if (!productId || !purposeIdValue) return;
    void api.listPendingQrFiles(productId, purposeIdValue).then((result) => {
      setPendingCreateFiles(result.items); setCreateQrFileId(result.items[0] ? String(result.items[0].id) : '');
    }).catch(() => setPendingCreateFiles([]));
  }, [creating, createProductId, createPurposeId, products, purposeOptions, purposes]);

  const submitFilters = (event: FormEvent) => {
    event.preventDefault(); setSelected(null); setPreview(null); setExpandedProductId(null);
    void load({ ...(search.trim() ? { search: search.trim() } : {}), ...(category ? { productCategory: category } : {}),
      ...(purposeId ? { purposeId: Number(purposeId) } : {}), status, fileStatus });
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); if (!selected) return; setMessage(''); setError('');
    try { replace(await api.updateQrCode(selected.id, { name: name.trim(), targetUrl: targetUrl.trim() || null })); setMessage('二维码信息已保存。'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '二维码信息保存失败'); }
  };
  const setBusinessStatus = async (next: 'active' | 'inactive') => {
    if (!selected) return; setMessage(''); setError('');
    try { replace(next === 'active' ? await api.activateQrCode(selected.id) : await api.deactivateQrCode(selected.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '二维码状态更新失败'); }
  };
  const associate = async (file: QrFileView) => {
    if (!selected) return; setMessage(''); setError('');
    try { replace(await api.associateQrFile(selected.id, file.id)); setMessage('已完成文件人工关联，二维码业务状态保持不变。'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '二维码文件关联失败'); }
  };
  const createCode = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    const productId = Number(createProductId || products[0]?.id || groups[0]?.id);
    const availablePurposes = purposeOptions.length ? purposeOptions : purposes.map((item) => ({ ...item,
      defaultForAll: false, productCategories: [] }));
    const selectedPurposeId = Number(createPurposeId || availablePurposes[0]?.id || purposes[0]?.purposeId);
    try {
      const created = await api.createQrCode({ productId, purposeId: selectedPurposeId, name: createName.trim(),
        targetUrl: createUrl.trim() || null, status: createStatus,
        ...(createQrFileId ? { qrFileId: Number(createQrFileId) } : {}) });
      setItems((current) => [...current, created]); setVocabulary((current) => [...current, created]);
      setCreating(false); setCreateName(''); setCreateUrl(''); setCreateStatus('inactive'); setCreateQrFileId('');
      setPendingCreateFiles([]); setMessage('二维码已新增。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '二维码新增失败'); }
  };
  const createPurpose = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setMessage('');
    try {
      const purpose = await api.createQrPurpose({ key: newPurposeKey, englishName: newPurposeEnglish,
        displayName: newPurposeDisplay, defaultForAll: false, productCategories: [] });
      setPurposeOptions((current) => [...current, purpose]); setManagingPurposes(false);
      setNewPurposeKey(''); setNewPurposeEnglish(''); setNewPurposeDisplay(''); setMessage('二维码用途已新增。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '二维码用途新增失败'); }
  };
  const deleteSelected = async () => {
    if (!selected || !window.confirm(`确认删除二维码“${selected.name}”吗？`)) return;
    try { await api.deleteQrCode(selected.id); setItems((current) => current.filter((item) => item.id !== selected.id));
      setVocabulary((current) => current.filter((item) => item.id !== selected.id)); setSelected(null); setMessage('二维码已删除。'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '二维码删除失败'); }
  };
  const fileAction = async (file: QrFileView, action: 'open' | 'show' | 'preview') => {
    if (mock) { if (action === 'preview') setPreview('data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100"><rect width="240" height="100" fill="#f3f6fa"/><text x="20" y="55" fill="#536176">Mock preview — not a real QR</text></svg>')); else setMessage('Mock 文件操作仅内存预览，不访问磁盘。'); return; }
    const result = await useDesktopQrFile(file.relativePath, action);
    if (!result.ok) { setError(result.error?.message ?? '二维码文件操作失败'); return; }
    if (result.previewDataUrl) setPreview(result.previewDataUrl);
  };

  if (selected) return <section className="page-surface page-enter qr-page qr-detail-page">
    <PageHeader title={selected.name} description={<>{selected.sku ?? 'SKU 待补录'} · {selected.model} · {selected.productCategory} · {selected.displayName}</>}>
      <div className="header-actions"><button className="secondary-button" type="button" onClick={() => { setSelected(null); setPreview(null); }}>返回列表</button>

        </div></PageHeader>
    {error && <p className="error-banner">{error}</p>}{message && <p className="success-banner">{message}</p>}
    <div className="qr-detail-meta"><div><span>SKU</span><strong>{selected.sku ?? '待补录'}</strong></div><div><span>型号</span><strong>{selected.model}</strong></div><div><span>产品类别</span><strong>{selected.productCategory}</strong></div><div><span>用途</span><strong>{purposeLabels[selected.key] ?? selected.displayName}</strong></div><div><span>业务状态</span><strong>{<BusinessStatus status={selected.status}/>}</strong></div><div><span>文件状态</span><strong>{fileLabel(selected.files)}</strong></div><div><span>扫描匹配状态</span><strong>{matchLabel(selected)}</strong></div><div><span>创建时间</span><strong>{formatTime(selected.createdAt)}</strong></div><div><span>更新时间</span><strong>{formatTime(selected.updatedAt)}</strong></div>
    {selected.targetUrl && <details className="qr-path qr-url"><summary>查看完整网址</summary><div className="qr-path-panel"><span>{selected.targetUrl}</span><button type="button" className="text-button" onClick={async()=>{try {await navigator.clipboard.writeText(selected.targetUrl!);setUrlCopyFeedback('已复制');}catch {setUrlCopyFeedback('复制不可用，请选中网址复制');}}}>复制网址</button><small role="status">{urlCopyFeedback}</small></div></details>}
    </div>
    <form className="editor-strip panel-enter" onSubmit={save}><div className="form-grid qr-form-grid"><label><span>二维码名称</span><input aria-label="二维码名称" value={name} onChange={(event) => setName(event.target.value)} required /></label><label><span>目标网址</span><input aria-label="二维码网址" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="可留空" /></label></div><div className="form-actions"><button className="primary-button" type="submit">保存二维码信息</button></div></form>
    <section className="qr-file-section"><h2>已关联文件</h2>{selected.files.length===0?<p className="muted-text">尚未关联二维码文件。</p>:<QrFilesTable files={selected.files} actions={file=><><button className="text-button" type="button" disabled={!file.isPresent} title={!file.isPresent ? '文件缺失，无法查看' : undefined} onClick={()=>void fileAction(file,file.mimeType.startsWith('image/')?'preview':'open')}>查看文件</button><button className="text-button" type="button" disabled={!file.isPresent} title={!file.isPresent ? '文件缺失，无法定位；可查看并复制记录路径' : undefined} onClick={()=>void fileAction(file,'show')}>打开所在位置</button></>}/>}
      {preview && <div><button type="button" className="text-button" onClick={()=>setPreview(null)}>收起预览</button><img className="qr-preview" src={preview} alt="二维码图片预览"/></div>}</section>
    <section className="qr-file-section"><h2>待人工确认</h2><p className="muted-text">待确认文件仅在确认匹配后关联，业务状态保持独立。</p>{selected.pendingFiles.length===0?<p className="muted-text">没有可关联的待确认文件。</p>:<QrFilesTable files={selected.pendingFiles} pending actions={file=><button className="text-button" type="button" disabled={!file.isPresent} title={!file.isPresent ? '文件缺失，不能关联；现有服务校验保持不变' : undefined} onClick={()=>void associate(file)}>关联此文件</button>}/>}</section>
    <section className="qr-maintenance"><strong>状态维护</strong><span>{<BusinessStatus status={selected.status}/>}</span><button className="primary-button" type="button" onClick={() => void setBusinessStatus(selected.status === 'active' ? 'inactive' : 'active')}>{selected.status === 'active' ? '停用二维码' : '启用二维码'}</button></section>
    <section className="qr-danger-zone"><strong>危险操作</strong><span>删除仍受文件和 BOM 引用检查保护。</span><button className="text-button danger-text" type="button" onClick={() => void deleteSelected()}>删除二维码</button></section>
  </section>;

  const availableProducts = products.length ? products : groups.map((group) => ({ id: group.id, sku: group.sku,
    model: group.model, productCategory: group.productCategory, status: 'active' as const } as ProductView));
  const availablePurposes = purposeOptions.length ? purposeOptions : purposes.map((item) => ({ id: item.purposeId,
    key: item.key, englishName: item.englishName, displayName: item.displayName, status: item.purposeStatus,
    defaultForAll: false, productCategories: [] }));
  return <section className="page-surface page-enter qr-page"><PageHeader title="二维码管理" description="集中维护产品二维码用途、网址、业务状态与资料文件状态。"><div className="header-actions"><button className="secondary-button" type="button" onClick={() => setManagingPurposes((value) => !value)}>新增用途</button><button className="primary-button" type="button" onClick={() => setCreating((value) => !value)}>新增二维码</button></div></PageHeader>{error && <p className="error-banner">{error}</p>}{message && <p className="success-banner">{message}</p>}
    {managingPurposes && <form className="editor-strip panel-enter qr-purpose-create" onSubmit={createPurpose}><div className="form-grid"><label><span>用途编码</span><input aria-label="用途编码" value={newPurposeKey} onChange={(event) => setNewPurposeKey(event.target.value)} required /></label><label><span>用途英文</span><input aria-label="用途英文" value={newPurposeEnglish} onChange={(event) => setNewPurposeEnglish(event.target.value)} required /></label><label><span>用途名称</span><input aria-label="用途名称" value={newPurposeDisplay} onChange={(event) => setNewPurposeDisplay(event.target.value)} required /></label></div><div className="form-actions"><button className="primary-button" type="submit">保存新增用途</button><button className="secondary-button" type="button" onClick={() => setManagingPurposes(false)}>取消</button></div></form>}
    {creating && <form className="editor-strip panel-enter qr-code-create" onSubmit={createCode}><div className="form-grid"><label><span>产品</span><select aria-label="新增二维码产品" value={createProductId || String(availableProducts[0]?.id ?? '')} onChange={(event) => setCreateProductId(event.target.value)}>{availableProducts.map((product) => <option key={product.id} value={product.id}>{product.sku ?? '待补录'} · {product.model}</option>)}</select></label><label><span>二维码用途</span><select aria-label="新增二维码用途" value={createPurposeId || String(availablePurposes[0]?.id ?? '')} onChange={(event) => setCreatePurposeId(event.target.value)}>{availablePurposes.filter((purpose) => purpose.status === 'active').map((purpose) => <option key={purpose.id} value={purpose.id}>{purpose.displayName}</option>)}</select></label><label><span>业务状态</span><select aria-label="新增二维码状态" value={createStatus} onChange={(event) => setCreateStatus(event.target.value as typeof createStatus)}><option value="inactive">未启用</option><option value="active">启用</option></select></label><label><span>待确认关联文件</span><select aria-label="待确认关联文件" value={createQrFileId} onChange={(event) => setCreateQrFileId(event.target.value)}><option value="">暂不关联</option>{pendingCreateFiles.map((file) => <option key={file.id} value={file.id}>{file.fileName}</option>)}</select></label><label><span>二维码名称</span><input aria-label="二维码名称" value={createName} onChange={(event) => setCreateName(event.target.value)} required /></label><label><span>目标网址</span><input aria-label="新增二维码网址" value={createUrl} onChange={(event) => setCreateUrl(event.target.value)} placeholder="可留空" /></label></div><div className="form-actions"><button className="primary-button" type="submit">保存新增二维码</button><button className="secondary-button" type="button" onClick={() => setCreating(false)}>取消</button></div></form>}
    <form className="filter-bar qr-filter" onSubmit={submitFilters}><label><span>SKU / 型号</span><input aria-label="SKU / 型号" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span>产品类别</span><select aria-label="产品类别" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>用途</span><select aria-label="用途" value={purposeId} onChange={(event) => setPurposeId(event.target.value)}><option value="">全部</option>{purposes.map((purpose) => <option key={purpose.purposeId} value={purpose.purposeId}>{purposeLabels[purpose.key] ?? purpose.displayName}</option>)}</select></label><label><span>业务状态</span><select aria-label="业务状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">全部</option><option value="active">启用中</option><option value="inactive">已停用</option></select></label><label><span>文件状态</span><select aria-label="文件状态" value={fileStatus} onChange={(event) => setFileStatus(event.target.value as typeof fileStatus)}><option value="all">全部</option><option value="present">文件可用</option><option value="missing">文件已缺失</option><option value="none">未关联文件</option></select></label><button className="primary-button" type="submit">筛选</button></form>
    {queryState !== 'ready' ? <QueryFeedback state={queryState} error={queryError} onRetry={() => void load(queriedFilters, Object.keys(queriedFilters).length === 0)}/> : groups.length === 0 ? <EmptyState title={Object.values(queriedFilters).some(value => value !== 'all' && value !== '') ? '没有符合筛选条件的二维码' : '还没有二维码记录'} description="建立产品档案后，适用的二维码用途会显示在这里。" symbol="二" /> : <DataTable fillViewport items={groups} columns={[
      {key:'product',label:'产品 · SKU / 型号',render:g=><span className="qr-product">{g.sku ?? '待补录'} · {g.model} · {g.productCategory}</span>},
      {key:'count',label:'二维码用途',render:g=>`${g.codes.length} 项`},
      {key:'attention',label:'需关注',render:g=><span className="qr-summary">{g.codes.some(c=>c.files.some(f=>!f.isPresent)) && <span className="qr-danger">文件缺失</span>}{g.codes.some(c=>c.pendingFiles.length>0) && <span className="qr-warning">待确认</span>}</span>},
      {key:'actions',label:'操作',render:g=><button type="button" className="text-button" aria-expanded={expandedProductId===g.id} aria-controls={`qr-purposes-${g.id}`} aria-label={`${expandedProductId===g.id?'收起':'展开'} ${g.model} 的二维码用途`} onClick={()=>setExpandedProductId(expandedProductId===g.id?null:g.id)}>{expandedProductId===g.id?'收起用途':'查看用途'}</button>}
    ]} renderExpandedRow={g=>expandedProductId!==g.id?null:<div id={`qr-purposes-${g.id}`} className="qr-subtable"><table><thead><tr>{['用途','二维码名称','业务状态','文件状态','匹配状态','操作'].map(t=><th key={t}>{t}</th>)}</tr></thead><tbody>{g.codes.map(item=><tr key={item.id}><td>{purposeLabels[item.key]??item.displayName}</td><td>{item.name}</td><td className="qr-neutral">{<BusinessStatus status={item.status}/>}</td><td><span className={item.files.some(f=>!f.isPresent)?'qr-danger':item.files.length?'qr-good':'qr-neutral'}>{fileLabel(item.files)}</span></td><td><span className={item.pendingFiles.length?'qr-warning':item.files.length?'qr-good':'qr-brown'}>{matchLabel(item)}</span></td><td><button type="button" className="text-button" aria-label={`查看 ${item.name}`} onClick={()=>void open(item.id)}>查看</button></td></tr>)}</tbody></table></div>} />}
  </section>;
}
