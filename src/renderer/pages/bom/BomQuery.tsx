import { Settings } from 'lucide-react';
import { useState } from 'react';
import { LayoutTable, resetTableLayouts } from '../../components/LayoutTable';
import '../v4-page-tables.css';
import { ViewportRegion } from '../../components/ViewportRegion';
import type { BomVersionSummaryView, BomVersionView, DictionaryItemView, MaterialBatchView, ProductView } from '../../data/client';
import { openBomAssetLocation } from '../../desktop-files';
import { formatBomTimestamp } from '../../../core/bom/bom-export-document';
import { BomHistoryComparison } from './BomHistoryComparison';
import { BomAssetPreview } from './BomAssetPreview';
import { materialBatchLabel } from '../../../core/files/material-batch-label';
import { BomRecordNotices } from './BomRecordNotices';
import { BomValue } from './BomValue';
import { exportBom } from './bom-export';

const businessDateLabel = (item: BomVersionSummaryView) => item.businessChangeDate ?? '—';
const historyColumns = [
  {key:'businessDate',label:'业务变更日期',width:140,align:'center'},
  {key:'systemTime',label:'记录时间',width:200,align:'center'},
  {key:'productCategory',label:'产品类别',width:120,minWidth:90,align:'center'},
  {key:'model',label:'型号',width:170,minWidth:120,align:'center'},
  {key:'projects',label:'项目明细',width:180,minWidth:120,align:'center'},
  {key:'actions',label:'操作',width:134,minWidth:116,align:'center',locked:'end'},
] as const;

export function BomQuery({ productId, products, businessDateFrom, businessDateTo, setProductId, setBusinessDateFrom, setBusinessDateTo, onReset, mainCategoryId, projectItemId, fullCode,
  mainCategories, projects, busy, history, detail,
  setMainCategoryId, setProjectItemId, setFullCode, onSearch, onView, onDelete, onDeleteProduct, onEdit, onCopy, readVersion, previewOnly = false, batches = [] }: {
  productId: string; products: ProductView[]; businessDateFrom: string; businessDateTo: string; mainCategoryId: string;
  projectItemId: string; fullCode: string; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[];
  batches?: MaterialBatchView[]; previewOnly?: boolean; busy: boolean; history: BomVersionSummaryView[]; detail: BomVersionView | null;
  setProductId(value: string): void; setBusinessDateFrom(value: string): void; setBusinessDateTo(value: string): void; onReset(): void;
  setMainCategoryId(value: string): void; setProjectItemId(value: string): void; setFullCode(value: string): void;
  onEdit(item: BomVersionSummaryView): void; onCopy?(item: BomVersionView): void; onSearch(): Promise<void>; onView(id: number): Promise<void>; onDelete(id: number): Promise<void>;
  onDeleteProduct(productId: number, modelConfirmation: string): Promise<void>;
  readVersion?: (id: number) => Promise<BomVersionView>;
}) {
  const [fileMessage, setFileMessage] = useState<{ id: number; error?: string; success?: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [comparisonId, setComparisonId] = useState<number | null>(null);
  const [moreFor, setMoreFor] = useState<number | null>(null);
  const [modelConfirmation, setModelConfirmation] = useState('');
  const canCompare = detail && Number.isSafeInteger(detail.previousVersionId) && detail.previousVersionId !== detail.id && Boolean(readVersion);
  const openAssetLocation = async (assetId: number) => {
    if (previewOnly || !detail) return;
    const result = await openBomAssetLocation(assetId);
    setFileMessage(result.ok ? null : { id: detail.id, error: result.error?.message ?? '打开文件位置失败' });
  };
  const runExport = async (version: BomVersionView) => {
    setExporting(true); setFileMessage(null);
    try {
      if (await exportBom(version.id, version.editRevision)) setFileMessage({ id: version.id, success: 'BOM PDF 已保存' });
    } catch (error) {
      setFileMessage({ id: version.id, error: error instanceof Error ? error.message : 'BOM PDF 导出失败' });
    } finally { setExporting(false); }
  };

  return <section className="bom-history" aria-label="查询 BOM">
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}>
      <label><span>产品型号</span><select aria-label="查询 BOM 产品型号" value={productId} onChange={e=>setProductId(e.target.value)}><option value="">全部</option>{products.map(p=><option key={p.id} value={p.id}>{p.brandName} · {p.model}</option>)}</select></label>
      <label><span>主类别</span><select aria-label="查询 BOM 主类别" value={mainCategoryId} onChange={(e) => setMainCategoryId(e.target.value)}><option value="">全部</option>{mainCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label title={!mainCategoryId ? '请先选择主类别后选择项目明细' : undefined}><span>项目明细</span><select aria-label="查询 BOM 项目明细" disabled={!mainCategoryId} value={projectItemId} onChange={(e) => setProjectItemId(e.target.value)}><option value="">全部</option>{projects.filter((item) => item.parentId === Number(mainCategoryId)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <fieldset className="bom-date-range"><legend>业务变更日期</legend><div><input aria-label="查询 BOM 开始日期" type="date" value={businessDateFrom} onChange={e=>setBusinessDateFrom(e.target.value)}/><span>至</span><input aria-label="查询 BOM 结束日期" type="date" value={businessDateTo} onChange={e=>setBusinessDateTo(e.target.value)}/></div></fieldset>
      <label><span>图号</span><input aria-label="查询 BOM 图号" value={fullCode} onChange={(e) => setFullCode(e.target.value)} /></label>
      <button className="primary-button" type="submit">{busy ? '查询中…' : '查询'}</button>
      <button className="secondary-button" type="button" onClick={onReset}>重置</button>
    </form>
    <div className="batch-toolbar"><h2>BOM 记录</h2><div className="bom-detail-actions"><span>{history.length} 条记录</span>
      <details className="bom-layout-settings"><summary aria-label="表格设置"><Settings aria-hidden="true" size={16}/></summary>
        <button className="text-button" type="button" onClick={event => { resetTableLayouts('bom.history'); event.currentTarget.closest('details')?.removeAttribute('open'); }}>恢复默认表格布局</button>
      </details>
    </div></div>
    {history.length === 0 ? <p className="muted-text">没有符合条件的 BOM 记录。</p> : <ViewportRegion className="bom-history-table" fraction={detail ? 0.5 : 1}>
      <LayoutTable tableId="bom.history" showLayoutTools={false} columns={[...historyColumns]}>
        <thead><tr>{historyColumns.map(column => <th key={column.key}>{column.label}</th>)}</tr></thead>
        <tbody>{history.map(item => <tr key={item.id} data-selected={detail?.id === item.id} onClick={() => void onView(item.id)}>
          <td>{businessDateLabel(item)}</td>
          <td title={`提交时间 ${formatBomTimestamp(item.createdAt)} · 最后修改时间 ${formatBomTimestamp(item.updatedAt ?? item.createdAt)}`}>
            {formatBomTimestamp(item.updatedAt ?? item.createdAt)}
          </td>
          <td>{products.find(product=>product.id===item.productId)?.productCategory || '—'}</td>
          <td><button className="text-button bom-row-model" type="button" aria-current={detail?.id === item.id ? 'true' : undefined} aria-label={`查看 BOM ${item.id}`} onClick={event => { event.stopPropagation(); void onView(item.id); }}>{item.model}</button></td>
          <td>{item.projectItemNames?.join('、') || '—'}</td>
          <td onClick={event => event.stopPropagation()}>
            <button className="text-button" type="button" aria-label={`编辑 BOM ${item.id}`} disabled={busy} onClick={() => onEdit(item)}>编辑</button>
            <button className="text-button" type="button" aria-label={`更多 BOM ${item.id}`} aria-expanded={moreFor === item.id} onClick={() => setMoreFor(moreFor === item.id ? null : item.id)}>更多</button>
            {moreFor === item.id && <button className="text-button danger bom-more-delete" type="button" aria-label={`删除 BOM ${item.id}`} disabled={busy || previewOnly} onClick={() => { setMoreFor(null); void onDelete(item.id); }}>删除</button>}
          </td>
        </tr>)}</tbody>
      </LayoutTable>
    </ViewportRegion>}
    {detail && <section className="bom-history-detail" aria-label="所选 BOM 记录"><div className="batch-toolbar"><h3>BOM 记录详情</h3>
      <div className="bom-detail-actions"><span>{detail.items.length} 个项目</span>
        <button type="button" className="secondary-button" disabled={previewOnly || exporting || !Number.isSafeInteger(detail.editRevision)} onClick={() => void runExport(detail)}>{exporting ? '正在导出…' : '导出此 BOM'}</button>
        {onCopy && <button type="button" className="secondary-button" disabled={previewOnly || busy} onClick={() => onCopy(detail)}>基于此版新建</button>}
        {canCompare && <button type="button" className="secondary-button" aria-expanded={comparisonId === detail.id} onClick={() => setComparisonId(comparisonId === detail.id ? null : detail.id)}>版本对比</button>}
      </div>
    </div>
      {canCompare && comparisonId === detail.id
        ? <BomHistoryComparison detail={detail} readVersion={readVersion} mainCategories={mainCategories} projects={projects} batches={batches} previewOnly={previewOnly} onOpenAsset={openAssetLocation} />
        : <BomDetail batches={batches} key={`details-${detail.id}`} detail={detail} products={products} mainCategories={mainCategories} projects={projects} />}
      <details key={detail.id} className="danger-zone" aria-label="删除整个型号 BOM"><summary>危险操作：删除整个型号 BOM</summary><p className="muted-text">此操作会移除 {detail.model} 的全部 BOM 变更记录。需仅删除此记录时，请使用记录行的更多操作。</p><label><span>输入型号确认</span><input aria-label="输入型号确认删除整个 BOM" value={modelConfirmation} onChange={(event) => setModelConfirmation(event.target.value)} /></label><button className="primary-button danger" type="button" disabled={busy || previewOnly || !modelConfirmation} onClick={() => void onDeleteProduct(detail.productId, modelConfirmation)}>删除整个型号 BOM</button></details>
      {fileMessage?.id === detail.id && (fileMessage.error
        ? <p className="error-banner" role="alert">{fileMessage.error}</p>
        : <p className="success-banner" role="status">{fileMessage.success}</p>)}</section>}
  </section>;
}

function BomDetail({ detail, products, mainCategories, projects, batches }: {
  batches: MaterialBatchView[];
  detail: BomVersionView; products: ProductView[]; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[];
}) {
  const [copyMessage, setCopyMessage] = useState('');
  const copyCode = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopyMessage('图号已复制'); }
    catch { setCopyMessage('图号复制失败，可选择图号文字手动复制。'); }
  };
  return <>
    <dl className="bom-detail-grid">
      <Attribute name="产品类别" value={products.find(product => product.id === detail.productId)?.productCategory} />
      <Attribute name="产品型号" value={detail.model} />
      <Attribute name="业务变更日期" value={businessDateLabel(detail)} />
      <Attribute name="提交时间" value={formatBomTimestamp(detail.createdAt)} />
      <Attribute name="最后修改时间" value={formatBomTimestamp(detail.updatedAt ?? detail.createdAt)} />
      <Attribute name="记录备注" value={detail.notes} />
    </dl>
    {copyMessage && <div role="status">{copyMessage}</div>}
    {detail.items.map((item, index) => <article className="bom-detail-project" key={item.bomItemId}>
      <h4>{item.projectItemName}</h4>
      <BomRecordNotices index={index + 1} drawingStatus={item.status} batchMissing={batches.some(batch => batch.id === item.effectiveMaterialBatchId && !batch.isPresent)} />
      <section aria-label="基本信息"><h5>基本信息</h5><dl className="bom-detail-grid">
        <Attribute name="主类别" value={mainCategories.find(category => category.id === projects.find(project => project.id === item.projectItemId)?.parentId)?.name} />
        <Attribute name="项目明细" value={item.projectItemName} />
        <div><dt>图号</dt><dd className="bom-detail-code">{item.fullCode ? <><BomValue value={item.fullCode} code/><button type="button" className="text-button" aria-label={`复制图号 ${item.fullCode}`} onClick={() => void copyCode(item.fullCode)}>复制</button></> : '—'}</dd></div>
        <Attribute name="生产批次" value={item.effectiveBatchName ? materialBatchLabel(item.effectiveBatchName) : null} />
        <Attribute name="沿用白色物料" value={item.usesWhiteMaterial ? '是' : '否'} />
      </dl></section>
      <section aria-label="规格"><h5>规格</h5><dl className="bom-detail-grid">
        <Attribute name="材质" value={item.material} /><Attribute name="尺寸" value={item.dimensions} /><Attribute name="位置" value={item.position} />
      </dl></section>
      <section aria-label="变更说明"><h5>变更说明</h5><dl className="bom-detail-grid bom-detail-notes">
        <Attribute name="修改明细" value={item.changeDetails} /><Attribute name="备注" value={item.notes} />
      </dl></section>
      <div className="bom-detail-gallery">{(['image', 'diagram'] as const).map(role => {
        const assets = item.assets.filter(asset => asset.role === role);
        return <div key={role}><span className="bom-field-label">{role === 'image' ? '图片' : '位置示意图'}</span>
          {assets.length ? assets.map(asset => <BomAssetPreview key={asset.id} assetId={asset.assetId} name={asset.originalFileName} gallery={item.assets} />) : '—'}
        </div>;
      })}</div>
    </article>)}
  </>;
}

function Attribute({ name, value }: { name: string; value?: string | null }) {
  return <div><dt>{name}</dt><dd>{value || '—'}</dd></div>;
}
