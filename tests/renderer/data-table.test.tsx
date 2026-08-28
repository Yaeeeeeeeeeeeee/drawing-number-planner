import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DataTable } from '../../src/renderer/components/DataTable';

describe('DataTable expanded rows', () => {
  it('renders the selected record editor in the immediately following full-width row', () => {
    render(<DataTable items={[{ id: 1, name: '1201' }, { id: 2, name: '1202' }]}
      columns={[
        { key: 'name', label: '名称', render: (item) => item.name },
        { key: 'action', label: '操作', render: (item) => <button type="button">修改 {item.name}</button> },
      ]}
      renderExpandedRow={(item) => item.id === 1 ? <label>修改名称<input aria-label="1201 修改名称" /></label> : null} />);

    fireEvent.click(screen.getByRole('button', { name: '修改 1201' }));
    const editor = screen.getByLabelText('1201 修改名称').closest('tr');
    const normal = screen.getByText('1201').closest('tr');
    expect(normal?.nextElementSibling).toBe(editor);
    expect(editor?.querySelector('td')).toHaveAttribute('colspan', '2');
    expect(screen.getByText('1202').closest('tr')?.nextElementSibling).toBeNull();
  });
});
