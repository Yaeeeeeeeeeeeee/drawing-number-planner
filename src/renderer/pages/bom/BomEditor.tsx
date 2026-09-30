import type { BomCandidateView, BomDiffView, BomItemAssetView, BomItemView, BomQrCandidateView, BomQrCodeView, BomVersionView, DictionaryItemView, MaterialBatchView } from '../../data/client';
import { materialBatchLabel } from '../../../core/files/material-batch-label';

type DraftStatus<T> = T extends unknown ? Omit<T, 'status'>
  & { status: 'reserved' | 'active' | 'inactive' | 'voided' } : never;
export type DraftCandidate = DraftStatus<BomCandidateView>;

export interface DraftRow {
  clientId: string; mainCategoryId: string; projectItemId: string; drawingId: string; usesWhiteMaterial: boolean;
  effectiveMaterialBatchId: string; material: string; dimensions: string; position: string; notes: string; changeDetails: string;
  imageAsset: BomItemAssetView | null; diagramAsset: BomItemAssetView | null;
  reuseImage: boolean; reuseDiagram: boolean; previousImageName: string | null; previousDiagramName: string | null;
  qrCodeIds: number[]; inactiveQrCodes: BomQrCodeView[]; showQrCodes: boolean;
  candidates: DraftCandidate[]; candidatesLoaded: boolean;
}

const describeDiff = (item: BomDiffView) => item.type === 'added' ? `${item.projectItemName}：新增 ${item.fullCode}`
  : item.type === 'removed' ? `${item.projectItemName}：移除 ${item.previousFullCode}`
    : item.type === 'replaced' ? `${item.projectItemName}：${item.previousFullCode} → ${item.fullCode}` : `${item.projectItemName}：未变化`;

export const candidateKey = (candidate: DraftCandidate) => candidate.origin === 'planned'
  ? `planned:${candidate.drawingId}` : `historical:${candidate.historicalDrawingId}`;
const candidateLabel = (candidate: DraftCandidate) => candidate.origin === 'historical'
  ? `历史已用 · ${candidate.status === 'inactive' ? '已停用' : '使用中'}`
  : candidate.status === 'reserved' ? '正式规划 · 已占号'
    : candidate.status === 'voided' ? '正式规划 · 作废，需替换' : '正式规划 · 正式使用';

export function BomEditor({ base, rows, mainCategories, projects, batches, qrCandidates, busy, complete, needsRefresh, savedMessage, diff, editing = false,
  onAdd, onDelete, onMainCategory, onProject, onWhite, onDrawing, onChange, onUpload, onQr, onSave, onRefresh }: {
  base: BomVersionView | null; rows: DraftRow[]; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[]; batches: MaterialBatchView[]; qrCandidates: BomQrCandidateView[];
  busy: boolean; complete: boolean; needsRefresh: boolean; savedMessage: string; diff: BomDiffView[]; editing?: boolean;
  onAdd(): void; onDelete(clientId: string): void; onMainCategory(row: DraftRow, value: string): void;
  onProject(row: DraftRow, value: string): void; onWhite(row: DraftRow, value: boolean): void;
  onDrawing(row: DraftRow, value: string): void; onChange(row: DraftRow, field: keyof DraftRow, value: string | boolean): void;
  onUpload(row: DraftRow, role: 'image' | 'diagram', file: File): Promise<void>; onQr(row: DraftRow, id: number, checked: boolean): void;
  onSave(): Promise<void>; onRefresh(): void;
}) {
  return <section aria-label="添加 BOM">
    <div className="batch-toolbar"><div><h2>{editing ? '编辑所选 BOM' : '当前 BOM'}</h2><small>{editing ? '修改所选记录，保留原提交时间；已完成外发及附件沿用快照不变。' : '业务变更日期与提交时间分别记录；保存后建立 BOM 记录。'}</small></div>
      <button className="secondary-button" type="button" disabled={busy} onClick={onAdd}>添加 BOM 项目</button></div>
    {!base && rows.length === 0 && <div className="bom-empty"><strong>尚未建立 BOM</strong><span>添加至少一个项目后保存。</span></div>}
    <div className="planning-rows">{rows.map((row, index) => <article className="planning-row bom-row" key={row.clientId}>
      <div className="planning-row-title"><strong>项目 {index + 1}</strong><button className="link-button" type="button" disabled={busy}
        aria-label={`删除 BOM 项目 ${index + 1}`} onClick={() => onDelete(row.clientId)}>删除</button></div>
      <div className="form-grid bom-row-fields">
        <label><span>主类别</span><select aria-label={`第 ${index + 1} 行主类别`} disabled={busy} value={row.mainCategoryId} onChange={(e) => onMainCategory(row, e.target.value)}><option value="">请选择</option>{mainCategories.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label><span>项目明细</span><select aria-label={`第 ${index + 1} 行项目明细`} disabled={busy || !row.mainCategoryId} value={row.projectItemId} onChange={(e) => onProject(row, e.target.value)}><option value="">请选择</option>{projects.filter((item) => item.parentId === Number(row.mainCategoryId)).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="bom-white-toggle"><span>颜色共用</span><span><input type="checkbox" aria-label={`第 ${index + 1} 行引用白色图号`} disabled={busy} checked={row.usesWhiteMaterial} onChange={(e) => onWhite(row, e.target.checked)} /> 引用白色图号</span></label>
        <label className="bom-drawing-field"><span>图号</span><select aria-label={`第 ${index + 1} 行图号`} disabled={busy || !row.projectItemId} value={row.drawingId} onChange={(e) => onDrawing(row, e.target.value)}><option value="">请选择</option>{row.candidates.map((item) => <option disabled={item.status === 'voided'} key={candidateKey(item)} value={candidateKey(item)}>{item.fullCode} · {item.displayName} · {candidateLabel(item)}</option>)}</select><small className="bom-candidate-rule">当前录入可引用的图号会明确标记“正式规划”或“历史已用”。</small>{row.candidates.some((item) => candidateKey(item) === row.drawingId && item.status === 'voided') && <small className="bom-candidate-empty">当前引用图号已作废，请选择可用图号替换后再保存。</small>}{row.projectItemId && row.candidatesLoaded && row.candidates.length === 0 && <small className="bom-candidate-empty">没有符合条件的图号。</small>}</label>
        <label><span>生效资料批次（可选）</span><select aria-label={`第 ${index + 1} 行生效资料批次`} disabled={busy} value={row.effectiveMaterialBatchId} onChange={(e) => onChange(row, 'effectiveMaterialBatchId', e.target.value)}><option value="">未选择</option>{batches.filter((batch) => batch.isPresent || String(batch.id) === row.effectiveMaterialBatchId).map((batch) => <option key={batch.id} value={batch.id}>{materialBatchLabel(batch.name)}{!batch.isPresent ? '（已缺失，保留原记录）' : ''}</option>)}</select></label>
        <label><span>材质</span><input aria-label={`第 ${index + 1} 行材质`} disabled={busy} value={row.material} onChange={(e) => onChange(row, 'material', e.target.value)} /></label>
        <label><span>尺寸</span><input aria-label={`第 ${index + 1} 行尺寸`} disabled={busy} value={row.dimensions} onChange={(e) => onChange(row, 'dimensions', e.target.value)} /></label>
        <label><span>位置</span><input aria-label={`第 ${index + 1} 行位置`} disabled={busy} value={row.position} onChange={(e) => onChange(row, 'position', e.target.value)} /></label>
        <label><span>备注</span><input aria-label={`第 ${index + 1} 行备注`} disabled={busy} value={row.notes} onChange={(e) => onChange(row, 'notes', e.target.value)} /></label>
        <label><span>修改明细</span><textarea aria-label={`第 ${index + 1} 行修改明细`} disabled={busy} value={row.changeDetails} onChange={(e) => onChange(row, 'changeDetails', e.target.value)} /></label>
        <label><span>图片</span><input aria-label={`第 ${index + 1} 行图片`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void onUpload(row, 'image', file); }} />{row.imageAsset && <small>{row.imageAsset.originalFileName}</small>}</label>
        <label><span>位置示意图</span><input aria-label={`第 ${index + 1} 行位置示意图`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { const file = e.target.files?.[0]; if (file) void onUpload(row, 'diagram', file); }} />{row.diagramAsset && <small>{row.diagramAsset.originalFileName}</small>}</label>
        {base && row.previousImageName && <label><span><input type="checkbox" aria-label={`第 ${index + 1} 行沿用图片`} checked={row.reuseImage} disabled={busy} onChange={(e) => onChange(row, 'reuseImage', e.target.checked)} /> 沿用上一次 BOM：{row.previousImageName}</span></label>}{base && row.previousDiagramName && <label><span><input type="checkbox" aria-label={`第 ${index + 1} 行沿用位置示意图`} checked={row.reuseDiagram} disabled={busy} onChange={(e) => onChange(row, 'reuseDiagram', e.target.checked)} /> 沿用上一次 BOM：{row.previousDiagramName}</span></label>}
      </div>

    </article>)}</div>
    <div className="bom-actions"><button className="primary-button" type="button" disabled={busy || !complete} onClick={() => void onSave()}>{busy ? '保存中…' : editing ? '保存修改' : '保存当前 BOM'}</button>{needsRefresh && <button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>刷新当前 BOM</button>}</div>
    {savedMessage && <p className="success-banner"><strong>{savedMessage}</strong></p>}
    {diff.length > 0 && <section className="bom-diff"><p className="eyebrow">LATEST CHANGE</p><h2>本次变更</h2><div className="bom-diff-list">{diff.filter((item) => item.type !== 'unchanged').map((item) => <span className={`bom-diff-${item.type}`} key={item.projectItemId}>{describeDiff(item)}</span>)}</div></section>}
  </section>;
}
