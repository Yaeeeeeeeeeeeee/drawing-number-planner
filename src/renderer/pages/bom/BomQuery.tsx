import { useState } from 'react';
import type { BomVersionSummaryView, BomVersionView, DictionaryItemView } from '../../data/client';
import { openBomAssetLocation } from '../../desktop-files';
import { BomAssetPreview } from './BomAssetPreview';

const businessDateLabel = (item: { businessChangeDate: string | null; businessChangeDateLabel: string }) =>
  item.businessChangeDate ?? (item.businessChangeDateLabel === '未补录' ? '业务日期未补录' : item.businessChangeDateLabel);

export function BomQuery({ model, businessChangeDate, effectiveBatchRelativePath, mainCategoryId, projectItemId, fullCode,
  mainCategories, projects, busy, history, detail, setModel, setBusinessChangeDate, setEffectiveBatchRelativePath,
  setMainCategoryId, setProjectItemId, setFullCode, onSearch, onView, onDelete, onDeleteProduct, onEdit }: {
  model: string; businessChangeDate: string; effectiveBatchRelativePath: string; mainCategoryId: string;
  projectItemId: string; fullCode: string; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[];
  busy: boolean; history: BomVersionSummaryView[]; detail: BomVersionView | null;
  setModel(value: string): void; setBusinessChangeDate(value: string): void; setEffectiveBatchRelativePath(value: string): void;
  setMainCategoryId(value: string): void; setProjectItemId(value: string): void; setFullCode(value: string): void;
  onEdit(item: BomVersionSummaryView): void; onSearch(): Promise<void>; onView(id: number): Promise<void>; onDelete(id: number): Promise<void>;
  onDeleteProduct(productId: number, modelConfirmation: string): Promise<void>;
}) {
  const [fileError, setFileError] = useState('');
  const [modelConfirmation, setModelConfirmation] = useState('');
  const openAssetLocation = async (assetId: number) => {
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
    {history.length === 0 ? <p className="muted-text">没有符合条件的 BOM 记录。</p> : <table><thead><tr><th>业务变更日期</th><th>提交时间</th><th>型号</th><th>最后修改时间</th><th>操作</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{businessDateLabel(item)}</td><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{item.model}</td><td>{new Date(item.updatedAt ?? item.createdAt).toLocaleString('zh-CN')}</td><td><button className="text-button" type="button" aria-label={`查看 BOM ${item.id}`} onClick={() => void onView(item.id)}>查看</button><button className="text-button" type="button" aria-label={`编辑 BOM ${item.id}`} disabled={busy} onClick={() => onEdit(item)}>编辑</button><button className="text-button danger" type="button" aria-label={`删除 BOM ${item.id}`} disabled={busy} onClick={() => void onDelete(item.id)}>删除</button></td></tr>)}</tbody></table>}
    {detail && <section className="bom-history-detail" aria-label="BOM 历史明细"><div className="batch-toolbar"><div><p className="eyebrow">HISTORY DETAIL</p><h3>历史 BOM 明细 · 业务日期 {businessDateLabel(detail)} · 提交于 {new Date(detail.createdAt).toLocaleString('zh-CN')}</h3></div><span>{detail.items.length} 个项目</span></div>
      <div className="planning-rows">{detail.items.map((item) => <article className="planning-row" key={item.bomItemId}>
        <div className="planning-row-title"><strong>{item.projectItemName}</strong><span className="code-cell">{item.fullCode}</span></div>
        <p>生效批次：{item.effectiveBatchName ?? '—'}</p>
        <dl className="form-grid"><div><dt>材质</dt><dd>{item.material || '—'}</dd></div><div><dt>尺寸</dt><dd>{item.dimensions || '—'}</dd></div><div><dt>位置</dt><dd>{item.position || '—'}</dd></div></dl>
        <ul className="bom-asset-paths">{item.assets.map((asset) => <li key={asset.id}><span><BomAssetPreview key={asset.assetId} assetId={asset.assetId} name={asset.originalFileName} /><strong>{asset.role === 'diagram' ? '位置示意图' : '图片'} · {asset.originalFileName}{(asset.inherited || asset.inheritedFromBomItemAssetId) ? '（沿用）' : ''}</strong><small className="bom-asset-path">{asset.relativePath}</small></span><button className="text-button" type="button" aria-label={`打开附件位置 ${asset.originalFileName}`} onClick={() => void openAssetLocation(asset.assetId)}>打开位置</button></li>)}</ul>
        <div><h4>修改明细</h4><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.changeDetails || '—'}</p></div>
        {item.notes && <div><h4>备注</h4><p>{item.notes}</p></div>}
      </article>)}</div>
      <details key={detail.id} className="danger-zone" aria-label="删除整个型号 BOM"><summary>危险操作：删除整个型号 BOM</summary><p className="muted-text">此操作会移除 {detail.model} 的全部 BOM 变更记录。普通删除请使用上方记录行。</p><label><span>输入型号确认</span><input aria-label="输入型号确认删除整个 BOM" value={modelConfirmation} onChange={(event) => setModelConfirmation(event.target.value)} /></label><button className="primary-button danger" type="button" disabled={busy || !modelConfirmation} onClick={() => void onDeleteProduct(detail.productId, modelConfirmation)}>删除整个型号 BOM</button></details>
      {fileError && <p className="error-banner" role="alert">{fileError}</p>}</section>}
  </section>;
}
