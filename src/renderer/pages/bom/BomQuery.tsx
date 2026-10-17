import { ViewportRegion } from '../../components/ViewportRegion';
import { useState } from 'react';
import type { BomVersionSummaryView, BomVersionView, DictionaryItemView, MaterialBatchView } from '../../data/client';
import { openBomAssetLocation } from '../../desktop-files';
import { BomHistoryComparison } from './BomHistoryComparison';

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
  const [fileError, setFileError] = useState('');
  const [modelConfirmation, setModelConfirmation] = useState('');
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
      <label title={!mainCategoryId ? '请先选择主类别后选择项目明细' : undefined}><span>项目明细</span><select aria-label="查询 BOM 项目明细" disabled={!mainCategoryId} value={projectItemId} onChange={(e) => setProjectItemId(e.target.value)}><option value="">全部</option>{projects.filter((item) => item.parentId === Number(mainCategoryId)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>图号</span><input aria-label="查询 BOM 图号" value={fullCode} onChange={(e) => setFullCode(e.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? '查询中…' : '查询'}</button>
    </form>
    <div className="batch-toolbar"><div><p className="eyebrow">CHANGE HISTORY</p><h2>BOM 记录</h2></div><span>{history.length} 条记录</span></div>
    {history.length === 0 ? <p className="muted-text">没有符合条件的 BOM 记录。</p> : <ViewportRegion className="bom-history-table" fraction={detail ? 0.5 : 1}><table><thead><tr><th>业务变更日期</th><th>提交时间</th><th>型号</th><th>最后修改时间</th><th>操作</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{businessDateLabel(item)}</td><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{item.model}</td><td>{new Date(item.updatedAt ?? item.createdAt).toLocaleString('zh-CN')}</td><td><button className="text-button" type="button" aria-label={`查看 BOM ${item.id}`} onClick={() => void onView(item.id)}>查看</button><button className="text-button" type="button" aria-label={`编辑 BOM ${item.id}`} disabled={busy} onClick={() => onEdit(item)}>编辑</button><button className="text-button danger" type="button" aria-label={`删除 BOM ${item.id}`} disabled={busy || previewOnly} onClick={() => void onDelete(item.id)}>删除</button></td></tr>)}</tbody></table></ViewportRegion>}
    {detail && <section className="bom-history-detail" aria-label="所选 BOM 记录"><div className="batch-toolbar"><div><h3>BOM 记录详情</h3></div><span>{detail.items.length} 个项目</span></div>
      <p className="muted-text">首次记录直接显示完整资料；有上一条记录时才提供差异筛选。附件核验失败时“打开位置”不可用，具体原因显示在附件下方。</p>
      <BomHistoryComparison detail={detail} readVersion={readVersion} mainCategories={mainCategories} projects={projects} batches={batches} previewOnly={previewOnly} onOpenAsset={openAssetLocation} />
      <details key={detail.id} className="danger-zone" aria-label="删除整个型号 BOM"><summary>危险操作：删除整个型号 BOM</summary><p className="muted-text">此操作会移除 {detail.model} 的全部 BOM 变更记录。普通删除请使用上方记录行。</p><label><span>输入型号确认</span><input aria-label="输入型号确认删除整个 BOM" value={modelConfirmation} onChange={(event) => setModelConfirmation(event.target.value)} /></label><button className="primary-button danger" type="button" disabled={busy || previewOnly || !modelConfirmation} onClick={() => void onDeleteProduct(detail.productId, modelConfirmation)}>删除整个型号 BOM</button></details>
      {fileError && <p className="error-banner" role="alert">{fileError}</p>}</section>}
  </section>;
}
