import { LayoutTable } from '../../components/LayoutTable';
import '../v4-page-tables.css';
import { readPageSize, savePageSize } from '../../data/query-cache';
import type { OutboundPackagePreviewItemView } from '../../data/client';

import { createPortal } from 'react-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CreatedOutboundPackageView,
  DictionaryItemView,
  MaterialBatchView,
  OutboundMaterialTypeView,
  OutboundPackageModeView,
  OutboundPackagePreviewView,
  PlannerApi,
  ProductView,
} from '../../data/client';
import { chooseOutboundDirectory, openIndexedPdfLocation } from '../../desktop-files';
import { PackageResult } from './PackageResult';
import { PackageHistory } from './PackageHistory';
import { materialBatchLabel } from '../../../core/files/material-batch-label';

const statusLabel = {
  normal: '正常', carried_forward: '沿用', needs_confirmation: '待确认', conflict: '冲突', missing: '缺失',
} as const;

export interface OutboundMailContext {
  appearanceVersionId?:number;
  appearanceLabel?:string;
  bomVersionIds?:number[];
  packageFiles?: string[];
  packageName: string;
  product: ProductView;
  materialType: OutboundMaterialTypeView;
  items: Array<{ projectItemName: string; fileName: string; sourceBatchName: string; pdfFileId: number; changeDetails?: string | null }>;
}

interface PackageBuilderProps {
  api: PlannerApi;
  target?:{productId:number;appearanceVersionId?:number};
  onPackage(value: CreatedOutboundPackageView, context: OutboundMailContext): void;
  showResult?: boolean;
  onResultChange?: (value:CreatedOutboundPackageView|null)=>void;
}

export function PackageBuilder({ api, onPackage, showResult=true, onResultChange, target }: PackageBuilderProps) {
  const previewRequest=useRef(0);
  const preflightRequest=useRef(0);
  const generationRequest=useRef(0);
  const currentRequestContext=useRef('');
  const [products, setProducts] = useState<ProductView[]>([]);
  const [batches, setBatches] = useState<MaterialBatchView[]>([]);
  const [brands, setBrands] = useState<DictionaryItemView[]>([]);
  const [brandId, setBrandId] = useState('');
  const [productId, setProductId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [materialType, setMaterialType] = useState<OutboundMaterialTypeView>('initial');
  const [mode, setMode] = useState<OutboundPackageModeView>('change_only');
  const [preview, setPreview] = useState<OutboundPackagePreviewView | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [created, setCreated] = useState<CreatedOutboundPackageView | null>(null);
  useEffect(()=>{if(target){setProductId(String(target.productId));}},[target?.productId,target?.appearanceVersionId]);
  useEffect(()=>{onResultChange?.(created);},[created,onResultChange]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [bomSelections, setBomSelections] = useState<Record<string, number>>({});
  const [previewDirty, setPreviewDirty] = useState(false);
  const [allHistory, setAllHistory] = useState(false);
  const [extraIds,setExtraIds]=useState<number[]>([]);const [extraChoices,setExtraChoices]=useState<import('../../data/client').PdfFileView[]>([]);const [extraOpen,setExtraOpen]=useState(false);const [extraReason,setExtraReason]=useState('');const [extraId,setExtraId]=useState('');
  const [confirmations,setConfirmations]=useState<Record<number,{reason:string;contentSha256?:string}>>({});const [confirmationReason,setConfirmationReason]=useState('');
  const [detail,setDetail]=useState<OutboundPackagePreviewItemView|null>(null);
  const [query,setQuery]=useState('');const [statusFilter,setStatusFilter]=useState('');const [listPage,setListPage]=useState(1);
  const [pageSize,setPageSize]=useState(()=>readPageSize('outbound',50));const [preflight,setPreflight]=useState<import('../../data/client').OutboundPreflightView|null>(null);
  const selectedKey=JSON.stringify(selected);const extraKey=JSON.stringify(extraIds);const confirmationKey=JSON.stringify(confirmations);
  useEffect(()=>{preflightRequest.current+=1;generationRequest.current+=1;setPreflight(null);setBusy(false);},[selectedKey,previewDirty,productId,batchId,materialType,mode,extraKey,confirmationKey]);
  useEffect(()=>{previewRequest.current+=1;},[extraKey,confirmationKey]);
  const v2=true;
  useEffect(() => {
    previewRequest.current+=1;setBusy(false);
    setBomSelections({});setSelected([]);setConfirmations({});setExtraIds([]);setPreflight(null);
    setPreview(null);
    setCreated(null);
  }, [productId, batchId, materialType, mode]);

  useEffect(() => {
    void Promise.all([api.listProducts({ status: 'active' }), api.listDictionaries('brand', false)])
      .then(([nextProducts, nextBrands]) => {
        setProducts(nextProducts);
        if(target){const selected=nextProducts.find(item=>item.id===target.productId);if(selected)setBrandId(String(selected.brandId));}
        setBrands(nextBrands);
        if (nextBrands.length === 1) setBrandId(String(nextBrands[0].id));
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : '产品加载失败'));
  }, [api]);

  useEffect(() => {
    let live=true;
    setBatchId('');
    setPreview(null);
    if (!productId) {
      setBatches([]);
      return;
    }
    void api.listMaterialBatches({ productId: Number(productId) })
      .then((items) => {if(live)setBatches(items.filter((item) => item.recognitionStatus === 'recognized' && item.isPresent));})
      .catch((loadError) => {if(live)setError(loadError instanceof Error ? loadError.message : '资料批次加载失败');});
    return()=>{live=false;};
  }, [api, productId]);

  const chosenProduct = products.find((item) => item.id === Number(productId));
  const visibleProducts = brandId ? products.filter((item) => item.brandId === Number(brandId)) : [];
  const blockers = preview?.items.some((item) => item.pdfFileId && selected.includes(item.pdfFileId) && !item.selectable) ?? false;
  const selectableIds = useMemo(
    () => preview?.items.filter((item) => item.selectable && item.pdfFileId).map((item) => item.pdfFileId!) ?? [],
    [preview],
  );

  const request = () => ({
    ...(v2?{workflowVersion:2 as const,extraPdfFileIds:extraIds,fileConfirmations:Object.entries(confirmations).map(([id,confirmation])=>({pdfFileId:Number(id),...confirmation}))}:{}),
    productId: Number(productId), selectedMaterialBatchId: Number(batchId), materialType, packageMode: mode,
    ...(Object.keys(bomSelections).length ? { bomSelections } : {}),
  });

  useEffect(()=>()=>{generationRequest.current+=1;previewRequest.current+=1;preflightRequest.current+=1;},[]);

  currentRequestContext.current=JSON.stringify({request:request(),selected,previewToken:preview?.previewToken,previewDirty});

  const loadPreview = async () => {
    generationRequest.current+=1;
    const serial=++previewRequest.current;
    setBusy(true);
    setError('');
    setCreated(null);setPreflight(null);
    try {
      const value = await api.previewOutboundPackage(request());
      if(serial!==previewRequest.current)return;
      setPreview(value);
      setPreviewDirty(false);
      setSelected(value.items.filter((item) => item.selectable && item.pdfFileId && item.defaultSelected!==false).map((item) => item.pdfFileId!));
    } catch (previewError) {
      if(serial===previewRequest.current)setError(previewError instanceof Error ? previewError.message : '外发预览失败');
    } finally {
      if(serial===previewRequest.current)setBusy(false);
    }
  };

  const runPreflight = async () => {
    if(!preview || previewDirty)return;
    const serial=++preflightRequest.current;
    setBusy(true);setError('');setPreflight(null);
    try {
      if(!api.preflightOutboundPackage)throw new Error('当前服务缺少生成前预检，请更新客户端和本地服务。');
      const result=await api.preflightOutboundPackage({...request(),previewToken:preview.previewToken,selectedPdfFileIds:selected});
      if(serial===preflightRequest.current)setPreflight(result);
    } catch(error){if(serial===preflightRequest.current)setError(error instanceof Error?error.message:'预检失败，请重新预览文件');}
    finally{if(serial===preflightRequest.current)setBusy(false);}
  };

  const generate = async () => {
    if (!preview || previewDirty) return;
    const serial=++generationRequest.current;
    const contextSerial=previewRequest.current;
    const context=currentRequestContext.current;
    const isCurrent=()=>serial===generationRequest.current&&contextSerial===previewRequest.current&&context===currentRequestContext.current;
    setError('');
    if (!window.plannerDesktop?.chooseOutboundDirectory) {
      setError('生成 ZIP 仅支持 Windows 桌面版，请在桌面版选择输出目录。');
      return;
    }
    setBusy(true);
    try {
      const picked = await chooseOutboundDirectory();
      if(!isCurrent())return;
      if (!picked.ok) {
        if (!picked.cancelled) setError(picked.error?.message ?? '选择输出目录失败');
        return;
      }
      const value = await api.createOutboundPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: selected });
      if(!isCurrent())return;
      setCreated(value);
      if (chosenProduct) {
        onPackage(value, {
          bomVersionIds:[...new Set(preview.items.flatMap(item=>item.bomContext?.candidates.map(candidate=>candidate.bomVersionId)??[]))],
          packageName: value.packageName,
          packageFiles: value.parts?.map((part) => part.zipRelativePath) ?? [value.zipRelativePath],
          product: chosenProduct,
          materialType,
          items: preview.items.flatMap((item) => (
            item.pdfFileId && item.fileName && selected.includes(item.pdfFileId)
              ? [{ projectItemName: item.projectItemName, fileName: item.fileName, sourceBatchName: item.sourceBatchName, pdfFileId: item.pdfFileId,
                changeDetails: item.bomContext?.changeDetails ?? null }]
              : []
          )),
        });
      }
    } catch (generateError) {
      if(isCurrent())setError(generateError instanceof Error ? generateError.message : '生成压缩包失败');
    } finally {
      if(isCurrent())setBusy(false);
    }
  };

  const filteredItems=preview?.items.filter(item=>(!query||`${item.fileName??''} ${item.fullCode??''}`.toLowerCase().includes(query.toLowerCase()))&&(!statusFilter||item.status===statusFilter))??[];
  const pages=Math.max(1,Math.ceil(filteredItems.length/pageSize));const shownItems=filteredItems.slice((Math.min(listPage,pages)-1)*pageSize,Math.min(listPage,pages)*pageSize);
  return (
    <section className="outbound-panel package-builder">
      <section className="ob-step" aria-label="选择外发范围"><h2><span aria-hidden="true">01</span> 选择外发范围</h2>
      <button type="button" className="text-button" onClick={() => setAllHistory((value) => !value)}>{allHistory ? '收起全部外发历史' : '查询全部外发历史（含退出产品）'}</button>
      {allHistory && <PackageHistory api={api} refreshId={created?.id} />}
      <div className="outbound-selection-grid">
        <label>
          <span>品牌</span>
          <select aria-label="品牌" value={brandId} onChange={(event) => { setBrandId(event.target.value); setProductId(''); setBatchId(''); setPreview(null); }}>
            <option value="">请选择</option>{brands.map((brand) => <option value={brand.id} key={brand.id}>{brand.name}</option>)}
          </select>
        </label>
        <div className="outbound-product-field">
          <label htmlFor="outbound-product-select">产品</label>
          <select id="outbound-product-select" aria-label="产品" value={productId} disabled={!brandId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">请选择</option>{visibleProducts.map((product) => <option key={product.id} value={product.id}>{product.sku ?? 'SKU待补录'} · {product.model} · {product.productCategory}</option>)}
          </select>
        </div>
        <label>
          <span>资料批次</span>
          <select aria-label="资料批次" value={batchId} disabled={!productId} onChange={(event) => { setBatchId(event.target.value); setPreview(null); }}>
            <option value="">请选择</option>{batches.map((item) => <option key={item.id} value={item.id}>{item.displayName||materialBatchLabel(item.name)}</option>)}
          </select>
        </label>
        <label><span>资料类型</span><select aria-label="打包资料类型" value={materialType} onChange={event=>{setMaterialType(event.target.value as OutboundMaterialTypeView);setPreview(null);}}><option value="initial">首批资料</option><option value="update">更新资料</option></select></label>
      <label className="outbound-mode-select">打包范围<select aria-label="打包模式" value={mode} onChange={event=>setMode(event.target.value as OutboundPackageModeView)}><option value="change_only">本次变更资料</option><option value="current_complete">当前完整包材资料</option></select></label>
      </div>


      <div className="ob-section-head outbound-preview-action"><span>核对所选产品及资料批次后预览文件。</span><button className="primary-button" type="button" disabled={busy || !productId || !batchId} onClick={() => void loadPreview()}>预览文件</button></div>
      {error && <p className="error-banner">{error}</p>}
      </section>
      <section className="ob-step" aria-label="外发文件清单"><h2><span aria-hidden="true">02</span> 外发文件清单</h2>
      {!preview&&<p className="muted-text">预览后显示所选批次的实际文件；不会自动补入其他批次资料。</p>}
      {preview && (
        <>
          <div className="outbound-preview-head">
            <strong>{preview.packageName}</strong>
            <div>
              <button className="text-button" type="button" onClick={() => setSelected(selectableIds)}>全选可用文件</button>
              <button className="text-button" type="button" onClick={() => setSelected([])}>取消全选</button>
            </div>
          </div>
          {preview.warnings?.map(warning=><p className="info-banner" key={warning}>{warning}</p>)}
          {preview.bomCheck&&<p className="muted-text">BOM 辅助核对：{preview.bomCheck.status==='missing'?'未关联 BOM':preview.bomCheck.status==='partial'?'存在差异':'已核对'} · 缺少对应文件 {preview.bomCheck.missingFullCodes.length} 项 · BOM 外文件 {preview.bomCheck.extraPdfFileIds.length} 个</p>}

          {v2&&<button className="text-button" disabled={busy} onClick={async()=>{setExtraReason('');setExtraId('');try{const result=await api.searchPdfFiles({productId:Number(productId),conversionType:'outlined',managementState:'included',page:1,pageSize:100});setExtraChoices(result.items.filter(file=>file.materialBatchId!==Number(batchId)));setExtraOpen(true);}catch(error){setError(error instanceof Error?error.message:String(error));}}}>添加额外资料</button>}

          <div className="outbound-list-tools"><span>共 {preview.items.length} 个文件 · 已选 {selected.length} 个</span>{(['missing','needs_confirmation','conflict'] as const).map(status=><button key={status} className="text-button" onClick={()=>{setStatusFilter(status);setListPage(1);}}>{statusLabel[status]} {preview.items.filter(item=>item.status===status).length} 个</button>)}<input aria-label="搜索外发文件" placeholder="文件名或图号" value={query} onChange={event=>{setQuery(event.target.value);setListPage(1);}}/><select aria-label="资料状态筛选" value={statusFilter} onChange={event=>{setStatusFilter(event.target.value);setListPage(1);}}><option value="">全部状态</option>{Object.entries(statusLabel).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><button className="text-button" onClick={()=>setSelected(preview.items.filter(item=>item.selectable&&item.pdfFileId&&['new','replaced'].includes(item.change)).map(item=>item.pdfFileId!))}>只选本次变更</button></div>
          <div className="ob-table outbound-full-file-list"><LayoutTable tableId="outbound.files" columns={[{key:'select',label:'选择',width:64,minWidth:56,align:'center',locked:'start'},{key:'fileName',label:'文件名',width:340,minWidth:180,align:'left'},{key:'fullCode',label:'完整图号',width:240,minWidth:180,align:'left'},{key:'source',label:'来源',width:170,minWidth:140,align:'center'},{key:'status',label:'资料状态',width:170,minWidth:140,align:'center'},{key:'actions',label:'操作',width:100,minWidth:88,align:'center',locked:'end'}]} aria-label="外发文件预览"><thead><tr>{['选择','文件名','完整图号','来源','资料状态','操作'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{shownItems.map((item,index)=><tr key={`${item.pdfFileId??item.slotKey}:${index}`}><td><input type="checkbox" aria-label={`选择 ${item.projectItemName}`} disabled={!item.selectable||!item.pdfFileId} checked={!!item.pdfFileId&&selected.includes(item.pdfFileId)} onChange={()=>item.pdfFileId&&setSelected(ids=>ids.includes(item.pdfFileId!)?ids.filter(id=>id!==item.pdfFileId):[...ids,item.pdfFileId!])}/></td><td className="file-primary" title={item.fileName??''}><button className="text-button outbound-file-name" onClick={()=>{setDetail(item);setConfirmationReason(item.confirmationReason??confirmations[item.pdfFileId??0]?.reason??'');}}>{item.fileName??'缺少转曲后文件'}</button></td><td className="mono">{item.fullCode??'待确认'}</td><td>{item.source==='extra'?'额外资料（旧批次）':item.source==='baseline_removed'?'对比基准':'当前批次'}</td><td><span className={`outbound-status ${item.status}`}>{item.status==='normal'&&mode==='change_only'&&preview.baselineBatchId===null?'未对比':item.change==='removed'?'已移除 / 待确认':item.detail==='缺少转曲后文件'?'缺少转曲后文件':item.source==='extra'&&item.selectable?'已确认沿用':item.status==='normal'&&item.change==='copied'?'未变化':item.status==='normal'&&item.change==='replaced'?'已修改':item.status==='normal'&&item.change==='new'?'新增':statusLabel[item.status]}</span></td><td><button className="text-button" onClick={()=>{setDetail(item);setConfirmationReason(item.confirmationReason??confirmations[item.pdfFileId??0]?.reason??'');}}>查看</button></td></tr>)}</tbody></LayoutTable></div>
          <div className="outbound-pagination"><span>{filteredItems.length} 条 · 第 {Math.min(listPage,pages)} / {pages} 页</span><button disabled={listPage<=1} onClick={()=>setListPage(page=>page-1)}>上一页</button><button disabled={listPage>=pages} onClick={()=>setListPage(page=>page+1)}>下一页</button><select aria-label="外发每页条数" value={pageSize} onChange={event=>{const size=Number(event.target.value);setPageSize(size);savePageSize('outbound',size);setListPage(1);}}>{[10,25,50,100].map(size=><option key={size} value={size}>{size} 条/页</option>)}</select></div>
          {preview.items.some(item=>!item.selectable)&&<p className="info-banner">未选中的异常文件不会阻止其他有效文件外发；请核对是否存在遗漏。BOM 仅作辅助核对。</p>}

          {previewDirty && <p className="info-banner">外发条件或人工确认已改变，请重新预览文件。</p>}
          <button className="primary-button" type="button" disabled={busy || previewDirty || blockers || selected.length === 0} onClick={() => void runPreflight()}>{busy?'预检中…':'生成压缩包'}</button>
        </>
      )}
      </section>
      {extraOpen&&createPortal(<div className="outbound-overlay"><section role="dialog" aria-modal="true" aria-label="添加额外资料" className="outbound-confirm-dialog"><h2>添加额外资料</h2><p>只读取当前产品的已有转曲后 PDF 索引，不改写原图号归属。</p><label>索引文件<select aria-label="额外资料文件" value={extraId} onChange={event=>setExtraId(event.target.value)}><option value="">请选择</option>{extraChoices.map(file=><option key={file.id} value={file.id}>{file.fileName} · {file.relativePath}</option>)}</select></label><label>确认沿用依据<textarea value={extraReason} onChange={event=>setExtraReason(event.target.value)}/></label><button onClick={()=>setExtraOpen(false)}>取消</button><button disabled={!extraId||extraReason.trim().length<5} onClick={()=>{const id=Number(extraId);setExtraIds(ids=>ids.includes(id)?ids:[...ids,id]);setConfirmations(value=>({...value,[id]:{reason:extraReason.trim()}}));setPreviewDirty(true);setSelected([]);setExtraOpen(false);}}>加入候选并重新预览</button><p className="muted-text">预览后请在文件详情核对实际内容哈希，再确认沿用。</p></section></div>,document.body)}
      {detail&&createPortal(<aside className="outbound-file-drawer" role="dialog" aria-modal="true" aria-label="外发文件详情"><header><h2>文件详情</h2><button onClick={()=>setDetail(null)}>关闭</button></header><dl>{[['文件名',detail.fileName],['完整图号',detail.fullCode],['产品型号',chosenProduct?.model],['资料批次',detail.sourceBatchName],['实际路径',detail.relativePath],['文件大小',detail.sizeBytes==null?'未记录':`${detail.sizeBytes} 字节`],['内容哈希',detail.contentSha256],['核对说明',detail.detail??'正常'],['BOM 核对',detail.bomContext?.status==='matched'?'已关联 BOM':'未关联 BOM'],['修改明细',detail.bomContext?.changeDetails??'待人工补充'],['人工确认',detail.confirmationReason],['转曲状态',detail.conversionType==='outlined'?'转曲后':'转曲前或未记录'],['文件存在',detail.status==='missing'?'文件缺失或不可读取':'已读取并核对'],['对比结果',detail.change==='copied'?'图号和内容相同':detail.change==='same_code_changed'?'同图号内容不同':detail.change==='replaced'?'已修改':detail.change==='removed'?'已移除':detail.change==='new'?'新增':'待确认'],['当前选择',detail.pdfFileId&&selected.includes(detail.pdfFileId)?'已选择':'未选择']].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||'未记录'}</dd></div>)}</dl>{detail.comparison&&<section><h3>与上一批次对比</h3><p>{detail.comparison.batchName}</p>{detail.comparison.files.length===0?<p>基准批次没有对应项目。</p>:detail.comparison.files.map(file=><dl key={file.pdfFileId}><dt>基准文件</dt><dd>{file.fileName}</dd><dt>完整图号</dt><dd>{file.fullCode??'待确认'}</dd><dt>实际路径</dt><dd>{file.relativePath}</dd><dt>内容哈希</dt><dd>{file.contentSha256??'无法读取'}</dd><dt>内容比较</dt><dd>{!file.contentSha256?'无法确定':file.contentSha256===detail.contentSha256?'内容相同':'内容不同'}</dd></dl>)}</section>}{detail.pdfFileId&&<button className="text-button" onClick={async()=>{const result=await openIndexedPdfLocation(detail.pdfFileId!);if(!result.ok)setError(result.error?.message??'打开位置失败');}}>打开文件位置</button>}{detail.pdfFileId&&detail.status!=='missing'&&!!detail.contentSha256&&<><label>人工确认依据<textarea value={confirmationReason} onChange={event=>setConfirmationReason(event.target.value)}/></label><button disabled={confirmationReason.trim().length<5} onClick={()=>{setConfirmations(value=>({...value,[detail.pdfFileId!]:{reason:confirmationReason.trim(),contentSha256:detail.contentSha256??undefined}}));setPreviewDirty(true);setSelected([]);setDetail(null);}}>记录确认并重新预览</button></>}</aside>,document.body)}
      {preflight&&preview&&createPortal(<div className="outbound-overlay"><section role="dialog" aria-modal="true" aria-label="外发预检" className="outbound-confirm-dialog"><h2>外发预检</h2><p>产品：{chosenProduct?.model}</p><p>批次：{batches.find(item=>item.id===Number(batchId))?.name}</p><p>{materialType==='initial'?'初次资料':'更新资料'} · {mode==='current_complete'?'当前完整包材资料':'本次变更资料'}</p><p>已选 {preflight.selectedCount} 个文件 · 有效文件 {preflight.normalCount} 个 · 警告 {preflight.warningCount} 项 · 阻断错误 {preflight.blockingErrors.length} 项</p>{preflight.warnings.map((warning,index)=><p className="info-banner" key={index}>{warning}</p>)}{preflight.blockingErrors.map((error,index)=><p className="error-banner" key={index}>{error.message}</p>)}<button disabled={busy} onClick={()=>setPreflight(null)}>返回检查</button><button disabled={busy||preflight.blockingErrors.length>0||!preflight.selectedCount} onClick={()=>{setPreflight(null);void generate();}}>确认生成</button></section></div>,document.body)}
      {productId && <PackageHistory api={api} productId={Number(productId)} refreshId={created?.id} />}
      {created && showResult && <PackageResult key={created.id} value={created}/>}
    </section>
  );
}
