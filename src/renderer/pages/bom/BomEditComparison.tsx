import { Children, type ReactNode } from 'react';
import type { BomItemView, DictionaryItemView } from '../../data/client';
import { BomValue } from './BomValue';
import { materialBatchLabel } from '../../../core/files/material-batch-label';

const fields = ['主类别', '项目', '图号', '生效批次', '材质', '尺寸', '图片', '位置', '位置示意图', '修改明细', '备注'];

// A view of the loaded item, never a reconstructed previous/current BOM relationship.
export function BomEditComparison({ index, original, mainCategories, projects, children, query = false, previousDate, selectedDate, changeDetails = '' }: {
  index: number; original?: BomItemView; mainCategories: DictionaryItemView[]; projects: DictionaryItemView[]; children: ReactNode;
  query?: boolean; previousDate?: string; selectedDate?: string; changeDetails?: string | null;
}) {
  const attachments = (role: 'image' | 'diagram') => original?.assets.filter((asset) => asset.role === role).map((asset) =>
    <div key={asset.id}><span>{asset.originalFileName}{asset.inherited || asset.inheritedFromBomItemAssetId ? '（沿用）' : ''}</span></div>);
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
  return <div className={`bom-edit-comparison${query ? ' bom-query-comparison' : ''}`}>
    <div className="bom-comparison-heading"><span>{query ? <>所选记录{selectedDate && <time>{selectedDate}</time>}</> : '本次编辑'}</span><span>{query ? <>上一条记录{previousDate && <time>{previousDate}</time>}</> : '修改前数据'} {!query && <small>本次加载时原值，不是上一条记录</small>}</span></div>
    {!original && <p className="bom-comparison-empty">{query ? '此项目无可用的上一条对照数据' : '无修改前数据 · 本次新增项目'}</p>}
    {Children.toArray(children).map((field, fieldIndex) => <div className="bom-comparison-row" key={fields[fieldIndex]}>
      <div className={`bom-edit-field${fieldIndex === 9 && changeDetails?.trim() ? ' bom-change-present' : ''}`}>{field}</div>
      <div className={`bom-original-field${fieldIndex === 9 && original?.changeDetails?.trim() ? ' bom-change-present' : ''}`} aria-label={`项目 ${index} ${query ? '上一条记录' : '修改前数据'} · ${fields[fieldIndex]}`}><span className="bom-original-label">{fields[fieldIndex]}</span><div>{values[fieldIndex] || '—'}</div></div>
    </div>)}
  </div>;
}
