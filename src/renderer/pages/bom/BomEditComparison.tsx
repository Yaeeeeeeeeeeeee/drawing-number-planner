import { Children, useEffect, useState, type ReactNode } from 'react';
import type { BomItemView, DictionaryItemView } from '../../data/client';
import { BomValue } from './BomValue';
import { BomAssetPreview } from './BomAssetPreview';
import './bom-v5.css';
import { materialBatchLabel } from '../../../core/files/material-batch-label';

const fields = ['主类别', '项目', '图号', '生效批次', '材质', '尺寸', '图片', '位置', '位置示意图', '修改明细', '备注'];

// A view of the loaded item, never a reconstructed previous/current BOM relationship.
export function BomEditComparison({ index, original, mainCategories, projects, children, query = false, previousDate, selectedDate, changeDetails = '' }: {
  index: number; original?: BomItemView; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[]; children: ReactNode;
  query?: boolean; previousDate?: string; selectedDate?: string; changeDetails?: string | null;
}) {
  const [open, setOpen] = useState(false);
  useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpen(false);};window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);},[open]);
  const attachments = (role: 'image' | 'diagram') => original?.assets.filter((asset) => asset.role === role).map((asset) =>
    <BomAssetPreview key={asset.id} assetId={asset.assetId} name={asset.originalFileName} gallery={original?.assets} />);
  const values: ReactNode[] = original ? [
    mainCategories.find((category) => category.id === projects.find((project) => project.id === original.projectItemId)?.parentId)?.name,
    original.projectItemName,
    <BomValue value={original.fullCode} code/>,
    original.effectiveBatchName ? <BomValue value={materialBatchLabel(original.effectiveBatchName)}/> : '未选择',
    original.material, original.dimensions,
    original.assets.some((asset) => asset.role === 'image') ? attachments('image') : '未关联图片',
    original.position,
    original.assets.some((asset) => asset.role === 'diagram') ? attachments('diagram') : '未关联位置示意图',
    original.changeDetails, original.notes,
  ] : [];
  const inputs = Children.toArray(children);
  const sections = [
    { name: '核心标识', indexes: [0, 1, 2, 3] },
    { name: '规格属性', indexes: [4, 5, 7] },
    { name: '图片与变更信息', indexes: [6, 8, 9, 10] },
  ];
  return <div className="bom-compact-editor">
    <div className="bom-editor-heading"><strong>本次编辑</strong>{original && <button type="button" className="text-button" onClick={()=>setOpen(true)}>修改前数据</button>}</div>
    {sections.map(section => <section key={section.name} className="bom-editor-section" aria-label={section.name}>
      <h4>{section.name}</h4>
      <div className="bom-compact-fields">{section.indexes.map(fieldIndex => <div
        className={`bom-compact-field bom-edit-field ${fieldIndex===9 && changeDetails?.trim() ? 'bom-change-present' : ''} ${fieldIndex===2 || fieldIndex===9 || fieldIndex===10 ? 'bom-wide-field' : ''}`}
        key={fields[fieldIndex]}>{inputs[fieldIndex]}</div>)}</div>
    </section>)}
    {open && original && <div className="bom-original-overlay" onClick={()=>setOpen(false)}><aside className="bom-original-drawer" role="dialog" aria-modal="true" aria-label={`项目 ${index} 修改前数据`} onClick={event=>event.stopPropagation()}><header><h3>修改前数据</h3><button type="button" className="text-button" autoFocus onClick={()=>setOpen(false)}>关闭</button></header><dl>{fields.map((label,i)=><div key={label} aria-label={`项目 ${index} 修改前数据 · ${label}`} className={i===9 && original.changeDetails?.trim() ? 'bom-change-present' : undefined}><dt>{label}</dt><dd>{values[i] || '—'}</dd></div>)}</dl></aside></div>}
  </div>;
}
