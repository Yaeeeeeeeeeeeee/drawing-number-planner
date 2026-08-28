import type { BomVersionSummaryView, BomVersionView, DictionaryItemView } from '../../data/client';

export function BomQuery({ model, projectItemId, fullCode, projects, busy, history, detail,
  setModel, setProjectItemId, setFullCode, onSearch, onView }: {
  model: string; projectItemId: string; fullCode: string; projects: DictionaryItemView[]; busy: boolean;
  history: BomVersionSummaryView[]; detail: BomVersionView | null;
  setModel(value: string): void; setProjectItemId(value: string): void; setFullCode(value: string): void;
  onSearch(): Promise<void>; onView(id: number): Promise<void>;
}) {
  return <section className="bom-history" aria-label="查询 BOM">
    <form className="filter-bar" onSubmit={(event) => { event.preventDefault(); void onSearch(); }}>
      <label><span>型号</span><input aria-label="查询 BOM 型号" value={model} onChange={(event) => setModel(event.target.value)} /></label>
      <label><span>项目</span><select aria-label="查询 BOM 项目" value={projectItemId} onChange={(event) => setProjectItemId(event.target.value)}><option value="">全部</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label><span>图号</span><input aria-label="查询 BOM 图号" value={fullCode} onChange={(event) => setFullCode(event.target.value)} /></label>
      <button className="primary-button" type="submit" disabled={busy}>{busy ? '查询中…' : '查询'}</button>
    </form>
    <div className="batch-toolbar"><div><p className="eyebrow">CHANGE HISTORY</p><h2>BOM 记录</h2></div><span>{history.length} 条记录</span></div>
    {history.length === 0 ? <p className="muted-text">没有符合条件的 BOM 记录。</p> : <table><thead><tr><th>系统保存时间</th><th>型号</th><th>颜色</th><th>查看</th></tr></thead>
      <tbody>{history.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString('zh-CN')}</td><td>{item.model}</td><td>{item.colorName}</td>
        <td><button className="text-button" type="button" aria-label={`查看 BOM ${item.id}`} onClick={() => void onView(item.id)}>查看</button></td></tr>)}</tbody></table>}
    {detail && <section className="bom-history-detail" aria-label="BOM 历史明细"><div className="batch-toolbar"><div><p className="eyebrow">HISTORY DETAIL</p><h3>历史 BOM 明细 · 系统保存于 {new Date(detail.createdAt).toLocaleString('zh-CN')}</h3></div><span>{detail.items.length} 个项目</span></div>
      <table><thead><tr><th>项目</th><th>图号</th><th>颜色</th><th>共用</th><th>备注</th></tr></thead><tbody>
        {detail.items.map((item) => <tr key={item.bomItemId}><td>{item.projectItemName}</td><td className="code-cell">{item.fullCode}</td><td>{item.colorName}</td><td>{item.usesWhiteMaterial ? '引用白色' : '本色'}</td><td>{item.notes || '—'}</td></tr>)}
      </tbody></table></section>}
  </section>;
}
