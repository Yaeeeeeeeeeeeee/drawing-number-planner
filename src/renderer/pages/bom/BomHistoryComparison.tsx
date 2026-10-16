import { useEffect, useId, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { BomItemView, BomVersionView, DictionaryItemView, MaterialBatchView } from '../../data/client';
import { materialBatchLabel } from '../../../core/files/material-batch-label';
import { BomRecordNotices } from './BomRecordNotices';
import { BomHistoryAsset } from './BomHistoryAsset';
import { BomValue } from './BomValue';
import { assetRoles, bomFields, compareBomItems, snapshotItems } from './bom-history-diff';
import type { BomFieldKey, HistoryItem } from './bom-history-diff';
import './bom-history-comparison.css';

const date = (v: BomVersionView) => v.businessChangeDate ?? (v.businessChangeDateLabel === '未补录' ? '业务日期未补录' : v.businessChangeDateLabel);
const time = (s: string) => new Date(s).toLocaleString('zh-CN');
const labels = { added: '新增', removed: '删除', modified: '修改', unchanged: '未变化', pending: '待确认', first: '首次记录' };
type Context = { mainCategories: DictionaryItemView[]; projects: DictionaryItemView[]; batches: MaterialBatchView[]; previewOnly: boolean; onOpenAsset(id: number): void };
function FieldValue({ item, field, context }: { item: BomItemView; field: BomFieldKey; context: Context }) {
  let value: ReactNode;
  switch (field) {
    case 'main': value = context.mainCategories.find(c => c.id === context.projects.find(p => p.id === item.projectItemId)?.parentId)?.name ?? '—'; break;
    case 'project': value = item.projectItemName; break;
    case 'drawing': return item.fullCode ? <BomValue value={item.fullCode} code/> : <>—</>;
    case 'batch': return item.effectiveBatchName ? <BomValue value={materialBatchLabel(item.effectiveBatchName)}/> : <>—</>;
    case 'quantity': value = (item as BomItemView & {quantity?: number}).quantity ?? '未记录'; break;
    case 'white': value = item.usesWhiteMaterial ? '是' : '否'; break;
    default: value = item[field] || '—';
  }
  return <>{value}</>;
}
function BatchDetails({ row }: { row: HistoryItem }) {
  const sides = row.previous && row.selected ? [{ label: '上一条记录', item: row.previous }, { label: '所选记录', item: row.selected }] : [{ label: row.selected ? '所选记录' : '上一条记录', item: row.selected ?? row.previous! }];
  if (!sides.some(side => side.item.effectiveBatchName || side.item.effectiveBatchRelativePath || side.item.effectiveMaterialBatchId !== null)) return null;
  return <details className="bom-history-batch-details"><summary>批次详情</summary><div className="bom-history-batch-snapshots">{sides.map(({ label, item }) => <section key={label} aria-label={`${label}批次详情`}><strong>{label}</strong><dl><dt>名称</dt><dd>{item.effectiveBatchName ? <BomValue value={item.effectiveBatchName}/> : '未记录'}</dd><dt>关联编号</dt><dd>{item.effectiveMaterialBatchId ?? '未记录'}</dd><dt>完整路径</dt><dd>{item.effectiveBatchRelativePath ? <BomValue value={item.effectiveBatchRelativePath}/> : '未记录'}</dd></dl></section>)}</div></details>;
}
function Project({ row, index, expanded, toggle, context, currentDate, previousDate }: { row: HistoryItem; index: number; expanded: boolean; toggle(): void; context: Context; currentDate: string; previousDate?: string }) {
  const id = useId(); const [allFields, setAllFields] = useState(false);
  const item = row.selected ?? row.previous!;
  const paired = !!row.selected && !!row.previous;
  const changes = row.changedFields.length + assetRoles.filter(role => row.attachments[role].changed).length;
  const fields = paired && !allFields ? bomFields.filter(f => row.changedFields.includes(f.key)) : bomFields;
  return <article className="bom-history-project">
    <div className="bom-history-project-heading"><button type="button" className="text-button bom-history-toggle" aria-expanded={expanded} aria-controls={id} onClick={toggle}><span aria-hidden="true">{expanded ? '▾' : '▸'}</span><strong>项目 {index + 1} · {item.projectItemName}</strong><span>{labels[row.kind]}{row.kind === 'modified' ? `｜${changes} 处变化` : ''}</span></button>
      <BomRecordNotices index={index + 1} drawingStatus={item.status} batchMissing={context.batches.some(b => b.id === item.effectiveMaterialBatchId && !b.isPresent)} />
    </div>
    {expanded && <div id={id} className="bom-history-project-body">
      {row.reason && <p className="muted-text">{row.reason}</p>}
      {row.kind === 'added' && <p>上一条记录无此项目；以下为所选记录完整资料。</p>}
      {row.kind === 'removed' && <p>所选记录已移除此项目；以下保留上一条记录完整资料。</p>}
      <div className="bom-history-field-toolbar"><strong>字段{paired ? '差异' : '资料'}</strong>{paired && <div><button className="text-button" type="button" aria-pressed={!allFields} onClick={() => setAllFields(false)}>仅变化项</button><button className="text-button" type="button" aria-pressed={allFields} onClick={() => setAllFields(true)}>全部字段</button></div>}</div>
      {paired && !allFields && !fields.length ? <p className="muted-text">没有已确认的字段变化，可切换全部字段查看。</p> : <div className="bom-history-table-scroll"><table className="bom-history-fields"><colgroup><col className="bom-history-label-col"/>{paired && <col/>}<col/></colgroup><thead><tr><th>字段</th>{paired && <th>上一条记录<small>{previousDate}</small></th>}<th>{row.selected ? '所选记录' : '上一条记录'}<small>{row.selected ? currentDate : previousDate}</small></th></tr></thead><tbody>{fields.map(f => <tr key={f.key} data-changed={paired && row.changedFields.includes(f.key)}><th scope="row" aria-label={f.label}>{f.label}{f.key === 'drawing' && paired && row.changedFields.includes('drawing') && <small title={`上一条：${row.previous!.origin} #${row.previous!.origin === 'planned' ? row.previous!.drawingId : row.previous!.historicalDrawingId}；所选：${row.selected!.origin} #${row.selected!.origin === 'planned' ? row.selected!.drawingId : row.selected!.historicalDrawingId}`}>图号或其关联变更</small>}</th>{paired && <td><FieldValue item={row.previous!} field={f.key} context={context}/></td>}<td><FieldValue item={row.selected ?? row.previous!} field={f.key} context={context}/></td></tr>)}</tbody></table></div>}
      <BatchDetails row={row}/>
      <h4>附件{paired ? '对比' : '资料'}</h4>
      <div className="bom-history-table-scroll"><table className="bom-history-fields"><colgroup><col className="bom-history-label-col"/>{paired && <col/>}<col/></colgroup><thead><tr><th>附件类型</th>{paired && <th>上一条记录</th>}<th>{row.selected ? '所选记录' : '上一条记录'}</th></tr></thead><tbody>{assetRoles.map(role => <tr key={role} data-changed={paired && row.attachments[role].changed}><th scope="row">{role === 'image' ? '图片' : '位置示意图'}{paired && <small>{row.attachments[role].label}</small>}</th>{(paired ? [row.previous!, row.selected!] : [item]).map((side, sideIndex) => <td key={sideIndex}>{side.assets.filter(a => a.role === role).map(a => <BomHistoryAsset key={`${a.assetId}:${a.id}:${a.relativePath}`} asset={a} previewOnly={context.previewOnly} onOpen={context.onOpenAsset}/>)}{!side.assets.some(a => a.role === role) && <span className="muted-text">未关联</span>}</td>)}</tr>)}</tbody></table></div>
    </div>}
  </article>;
}
export function BomHistoryComparison({ detail, readVersion, ...context }: Context & { detail: BomVersionView; readVersion?: (id: number) => Promise<BomVersionView> }) {
  const [result, setResult] = useState<{ target: BomVersionView; previous?: BomVersionView; error?: string } | null>(null);
  useEffect(() => {
    let cancelled = false; setResult(null);
    const id = detail.previousVersionId;
    if (id === null) return;
    if (!Number.isSafeInteger(id) || id === 0 || id === detail.id || !readVersion) { setResult({ target: detail, error: '上一条关系不可用，不能确认对照数据；未推断其他记录。' }); return; }
    void readVersion(id).then(previous => {
      if (cancelled) return;
      setResult(previous.id === id && previous.productId === detail.productId && previous.previousVersionId !== detail.id && Array.isArray(previous.items)
        ? { target: detail, previous } : { target: detail, error: '上一条关系不匹配，不能确认对照数据。' });
    }).catch(() => { if (!cancelled) setResult({ target: detail, error: '上一条记录读取失败，不能确认对照数据；未按首次记录处理。' }); });
    return () => { cancelled = true; };
  }, [detail, readVersion]);
  const first = detail.previousVersionId === null;
  const current = result?.target === detail ? result : null;
  const previous = current?.previous;
  const comparison = useMemo(() => previous ? compareBomItems(detail.items, previous.items) : null, [detail, previous]);
  const rows = useMemo(() => comparison?.rows ?? snapshotItems(detail.items, first ? 'first' : 'pending', first ? '' : '对照尚未确认，以下为所选记录完整资料。'), [comparison, detail, first]);
  return <div className="bom-history-comparison">
    <div className="bom-history-basic"><h3>{detail.model}｜{date(detail)}</h3><span>提交时间：{time(detail.createdAt)}</span>{detail.notes && <p>记录备注：{detail.notes}</p>}</div>
    <section className="bom-history-summary" aria-label="BOM 变更摘要"><h4>BOM 变更摘要</h4><p>所选记录 #{detail.id} · 项目总数 {detail.items.length}</p>
      {first ? <p role="status">首次记录，无历史版本可对照</p> : previous ? <><p>对照上一条记录 #{previous.id} · {date(previous)} · {previous.items.length} 个项目</p><div className="bom-history-counts">{(['added','removed','modified','unchanged','pending'] as const).map(kind => <span key={kind}>{labels[kind]} {comparison!.counts[kind]} 项</span>)}</div></> : <p role="status">{current?.error ?? '正在读取上一条记录…'} 变更统计暂不可用。</p>}
      <small>主类别、项目名称来自当前字典，不作为历史名称变化判断依据。附件摘要表示记录内容，磁盘状态需展开核验。</small>
    </section>
    <ProjectList key={`${detail.id}:${detail.editRevision}:${detail.updatedAt}:${previous ? 'ready' : first ? 'first' : 'pending'}`} rows={rows} context={context} currentDate={date(detail)} previousDate={previous ? date(previous) : undefined}/>
  </div>;
}
function ProjectList({ rows, context, currentDate, previousDate }: { rows: HistoryItem[]; context: Context; currentDate: string; previousDate?: string }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(rows.map(row => [row.key, row.kind !== 'unchanged'])));
  return <><div className="bom-history-field-toolbar"><h4>BOM 项目列表</h4><div><button type="button" className="text-button" onClick={() => setExpanded(Object.fromEntries(rows.map(r => [r.key, true])))}>全部展开</button><button type="button" className="text-button" onClick={() => setExpanded({})}>全部收起</button></div></div>
    {rows.length ? rows.map((row,index) => <Project key={row.key} row={row} index={index} expanded={!!expanded[row.key]} toggle={() => setExpanded(state => ({...state, [row.key]: !state[row.key]}))} context={context} currentDate={currentDate} previousDate={previousDate}/>) : <p className="muted-text">此记录没有项目。</p>}</>;
}
