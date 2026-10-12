import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductExitMockPanel } from '../../src/renderer/pages/products/ProductExitMockPanel';
import { createProductCleanupMock, productSamples } from '../../src/renderer/pages/products/products-mock';

describe('independent product exit worksheet', () => {
  it('keeps rows distinct and requires exact identity and second confirmation', async () => {
    const remove = vi.fn(); const complete = vi.fn();
    const api = createProductCleanupMock(productSamples, remove, () => 'normal');
    render(<ProductExitMockPanel api={api} productId={-1} onCancel={vi.fn()} onComplete={complete}/>);
    await screen.findByRole('table', {name: '退出关联工作表'});
    expect(screen.getByText('正式图号')).toBeVisible();
    expect(screen.getByText('历史图号')).toBeVisible();
    expect(screen.getByText('文件存在的 PDF 索引')).toBeVisible();
    expect(screen.getByText('文件缺失的 PDF 索引')).toBeVisible();
    fireEvent.click(screen.getAllByRole('button', {name: '查看处理指引'})[0]);
    expect(screen.getByText(/作废只改变使用状态/)).toBeVisible();
    const button = screen.getByRole('button', {name: '确认删除档案'});
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('输入型号确认'), {target: {value: 'F100'}});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    fireEvent.click(button); expect(remove).not.toHaveBeenCalled();
    confirm.mockReturnValue(true); fireEvent.click(button);
    await waitFor(() => expect(complete).toHaveBeenCalledOnce());
    expect(remove).toHaveBeenCalledWith(-1); confirm.mockRestore();
  });
  it('blocks exit even with matching identity when the preflight is blocked', async () => {
    const remove = vi.fn();
    const api = createProductCleanupMock(productSamples, remove, () => 'blocked');
    render(<ProductExitMockPanel api={api} productId={-1} onCancel={vi.fn()} onComplete={vi.fn()}/>);
    await screen.findByRole('table', {name: '退出关联工作表'});
    fireEvent.change(screen.getByLabelText('输入型号确认'), {target: {value: 'F100'}});
    expect(screen.getByRole('button', {name: '确认删除档案'})).toBeDisabled();
    expect(screen.getByText('阻塞检查 1')).toBeVisible();
    expect(remove).not.toHaveBeenCalled();
  });
  it('disables exit when the preflight fails', async () => {
    const api = createProductCleanupMock(productSamples, vi.fn(), () => 'preflightFailure');
    render(<ProductExitMockPanel api={api} productId={-1} onCancel={vi.fn()} onComplete={vi.fn()}/>);
    await screen.findByRole('alert');
    expect(screen.getByText('检查失败')).toBeVisible();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', {name: '确认删除档案'})).toBeDisabled();
  });
});
