import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { BomArchivePanel } from '../../src/renderer/pages/bom/BomArchivePanel';
it('previews before migrating and cancels unsent attachments while keeping the current one complete', async () => {
  let finish!: (value: { linkId: number; status: 'archived' }) => void;
  const api = { previewBomAssetArchive: async () => [1, 2].map((linkId) => ({ linkId, model: 'M', businessDate: '2026-09-23', project: '铭牌', relativePath: 'old.png' })),
    archiveBomAssetLink: vi.fn(() => new Promise<{ linkId: number; status: 'archived' }>((resolve) => { finish = resolve; })) };
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  render(<BomArchivePanel api={api as never} />);
  fireEvent.click(screen.getByText('旧 BOM 附件归档'));
  fireEvent.click(screen.getByRole('button', { name: '检查旧附件归档' }));
  fireEvent.click(await screen.findByRole('button', { name: '开始复制并归档 2 项' }));
  await waitFor(() => expect(api.archiveBomAssetLink).toHaveBeenCalledWith(1));
  fireEvent.click(screen.getByRole('button', { name: '取消剩余迁移' }));
  finish({ linkId: 1, status: 'archived' });
  expect(await screen.findByText(/已停止.*完成 1/)).toBeVisible();
  expect(api.archiveBomAssetLink).toHaveBeenCalledTimes(1);
});
