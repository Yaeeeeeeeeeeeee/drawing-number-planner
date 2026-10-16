import { ViewportRegion } from '../../components/ViewportRegion';
import { useEffect, useState } from 'react';
import { materialBatchLabel } from '../../../core/files/material-batch-label';
import type { BomVersionSummaryView, BomVersionView, DictionaryItemView, MaterialBatchView } from '../../data/client';
import { openBomAssetLocation } from '../../desktop-files';
import { BomAssetPreview, useBomPreviewFailures } from './BomAssetPreview';
import { BomRecordNotices } from './BomRecordNotices';
import { BomEditComparison } from './BomEditComparison';

const businessDateLabel = (item: { businessChangeDate: string | null; businessChangeDateLabel: string }) =>
  item.businessChangeDate ?? (item.businessChangeDateLabel === '未补录' ? '业务日期未补录' : item.businessChangeDateLabel);

export function BomQuery({ model, businessChangeDate, effectiveBatchRelativePath, mainCategoryId, projectItemId, fullCode,
  mainCategories, projects, busy, history, detail, setModel, setBusinessChangeDate, setEffectiveBatchRelativePath,
  setMainCategoryId, setProjectItemId, setFullCode, onSearch, onView, onDelete, onDeleteProduct, onEdit, readVersion, previewOnly = false, batches = [] }: {
  model: string; businessChangeDate: string; effectiveBatchRelativePath: string; mainCategoryId: string;
  projectItemId: string; fullCode: string; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[];
  batches?: MaterialBatchView[]; previewOnly?: boolean; busy: boolean; history: BomVersionSummaryView[]; detail: BomVersionView | null;
  setModel(value: string): void; setBusinessChangeDate(value: string): void; setEffectiveBatchRelativePath(value: string): void;
  setMainCategoryId(value: string): void; setProjectItemId(value: string): void; setFullCode(value: string): void;
  onEdit(item: BomVersionSummaryView): void; onSearch(): Promise<void>; onView(id: number): Promise<void>; onDelete(id: number): Promise<void>;
  onDeleteProduct(productId: number, modelConfirmation: string): Promise<void>;
  readVersion?: (id: number) => Promise<BomVersionView>;
}) {
  const { failures, onPreviewChange } = useBomPreviewFailures();
  const [fileError, setFileError] = useState('');
  const [modelConfirmation, setModelConfirmation] = useState('');
  const [comparison, setComparison] = useState<{ forId: number; version: BomVersionView | null; message: string } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setComparison(null);
    if (!detail) return;
    const target = detail;
    if (target.previousVersionId === null) { setComparison({ forId: target.id, version: null, message: '无上一条记录' }); return; }
    if (!readVersion || target.previousVersionId === target.id) { setComparison({ forId: target.id, version: null, message: '上一条关系不可用，未推断其他记录' }); return; }
    void readVersion(target.previousVersionId).then((version) => {
      if (cancelled) return;
      setComparison(version.id === target.previousVersionId && version.productId === target.productId
        ? { forId: target.id, version, message: '' }
        : { forId: target.id, version: null, message: '上一条关系不匹配，未展示对照' });
    }).catch(() => { if (!cancelled) setComparison({ forId: target.id, version: null, message: '上一条记录读取失败，不能确认对照数据' }); });
    return () => { cancelled = true; };
  }, [detail, readVersion]);
  const previous = comparison && comparison.forId === detail?.id ? comparison.version : null;
  const openAssetLocation = async (assetId: number) => {
    if (previewOnly) return;
    const result = await openBomAssetLocation(assetId);
    setFileError(result.ok ? '' : result.error?.message ?? '打开文件位置失败');
  };
  return <section className="bom-history" aria-label="查询 BOM">
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}>
      <label><span>型号</span><input aria-label="查询 BOM 型号" value={model} onChange={(e) => setModel(e.target.value)} /></label>
      <label><span>业务日期</span><input aria-label="查询 BOM 业务日期" type="date" value={businessChangeDate} onChange={(e) => setBusinessChangeDate(e.target.value)} /></label>
      <label><span>生效批次路径</span><input type="text" aria-label="查询 BOM 生效批次" placeholder="可输入历史快照路径" value={effectiveBatchRelativePath} onChange={(e) => setEffectiveBatchRelativePath(e.target.value)} /></label>
      <label><span>主类别</span><select aria-label="查询 BOM 主类别" value={mainCategoryId} onChange={(e) => setMainCategoryId(e.target.value)}><option value="">全部</option>{mainCategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>项目明细</span><select aria-label="查询 BOM 项目明细" disabled={!mainCategoryId} value={projectItemId} onChange={(e) => setProjectItemId(e.target.value)}><option value="">全部</option>{projects.filter((item) => item.parentId === Number(mainCategoryId)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>图号</span><input aria-label="查询 BOM 图号" value={fullCode} onChange={(e) => setFullCode(e.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? '查询中…' : '查询'}</button>
    </form>
    <div className="batch-toolbar"><div><p className="eyebrow">CHANGE HISTORY</p><h2>BOM 记录</h2></div><span>{history.length} 条记录</span></div>
    {history.length === 0 ? <p className="muted-text">没有符合条件的 BOM 记录。</p> : <ViewportRegion className="bom-history-table" fraction={detail ? 0.5 : 1}><table><thead><tr><th>业务变更日期</th><th>提交时间</th><th>型号</th><th>最后修改时间</th><th>操作</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{businessDateLabel(item)}</td><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{item.model}</td><td>{new Date(item.updatedAt ?? item.createdAt).toLocaleString('zh-CN')}</td><td><button className="text-button" type="button" aria-label={`查看 BOM ${item.id}`} onClick={() => void onView(item.id)}>查看</button><button className="text-button" type="button" aria-label={`编辑 BOM ${item.id}`} disabled={busy} onClick={() => onEdit(item)}>编辑</button><button className="text-button danger" type="button" aria-label={`删除 BOM ${item.id}`} disabled={busy || previewOnly} onClick={() => void onDelete(item.id)}>删除</button></td></tr>)}</tbody></table></ViewportRegion>}
    {detail && <section className="bom-history-detail bom-query-vertical" aria-label="所选 BOM 记录"><div className="batch-toolbar"><div><p className="eyebrow">SELECTED RECORD</p><h3>所选 BOM 记录 · 业务日期 {businessDateLabel(detail)} · 提交于 {new Date(detail.createdAt).toLocaleString('zh-CN')}</h3></div><span>{detail.items.length} 个项目</span></div>
      <p className="muted-text" role="status">{comparison?.forId === detail.id ? comparison.message || `左侧：所选记录 · 业务日期 ${businessDateLabel(detail)}；右侧：上一条记录 · 业务日期 ${businessDateLabel(comparison.version!)}` : '正在读取上一条记录…'}</p>
      <div className="bom-work-list">{detail.items.map((item, index) => <article className="bom-work-record bom-query-record" key={item.bomItemId}>
        <div className="bom-record-heading"><strong>项目 {index + 1} · {item.projectItemName}</strong><BomRecordNotices index={index + 1} drawingStatus={item.status} batchMissing={batches.some((batch) => batch.id === item.effectiveMaterialBatchId && !batch.isPresent)} previewFailed={item.assets.some((asset) => failures[asset.assetId])} /></div>
        <BomEditComparison query selectedDate={businessDateLabel(detail)} changeDetails={item.changeDetails} index={index + 1} original={previous?.items.filter((old) => old.projectItemId === item.projectItemId).length === 1 ? previous.items.find((old) => old.projectItemId === item.projectItemId) : undefined} previousDate={previous ? businessDateLabel(previous) : undefined} mainCategories={mainCategories} projects={projects}>
          <div><span className="bom-field-label">主类别</span><span>{mainCategories.find((category) => category.id === projects.find((project) => project.id === item.projectItemId)?.parentId)?.name || '—'}</span></div>
          <div><span className="bom-field-label">项目</span><span>{item.projectItemName}</span></div>
          <div className="bom-code-field"><span className="bom-field-label">图号</span><span className="code-cell">{item.fullCode}</span></div>
          <div><span className="bom-field-label">生效批次</span><span>{item.effectiveBatchName ? materialBatchLabel(item.effectiveBatchName) : '—'}</span></div>
          <div><span className="bom-field-label">材质</span><span>{item.material || '—'}</span></div>
          <div><span className="bom-field-label">尺寸</span><span>{item.dimensions || '—'}</span></div>
          <div className="bom-attachment-field"><span className="bom-field-label">图片</span>{item.assets.filter((asset) => asset.role === 'image').map((asset) => <div key={asset.id} className="bom-query-asset"><BomAssetPreview assetId={asset.assetId} name={asset.originalFileName} onPreviewChange={onPreviewChange} /><strong className="bom-query-asset-name">{asset.originalFileName}{(asset.inherited || asset.inheritedFromBomItemAssetId) ? '（沿用）' : ''}</strong><button className="text-button" disabled={previewOnly} type="button" aria-label={`打开附件位置 ${asset.originalFileName}`} onClick={() => void openAssetLocation(asset.assetId)}>打开位置</button></div>)}{!item.assets.some((asset) => asset.role === 'image') && <small>未关联图片</small>}</div>
          <div className="bom-position-field"><span className="bom-field-label">位置</span><span>{item.position || '—'}</span></div>
          <div className="bom-attachment-field"><span className="bom-field-label">位置示意图</span>{item.assets.filter((asset) => asset.role === 'diagram').map((asset) => <div key={asset.id} className="bom-query-asset"><BomAssetPreview assetId={asset.assetId} name={asset.originalFileName} onPreviewChange={onPreviewChange} /><strong className="bom-query-asset-name">{asset.originalFileName}{(asset.inherited || asset.inheritedFromBomItemAssetId) ? '（沿用）' : ''}</strong><button className="text-button" disabled={previewOnly} type="button" aria-label={`打开附件位置 ${asset.originalFileName}`} onClick={() => void openAssetLocation(asset.assetId)}>打开位置</button></div>)}{!item.assets.some((asset) => asset.role === 'diagram') && <small>未关联位置示意图</small>}</div>
          <div className="bom-change-field"><span className="bom-field-label">修改明细</span><span className="bom-multiline">{item.changeDetails || '—'}</span></div>
          <div className="bom-notes-field"><span className="bom-field-label">备注</span><span>{item.notes || '—'}</span></div>
        </BomEditComparison>
      </article>)}</div>
      <details key={detail.id} className="danger-zone" aria-label="删除整个型号 BOM"><summary>危险操作：删除整个型号 BOM</summary><p className="muted-text">此操作会移除 {detail.model} 的全部 BOM 变更记录。普通删除请使用上方记录行。</p><label><span>输入型号确认</span><input aria-label="输入型号确认删除整个 BOM" value={modelConfirmation} onChange={(event) => setModelConfirmation(event.target.value)} /></label><button className="primary-button danger" type="button" disabled={busy || previewOnly || !modelConfirmation} onClick={() => void onDeleteProduct(detail.productId, modelConfirmation)}>删除整个型号 BOM</button></details>
      {fileError && <p className="error-banner" role="alert">{fileError}</p>}</section>}
  </section>;
}
