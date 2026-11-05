import { fireEvent, render, screen, within } from '@testing-library/react';
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
    const issues=screen.getByRole('table',{name:'迁移问题工作表'});
    fireEvent.keyDown(within(issues).getByRole('columnheader',{name:'数据摘要'}),{altKey:true,key:'ArrowLeft'});
    expect(issues.querySelectorAll('thead th')[1]).toHaveAttribute('data-column-key','summary');
    expect(issues.querySelectorAll('tbody td')[1]).toHaveTextContent('0209');
    fireEvent.click(within(issues).getByRole('button',{name:'查看原因'}));
    expect(within(issues).getByText('同一字典范围内存在重复编码')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /导入候选/ }));
    expect(screen.getAllByText('0209')).toHaveLength(1);
    expect(screen.getByText('SAMKYO')).toBeVisible();
  });

  it('selects only eligible candidates and can clear the selection', async () => {
    const report = {
      candidates: [
        { id: 'brand:F22', type: 'brand', code: '01', name: 'SAMKYO', sourceCell: 'E22:F22' },
        { id: 'product_size:B40', type: 'product_size', code: '0209', name: 'ZC200', sourceCell: 'A40:B40' },
        { id: 'color:C10', type: 'color', code: '03', name: '白色', sourceCell: 'C10:D10' },
      ],
      issues: [{ code: 'DUPLICATE_CODE', dictionaryType: 'product_size', sourceCell: 'A40:B40, A41:B41',
        message: '同一字典范围内存在重复编码', value: '0209', candidateIds: ['product_size:B40'] }],
    };
    const api = { auditWorkbook: vi.fn().mockResolvedValue({ auditId: 'audit-1', report }), confirmImport: vi.fn() };
    render(<ImportPage api={api as never} />);

    const file = new File(['xlsx'], '图号规划.xlsx');
    fireEvent.change(screen.getByLabelText('选择 Excel 文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '开始检查' }));

    expect(await screen.findByText('可导入 2 条')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /导入候选/ }));
    fireEvent.click(screen.getByRole('button', { name: '全选可导入项（含筛选外）' }));
    expect(screen.getByText('已选择 2 条')).toBeVisible();
    expect(screen.getByLabelText('选择 SAMKYO')).toBeChecked();
    expect(screen.getByLabelText('选择 白色')).toBeChecked();
    expect(screen.getByLabelText('选择 ZC200')).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '取消全选' }));
    expect(screen.getByText('已选择 0 条')).toBeVisible();
    expect(screen.getByLabelText('选择 SAMKYO')).not.toBeChecked();
  });

  it('keeps manual multi-selection, resets it for a fresh audit, and consumes it after a successful import', async () => {
    const firstReport = {
      candidates: [
        { id: 'brand:F22', type: 'brand', code: '01', name: 'SAMKYO', sourceCell: 'E22:F22' },
        { id: 'color:C10', type: 'color', code: '03', name: '白色', sourceCell: 'C10:D10' },
      ],
      issues: [],
    };
    const secondReport = {
      candidates: [{ id: 'brand:F25', type: 'brand', code: '02', name: 'D&D', sourceCell: 'E25:F25' }],
      issues: [],
    };
    const api = {
      auditWorkbook: vi.fn().mockResolvedValueOnce({ auditId: 'audit-1', report: firstReport }).mockResolvedValueOnce({ auditId: 'audit-2', report: secondReport }),
      confirmImport: vi.fn().mockResolvedValue({ imported: 2, skipped: 0 }),
    };
    render(<ImportPage api={api as never} />);

    const file = new File(['xlsx'], '图号规划.xlsx');
    fireEvent.change(screen.getByLabelText('选择 Excel 文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '开始检查' }));
    expect(await screen.findByText('可导入 2 条')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /导入候选/ }));
    fireEvent.click(screen.getByLabelText('选择 SAMKYO'));
    fireEvent.click(screen.getByLabelText('选择 白色'));
    expect(screen.getByText('已选择 2 条')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    expect(await screen.findByText('已导入 2 条，跳过 0 条')).toBeVisible();
    expect(api.confirmImport).toHaveBeenCalledWith('audit-1', ['brand:F22', 'color:C10']);
    expect(screen.getByText('已选择 0 条')).toBeVisible();
    expect(screen.getByRole('button', { name: '确认导入' })).toBeDisabled();
    expect(screen.getByText('本次检查已完成导入，请重新检查后继续导入。')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '开始检查' }));
    expect(await screen.findByText('D&D')).toBeVisible();
    expect(screen.getByText('已选择 0 条')).toBeVisible();
  });

  it('preserves selection when batch confirmation fails', async () => {
    const report = {
      candidates: [{ id: 'brand:F22', type: 'brand', code: '01', name: 'SAMKYO', sourceCell: 'E22:F22' }],
      issues: [],
    };
    const api = {
      auditWorkbook: vi.fn().mockResolvedValue({ auditId: 'audit-1', report }),
      confirmImport: vi.fn().mockRejectedValue(new Error('导入被拒绝')),
    };
    render(<ImportPage api={api as never} />);

    const file = new File(['xlsx'], '图号规划.xlsx');
    fireEvent.change(screen.getByLabelText('选择 Excel 文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '开始检查' }));
    expect(await screen.findByText('可导入 1 条')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /导入候选/ }));
    fireEvent.click(screen.getByRole('button', { name: '全选可导入项（含筛选外）' }));
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));

    expect(await screen.findByText('导入被拒绝')).toBeVisible();
    expect(screen.getByText('已选择 1 条')).toBeVisible();
    expect(screen.getByRole('button', { name: '确认导入' })).toBeEnabled();
  });

  it('locks every selectable candidate until a batch confirmation settles', async () => {
    const report = {
      candidates: [
        { id: 'brand:F22', type: 'brand', code: '01', name: 'SAMKYO', sourceCell: 'E22:F22' },
        { id: 'color:C10', type: 'color', code: '03', name: '白色', sourceCell: 'C10:D10' },
      ],
      issues: [],
    };
    let rejectImport: (reason?: unknown) => void = () => undefined;
    const api = {
      auditWorkbook: vi.fn().mockResolvedValue({ auditId: 'audit-1', report }),
      confirmImport: vi.fn().mockImplementation(() => new Promise((_, reject) => { rejectImport = reject; })),
    };
    render(<ImportPage api={api as never} />);

    const file = new File(['xlsx'], '图号规划.xlsx');
    fireEvent.change(screen.getByLabelText('选择 Excel 文件'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: '开始检查' }));
    expect(await screen.findByText('可导入 2 条')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /导入候选/ }));
    fireEvent.click(screen.getByLabelText('选择 SAMKYO'));
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));

    expect(screen.getByLabelText('选择 SAMKYO')).toBeDisabled();
    expect(screen.getByLabelText('选择 白色')).toBeDisabled();
    expect(screen.getByRole('button', { name: '全选可导入项（含筛选外）' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '取消全选' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('选择 白色'));
    expect(screen.getByText('已选择 1 条')).toBeVisible();

    rejectImport(new Error('导入被拒绝'));
    expect(await screen.findByText('导入被拒绝')).toBeVisible();
    expect(screen.getByText('已选择 1 条')).toBeVisible();
    expect(screen.getByLabelText('选择 SAMKYO')).toBeChecked();
    expect(screen.getByLabelText('选择 白色')).toBeEnabled();
  });
});
