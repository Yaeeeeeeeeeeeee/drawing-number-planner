import { useState } from 'react';
import type { DraftCandidate, DraftRow } from './BomEditor';

export const candidateKey = (candidate: DraftCandidate) => candidate.origin === 'planned'
  ? `planned:${candidate.drawingId}` : `historical:${candidate.historicalDrawingId}`;
const candidateLabel = (candidate: DraftCandidate) => candidate.origin === 'historical'
  ? `历史已用 · ${candidate.status === 'inactive' ? '已停用' : '使用中'}`
  : candidate.status === 'reserved' ? '正式规划 · 已占号'
    : candidate.status === 'voided' ? '正式规划 · 作废，需替换' : '正式规划 · 正式使用';



export function BomDrawingField({ row, index, selected, busy, drawingError, onBlur, onWhite, onDrawing }: {
  row: DraftRow; index: number; selected?: DraftCandidate; busy: boolean; drawingError?: string;
  onBlur(): void; onWhite(value: boolean): void; onDrawing(value: string): void;
}) {
  const [search, setSearch] = useState('');
  const term = search.trim().toLocaleLowerCase();
  const candidates = row.candidates.filter(candidate => candidateKey(candidate) === row.drawingId
    || `${candidate.fullCode} ${candidate.projectItemName}`.toLocaleLowerCase().includes(term));
  const error = selected?.status === 'voided' ? '当前引用图号已作废，请选择可用图号替换后再保存。'
    : row.projectItemId && row.candidatesLoaded && !row.candidates.length ? '没有符合条件的图号。'
      : drawingError ? '请选择图号' : '';
  return <div className="bom-code-field">
    <div className="bom-drawing-pick">
      <label><span>查找图号或项目</span><input type="search" aria-label={`第 ${index} 行查找图号或项目`} disabled={busy || !row.projectItemId}
        value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label><span>图号 <span aria-hidden="true" className="bom-required">*</span></span>
        <select id={`${row.clientId}-drawing`} aria-required="true" aria-invalid={error ? true : undefined}
          aria-describedby={[selected && `${row.clientId}-qualification`, error && `${row.clientId}-drawing-error`].filter(Boolean).join(' ') || undefined}
          aria-label={`第 ${index} 行图号`} disabled={busy || !row.projectItemId} value={row.drawingId} onBlur={onBlur}
          onChange={event => { onDrawing(event.target.value); setSearch(''); }}>
          <option value="">请选择</option>
          {candidates.map(candidate => <option disabled={candidate.status === 'voided'} key={candidateKey(candidate)} value={candidateKey(candidate)}>
            {candidate.fullCode} · {candidate.projectItemName}{candidate.origin === 'historical' || candidate.status === 'voided' ? ' · ' + candidateLabel(candidate) : ''}
          </option>)}
        </select>
      </label>
    </div>
    {term && row.candidates.length > 0 && !candidates.some(candidate => `${candidate.fullCode} ${candidate.projectItemName}`.toLocaleLowerCase().includes(term)) && <small>没有匹配的图号或项目。</small>}
    {selected && <div id={`${row.clientId}-qualification`} className="bom-selected-drawing">
      <span className="code-cell">{selected.fullCode}</span><small>{candidateLabel(selected)}</small>
    </div>}
    <label className="bom-inline-check" title="同型号、同项目共用白色物料时，候选范围限定到白色图号">
      <input type="checkbox" aria-label={`第 ${index} 行共用白色物料`} disabled={busy} checked={row.usesWhiteMaterial}
        onChange={event => { setSearch(''); onWhite(event.target.checked); }} />共用白色物料
    </label>
    {error && <small id={`${row.clientId}-drawing-error`} className="bom-candidate-empty">{error}</small>}
  </div>;
}
