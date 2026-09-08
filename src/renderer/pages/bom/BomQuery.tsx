import type { BomVersionSummaryView, BomVersionView, DictionaryItemView } from '../../data/client';

const businessDateLabel = (item: { businessChangeDate: string | null; businessChangeDateLabel: string }) =>
  item.businessChangeDate ?? (item.businessChangeDateLabel === '未补录' ? '业务日期未补录' : item.businessChangeDateLabel);

export function BomQuery({ model, businessChangeDate, effectiveBatchRelativePath, projectItemId, fullCode, projects, busy, history, detail,
  setModel, setBusinessChangeDate, setEffectiveBatchRelativePath, setProjectItemId, setFullCode, onSearch, onView }: {
  model: string; businessChangeDate: string; effectiveBatchRelativePath: string; projectItemId: string; fullCode: string;
  projects: DictionaryItemView[]; busy: boolean; history: BomVersionSummaryView[]; detail: BomVersionView | null;
  setModel(value: string): void; setBusinessChangeDate(value: string): void; setEffectiveBatchRelativePath(value: string): void;
  setProjectItemId(value: string): void; setFullCode(value: string): void; onSearch(): Promise<void>; onView(id: number): Promise<void>;
}) {
  return <section className="bom-history" aria-label="查询 BOM">
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}>
      <label><span>型号</span><input aria-label="查询 BOM 型号" value={model} onChange={(e) => setModel(e.target.value)} /></label>
      <label><span>业务日期</span><input aria-label="查询 BOM 业务日期" type="date" value={businessChangeDate} onChange={(e) => setBusinessChangeDate(e.target.value)} /></label>
      <label><span>生效批次路径</span><input type="text" aria-label="查询 BOM 生效批次" placeholder="可输入历史快照路径" value={effectiveBatchRelativePath} onChange={(e) => setEffectiveBatchRelativePath(e.target.value)} /></label>
      <label><span>项目</span><select aria-label="查询 BOM 项目" value={projectItemId} onChange={(e) => setProjectItemId(e.target.value)}><option value="">全部</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>图号</span><input aria-label="查询 BOM 图号" value={fullCode} onChange={(e) => setFullCode(e.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? '查询中…' : '查询'}</button>
    </form>
    <div className="batch-toolbar"><div><p className="eyebrow">CHANGE HISTORY</p><h2>BOM 记录</h2></div><span>{history.length} 条记录</span></div>
    {history.length === 0 ? <p className="muted-text">没有符合条件的 BOM 记录。</p> : <table><thead><tr><th>业务变更日期</th><th>提交时间</th><th>型号</th><th>版本</th><th>查看</th></tr></thead><tbody>{history.map((item) => <tr key={item.id}><td>{businessDateLabel(item)}</td><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{item.model}</td><td>V{item.versionNumber}</td><td><button className="text-button" type="button" aria-label={`查看 BOM ${item.id}`} onClick={() => void onView(item.id)}>查看</button></td></tr>)}</tbody></table>}
    {detail && <section className="bom-history-detail" aria-label="BOM 历史明细"><div className="batch-toolbar"><div><p className="eyebrow">HISTORY DETAIL</p><h3>历史 BOM 明细 · 业务日期 {businessDateLabel(detail)} · 提交于 {new Date(detail.createdAt).toLocaleString('zh-CN')}</h3></div><span>{detail.items.length} 个项目</span></div>
      <table><thead><tr><th>项目</th><th>图号</th><th>生效批次</th><th>材质/尺寸/位置</th><th>附件</th><th>二维码</th><th>备注</th></tr></thead><tbody>{detail.items.map((item) => <tr key={item.bomItemId}><td>{item.projectItemName}</td><td className="code-cell">{item.fullCode}</td><td>{item.effectiveBatchName ?? '—'}</td><td>{[item.material, item.dimensions, item.position].filter(Boolean).join(' / ') || '—'}</td><td>{item.assets.map((asset) => `${asset.role}：${asset.originalFileName}${asset.inheritedFromBomItemAssetId ? '（沿用）' : ''}`).join('；') || '—'}</td><td>{item.qrCodes.map((qr) => qr.purposeDisplayName || qr.name).join('；') || '—'}</td><td>{item.notes || '—'}</td></tr>)}</tbody></table></section>}
  </section>;
}
