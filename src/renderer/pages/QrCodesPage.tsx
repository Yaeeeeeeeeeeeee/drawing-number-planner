import { useEffect, useMemo, useState, type FormEvent } from 'react';

import type { PlannerApi, ProductQrCodeFilters, ProductQrCodeView, QrFileView } from '../data/client';
import { DataTable } from '../components/DataTable';
import { EmptyState } from '../components/EmptyState';
import { useDesktopQrFile } from '../desktop-qr-files';

const purposeLabels: Record<string, string> = { user_manual: '说明书', warranty: '售后', recipe: '菜谱' };
const businessLabel = (status: 'active' | 'inactive') => status === 'active' ? '启用中' : '已停用';
const fileLabel = (files: QrFileView[]) => files.length === 0 ? '未关联文件'
  : files.some((file) => file.isPresent) ? '文件可用' : '文件已缺失';
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

export function QrCodesPage({ api, initialQrCodeId, onOpened }: {
  api: PlannerApi; initialQrCodeId?: number | null; onOpened?: () => void;
}) {
  const [items, setItems] = useState<ProductQrCodeView[]>([]);
  const [vocabulary, setVocabulary] = useState<ProductQrCodeView[]>([]);
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [selected, setSelected] = useState<ProductQrCodeView | null>(null);
  const [search, setSearch] = useState(''); const [category, setCategory] = useState('');
  const [purposeId, setPurposeId] = useState(''); const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [fileStatus, setFileStatus] = useState<'all' | 'present' | 'missing' | 'none'>('all');
  const [name, setName] = useState(''); const [targetUrl, setTargetUrl] = useState('');
  const [message, setMessage] = useState(''); const [error, setError] = useState(''); const [preview, setPreview] = useState<string | null>(null);

  const categories = useMemo(() => [...new Set(vocabulary.map((item) => item.productCategory))], [vocabulary]);
  const purposes = useMemo(() => [...new Map(vocabulary.map((item) => [item.purposeId, item])).values()], [vocabulary]);
  const groups = useMemo(() => groupByProduct(items), [items]);
  const replace = (updated: ProductQrCodeView) => {
    setSelected(updated); setName(updated.name); setTargetUrl(updated.targetUrl ?? '');
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  };
  const load = async (filters: ProductQrCodeFilters = {}, setFilterVocabulary = false) => {
    try { setError(''); const result = await api.listQrCodes(filters); setItems(result.items); if (setFilterVocabulary) setVocabulary(result.items); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '二维码记录加载失败'); }
  };
  const open = async (id: number) => {
    try { setError(''); const detail = await api.getQrCode(id); replace(detail); setPreview(null); onOpened?.(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '二维码详情加载失败'); }
  };

  useEffect(() => { void load({}, true); }, []);
  useEffect(() => { if (initialQrCodeId != null) void open(initialQrCodeId); }, [initialQrCodeId]);

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
  const fileAction = async (file: QrFileView, action: 'open' | 'show' | 'preview') => {
    const result = await useDesktopQrFile(file.relativePath, action);
    if (!result.ok) { setError(result.error?.message ?? '二维码文件操作失败'); return; }
    if (result.previewDataUrl) setPreview(result.previewDataUrl);
  };

  if (selected) return <section className="page-surface page-enter qr-detail-page">
    <header className="page-header"><div><p className="eyebrow">QR MANAGEMENT</p><h1>{selected.name}</h1><p>{selected.sku ?? 'SKU 待补录'} · {selected.model} · {selected.productCategory} · {selected.displayName}</p></div>
      <div className="header-actions"><button className="secondary-button" type="button" onClick={() => { setSelected(null); setPreview(null); }}>返回列表</button>
        <button className="primary-button" type="button" onClick={() => void setBusinessStatus(selected.status === 'active' ? 'inactive' : 'active')}>{selected.status === 'active' ? '停用二维码' : '启用二维码'}</button></div></header>
    {error && <p className="error-banner">{error}</p>}{message && <p className="success-banner">{message}</p>}
    <div className="qr-detail-meta"><div><span>SKU</span><strong>{selected.sku ?? '待补录'}</strong></div><div><span>型号</span><strong>{selected.model}</strong></div><div><span>产品类别</span><strong>{selected.productCategory}</strong></div><div><span>用途</span><strong>{purposeLabels[selected.key] ?? selected.displayName}</strong></div><div><span>业务状态</span><strong>{businessLabel(selected.status)}</strong></div><div><span>文件状态</span><strong>{fileLabel(selected.files)}</strong></div><div><span>创建时间</span><strong>{formatTime(selected.createdAt)}</strong></div><div><span>更新时间</span><strong>{formatTime(selected.updatedAt)}</strong></div></div>
    <form className="editor-strip panel-enter" onSubmit={save}><div className="form-grid qr-form-grid"><label><span>二维码名称</span><input aria-label="二维码名称" value={name} onChange={(event) => setName(event.target.value)} required /></label><label><span>目标网址</span><input aria-label="二维码网址" value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} placeholder="可留空" /></label></div><div className="form-actions"><button className="primary-button" type="submit">保存二维码信息</button></div></form>
    <section className="qr-file-section"><h2>已关联文件</h2>{selected.files.length === 0 ? <p className="muted-text">尚未关联二维码文件。</p> : <ul className="qr-file-list">{selected.files.map((file) => <li key={file.id}><div><strong>{file.fileName}</strong><small>{file.relativePath}</small><span>{file.isPresent ? '文件可用' : '文件已缺失'}</span></div><div className="row-actions"><button className="text-button" type="button" onClick={() => void fileAction(file, file.mimeType.startsWith('image/') ? 'preview' : 'open')}>查看文件</button><button className="text-button" type="button" onClick={() => void fileAction(file, 'show')}>打开所在位置</button></div></li>)}</ul>}
      {preview && <img className="qr-preview" src={preview} alt="二维码图片预览" />}</section>
    <section className="qr-file-section"><h2>待人工确认</h2><p className="muted-text">待确认文件会保留在索引中，只有确认匹配后才会关联到当前二维码。</p>{selected.pendingFiles.length === 0 ? <p className="muted-text">没有可关联的待确认文件。</p> : <ul className="qr-file-list">{selected.pendingFiles.map((file) => <li key={file.id}><div><strong>{file.fileName}</strong><small>{file.relativePath}</small><span>{file.isPresent ? '文件可用' : '文件已缺失'}</span></div><button className="secondary-button" type="button" onClick={() => void associate(file)}>关联此文件</button></li>)}</ul>}</section>
  </section>;

  return <section className="page-surface page-enter"><header className="page-header"><div><p className="eyebrow">QR MANAGEMENT</p><h1>二维码管理</h1><p>集中维护产品二维码用途、网址、业务状态与资料文件状态。</p></div></header>{error && <p className="error-banner">{error}</p>}
    <form className="filter-bar qr-filter" onSubmit={submitFilters}><label><span>SKU / 型号</span><input aria-label="SKU / 型号" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label><span>产品类别</span><select aria-label="产品类别" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">全部</option>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label><span>用途</span><select aria-label="用途" value={purposeId} onChange={(event) => setPurposeId(event.target.value)}><option value="">全部</option>{purposes.map((purpose) => <option key={purpose.purposeId} value={purpose.purposeId}>{purposeLabels[purpose.key] ?? purpose.displayName}</option>)}</select></label><label><span>业务状态</span><select aria-label="业务状态" value={status} onChange={(event) => setStatus(event.target.value as typeof status)}><option value="all">全部</option><option value="active">启用中</option><option value="inactive">已停用</option></select></label><label><span>文件状态</span><select aria-label="文件状态" value={fileStatus} onChange={(event) => setFileStatus(event.target.value as typeof fileStatus)}><option value="all">全部</option><option value="present">文件可用</option><option value="missing">文件已缺失</option><option value="none">未关联文件</option></select></label><button className="primary-button" type="submit">筛选</button></form>
    {groups.length === 0 ? <EmptyState title="还没有二维码记录" description="建立产品档案后，适用的二维码用途会显示在这里。" symbol="二" /> : <DataTable items={groups} columns={[{ key: 'model', label: 'SKU / 型号', render: (item) => <div className="file-product"><strong>{item.sku ?? '待补录'}</strong><small>{item.model}</small></div> }, { key: 'category', label: '产品类别', render: (item) => item.productCategory }, { key: 'count', label: '二维码用途', render: (item) => `${item.codes.length} 项` }, { key: 'actions', label: '操作', render: (item) => <button className="text-button" type="button" aria-label={`${expandedProductId === item.id ? '收起' : '展开'} ${item.model} 的二维码用途`} onClick={() => setExpandedProductId((current) => current === item.id ? null : item.id)}>{expandedProductId === item.id ? '收起用途' : '查看用途'}</button> }]} renderExpandedRow={(group) => expandedProductId !== group.id ? null : <div className="qr-purpose-list">{group.codes.map((item) => <div className="qr-purpose-row" key={item.id}><div><strong>{purposeLabels[item.key] ?? item.displayName}</strong><small>{item.name}</small></div><span>{businessLabel(item.status)}</span><span>{fileLabel(item.files)}</span><button className="text-button" type="button" aria-label={`查看 ${item.name}`} onClick={() => void open(item.id)}>查看</button></div>)}</div>} />}
  </section>;
}
