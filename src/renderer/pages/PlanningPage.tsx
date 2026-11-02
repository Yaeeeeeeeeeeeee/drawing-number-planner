import { CircleCheck } from 'lucide-react';
import { CopyButton } from '../components/CopyButton';
import './planning-workspace.css';
import type { PackagingNavigationTarget } from './packaging/PackagingTaskPanel';
import { PageHeader } from '../components/PageHeader';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { DictionaryItemView, PlannerApi, PlanningPreviewView, PlanningRowInputView, ProductView, ReservedDrawingView } from '../data/client';
import { isPlanningMock, PlanningMockPage } from './planning-mock';

interface DraftRow { clientId: string; colorId: string; mainCategoryId: string; projectItemId: string; notes: string }
interface ApprovedInput { productId: number; appearanceId: number; rows: PlanningRowInputView[] }
const blankRow = (id: number): DraftRow => ({ clientId: `row-${id}`, colorId: '', mainCategoryId: '', projectItemId: '', notes: '' });

export interface PlanningDrawingTarget {productId:number;appearanceVersionId?:number;drawingIds?:number[];fullCodes?:string[];initialDrawingId?:number}
export function PlanningPage({ api,active=true,onOpenDrawingLibrary,onGenerateFiles }: { api: PlannerApi;active?:boolean;onOpenDrawingLibrary?(target:PlanningDrawingTarget):void;onGenerateFiles?(target:PackagingNavigationTarget):void }) {
  return isPlanningMock() ? <PlanningMockPage/> : <PlanningWorkspace api={api} active={active} onOpenDrawingLibrary={onOpenDrawingLibrary} onGenerateFiles={onGenerateFiles}/>;
}
function PlanningWorkspace({ api,active=true,onOpenDrawingLibrary,onGenerateFiles }: { api: PlannerApi;active?:boolean;onOpenDrawingLibrary?(target:PlanningDrawingTarget):void;onGenerateFiles?(target:PackagingNavigationTarget):void }) {
  const [products, setProducts] = useState<ProductView[]>([]);
  const [appearances, setAppearances] = useState<DictionaryItemView[]>([]);
  const [colors, setColors] = useState<DictionaryItemView[]>([]);
  const [mains, setMains] = useState<DictionaryItemView[]>([]);
  const [projects, setProjects] = useState<DictionaryItemView[]>([]);
  const [brands, setBrands] = useState<DictionaryItemView[]>([]);
  const [sizes, setSizes] = useState<DictionaryItemView[]>([]);
  const [productId, setProductId] = useState('');
  const [productCategory,setProductCategory]=useState('');
  const [appearanceId, setAppearanceId] = useState('');
  const [rows, setRows] = useState<DraftRow[]>([blankRow(1)]);
  const [preview, setPreview] = useState<PlanningPreviewView | null>(null);
  const [approvedInput, setApprovedInput] = useState<ApprovedInput | null>(null);
  const [reservedContext,setReservedContext]=useState<PlanningDrawingTarget|null>(null);
  const [reserved, setReserved] = useState<ReservedDrawingView[]>([]);
  const [reservedDescriptions,setReservedDescriptions]=useState<Record<number,string>>({});
  const [error, setError] = useState('');
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [busy, setBusy] = useState(false);
  const nextRow = useRef(2);
  const draftVersion = useRef(0);

  useEffect(() => {
    if(!active)return;
    let current=true;
    void Promise.all([
    api.listProducts({ status: 'active' }), api.listDictionaries('appearance', false),
    api.listDictionaries('color', false), api.listDictionaries('main_category', false),
    api.listDictionaries('project_item', false),
  ]).then(([productItems, appearanceItems, colorItems, mainItems, projectItems]) => {
    if(!current)return;
    setProducts(productItems); setAppearances(appearanceItems); setColors(colorItems);
    setMains(mainItems); setProjects(projectItems);
  }).catch((reason) => {if(current)setError(reason instanceof Error ? reason.message : '基础资料加载失败');});
    return()=>{current=false;};
  }, [api,active]);

  // Optional display metadata cannot prevent the original five-query planning workflow.
  useEffect(()=>{
    if(!active)return;
    let current=true;
    void api.listDictionaries('brand',false).then(items=>{if(current)setBrands(items??[]);}).catch(()=>{if(current)setBrands([]);});
    void api.listDictionaries('product_size',false).then(items=>{if(current)setSizes(items??[]);}).catch(()=>{if(current)setSizes([]);});
    return ()=>{current=false;};
  },[api,active]);

  const invalidate = () => {
    draftVersion.current += 1;
    setPreview(null); setApprovedInput(null); setReserved([]); setReservedContext(null); setReservedDescriptions({}); setNeedsRefresh(false); setError('');
  };
  const selectProduct = (value: string) => {
    setProductId(value); const product = products.find((item) => item.id === Number(value));
    setAppearanceId(product?.defaultAppearanceId ? String(product.defaultAppearanceId) : ''); invalidate();
  };
  const updateRow = (clientId: string, field: keyof Omit<DraftRow, 'clientId'>, value: string) => {
    setRows((current) => current.map((row) => row.clientId === clientId
      ? { ...row, [field]: value, ...(field === 'mainCategoryId' ? { projectItemId: '' } : {}) } : row));
    invalidate();
  };
  const complete = useMemo(() => Boolean(productId && appearanceId && rows.length
    && rows.every((row) => row.colorId && row.mainCategoryId && row.projectItemId)), [productId, appearanceId, rows]);
  const planningRows = () => rows.map((row) => ({
    clientId: row.clientId, colorId: Number(row.colorId), mainCategoryId: Number(row.mainCategoryId),
    projectItemId: Number(row.projectItemId), ...(row.notes.trim() ? { notes: row.notes.trim() } : {}),
  }));
  const check = async () => {
    if (!complete) return; setBusy(true); setError(''); setNeedsRefresh(false); setReserved([]);
    const version = draftVersion.current;
    const input: ApprovedInput = { productId: Number(productId), appearanceId: Number(appearanceId), rows: planningRows() };
    try {
      const result = await api.previewPlan(input);
      if (version === draftVersion.current) { setPreview(result); setApprovedInput(input); }
    }
    catch (reason) {
      if (version === draftVersion.current) setError(reason instanceof Error ? reason.message : '图号查重失败');
    }
    finally { setBusy(false); }
  };
  const reserve = async () => {
    if (!preview || !approvedInput) return;
    const currentInput: ApprovedInput = {
      productId: Number(productId), appearanceId: Number(appearanceId), rows: planningRows(),
    };
    if (JSON.stringify(currentInput) !== JSON.stringify(approvedInput)) {
      setPreview(null); setApprovedInput(null); setNeedsRefresh(true); setError('规划条件已变化，请重新查重');
      return;
    }
    const expectedByClientId = new Map(preview.rows.map((row) => [row.clientId, row.fullCode]));
    if (approvedInput.rows.some((row) => !expectedByClientId.has(row.clientId))) {
      setPreview(null); setApprovedInput(null); setNeedsRefresh(true); setError('占号预览与当前项目不一致，请重新查重');
      return;
    }
    const reservationRows = approvedInput.rows.map((row) => {
      const expectedFullCode = expectedByClientId.get(row.clientId)!;
      return { ...row, expectedFullCode };
    });
    const product=products.find(item=>item.id===approvedInput.productId);
    const descriptionsByFullCode=new Map(approvedInput.rows.map(row=>[expectedByClientId.get(row.clientId)!,[product?.brandName,product?.model,colors.find(item=>item.id===row.colorId)?.name,projects.find(item=>item.id===row.projectItemId)?.name].filter(Boolean).join(' · ')]));
    setBusy(true); setError('');
    try {
      const items = await api.reservePlan({ ...approvedInput, rows: reservationRows });
      setReservedDescriptions(Object.fromEntries(items.map(item=>[item.id,descriptionsByFullCode.get(item.fullCode)??item.displayName])));
      setReserved(items);setReservedContext({productId:approvedInput.productId,drawingIds:items.map(item=>item.id),fullCodes:items.map(item=>item.fullCode),initialDrawingId:items[0]?.id}); setPreview(null); setApprovedInput(null); setRows([blankRow(nextRow.current++)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '批量占号失败'); setPreview(null); setApprovedInput(null); setNeedsRefresh(true);
    } finally { setBusy(false); }
  };

  const copyDrawing=async(code:string)=>{
    try { await navigator.clipboard.writeText(code); }
    catch { setError('复制失败，请手动选择图号复制'); }
  };
  const selectedProduct = products.find(item => item.id === Number(productId));
  return <section className="page-surface page-enter planning-page planning-real-page pm-plan approved-planning">
    <PageHeader title="图号规划" description="选择产品与外观，核对项目及预计图号后确认占号。"></PageHeader>
    <section className="planning-stage" aria-label="产品与外观"><h2><span>01</span> 产品与外观</h2>
    <div className="pp-context">
      <label><span>产品类别</span><select aria-label="产品类别" value={productCategory} disabled={busy} onChange={event=>{setProductCategory(event.target.value);if(productId&&products.find(item=>item.id===Number(productId))?.productCategory!==event.target.value)selectProduct('');}}><option value="">全部类别</option>{[...new Set(products.map(item=>item.productCategory))].sort().map(category=><option key={category} value={category}>{category}</option>)}</select></label>
      <label><span>产品型号</span><select aria-label="产品型号" disabled={busy} value={productId} onChange={(event) => selectProduct(event.target.value)}><option value="">请选择</option>{products.filter(item=>!productCategory||item.productCategory===productCategory).map((item) => <option value={item.id} key={item.id}>{item.sku ?? 'SKU待补录'} · {item.model} · {item.brandName}</option>)}</select></label>
      <label><span>外观</span><select aria-label="外观" disabled={busy} value={appearanceId} onChange={(event) => { setAppearanceId(event.target.value); invalidate(); }}><option value="">请选择</option>{appearances.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
    </div>
    <div className="pp-derived"><div className="pp-context-fact"><span>品牌</span><strong>{selectedProduct ? `${brands.find(item=>item.id===selectedProduct.brandId)?.code ? brands.find(item=>item.id===selectedProduct.brandId)?.code+' · ' : ''}${selectedProduct.brandName}` : '随产品确定'}</strong></div><div className="pp-context-fact"><span>品类尺寸</span><strong>{selectedProduct ? `${sizes.find(item=>item.id===selectedProduct.productSizeId)?.code ? sizes.find(item=>item.id===selectedProduct.productSizeId)?.code+' · ' : ''}${selectedProduct.productSizeName}` : '随产品确定'}</strong></div></div>
    </section>
    <section className="planning-stage planning-items" aria-label="规划项目"><h2><span>02</span> 规划项目</h2>
    <div className="pp-toolbar"><strong>规划项目 · {rows.length} 行</strong><button type="button" disabled={busy} onClick={() => { setRows((current) => [...current, blankRow(nextRow.current++)]); invalidate(); }}>添加项目</button></div>
    <div className="pp-rows">{rows.map((row, index) => <div className="pp-item" key={row.clientId}>
      <span className="pp-row-no" aria-label={`项目 ${index + 1}`}>项目 {index + 1}</span>
      <article className="pp-row"><div className="pp-fields">
        <label><span>主类别</span><select aria-label={`第 ${index + 1} 行主类别`} disabled={busy} value={row.mainCategoryId} onChange={(event) => updateRow(row.clientId, 'mainCategoryId', event.target.value)}><option value="">请选择</option>{mains.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>项目明细</span><select aria-label={`第 ${index + 1} 行项目明细`} disabled={busy || !row.mainCategoryId} value={row.projectItemId} onChange={(event) => updateRow(row.clientId, 'projectItemId', event.target.value)}><option value="">请选择</option>{projects.filter((item) => item.parentId === Number(row.mainCategoryId)).map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>颜色</span><select aria-label={`第 ${index + 1} 行颜色`} disabled={busy} value={row.colorId} onChange={(event) => updateRow(row.clientId, 'colorId', event.target.value)}><option value="">请选择</option>{colors.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>备注</span><input aria-label={`第 ${index + 1} 行备注`} disabled={busy} value={row.notes} onChange={(event) => updateRow(row.clientId, 'notes', event.target.value)} /></label>
        <button aria-label={`删除项目 ${index + 1}`} type="button" disabled={busy || rows.length === 1} onClick={() => { setRows((current) => current.filter((item) => item.clientId !== row.clientId)); invalidate(); }}>移除</button>
      </div>
      <PlanningRowPreview api={api} productId={productId} appearanceId={appearanceId} row={row} index={index} paused={busy||!active} approved={preview?.rows.find(item=>item.clientId===row.clientId)}/>
    </article></div>)}</div>
    </section>
    <section className="planning-stage planning-confirm" aria-label="查重与确认"><h2><span>03</span> 查重与确认</h2>
    <div className="pp-bottom"><span>{complete ? '条件完整' : '待完成：产品、外观及各行主类别 / 项目明细 / 颜色'}</span><div><button type="button" title={reserved.length ? '使用本次已正式保存的图号创建或继续制图任务' : '请先查重并确认批量占号'} disabled={busy || !reserved.length || !reservedContext || !onGenerateFiles} onClick={()=>{if(reservedContext&&reserved.length)onGenerateFiles?.({productId:reservedContext.productId,drawings:reserved.map(item=>({origin:'planned' as const,id:item.id})),revision:Date.now()});}}>生成文件</button><button className="secondary-button planning-check" type="button" disabled={!complete || busy} onClick={() => void check()}>{busy ? '处理中…' : needsRefresh ? '重新查重' : '查重并预览'}</button><button className="primary-button" type="button" disabled={!preview || !approvedInput || busy} onClick={() => void reserve()}>确认批量占号</button></div></div>
    </section>
    {error && <p className="error-banner">{error}</p>}
    {reserved.length > 0 && <section className="pp-saved" aria-label="本次占号结果"><header><div><CircleCheck size={20} aria-hidden="true"/><strong>已成功占用 {reserved.length} 个图号 · 正式保存</strong></div>{reservedContext&&onOpenDrawingLibrary&&<button type="button" onClick={()=>onOpenDrawingLibrary(reservedContext)}>查看图号库</button>}</header><ul>{reserved.map(item => <li key={item.id}><div><strong>{item.fullCode}</strong><span>{reservedDescriptions[item.id]??item.displayName}</span></div><CopyButton label={`复制图号 ${item.fullCode}`} onClick={()=>void copyDrawing(item.fullCode)}/></li>)}</ul></section>}

  </section>;
}


type PreviewRow=PlanningPreviewView['rows'][number];
function PlanningRowPreview({api,productId,appearanceId,row,index,paused,approved}:{api:PlannerApi;productId:string;appearanceId:string;row:DraftRow;index:number;paused:boolean;approved?:PreviewRow}) {
  const ready=Boolean(productId&&appearanceId&&row.colorId&&row.mainCategoryId&&row.projectItemId);
  const input:ApprovedInput={productId:Number(productId),appearanceId:Number(appearanceId),rows:[{clientId:row.clientId,colorId:Number(row.colorId),mainCategoryId:Number(row.mainCategoryId),projectItemId:Number(row.projectItemId),...(row.notes.trim()?{notes:row.notes.trim()}:{})}]};
  const identity=ready?JSON.stringify(input):'';
  const [live,setLive]=useState<{identity:string;item?:PreviewRow;error?:string}>();
  useEffect(()=>{
    if(!identity||paused||approved)return;
    let current=true;
    const timer=window.setTimeout(()=>{
      void api.previewPlan(JSON.parse(identity) as ApprovedInput).then(result=>{
        if(!current)return;
        const item=result.rows.find(item=>item.clientId===row.clientId);
        setLive({identity,...(item?{item}:{error:'未取得本项目预览，请重新查重'})});
      }).catch(reason=>{if(current)setLive({identity,error:reason instanceof Error?reason.message:'实时查重失败'});});
    },250);
    return()=>{current=false;window.clearTimeout(timer);};
  },[api,identity,paused,approved,row.clientId]);
  const item=approved??(live?.identity===identity?live.item:undefined);
  const error=live?.identity===identity&&!approved?live.error:undefined;
  if(!ready)return null;
  return <div className="pp-result" aria-label={`项目 ${index+1} 预览`} aria-live="polite">
    {item?<><span className="planning-preview-link">预计完整图号</span><strong className="pp-code">{item.fullCode}</strong><span>推荐流水号 <b>{String(item.sequence).padStart(3,'0')}</b></span><span className="status-text active">可占用</span><small>尚未占号</small></>:error?<span className="status-text inactive">{error}</span>:<small>正在查重预览…</small>}
  </div>;
}
