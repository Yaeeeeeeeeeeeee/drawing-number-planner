import { Fragment, type ReactNode } from 'react';

export interface TableColumn<T> { key: string; label: string; render(item: T): ReactNode }

export function DataTable<T extends { id: number | string }>({ columns, items, onRowClick, renderExpandedRow }: {
  columns: TableColumn<T>[]; items: T[]; onRowClick?: (item: T) => void;
  renderExpandedRow?: (item: T) => ReactNode | null;
}) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
    <tbody>{items.map((item) => {
      const expanded = renderExpandedRow?.(item);
      return <Fragment key={item.id}><tr onClick={() => onRowClick?.(item)} className={onRowClick ? 'clickable-row' : undefined}>
        {columns.map((column) => <td key={column.key}>{column.render(item)}</td>)}</tr>
        {expanded != null && <tr className="expanded-table-row"><td colSpan={columns.length}>{expanded}</td></tr>}
      </Fragment>;
    })}</tbody></table></div>;
}
