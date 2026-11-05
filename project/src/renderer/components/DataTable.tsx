import { Fragment, useRef, type CSSProperties, type ReactNode } from 'react';
import { LayoutTable } from './LayoutTable';
import type { LayoutColumn } from './useTableLayout';
import { VirtualTableRows } from './VirtualTableRows';
import { useWorkspaceExtent } from './useWorkspaceExtent';

export interface TableColumn<T> extends LayoutColumn { render(item: T): ReactNode }

export function DataTable<T extends { id: number | string }>({ columns, items, onRowClick, renderExpandedRow, fillViewport = false, virtualize = false, onEndReached, virtualKey, tableId, showLayoutTools = true }: {
  tableId?: string; showLayoutTools?: boolean; columns: TableColumn<T>[]; items: T[]; onRowClick?: (item: T) => void;
  renderExpandedRow?: (item: T) => ReactNode | null;
  fillViewport?: boolean; virtualize?: boolean; onEndReached?: () => void | boolean; virtualKey?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { height } = useWorkspaceExtent(root, fillViewport || virtualize);
  return <div ref={root} className={`table-wrap${fillViewport || virtualize ? ' viewport-region' : ''}`} style={fillViewport || virtualize ? { '--data-region-height': `${height}px` } as CSSProperties : undefined}><LayoutTable showLayoutTools={showLayoutTools} tableId={tableId??`data:${columns.map(c=>c.key).join('|')}`} columns={columns.map(c=>({...c,locked:c.locked??(/^(select|selection|checkbox)$/.test(c.key)?'start':/^(actions?|operations?)$/.test(c.key)?'end':undefined)}))}>{(ordered)=>{const displayColumns=ordered.map(c=>columns.find(original=>original.key===c.key)!);return <><thead><tr>{displayColumns.map((column) => <th key={column.key} data-column-key={column.key}>{column.label}</th>)}</tr></thead>
    {virtualize ? <VirtualTableRows scrollRoot={root} columns={displayColumns} items={items} onRowClick={onRowClick} renderExpandedRow={renderExpandedRow} onEndReached={onEndReached} virtualKey={virtualKey}/> : <tbody>{items.map((item) => {
      const expanded = renderExpandedRow?.(item);
      return <Fragment key={item.id}><tr onClick={() => onRowClick?.(item)} className={onRowClick ? 'clickable-row' : undefined}>
        {displayColumns.map((column) => <td key={column.key} data-column-key={column.key} style={{textAlign:column.align}}>{column.render(item)}</td>)}</tr>
        {expanded != null && <tr className="expanded-table-row"><td colSpan={columns.length}>{expanded}</td></tr>}
      </Fragment>;
    })}</tbody>}</>;}}</LayoutTable></div>;
}
