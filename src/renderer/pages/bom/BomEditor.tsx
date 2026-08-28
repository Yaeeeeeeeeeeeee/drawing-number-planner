import type { BomCandidateView, BomDiffView, BomItemView, BomVersionView, DictionaryItemView } from '../../data/client';

export type DraftCandidate = Omit<BomCandidateView, 'status'> & { status: BomItemView['status'] };
export interface DraftRow {
  clientId: string; projectItemId: string; drawingId: string; quantity: string; notes: string;
  usesWhiteMaterial: boolean; candidates: DraftCandidate[]; candidatesLoaded: boolean;
}

const describeDiff = (item: BomDiffView): string => {
  if (item.type === 'added') return `${item.projectItemName}：新增 ${item.fullCode}`;
  if (item.type === 'removed') return `${item.projectItemName}：移除 ${item.previousFullCode}`;
  if (item.type === 'replaced') return `${item.projectItemName}：${item.previousFullCode} → ${item.fullCode}`;
  return `${item.projectItemName}：未变化`;
};

export function BomEditor({ base, rows, projects, colors, colorId, busy, complete, needsRefresh, savedMessage, diff,
  onAdd, onDelete, onProject, onWhite, onDrawing, onNotes, onSave, onRefresh }: {
  base: BomVersionView | null; rows: DraftRow[]; projects: DictionaryItemView[]; colors: DictionaryItemView[];
  colorId: string; busy: boolean; complete: boolean; needsRefresh: boolean; savedMessage: string; diff: BomDiffView[];
  onAdd(): void; onDelete(clientId: string): void; onProject(row: DraftRow, value: string): void;
  onWhite(row: DraftRow, value: boolean): void; onDrawing(row: DraftRow, value: string): void;
  onNotes(row: DraftRow, value: string): void; onSave(): Promise<void>; onRefresh(): void;
}) {
  return <section aria-label="添加 BOM">
    <div className="batch-toolbar"><div><h2>当前 BOM</h2><small>保存后自动记录本次变更</small></div>
      <button className="secondary-button" type="button" disabled={busy} onClick={onAdd}>添加 BOM 项目</button></div>
    {!base && rows.length === 0 && <div className="bom-empty"><strong>尚未建立 BOM</strong><span>添加项目后保存为当前 BOM。</span></div>}
    <div className="planning-rows">{rows.map((row, index) => <article className="planning-row bom-row" key={row.clientId}>
      <div className="planning-row-title"><strong>项目 {index + 1}</strong><button className="link-button" type="button"
        disabled={busy} aria-label={`删除 BOM 项目 ${index + 1}`} onClick={() => onDelete(row.clientId)}>删除</button></div>
      <div className="form-grid bom-row-fields">
        <label><span>项目</span><select aria-label={`第 ${index + 1} 行项目`} disabled={busy} value={row.projectItemId}
          onChange={(event) => onProject(row, event.target.value)}><option value="">请选择</option>
          {projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="bom-white-toggle"><span>颜色共用</span><span><input type="checkbox" aria-label={`第 ${index + 1} 行引用白色图号`}
          disabled={busy || colors.find((item) => item.id === Number(colorId))?.code === '0'} checked={row.usesWhiteMaterial}
          onChange={(event) => onWhite(row, event.target.checked)} /> 引用白色图号</span>
          {colors.find((item) => item.id === Number(colorId))?.code === '0' && <small>当前 BOM 已是白色，无需引用白色图号</small>}</label>
        <label className="bom-drawing-field"><span>正式图号</span><select aria-label={`第 ${index + 1} 行图号`} disabled={busy || !row.projectItemId}
          value={row.drawingId} onChange={(event) => onDrawing(row, event.target.value)}>
          <option value="">请选择</option>{row.candidates.map((item) => <option disabled={item.status === 'voided'} key={item.id} value={item.id}>{item.fullCode} · {item.displayName} · {item.status === 'reserved' ? '已占号' : item.status === 'active' ? '正式使用' : '作废，需替换'} · {item.colorName}</option>)}</select>
          <small className="bom-candidate-rule">可引用已占号或正式使用的正式规划图号；文件完整性单独提示，已作废图号不会作为新候选。</small>
          {row.candidates.some((item) => item.id === Number(row.drawingId) && item.status === 'voided') && <small className="bom-candidate-empty">当前引用图号已作废，请选择可用图号替换后再保存。</small>}
          {row.projectItemId && row.candidatesLoaded && row.candidates.length === 0 && <small className="bom-candidate-empty">没有符合当前产品、项目和颜色规则的正式规划图号。历史已用图号不会自动进入候选；源文件或转曲后文件是否存在不影响候选资格。</small>}</label>
        <label><span>备注</span><input aria-label={`第 ${index + 1} 行备注`} disabled={busy} value={row.notes}
          onChange={(event) => onNotes(row, event.target.value)} /></label>
      </div>
    </article>)}</div>
    <div className="bom-actions"><button className="primary-button" type="button" disabled={busy || !complete} onClick={() => void onSave()}>{busy ? '保存中…' : '保存当前 BOM'}</button>
      {needsRefresh && <button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>刷新当前 BOM</button>}</div>
    {savedMessage && <p className="success-banner"><strong>{savedMessage}</strong></p>}
    {diff.length > 0 && <section className="bom-diff"><p className="eyebrow">LATEST CHANGE</p><h2>本次变更</h2>
      <div className="bom-diff-list">{diff.filter((item) => item.type !== 'unchanged').map((item) => <span className={`bom-diff-${item.type}`} key={item.projectItemId}>{describeDiff(item)}</span>)}</div></section>}
  </section>;
}
