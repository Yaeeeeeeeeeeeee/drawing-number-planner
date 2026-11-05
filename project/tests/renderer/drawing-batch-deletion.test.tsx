import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DrawingBatchDeletion } from '../../src/renderer/components/DrawingBatchDeletion';

const preview = (id: number) => ({ signedId: id, fullCode: `CODE-${id}`, deletable: true,
  references: { presentPdf: 0 }, blockers: [] });

describe('batch drawing deletion safety', () => {
  it('cancels the remaining items without interrupting the transaction already sent', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let resolve!: (value: { items: Array<{ signedId: number; status: string }> }) => void;
    const api = { getDrawingDeletionPreview: vi.fn(async (id: number) => preview(id)),
      deleteDrawings: vi.fn(() => new Promise((done) => { resolve = done; })) };
    render(<DrawingBatchDeletion ids={[1, 2]} api={api as never} onComplete={async () => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: '批量删除（已选 2 项）' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除可删除项 / 跳过阻塞项' }));
    fireEvent.click(await screen.findByRole('button', { name: '取消剩余任务' }));
    await act(async () => resolve({ items: [{ signedId: 1, status: 'deleted' }] }));
    expect(api.deleteDrawings).toHaveBeenCalledTimes(1);
    expect(api.deleteDrawings).toHaveBeenCalledWith([{ signedId: 1, confirmedCode: 'CODE-1', mode: 'retain_occupied' }]);
    expect(screen.getByRole('status')).toHaveTextContent('未执行 1');
  });
  it('discards a preview that arrives after the selection changed', async () => {
    let resolve!: (value: ReturnType<typeof preview>) => void;
    const api = { getDrawingDeletionPreview: vi.fn(() => new Promise((done) => { resolve = done; })) };
    const done = vi.fn();
    const view = render(<DrawingBatchDeletion ids={[1]} api={api as never} onComplete={done} />);
    fireEvent.click(screen.getByRole('button', { name: '批量删除（已选 1 项）' }));
    view.rerender(<DrawingBatchDeletion ids={[2]} api={api as never} onComplete={done} />);
    await act(async () => resolve(preview(1)));
    expect(screen.queryByRole('button', { name: '删除可删除项 / 跳过阻塞项' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批量删除（已选 1 项）' })).toBeEnabled();
  });

  it('keeps failure details after completion clears the selected rows', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const api = { getDrawingDeletionPreview: vi.fn(async () => preview(1)),
      deleteDrawings: vi.fn(async () => ({ items: [{ signedId: 1, status: 'skipped', message: '被当前 BOM 引用' }] })) };
    const view = render(<DrawingBatchDeletion ids={[1]} api={api as never} onComplete={async () => {
      view.rerender(<DrawingBatchDeletion ids={[]} api={api as never} onComplete={async () => undefined} />);
    }} />);
    fireEvent.click(screen.getByRole('button', { name: '批量删除（已选 1 项）' }));
    fireEvent.click(await screen.findByRole('button', { name: '删除可删除项 / 跳过阻塞项' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('跳过/失败 1'));
    expect(screen.getByText('记录 1：被当前 BOM 引用')).toBeVisible();
  });
});
