import type { BomCandidateView, BomDiffView, BomItemAssetView, BomItemView, BomQrCandidateView, BomQrCodeView, BomVersionView, DictionaryItemView, MaterialBatchView } from '../../data/client';
import { useBomPreviewFailures } from './BomAssetPreview';
import { BomAttachmentControl } from './BomAttachmentControl';
import { BomRecordNotices } from './BomRecordNotices';
import { materialBatchLabel } from '../../../core/files/material-batch-label';
import { BomEditComparison } from './BomEditComparison';

type DraftStatus<T> = T extends unknown ? Omit<T, 'status'>
  & { status: 'reserved' | 'active' | 'inactive' | 'voided' } : never;
export type DraftCandidate = DraftStatus<BomCandidateView>;

export interface DraftRow {
  originalItemId?: number;
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
  previewOnly = false, simulateConflict = false, blockers = [],
  onAdd, onDelete, onMainCategory, onProject, onWhite, onDrawing, onChange, onUpload, onQr, onSave, onRefresh }: {
  base: BomVersionView | null; rows: DraftRow[]; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[]; batches: MaterialBatchView[]; qrCandidates: BomQrCandidateView[];
  busy: boolean; complete: boolean; needsRefresh: boolean; savedMessage: string; diff: BomDiffView[]; editing?: boolean; previewOnly?: boolean; simulateConflict?: boolean; blockers?: string[];
  onAdd(): void; onDelete(clientId: string): void; onMainCategory(row: DraftRow, value: string): void;
  onProject(row: DraftRow, value: string): void; onWhite(row: DraftRow, value: boolean): void;
  onDrawing(row: DraftRow, value: string): void; onChange(row: DraftRow, field: keyof DraftRow, value: string | boolean): void;
  onUpload(row: DraftRow, role: 'image' | 'diagram', file: File): Promise<void>; onQr(row: DraftRow, id: number, checked: boolean): void;
  onSave(): Promise<void>; onRefresh(): void;
}) {
  const { failures, onPreviewChange } = useBomPreviewFailures();
  return <section aria-label="添加 BOM">
    <div className="batch-toolbar"><div><h2>{editing ? '编辑所选 BOM' : '当前 BOM'}</h2><small>{editing ? '编辑所选记录；原提交时间及已完成外发、附件沿用快照不变。' : '业务变更日期与提交时间分别记录。'} · {rows.length} 个项目</small></div>
      <button className="secondary-button" type="button" disabled={busy} onClick={onAdd}>添加 BOM 项目</button></div>
    {!base && rows.length === 0 && <div className="bom-empty"><strong>尚未建立 BOM</strong><span>添加至少一个项目后保存。</span></div>}
    <div className="bom-work-list">{rows.map((row, index) => {
      const selected = row.candidates.find((item) => candidateKey(item) === row.drawingId);
      const fieldErrors = blockers.filter((text) => text.startsWith(`项目 ${index + 1} ·`));
      const drawingError = fieldErrors.find((text) => text.includes('· 图号：'));
      return <article className="bom-work-record" key={row.clientId} aria-label={`BOM 项目 ${index + 1}`}>
        <div className="bom-record-heading"><strong>项目 {index + 1} · {projects.find((item) => String(item.id) === row.projectItemId)?.name || '未选择'}</strong><BomRecordNotices index={index + 1} blocked={fieldErrors.length > 0} drawingStatus={selected?.status} batchMissing={batches.some((batch) => String(batch.id) === row.effectiveMaterialBatchId && !batch.isPresent)} previewFailed={[row.imageAsset, row.diagramAsset].some((asset) => asset && failures[asset.assetId])} noCandidates={Boolean(row.projectItemId && row.candidatesLoaded && row.candidates.length === 0)} />
          <button className="text-button" type="button" disabled={busy} aria-label={`删除 BOM 项目 ${index + 1}`} onClick={() => onDelete(row.clientId)}>移除项目</button></div>
        <BomEditComparison changeDetails={row.changeDetails} index={index + 1} original={base?.items.find((item) => item.bomItemId === row.originalItemId)} mainCategories={mainCategories} projects={projects}>
          <div className="bom-category-field">
            {fieldErrors.filter((text) => text.includes('· 主类别：')).map((text) => <small className="bom-candidate-empty" key={text}>{text}</small>)}
            <label><span>主类别</span><select aria-label={`第 ${index + 1} 行主类别`} disabled={busy} value={row.mainCategoryId} onChange={(e) => onMainCategory(row, e.target.value)}><option value="">请选择</option>{mainCategories.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          </div>
          <div className="bom-project-field">
            {fieldErrors.filter((text) => text.includes('· 项目：')).map((text) => <small className="bom-candidate-empty" key={text}>{text}</small>)}
            <label><span>项目</span><select aria-label={`第 ${index + 1} 行项目明细`} disabled={busy || !row.mainCategoryId} value={row.projectItemId} onChange={(e) => onProject(row, e.target.value)}><option value="">请选择</option>{projects.filter((item) => item.parentId === Number(row.mainCategoryId)).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
          </div>
          <div className="bom-code-field">
            <label><span>图号</span><select aria-invalid={drawingError ? true : undefined} aria-describedby={[selected && `${row.clientId}-qualification`, (drawingError || selected?.status === 'voided') && `${row.clientId}-drawing-error`].filter(Boolean).join(' ') || undefined} aria-label={`第 ${index + 1} 行图号`} disabled={busy || !row.projectItemId} value={row.drawingId} onChange={(e) => onDrawing(row, e.target.value)}><option value="">请选择</option>{row.candidates.map((item) => <option disabled={item.status === 'voided'} key={candidateKey(item)} value={candidateKey(item)}>{item.fullCode}{candidateKey(item) !== row.drawingId && ` · ${candidateLabel(item)}`}</option>)}</select></label>
            {selected && <div id={`${row.clientId}-qualification`} className="bom-selected-drawing">{selected.fullCode.length > 28 && <span className="code-cell">{selected.fullCode}</span>}<small>{candidateLabel(selected)}</small></div>}
            <label className="bom-inline-check"><input type="checkbox" aria-label={`第 ${index + 1} 行引用白色图号`} disabled={busy} checked={row.usesWhiteMaterial} onChange={(e) => onWhite(row, e.target.checked)} />引用白色图号</label>
            <small className="bom-candidate-rule">候选区分正式规划 / 历史已用。</small>
            {selected?.status === 'voided' ? <small id={`${row.clientId}-drawing-error`} className="bom-candidate-empty">当前引用图号已作废，请选择可用图号替换后再保存。</small> : row.projectItemId && row.candidatesLoaded && row.candidates.length === 0 ? <small id={`${row.clientId}-drawing-error`} className="bom-candidate-empty">没有符合条件的图号。</small> : drawingError && <small id={`${row.clientId}-drawing-error`} className="bom-candidate-empty">{drawingError}</small>}
          </div>
          <label><span>生效批次（可选）</span><select aria-label={`第 ${index + 1} 行生效资料批次`} disabled={busy} value={row.effectiveMaterialBatchId} onChange={(e) => onChange(row, 'effectiveMaterialBatchId', e.target.value)}><option value="">未选择</option>{batches.filter((batch) => batch.isPresent || String(batch.id) === row.effectiveMaterialBatchId).map((batch) => <option key={batch.id} value={batch.id}>{materialBatchLabel(batch.name)}{!batch.isPresent ? '（已缺失，保留原记录）' : ''}</option>)}</select>{row.effectiveMaterialBatchId && batches.some((batch) => String(batch.id) === row.effectiveMaterialBatchId && !batch.isPresent) && <small className="bom-candidate-empty">批次缺失 · 保留原记录</small>}</label>
          <label><span>材质</span><textarea rows={2} aria-label={`第 ${index + 1} 行材质`} disabled={busy} value={row.material} onChange={(e) => onChange(row, 'material', e.target.value)} /></label>
          <label><span>尺寸</span><textarea rows={2} aria-label={`第 ${index + 1} 行尺寸`} disabled={busy} value={row.dimensions} onChange={(e) => onChange(row, 'dimensions', e.target.value)} /></label>
          <BomAttachmentControl index={index + 1} role="image" asset={row.imageAsset} canReuse={Boolean(base && row.previousImageName)} reuse={row.reuseImage} disabled={busy} previewOnly={previewOnly} onReuse={(value) => onChange(row, 'reuseImage', value)} onUpload={(file) => { void onUpload(row, 'image', file); }} onPreviewChange={onPreviewChange} />
          <label className="bom-position-field"><span>位置</span><textarea rows={2} aria-label={`第 ${index + 1} 行位置`} disabled={busy} value={row.position} onChange={(e) => onChange(row, 'position', e.target.value)} /></label>
          <BomAttachmentControl index={index + 1} role="diagram" asset={row.diagramAsset} canReuse={Boolean(base && row.previousDiagramName)} reuse={row.reuseDiagram} disabled={busy} previewOnly={previewOnly} onReuse={(value) => onChange(row, 'reuseDiagram', value)} onUpload={(file) => { void onUpload(row, 'diagram', file); }} onPreviewChange={onPreviewChange} />
          <label className="bom-change-field"><span>修改明细</span><textarea rows={3} aria-label={`第 ${index + 1} 行修改明细`} disabled={busy} value={row.changeDetails} onChange={(e) => onChange(row, 'changeDetails', e.target.value)} /></label>
          <label className="bom-notes-field"><span>备注</span><textarea rows={2} aria-label={`第 ${index + 1} 行备注`} disabled={busy} value={row.notes} onChange={(e) => onChange(row, 'notes', e.target.value)} /></label>
        </BomEditComparison>
      </article>;
    })}</div>
    <div className="bom-save-summary">
      {!complete && blockers.length > 0 && <div role="status"><strong>暂不能保存</strong><ul>{blockers.map((text) => <li key={text}>{text}</li>)}</ul></div>}
      {previewOnly && <p className="muted-text">{simulateConflict ? '模拟保存只返回冲突，不写入任何数据。' : 'Mock：可调整内存草稿；保存、上传及维护操作已禁用。'}</p>}
      <div className="bom-actions"><button className="primary-button" type="button" disabled={busy || !complete || (previewOnly && !simulateConflict)} onClick={() => void onSave()}>{busy ? '保存中…' : simulateConflict ? '模拟保存冲突' : editing ? '保存修改' : '保存当前 BOM'}</button>{needsRefresh && <button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>刷新当前 BOM</button>}</div>
    </div>
    {savedMessage && <p className="success-banner"><strong>{savedMessage}</strong></p>}
    {diff.length > 0 && <section className="bom-diff"><h2>本次变更</h2><div className="bom-diff-list">{diff.filter((item) => item.type !== 'unchanged').map((item) => <span className={`bom-diff-${item.type}`} key={item.projectItemId}>{describeDiff(item)}</span>)}</div></section>}
  </section>;
}
