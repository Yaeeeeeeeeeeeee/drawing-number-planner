import { useState } from 'react';
import type { BomCandidateView, BomItemAssetView, BomItemView, BomQrCandidateView, BomQrCodeView, BomVersionView, DictionaryItemView, MaterialBatchView } from '../../data/client';
import { useBomPreviewFailures } from './BomAssetPreview';
import { BomAttachmentControl } from './BomAttachmentControl';
import { BomRecordNotices } from './BomRecordNotices';
import { materialBatchLabel } from '../../../core/files/material-batch-label';
import { BomDrawingField, candidateKey } from './BomDrawingField';
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

export { candidateKey } from './BomDrawingField';

export function BomEditor({ base, reuseSource = base, rows, mainCategories, projects, batches, qrCandidates, busy, complete, needsRefresh, savedMessage, editing = false,
  previewOnly = false, simulateConflict = false, blockers = [],
  onAdd, onBulkImport, onDelete, onMainCategory, onProject, onWhite, onDrawing, onChange, onUpload, onQr, onSave, onRefresh }: {
  base: BomVersionView | null; reuseSource?: BomVersionView | null; rows: DraftRow[]; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[]; batches: MaterialBatchView[]; qrCandidates: BomQrCandidateView[];
  busy: boolean; complete: boolean; needsRefresh: boolean; savedMessage: string; editing?: boolean; previewOnly?: boolean; simulateConflict?: boolean; blockers?: string[];
  onAdd(): void; onBulkImport?(): void; onDelete(clientId: string): void; onMainCategory(row: DraftRow, value: string): void;
  onProject(row: DraftRow, value: string): void; onWhite(row: DraftRow, value: boolean): void;
  onDrawing(row: DraftRow, value: string): void; onChange(row: DraftRow, field: keyof DraftRow, value: string | boolean): void;
  onUpload(row: DraftRow, role: 'image' | 'diagram', file: File): Promise<void>; onQr(row: DraftRow, id: number, checked: boolean): void;
  onSave(): Promise<void>; onRefresh(): void;
}) {
  const { failures, onPreviewChange } = useBomPreviewFailures();
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);
  const markTouched = (id: string) => setTouched(previous => previous[id] ? previous : { ...previous, [id]: true });
  const focusField = (id: string) => document.getElementById(id)?.focus();
  const fieldIdFor = (message: string) => {
    if (message.startsWith('业务变更日期：')) return 'bom-business-date';
    const match = /^项目 (\d+) · (主类别|项目|图号)：/.exec(message);
    if (!match) return 'bom-add-item';
    const row = rows[Number(match[1]) - 1];
    const fields = { 主类别: 'main', 项目: 'project', 图号: 'drawing' };
    const field = fields[match[2] as keyof typeof fields];
    // A dependent field can be disabled until its upstream selection exists.
    return `${row.clientId}-${!row.mainCategoryId ? 'main' : !row.projectItemId && field === 'drawing' ? 'project' : field}`;
  };
  const submit = () => {
    if (complete) { setSubmitted(false); setTouched({}); void onSave(); }
    else { setSubmitted(true); if (blockers[0]) focusField(fieldIdFor(blockers[0])); }
  };
  const blockedByVoidedDrawing = blockers.some(message => message.includes('原引用已作废'));

  return <section aria-label="添加 BOM">
    <div className="batch-toolbar"><div><h2>{editing ? '编辑所选 BOM' : '当前 BOM'}</h2><small>{rows.length} 个项目</small></div></div>
    {!base && rows.length === 0 && <div className="bom-empty"><strong>尚无当前 BOM</strong><span>添加至少一个项目后保存。</span></div>}
    <div className="bom-work-list">{rows.map((row, index) => {
      const selected = row.candidates.find((item) => candidateKey(item) === row.drawingId);
      const fieldErrors = blockers.filter((text) => text.startsWith(`项目 ${index + 1} ·`));
      const mainError = (submitted || touched[`${row.clientId}-main`]) && fieldErrors.some(text => text.includes('· 主类别：'));
      const projectError = (submitted || touched[`${row.clientId}-project`]) && fieldErrors.some(text => text.includes('· 项目：'));
      const drawingError = (submitted || touched[`${row.clientId}-drawing`]) && fieldErrors.find(text => text.includes('· 图号：'));
      return <article className="bom-work-record" key={row.clientId} aria-label={`BOM 项目 ${index + 1}`}>
        <div className="bom-record-heading"><strong>项目 {index + 1} · {projects.find((item) => String(item.id) === row.projectItemId)?.name || '未选择'}</strong><BomRecordNotices index={index + 1} blocked={Boolean(mainError || projectError || drawingError)} drawingStatus={selected?.status} batchMissing={batches.some((batch) => String(batch.id) === row.effectiveMaterialBatchId && !batch.isPresent)} previewFailed={[row.imageAsset, row.diagramAsset].some((asset) => asset && failures[asset.assetId])} noCandidates={Boolean(row.projectItemId && row.candidatesLoaded && row.candidates.length === 0)} />
          <button className="text-button" type="button" disabled={busy} aria-label={`删除 BOM 项目 ${index + 1}`} onClick={() => onDelete(row.clientId)}>移除项目</button></div>
        <BomEditComparison changeDetails={row.changeDetails} index={index + 1} original={base?.items.find((item) => item.bomItemId === row.originalItemId)} mainCategories={mainCategories} projects={projects}>
          <div className="bom-category-field">
            <label><span>主类别 <span aria-hidden="true" className="bom-required">*</span></span><select id={`${row.clientId}-main`} aria-invalid={mainError || undefined} aria-describedby={mainError ? `${row.clientId}-main-error` : undefined} aria-required="true" aria-label={`第 ${index + 1} 行主类别`} disabled={busy} value={row.mainCategoryId} onBlur={event => markTouched(event.target.id)} onChange={(e) => onMainCategory(row, e.target.value)}><option value="">请选择</option>{mainCategories.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            {mainError && <small className="bom-candidate-empty" id={`${row.clientId}-main-error`}>请选择主类别</small>}
          </div>
          <div className="bom-project-field">
            <label><span>项目明细 <span aria-hidden="true" className="bom-required">*</span></span><select id={`${row.clientId}-project`} aria-invalid={projectError || undefined} aria-describedby={projectError ? `${row.clientId}-project-error` : undefined} aria-required="true" aria-label={`第 ${index + 1} 行项目明细`} disabled={busy || !row.mainCategoryId} value={row.projectItemId} onBlur={event => markTouched(event.target.id)} onChange={(e) => onProject(row, e.target.value)}><option value="">请选择</option>{projects.filter((item) => item.parentId === Number(row.mainCategoryId)).map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            {projectError && <small className="bom-candidate-empty" id={`${row.clientId}-project-error`}>请选择项目明细</small>}
          </div>
          <BomDrawingField key={row.projectItemId} row={row} index={index + 1} selected={selected} busy={busy} drawingError={drawingError || undefined}
            onBlur={() => markTouched(`${row.clientId}-drawing`)} onWhite={value => onWhite(row, value)} onDrawing={value => onDrawing(row, value)} />
          <label><span>生效批次（可选）</span><select aria-label={`第 ${index + 1} 行生效资料批次`} disabled={busy} value={row.effectiveMaterialBatchId} onChange={(e) => onChange(row, 'effectiveMaterialBatchId', e.target.value)}><option value="">未选择</option>{batches.filter((batch) => batch.isPresent || String(batch.id) === row.effectiveMaterialBatchId).map((batch) => <option key={batch.id} value={batch.id}>{materialBatchLabel(batch.name)}{!batch.isPresent ? '（已缺失，保留原记录）' : ''}</option>)}</select>{row.effectiveMaterialBatchId && batches.some((batch) => String(batch.id) === row.effectiveMaterialBatchId && !batch.isPresent) && <small className="bom-candidate-empty">批次缺失 · 保留原记录</small>}</label>
          <label><span>材质</span><input aria-label={`第 ${index + 1} 行材质`} disabled={busy} value={row.material} onChange={(e) => onChange(row, 'material', e.target.value)} /></label>
          <label><span>尺寸</span><input aria-label={`第 ${index + 1} 行尺寸`} disabled={busy} value={row.dimensions} onChange={(e) => onChange(row, 'dimensions', e.target.value)} /></label>
          <BomAttachmentControl index={index + 1} role="image" asset={row.imageAsset} gallery={[row.imageAsset,row.diagramAsset].filter((asset): asset is BomItemAssetView=>Boolean(asset))} canReuse={Boolean(reuseSource?.items.find(item=>item.projectItemId===Number(row.projectItemId))?.assets.some(asset=>asset.role==='image' && !failures[asset.assetId]))} reuse={row.reuseImage} disabled={busy} previewOnly={previewOnly} onReuse={(value) => onChange(row, 'reuseImage', value)} onUpload={(file) => { void onUpload(row, 'image', file); }} onPreviewChange={onPreviewChange} />
          <label className="bom-position-field"><span>位置</span><input aria-label={`第 ${index + 1} 行位置`} disabled={busy} value={row.position} onChange={(e) => onChange(row, 'position', e.target.value)} /></label>
          <BomAttachmentControl index={index + 1} role="diagram" asset={row.diagramAsset} gallery={[row.imageAsset,row.diagramAsset].filter((asset): asset is BomItemAssetView=>Boolean(asset))} canReuse={Boolean(reuseSource?.items.find(item=>item.projectItemId===Number(row.projectItemId))?.assets.some(asset=>asset.role==='diagram' && !failures[asset.assetId]))} reuse={row.reuseDiagram} disabled={busy} previewOnly={previewOnly} onReuse={(value) => onChange(row, 'reuseDiagram', value)} onUpload={(file) => { void onUpload(row, 'diagram', file); }} onPreviewChange={onPreviewChange} />
          <label className="bom-change-field"><span>修改明细</span><textarea rows={3} aria-label={`第 ${index + 1} 行修改明细`} disabled={busy} value={row.changeDetails} onChange={(e) => onChange(row, 'changeDetails', e.target.value)} /></label>
          <label className="bom-notes-field"><span>备注</span><textarea rows={2} aria-label={`第 ${index + 1} 行备注`} disabled={busy} value={row.notes} onChange={(e) => onChange(row, 'notes', e.target.value)} /></label>
        </BomEditComparison>
      </article>;
    })}</div>
    <div className="bom-add-bottom"><button id="bom-add-item" className="secondary-button" type="button" disabled={busy} onClick={onAdd}>添加 BOM 项目</button>{onBulkImport && <button className="secondary-button" type="button" disabled={busy || previewOnly} onClick={onBulkImport}>从图号库批量导入</button>}</div>
    <div className="bom-save-summary">
      {submitted && !complete && blockers.length > 0 && <div role="status"><strong>请检查 {blockers.length} 处必填项</strong><ul>{blockers.map(text => <li key={text}><button className="text-button" type="button" onClick={() => focusField(fieldIdFor(text))}>{text}</button></li>)}</ul></div>}
      {previewOnly && <p className="muted-text">{simulateConflict ? '模拟保存只返回冲突，不写入任何数据。' : 'Mock：可调整内存草稿；保存、上传及维护操作已禁用。'}</p>}
      <div className="bom-actions"><button className="primary-button" type="button" disabled={busy || blockedByVoidedDrawing || (previewOnly && !simulateConflict)} onClick={submit}>{busy ? '保存中…' : simulateConflict ? '模拟保存冲突' : editing ? '保存修改' : '保存当前 BOM'}</button>{needsRefresh && <button className="secondary-button" type="button" disabled={busy} onClick={onRefresh}>刷新当前 BOM</button>}</div>
    </div>
    {savedMessage && <p className="success-banner"><strong>{savedMessage}</strong></p>}

  </section>;
}
