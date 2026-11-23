import { Fragment, useRef, type CSSProperties, type ReactNode } from 'react';
import { LayoutTable } from './LayoutTable';
import type { LayoutColumn } from './useTableLayout';
import { VirtualTableRows } from './VirtualTableRows';
import { useWorkspaceExtent } from './useWorkspaceExtent';

export interface TableColumn<T> extends LayoutColumn { header?: ReactNode; render(item: T): ReactNode }

export function DataTable<T extends { id: number | string }>({ columns, items, onRowClick, onRowDoubleClick, selectedRowId, renderExpandedRow, renderGroupRow, fillViewport = false, virtualize = false, onEndReached, virtualKey, tableId, showLayoutTools = true }: {
  tableId?: string; showLayoutTools?: boolean; columns: TableColumn<T>[]; items: T[]; onRowClick?: (item: T) => void; onRowDoubleClick?: (item:T)=>void; selectedRowId?: T['id'];
  renderExpandedRow?: (item: T) => ReactNode | null;
  renderGroupRow?: (item: T) => ReactNode | null;
  fillViewport?: boolean; virtualize?: boolean; onEndReached?: () => void | boolean; virtualKey?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const { height } = useWorkspaceExtent(root, fillViewport || virtualize);
  return <div ref={root} className={`table-wrap${fillViewport || virtualize ? ' viewport-region' : ''}`} style={fillViewport || virtualize ? { '--data-region-height': `${height}px` } as CSSProperties : undefined}><LayoutTable showLayoutTools={showLayoutTools} tableId={tableId??`data:${columns.map(c=>c.key).join('|')}`} columns={columns.map(c=>({...c,locked:c.locked??(/^(select|selection|checkbox)$/.test(c.key)?'start':/^(actions?|operations?)$/.test(c.key)?'end':undefined)}))}>{(ordered)=>{const displayColumns=ordered.map(c=>columns.find(original=>original.key===c.key)!);return <><thead><tr>{displayColumns.map((column) => <th key={column.key} data-column-key={column.key}>{column.header ?? column.label}</th>)}</tr></thead>
    {virtualize ? <VirtualTableRows scrollRoot={root} columns={displayColumns} items={items} onRowClick={onRowClick} onRowDoubleClick={onRowDoubleClick} selectedRowId={selectedRowId} renderExpandedRow={renderExpandedRow} renderGroupRow={renderGroupRow} onEndReached={onEndReached} virtualKey={virtualKey}/> : <tbody>{items.map((item) => {
      const group = renderGroupRow?.(item);
      if (group != null) return <tr className="table-group-row" key={item.id}><td colSpan={displayColumns.length}>{group}</td></tr>;
      const expanded = renderExpandedRow?.(item);
      return <Fragment key={item.id}><tr onClick={(event) => {if (!onRowDoubleClick || !(event.target as HTMLElement).closest('button,input,a,select')) onRowClick?.(item);}} onDoubleClick={(event) => {if (!(event.target as HTMLElement).closest('button,input,a,select')) onRowDoubleClick?.(item);}} aria-selected={selectedRowId === undefined ? undefined : selectedRowId === item.id} className={onRowClick ? 'clickable-row' : undefined}>
        {displayColumns.map((column) => <td key={column.key} data-column-key={column.key} style={{textAlign:column.align}}>{column.render(item)}</td>)}</tr>
        {expanded != null && <tr className="expanded-table-row"><td colSpan={columns.length}>{expanded}</td></tr>}
      </Fragment>;
    })}</tbody>}</>;}}</LayoutTable></div>;
}
