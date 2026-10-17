import { Fragment, useRef, type CSSProperties, type ReactNode } from 'react';
import { useWorkspaceExtent } from './useWorkspaceExtent';

export interface TableColumn<T> { key: string; label: string; render(item: T): ReactNode }

export function DataTable<T extends { id: number | string }>({ columns, items, onRowClick, renderExpandedRow, fillViewport = false }: {
  columns: TableColumn<T>[]; items: T[]; onRowClick?: (item: T) => void;
  renderExpandedRow?: (item: T) => ReactNode | null;
  fillViewport?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { height } = useWorkspaceExtent(root, fillViewport);
  return <div ref={root} className={`table-wrap${fillViewport ? ' viewport-region' : ''}`} style={fillViewport ? { '--data-region-height': `${height}px` } as CSSProperties : undefined}><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
    <tbody>{items.map((item) => {
      const expanded = renderExpandedRow?.(item);
      return <Fragment key={item.id}><tr onClick={() => onRowClick?.(item)} className={onRowClick ? 'clickable-row' : undefined}>
        {columns.map((column) => <td key={column.key}>{column.render(item)}</td>)}</tr>
        {expanded != null && <tr className="expanded-table-row"><td colSpan={columns.length}>{expanded}</td></tr>}
      </Fragment>;
    })}</tbody></table></div>;
}
