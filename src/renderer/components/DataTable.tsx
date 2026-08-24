import type { ReactNode } from 'react';

export interface TableColumn<T> { key: string; label: string; render(item: T): ReactNode }

export function DataTable<T extends { id: number | string }>({ columns, items, onRowClick }: {
  columns: TableColumn<T>[]; items: T[]; onRowClick?: (item: T) => void;
}) {
  return <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead>
    <tbody>{items.map((item) => <tr key={item.id} onClick={() => onRowClick?.(item)} className={onRowClick ? 'clickable-row' : undefined}>
      {columns.map((column) => <td key={column.key}>{column.render(item)}</td>)}</tr>)}</tbody></table></div>;
}
