import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImportPage } from '../../src/renderer/pages/ImportPage';

describe('ImportPage', () => {
  it('shows workbook conflicts before import confirmation', async () => {
    const report = {
      candidates: [
        { id: 'brand:F22', type: 'brand', code: '01', name: 'SAMKYO', sourceCell: 'E22:F22' },
        { id: 'product_size:B40', type: 'product_size', code: '0209', name: 'ZC200', sourceCell: 'A40:B40' },
      ],
      issues: [{ code: 'DUPLICATE_CODE', dictionaryType: 'product_size', sourceCell: 'A40:B40, A41:B41',
        message: '同一字典范围内存在重复编码', value: '0209', candidateIds: ['product_size:B40'] }],
    };
    const api = {
      auditWorkbook: vi.fn().mockResolvedValue({ auditId: 'audit-1', report }),
      confirmImport: vi.fn().mockResolvedValue({ imported: 1, skipped: 1 }),
    };
    render(<ImportPage api={api as never} />);

    const file = new File(['xlsx'], '图号规划.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    fireEvent.change(screen.getByLabelText('选择 Excel 文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '开始检查' }));

    expect(await screen.findByText('发现 1 个问题')).toBeVisible();
    expect(screen.getAllByText('0209')).toHaveLength(2);
    expect(screen.getByText('SAMKYO')).toBeVisible();
  });
});
