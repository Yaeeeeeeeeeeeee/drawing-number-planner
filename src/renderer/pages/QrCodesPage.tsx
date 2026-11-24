import { QrPixelComparison } from '../components/QrPixelComparison';
import { LayoutTable } from '../components/LayoutTable';
import './v4-page-tables.css';
import './qr-manual.css';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight, CircleCheck, CircleMinus, Copy, Link2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from 'react';
import type { PlannerApi, ProductQrCodeView, ProductView, QrFileView, QrPurposeView } from '../data/client';
import type { ProductQrTarget } from './products/product-qr-navigation';
import type { QrManualApi, QrManualHistory } from '../data/qr-manual-client';
import type { QrManualPreview, QrManualSelection } from '../../core/qr/qr-manual-service';
import { isQrPurposeApplicable } from '../../core/qr/qr-applicability';
import { QR_MANUAL_PDF_LIMIT_MB, canInitializeQrTarget, qrManualDisplayName, qrUrlTail } from '../../core/qr/qr-manual-validation';
import { useModalFocus } from '../components/useModalFocus';
import { PageHeader } from '../components/PageHeader';
import { DataTable } from '../components/DataTable';
import { useDesktopQrFile } from '../desktop-qr-files';
import { createQrMockApi, isQrMockEnabled } from './qr-mock';

const labels: Record<string,string> = {user_manual:'说明书',warranty:'售后卡',recipe:'菜谱'};
const emptyFilters = { search: '', category: '', purposeFilter: '', status: 'all' as 'all' | 'active' | 'inactive' };
function safeUrl(value:string|null): string|null { try { const url=new URL(value??''); return ['https:','http:'].includes(url.protocol)?value:null; }catch{return null;} }
function StoredUrl({ value }: { value: string | null }) {
  const [message, setMessage] = useState('');
  const url = safeUrl(value);
  if (!url) return <span className="muted-text">—</span>;
  async function copy(address: string) {
    try {
      await navigator.clipboard.writeText(address);
      setMessage('已复制');
    } catch {
      setMessage('复制失败');
    }
  }
  return <span className="qr-stored-url">
    <a href={url} target="_blank" rel="noreferrer" aria-label="打开网址" title={url}>
      <Link2 size={16} aria-hidden="true" />
    </a>
    <button className="text-button qr-copy" type="button" aria-label="复制网址" title={message || '复制网址'} onClick={() => void copy(url)}>
      <Copy size={16} aria-hidden="true" />
    </button>
    <span className="sr-only" role="status">{message}</span>
  </span>;
}
type ManualFile=QrFileView&{externalFileId?:string};
type Code=ProductQrCodeView&{hasFileHistory?:boolean;canonicalProductId?:number;appearanceVersionId?:number|null;appearanceName?:string|null};
interface Group {id:number;sku:string|null;model:string;productCategory:string;codes:Code[]}
interface ManualDialog {product:Pick<ProductView,'id'|'sku'|'model'|'productCategory'>;purpose:QrPurposeView;code?:Code}
export function QrCodesPage({api: originalApi, initialQrCodeId,onOpened,productTarget,onReturnProducts,versionTarget,active=true}:{active?:boolean;api:PlannerApi;initialQrCodeId?:number|null;onOpened?:()=>void;productTarget?:ProductQrTarget|null;onReturnProducts?:()=>void;versionTarget?:{productId:number;appearanceVersionId:number}|null}) {
  const mock=isQrMockEnabled(); const api=useMemo(()=>mock?createQrMockApi():originalApi,[mock,originalApi]) as PlannerApi&QrManualApi;
  const [items,setItems]=useState<Code[]>([]),[products,setProducts]=useState<ProductView[]>([]),[purposes,setPurposes]=useState<QrPurposeView[]>([]);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  const [expanded,setExpanded]=useState<Set<number>>(new Set()),[selected,setSelected]=useState<Code|null>(null),[dialog,setDialog]=useState<ManualDialog|null>(null);
  const [history,setHistory]=useState<QrManualHistory|null>(null);
  const [search,setSearch]=useState(''),[category,setCategory]=useState(''),[status,setStatus]=useState<'all'|'active'|'inactive'>('all'),[purposeFilter,setPurposeFilter]=useState('');
  const [name,setName]=useState(''),[url,setUrl]=useState(''); const requestId=useRef(0),detailRequestId=useRef(0),listLoading=useRef(false);
  const referencesRequest=useRef(0);const [referencesLoading,setReferencesLoading]=useState(false),[referencesError,setReferencesError]=useState(''),[referencesReady,setReferencesReady]=useState({products:false,purposes:false}),[listFailed,setListFailed]=useState(false),[listLoaded,setListLoaded]=useState(false);
  const wasActive=useRef(active),loadedScope=useRef<string|null>(null);
  const productId=productTarget?.productId,appearanceProductId=versionTarget?.productId,appearanceId=versionTarget?.appearanceVersionId;
  const applied=useRef(emptyFilters);
  const [loadedFilters, setLoadedFilters] = useState(emptyFilters);
  async function load(next=applied.current) {
    applied.current=next; const {search,category,purposeFilter,status}=next;
    const id=++requestId.current;listLoading.current=true; setBusy(true);
    try { const result=await api.listQrCodes({...versionTarget?{productId:versionTarget.productId}:{},...productTarget?{productId:productTarget.productId}:{},...search.trim()?{search:search.trim()}:{},...category?{productCategory:category}:{},...purposeFilter?{purposeId:Number(purposeFilter)}:{},status}); if(id===requestId.current){setItems(result.items);setLoadedFilters(next);setError('');setListFailed(false);setListLoaded(true);} }
    catch(reason){if(id===requestId.current){setError(reason instanceof Error?reason.message:'二维码加载失败');setListFailed(true);}} finally {if(id===requestId.current){listLoading.current=false;setBusy(false);}}
  }
  const refreshReferences=async()=>{
    const request=++referencesRequest.current;setReferencesLoading(true);
    const results=await Promise.allSettled([api.listProducts({status:'all'}),api.listQrPurposes()]);
    if(request!==referencesRequest.current)return;
    const [nextProducts,nextPurposes]=results;
    if(nextProducts.status==='fulfilled')setProducts(nextProducts.value);
    if(nextPurposes.status==='fulfilled')setPurposes(nextPurposes.value.items);
    setReferencesReady(previous=>({products:previous.products||nextProducts.status==='fulfilled',purposes:previous.purposes||nextPurposes.status==='fulfilled'}));
    setReferencesError(results.flatMap((result,index)=>result.status==='rejected'?[`${['产品资料','二维码用途'][index]}：${result.reason instanceof Error?result.reason.message:'读取失败'}`]:[]).join('；'));setReferencesLoading(false);
  };
  useEffect(()=>{if(active)void refreshReferences();return()=>{referencesRequest.current++;};},[api,active]);
  const refresh=()=>{void load();if(selected)void open(selected.id);};
  const scope=JSON.stringify([productId,productTarget?.purposeKey,appearanceProductId,appearanceId]);
  useEffect(()=>{
    if(active){
      if(loadedScope.current!==scope){detailRequestId.current++;setSelected(null);setDialog(null);void load();if(productId)setExpanded(current=>new Set(current).add(productId));loadedScope.current=scope;}
      else if(!wasActive.current)refresh();
    }
    wasActive.current=active;
  },[active,scope,api]);
  useEffect(()=>()=>{requestId.current++;detailRequestId.current++;loadedScope.current=null;listLoading.current=false;},[api]);
  useEffect(()=>{if(!active)return;const focus=()=>{if(!busy&&!listLoading.current&&!dialog)refresh();};window.addEventListener('focus',focus);return()=>window.removeEventListener('focus',focus);},[active,busy,dialog,selected?.id,productId,appearanceProductId,appearanceId]);
  useEffect(()=>{if(initialQrCodeId)void open(initialQrCodeId);},[initialQrCodeId]);
  const selectedFileRevision=JSON.stringify([selected?.files,selected?.pendingFiles]);
  useEffect(()=>{setHistory(null);if(!selected)return;let cancelled=false;setName(selected.name);setUrl(selected.targetUrl??'');void api.qrManualHistory?.(selected.id).then(result=>{if(!cancelled)setHistory(result);}).catch(()=>{if(!cancelled)setHistory(null);});return()=>{cancelled=true;};},[selected?.id,selected?.updatedAt,selectedFileRevision]);
  const groups=useMemo(()=>{
    const map=new Map<number,Group>();
    for(const code of items){const id=code.canonicalProductId??code.productId; const group=map.get(id)??{id,sku:code.sku,model:code.model,productCategory:code.productCategory,codes:[]};group.codes.push(code);map.set(id,group);}
    // Product rows and virtual purposes are presentation only: no QR record is created here.
    if(loadedFilters.status==='all'&&!loadedFilters.purposeFilter) for(const product of products){if(loadedFilters.category && product.productCategory!==loadedFilters.category)continue;const term=loadedFilters.search.trim().toLocaleLowerCase();if(term&&!`${product.sku??''} ${product.model}`.toLocaleLowerCase().includes(term))continue;if(productTarget&&product.id!==productTarget.productId||versionTarget&&product.id!==versionTarget.productId)continue;const id=(product as ProductView&{canonicalProductId?:number}).canonicalProductId??product.id;if(!map.has(id))map.set(id,{id,sku:product.sku,model:product.model,productCategory:product.productCategory,codes:[]});}
    return [...map.values()];
  },[items,products,loadedFilters,productTarget,versionTarget]);
  function resetFilters() {
    setSearch(emptyFilters.search);
    setCategory(emptyFilters.category);
    setPurposeFilter(emptyFilters.purposeFilter);
    setStatus(emptyFilters.status);
    void load(emptyFilters);
  }
  function replace(code:Code){setItems(current=>current.some(c=>c.id===code.id)?current.map(c=>c.id===code.id?code:c):[...current,code]);setSelected(current=>current?.id===code.id?code:current);}
  async function open(id:number){const request=++detailRequestId.current;try{const code=await api.getQrCode(id);if(request!==detailRequestId.current)return;setSelected(code);onOpened?.();}catch(reason){if(request===detailRequestId.current)setError(String(reason));}}
  async function fileAction(file:ManualFile,action:'open'|'show') {
    if(mock){setMessage('Mock 文件操作仅内存预览，不访问磁盘。');return;}
    try { if(file.externalFileId){if(!window.plannerDesktop?.qrManualAction)throw new Error('请使用 Windows 桌面版');await window.plannerDesktop.qrManualAction(action,{fileId:file.externalFileId});}
      else {const result=await useDesktopQrFile(file.relativePath,action);if(!result.ok)throw new Error(result.error?.message??'文件不可用');} }
    catch(reason){setError(reason instanceof Error?reason.message:'文件操作失败');}
  }
  function start(group:Group,purpose:QrPurposeView,code?:Code){setDialog({product:{id:code?.productId??group.id,sku:group.sku,model:group.model,productCategory:group.productCategory},purpose,code});setError('');}
  function purposeState(group: Group, key: string) {
    const codes = group.codes.filter(code => code.key === key);
    const purpose = purposes.find(item => item.key === key);
    const name = labels[key];
    const filterExcludesMissing = loadedFilters.status !== 'all' || (loadedFilters.purposeFilter && Number(loadedFilters.purposeFilter) !== purpose?.id);
    const applicable = purpose?.status === 'active' && isQrPurposeApplicable(purpose, group.productCategory);
    const code = codes.length === 1 ? codes[0] : undefined;
    const unconfigured = !codes.length || Boolean(code && canInitializeQrTarget(code));
    if (!codes.length && (!applicable || filterExcludesMissing)) {
      const state = filterExcludesMissing ? '筛选范围外' : referencesReady.purposes ? '不适用' : '用途资料不可用';
      const label = `${name}：${state}`;
      return <span role="img" aria-label={label} title={label} className="qr-status-icon">
        {state}
      </span>;
    }
    if (purpose && applicable && (unconfigured || (code && !code.files.length && code.targetUrl))) {
      const state = unconfigured ? '未配置' : '未关联文件';
      const label = `${name}：${state}，关联文件`;
      return <button className="text-button qr-status-icon" type="button" aria-label={label} title={label} onClick={() => start(group, purpose, code)}>
        {state}
      </button>;
    }
    const states = [...new Set(codes.map(item => item.status === 'active' ? '启用中' : '已停用'))];
    const active = codes.length > 0 && codes.every(item => item.status === 'active');
    const label = `${name}：${states.join('、')}`;
    return <button className="text-button qr-status-icon" type="button" data-active={active} aria-label={label} title={label}
      onClick={() => code ? void open(code.id) : setExpanded(current => new Set(current).add(group.id))}>
      {active ? <CircleCheck size={17} aria-hidden="true" /> : <CircleMinus size={17} aria-hidden="true" />}
    </button>;
  }
  function purposeRows(group: Group) {
    const available = new Map(purposes.map(purpose => [purpose.id, purpose]));
    for (const code of group.codes) {
      if (!available.has(code.purposeId)) available.set(code.purposeId, {
        id: code.purposeId, key: code.key, englishName: code.englishName, displayName: code.displayName,
        status: code.purposeStatus, defaultForAll: false, productCategories: [],
      });
    }
    return Array.from(available.values()).flatMap(purpose => {
      const codes = group.codes.filter(code => code.purposeId === purpose.id);
      const showUnconfigured = loadedFilters.status === 'all' && (!loadedFilters.purposeFilter || Number(loadedFilters.purposeFilter) === purpose.id)
        && purpose.status === 'active' && isQrPurposeApplicable(purpose, group.productCategory);
      return (codes.length ? codes : showUnconfigured ? [undefined] : []).map(code => {
        const label = labels[purpose.key] ?? purpose.displayName;
        const action = code?.files.length
          ? code.files.every(file => file.isPresent) ? '更换文件' : '重新关联'
          : code?.hasFileHistory ? '重新关联' : '关联文件';
        return <tr key={code?.id ?? `virtual-${purpose.id}`}>
          <td>{code ? <button className="text-button" type="button" aria-label={`查看 ${code.name}`} title={code.name} onClick={() => void open(code.id)}>{label}</button> : label}</td>
          <td><div className="qr-binding-cell" data-table-no-clamp>
            {code?.files.length ? code.files.map(file => <button key={(file as ManualFile).externalFileId ?? file.id}
              className="text-button qr-filename" type="button" title={`${file.fileName}\n${file.relativePath}`}
              disabled={!file.isPresent} onClick={() => void fileAction(file, 'open')}>
              {qrManualDisplayName(file.fileName)}{!file.isPresent && <span className="qr-file-missing"> · 文件缺失</span>}
            </button>) : <span className="muted-text">{code?.targetUrl || code?.hasFileHistory ? '未关联文件' : '未配置'}</span>}
            {purpose.status === 'active' && <button className="text-button qr-binding-action" type="button" onClick={() => start(group, purpose, code)}>{action}</button>}
          </div></td>
          <td><StoredUrl value={code?.targetUrl ?? null} /></td>
          <td>{code ? <span className="qr-business-state" data-status={code.status}>{code.status === 'active' ? '启用中' : '已停用'}</span> : '—'}</td>
        </tr>;
      });
    });
  }
  async function save(event:FormEvent){event.preventDefault();if(!selected||busy)return;setBusy(true);try{replace(await api.updateQrCode(selected.id,{name:name.trim(),targetUrl:url.trim()||null}));setMessage('二维码信息已保存。');}catch(reason){setError(String(reason));}finally{setBusy(false);}}
  async function toggle(){if(!selected||busy)return;setBusy(true);try{replace(await(selected.status==='active'?api.deactivateQrCode(selected.id):api.activateQrCode(selected.id)));}catch(reason){setError(String(reason));}finally{setBusy(false);}}
  async function unlink(){if(!selected||!history||!api.qrManualUnlink||busy)return;setBusy(true);try{replace(await api.qrManualUnlink(selected.id,history.revision));setMessage('已解除当前文件关联，历史记录保留。');}catch(reason){setError(String(reason));}finally{setBusy(false);}}
  async function remove(){if(!selected||!window.confirm(`确认删除二维码“${selected.name}”吗？`))return;try{await api.deleteQrCode(selected.id);setItems(current=>current.filter(c=>c.id!==selected.id));setSelected(null);}catch(reason){setError(String(reason));}}
  const header=<PageHeader title={selected?selected.name:'二维码管理'} description="维护产品二维码及关联文件。"><div className="header-actions">{productTarget&&<button className="secondary-button" onClick={onReturnProducts}>返回产品档案</button>}{selected&&<button className="secondary-button" onClick={()=>{detailRequestId.current++;setSelected(null);}}>返回列表</button>}</div></PageHeader>;
  return <section className="page-surface qr-page qr-manual-page"><div className="page-sticky-controls">{header}{!selected&&<form className="filter-bar qr-filter" onSubmit={e=>{e.preventDefault();void load({search,category,purposeFilter,status});}}><label><span>SKU / 型号</span><input aria-label="SKU / 型号" value={search} onChange={e=>setSearch(e.target.value)}/></label><label><span>产品类别</span><select aria-label="产品类别" value={category} onChange={e=>setCategory(e.target.value)}><option value="">全部</option>{[...new Set(products.map(p=>p.productCategory))].map(c=><option key={c}>{c}</option>)}</select></label><label><span>用途</span><select aria-label="用途" value={purposeFilter} onChange={e=>setPurposeFilter(e.target.value)}><option value="">全部</option>{purposes.map(p=><option value={p.id} key={p.id}>{p.displayName}</option>)}</select></label><label><span>业务状态</span><select aria-label="业务状态" value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="all">全部</option><option value="active">启用中</option><option value="inactive">已停用</option></select></label><button className="primary-button" disabled={busy}>筛选</button><button className="text-button" type="button" onClick={resetFilters}>重置</button></form>}</div>{mock&&<p className="info-banner">开发预览 Mock · 仅内存数据；不连接真实数据库或文件系统。</p>}{referencesLoading&&<p role="status">加载二维码辅助资料…</p>}{referencesError&&<p role="alert" className="error-banner">{referencesError}<button type="button" onClick={()=>void refreshReferences()}>重试辅助资料</button></p>}{busy&&!listLoaded&&<p role="status">加载二维码…</p>}{error&&<p role="alert" className="error-banner">{error}{listFailed&&<button type="button" onClick={()=>void load()}>重试二维码</button>}</p>}{message&&<p role="status" className="success-banner">{message}</p>}
    {selected?<><div className="qr-detail-meta"><div><span>型号</span><strong>{selected.model}</strong></div><div><span>用途</span><strong>{selected.displayName}</strong></div><div><span>业务状态</span><strong>{selected.status==='active'?'启用中':'已停用'}</strong></div><div><span>网址</span><StoredUrl value={selected.targetUrl}/></div></div>
      <form className="editor-strip" onSubmit={save}><div className="form-grid"><label>二维码名称<input aria-label="二维码名称" value={name} onChange={e=>setName(e.target.value)} required/></label><label>目标网址<input aria-label="二维码网址" value={url} onChange={e=>setUrl(e.target.value)}/></label></div><button disabled={busy} className="primary-button">保存二维码信息</button></form>
      <section className="qr-file-section"><h2>已关联文件</h2>{selected.files.length?selected.files.map(file=><div className="qr-manual-file-detail" key={(file as ManualFile).externalFileId??file.id}><strong title={`${file.fileName}\n${file.relativePath}`}>{file.fileName}</strong><span>{file.relativePath}</span><span className={file.isPresent?'qr-good':'qr-danger'}>{file.isPresent?'文件可用':'文件已缺失'}</span><button className="text-button" disabled={!file.isPresent} onClick={()=>void fileAction(file,'open')}>查看文件</button><button className="text-button" disabled={!file.isPresent} onClick={()=>void fileAction(file,'show')}>打开所在位置</button></div>):<p>尚未关联二维码文件。</p>}
      <button className="secondary-button" onClick={()=>start({id:selected.productId,model:selected.model,sku:selected.sku,productCategory:selected.productCategory,codes:[selected]},purposes.find(p=>p.id===selected.purposeId)??{id:selected.purposeId,key:selected.key,englishName:selected.englishName,displayName:selected.displayName,status:selected.purposeStatus,defaultForAll:false,productCategories:[]},selected)}>{selected.files.length?'更换文件':'关联文件'}</button>{selected.files.length>0&&history&&<button className="text-button danger-text" disabled={busy} onClick={()=>void unlink()}>解除关联</button>}</section>
      {history&&(history.items.length>0||Boolean(history.legacyItems?.length))&&<details className="qr-file-section"><summary>文件关联历史</summary>{history.items.map(h=><p key={h.id} title={h.absolute_path}>{h.file_name} · {h.linked_at} · {h.unlinked_at?'已解除':'当前关联'}{h.exception_reason&&` · 例外理由：${h.exception_reason}`}</p>)}{history.legacyItems?.map(file=><p key={`legacy-${file.id}`} title={file.relativePath}>历史索引文件：{file.fileName}<span>{file.relativePath}</span><button className="text-button" disabled={!file.isPresent} onClick={()=>void fileAction({...file,isPresent:Boolean(file.isPresent),matchStatus:'matched',detectedIdentifier:null},'open')}>查看历史文件</button></p>)}</details>}
      <section className="qr-maintenance"><button disabled={busy} className="primary-button" onClick={()=>void toggle()}>{selected.status==='active'?'停用二维码':'启用二维码'}</button><button className="text-button danger-text" onClick={()=>void remove()}>删除二维码</button></section></>:<>

      <div aria-busy={busy} className="qr-main-table"><DataTable tableId="qr.products" fillViewport virtualize virtualKey={JSON.stringify(applied.current)} items={groups} columns={[
        {key:'sku',label:'SKU', width:210, minWidth:130, align:'center',render:g=><button className="text-button qr-expand" aria-label={`${expanded.has(g.id)?'收起':'展开'} ${g.model} 的二维码用途`} aria-expanded={expanded.has(g.id)} onClick={()=>setExpanded(current=>{const next=new Set(current);next.has(g.id)?next.delete(g.id):next.add(g.id);return next;})}>{expanded.has(g.id)?<ChevronDown size={18} strokeWidth={1.8} aria-hidden="true"/>:<ChevronRight size={18} strokeWidth={1.8} aria-hidden="true"/>}<span title={g.sku??'待补录'}>{g.sku??'待补录'}</span></button>},
        {key:'model',label:'型号', width:170, minWidth:130, align:'center',render:g=><span title={g.model}>{g.model}</span>},
        {key:'category',label:'产品类别', width:150, minWidth:130, align:'center',render:g=>g.productCategory},
        ...(['user_manual','warranty','recipe'] as const).map(key=>({key,label:labels[key],width:102,minWidth:80,align:'center' as const,render:(group:Group)=>purposeState(group,key)})),
        {key:'actions',label:'操作', width:200, minWidth:180, align:'center', locked:'end',render:g=><div className="row-actions"><button className="text-button" onClick={()=>setExpanded(current=>new Set(current).add(g.id))}>查看用途</button><button className="text-button" disabled={!referencesReady.purposes||!purposes.some(p=>p.status==='active'&&isQrPurposeApplicable(p,g.productCategory))} onClick={()=>{const purpose=purposes.find(p=>p.status==='active'&&isQrPurposeApplicable(p,g.productCategory));if(purpose)start(g,purpose);}}>新增用途</button></div>}
      ]} renderExpandedRow={group => expanded.has(group.id) ? <div className="qr-subtable qr-manual-subtable">
        <LayoutTable tableId="qr.purposes" columns={[
          {key:'purpose',label:'用途',width:160,minWidth:120,align:'center'},
          {key:'fileName',label:'关联文件',width:320,minWidth:180,align:'left'},
          {key:'url',label:'网址',width:105,minWidth:88,align:'center'},
          {key:'status',label:'业务状态',width:130,minWidth:112,align:'center'},
        ]}>
          <thead><tr>{['用途','关联文件','网址','业务状态'].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{purposeRows(group)}</tbody>
        </LayoutTable>
      </div> : null} /></div>
      {!busy && listLoaded && !listFailed && !referencesLoading && !referencesError && referencesReady.products && referencesReady.purposes && !groups.length &&
        <p className="muted-text">{loadedFilters.search || loadedFilters.category || loadedFilters.purposeFilter || loadedFilters.status !== 'all' ? '没有符合筛选条件的二维码。' : '暂无二维码或产品记录。'}</p>}
    </>}
      {dialog&&<ManualPdfDialog value={dialog} api={api} purposes={purposes} mock={mock} onCancel={()=>setDialog(null)} onSaved={code=>{replace(code);setDialog(null);setMessage('文件已关联，业务状态保持不变。');}}/>}
    </section>;
}
function ManualPdfDialog({value,api,purposes,mock,onCancel,onSaved}:{value:ManualDialog;api:PlannerApi&QrManualApi;purposes:QrPurposeView[];mock:boolean;onCancel:()=>void;onSaved:(code:Code)=>void}) {
  const [purposeId,setPurposeId]=useState(value.purpose.id);
  const purpose=purposes.find(p=>p.id===purposeId)??value.purpose;
  // Existing version-linked QR identities remain unchanged; new QR records are product-scoped.
  const legacyAppearanceId=value.code?.appearanceVersionId??null;
  const [name,setName]=useState(value.code?.name??`${value.product.model} ${value.purpose.displayName}`),[url,setUrl]=useState(value.code?.targetUrl??'');
  const [selection,setSelection]=useState<QrManualSelection|null>(null),[preview,setPreview]=useState<QrManualPreview|null>(null),[error,setError]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false);const guard=useRef(false);
  const panel=useRef<HTMLElement>(null);
  const previewGeneration=useRef(0);
  useEffect(()=>()=>{previewGeneration.current++;},[]);
  function invalidatePreview(){previewGeneration.current++;setPreview(null);}
  useModalFocus({panel,open:true,onClose:()=>{if(!guard.current)onCancel();}});
  let tail='';try{tail=qrUrlTail(url);}catch{/* invalid URLs shown by preflight */}
  const canEditTarget = !value.code || canInitializeQrTarget(value.code);
  async function choose(file?: File) {
    if (mock) {
      setError('Mock 不访问本地文件；请退出开发预览后使用真实文件关联。');
      return;
    }
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    try {
      const desktop = window.plannerDesktop;
      const chosen = file ? await desktop?.registerDroppedQrPdf?.(file) : await desktop?.qrManualSelectFile?.();
      if (chosen === undefined) throw new Error('请在 Windows 桌面版选择或拖入本地PDF');
      if (chosen) {
        setSelection(chosen);
        invalidatePreview();
        setError('');
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '选择失败');
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  function drop(event: DragEvent) {
    event.preventDefault();
    if (guard.current) return;
    invalidatePreview();
    const files = event.dataTransfer.files;
    if (files.length !== 1) {
      setError('请一次拖入一个本地PDF文件');
      return;
    }
    void choose(files[0]);
  }
  async function validate(){if(!selection||!api.qrManualPreview||guard.current)return;guard.current=true;setBusy(true);setError('');invalidatePreview();const generation=previewGeneration.current;try{const result=await api.qrManualPreview({token:selection.token,productId:value.product.id,purposeId:purpose.id,qrCodeId:value.code?.id,name,targetUrl:url,appearanceVersionId:legacyAppearanceId});if(generation===previewGeneration.current){setPreview(result);setConfirmed(false);}}catch(reason){if(generation===previewGeneration.current)setError(reason instanceof Error?reason.message:'校验失败');}finally{guard.current=false;setBusy(false);}}
  async function commit(){if(!preview||!api.qrManualCommit||guard.current)return;guard.current=true;setBusy(true);setError('');try{onSaved(await api.qrManualCommit(preview.previewId,preview.issues.length?{confirmed,reason}:undefined));}catch(reason){setError(reason instanceof Error?reason.message:'关联失败');}finally{guard.current=false;setBusy(false);}}
  return createPortal(<div className="modal-backdrop qr-page qr-manual-page qr-manual-modal-root"><section ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="qr-manual-title" aria-describedby="qr-manual-scope" className="editor-strip qr-manual-dialog"><h2 id="qr-manual-title">手动关联二维码</h2><p id="qr-manual-scope">SKU {value.product.sku || '待补录'} · 型号 {value.product.model} · {purpose.displayName}（{purpose.englishName}）</p>{error&&<p className="error-banner" role="alert">{error}</p>}<div className="form-grid"><label>用途<select aria-label="手动二维码用途" disabled={Boolean(value.code)} value={purposeId} onChange={e=>{setPurposeId(Number(e.target.value));invalidatePreview();}}>{(value.code ? [value.purpose] : purposes.filter(p => p.status === 'active' && isQrPurposeApplicable(p, value.product.productCategory))).map(p=><option key={p.id} value={p.id}>{p.displayName}</option>)}</select></label><label className="qr-name-secondary">二维码名称<input aria-label="手动二维码名称" readOnly={Boolean(value.code)} value={name} onChange={e=>{setName(e.target.value);invalidatePreview();}}/></label><label>网址<input aria-label="手动二维码网址" readOnly={!canEditTarget} value={url} onChange={e=>{setUrl(e.target.value);invalidatePreview();}}/></label><span className="qr-url-tail" title="网址末段校验标识">尾码：{tail||'—'}</span></div><div role="group" aria-label="PDF 文件" className="qr-pdf-drop" onDragOver={event => event.preventDefault()} onDrop={drop}>
    <button className="secondary-button" type="button" disabled={busy} onClick={() => void choose()}>选择本地PDF</button>
    <span>或拖入 .pdf 文件（最大 {QR_MANUAL_PDF_LIMIT_MB} MB）</span>
    {selection && <p title={selection.path}>{selection.fileName}<small>{selection.path}</small></p>}
  </div><button className="secondary-button" disabled={!selection||busy||!api.qrManualPreview} onClick={()=>void validate()}>校验文件</button>{preview&&<div><QrPixelComparison key={preview.previewId} previewId={preview.previewId} api={api}/>{preview.issues.length?<><p className="error-banner">校验不一致：{preview.issues.join('；')}</p><label>例外关联理由<textarea aria-label="例外关联理由" value={reason} onChange={e=>setReason(e.target.value)}/></label><label><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/>我已核对差异，明确确认例外关联并记录审计</label></>:<p className="success-banner">型号、用途、网址尾码与PDF文件校验通过。</p>}</div>}<div className="form-actions"><button className="primary-button" disabled={busy||!preview||preview.issues.length>0&&(!confirmed||reason.trim().length<5)} onClick={()=>void commit()}>{busy?'处理中…':'确认关联'}</button><button className="secondary-button" disabled={busy} onClick={onCancel}>取消</button></div></section></div>, document.body);
}
