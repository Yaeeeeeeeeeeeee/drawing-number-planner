import { Fragment, useRef, type CSSProperties, type ReactNode } from 'react';
import { VirtualTableRows } from './VirtualTableRows';
import { useWorkspaceExtent } from './useWorkspaceExtent';

export interface TableColumn<T> { key: string; label: string; render(item: T): ReactNode }

export function DataTable<T extends { id: number | string }>({ columns, items, onRowClick, renderExpandedRow, fillViewport = false, virtualize = false, onEndReached, virtualKey }: {
  columns: TableColumn<T>[]; items: T[]; onRowClick?: (item: T) => void;
  renderExpandedRow?: (item: T) => ReactNode | null;
  fillViewport?: boolean; virtualize?: boolean; onEndReached?: () => void; virtualKey?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { height } = useWorkspaceExtent(root, fillViewport || virtualize);
  return <div ref={root} className={`table-wrap${fillViewport || virtualize ? ' viewport-region' : ''}`} style={fillViewport || virtualize ? { '--data-region-height': `${height}px` } as CSSProperties : undefined}><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
    {virtualize ? <VirtualTableRows scrollRoot={root} columns={columns} items={items} onRowClick={onRowClick} renderExpandedRow={renderExpandedRow} onEndReached={onEndReached} virtualKey={virtualKey}/> : <tbody>{items.map((item) => {
      const expanded = renderExpandedRow?.(item);
      return <Fragment key={item.id}><tr onClick={() => onRowClick?.(item)} className={onRowClick ? 'clickable-row' : undefined}>
        {columns.map((column) => <td key={column.key}>{column.render(item)}</td>)}</tr>
        {expanded != null && <tr className="expanded-table-row"><td colSpan={columns.length}>{expanded}</td></tr>}
      </Fragment>;
    })}</tbody>}</table></div>;
}
