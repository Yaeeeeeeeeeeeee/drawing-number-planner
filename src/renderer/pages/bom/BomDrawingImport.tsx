import { useRef, useState } from 'react';
import { useModalFocus } from '../../components/useModalFocus';
import type { BomCandidateView, DictionaryItemView } from '../../data/client';
import { candidateKey } from './BomDrawingField';

export function BomDrawingImport({ projectIds, categories, projects, readCandidates, onClose, onImport }: {
  projectIds: Set<number>; categories: DictionaryItemView[]; projects: DictionaryItemView[];
  readCandidates(projectId: number): Promise<BomCandidateView[]>;
  onClose(): void; onImport(drawings: BomCandidateView[]): void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useModalFocus({ panel, open: true, onClose });
  const requestId = useRef(0);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<BomCandidateView[]>([]);
  const [selection, setSelection] = useState<Record<string, BomCandidateView>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadCategory = async (id: string) => {
    const serial = ++requestId.current;
    setCategory(id); setItems([]); setError(''); setBusy(Boolean(id));
    if (!id) return;
    try {
      const results = await Promise.all(projects.filter(project => project.parentId === Number(id)).map(async project => {
        const candidates = await readCandidates(project.id);
        return candidates.filter(candidate => candidate.projectItemId === project.id);
      }));
      if (requestId.current === serial) setItems(results.flat());
    } catch (reason) {
      if (requestId.current === serial) setError(reason instanceof Error ? reason.message : '无法读取图号库');
    } finally { if (requestId.current === serial) setBusy(false); }
  };
  const toggle = (candidate: BomCandidateView) => {
    const key = candidateKey(candidate);
    setSelection(current => {
      if (current[key]) { const next = { ...current }; delete next[key]; return next; }
      return { ...current, [key]: candidate };
    });
  };
  const chosen = Object.values(selection);
  const conflictedProjects = new Set(chosen.filter((drawing, i) => chosen.slice(0, i)
    .some(prior => prior.projectItemId === drawing.projectItemId)).map(item => item.projectItemName));
  const term = search.trim().toLowerCase();
  const visible = items.filter(drawing => `${drawing.fullCode} ${drawing.projectItemName}`.toLowerCase().includes(term));
  return <div className="bom-original-overlay" onClick={onClose}>
    <div className="bom-original-drawer bom-import-drawer" ref={panel} role="dialog" aria-label="从图号库批量导入" aria-modal="true" tabIndex={-1} onClick={event => event.stopPropagation()}>
      <header><h3>从图号库批量导入</h3><button className="text-button" type="button" onClick={onClose}>关闭</button></header>
      <p className="muted-text">每个项目选择一个明确的图号。规格、图片和变更信息可在导入后填写。</p>
      <label><span>主类别</span><select autoFocus value={category} aria-label="批量导入主类别" onChange={event => void loadCategory(event.target.value)}>
        <option value="">请选择</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      <label><span>查找图号或项目</span><input type="search" aria-label="批量导入查找图号或项目" value={search} onChange={event => setSearch(event.target.value)} /></label>
      {error && <p className="error-banner" role="alert">{error}</p>}
      {busy && <p role="status">正在读取候选图号…</p>}
      {!busy && category && !visible.length && !error && <p className="muted-text">此类别没有匹配的图号。</p>}
      <div className="bom-import-list">{visible.map(drawing => {
        const key = candidateKey(drawing);
        const alreadyPresent = projectIds.has(drawing.projectItemId);
        return <label key={key}><input type="checkbox" checked={Boolean(selection[key])} disabled={alreadyPresent} onChange={() => toggle(drawing)} />
          <span className="code-cell">{drawing.fullCode}</span><span>{drawing.projectItemName}</span>{alreadyPresent && <small>项目已在 BOM 中</small>}
        </label>;
      })}</div>
      {!!conflictedProjects.size && <p className="error-banner" role="alert">{[...conflictedProjects].join('、')} 选择了多个图号，请为每个项目保留一个。</p>}
      <button className="primary-button" type="button" disabled={!chosen.length || conflictedProjects.size > 0} onClick={() => onImport(chosen)}>导入 {chosen.length} 个项目</button>
    </div>
  </div>;
}
