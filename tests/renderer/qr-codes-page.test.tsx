import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QrCodesPage } from '../../src/renderer/pages/QrCodesPage';

const manual = {
  id: 11, productId: 3, sku: 'SKU-Q1', model: 'Q100', productCategory: '冰柜', purposeId: 1,
  key: 'user_manual', englishName: 'User Manual', displayName: '说明书二维码', purposeStatus: 'active',
  name: 'Q100 使用说明', targetUrl: 'https://example.test/manual', status: 'active',
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
  files: [{ id: 81, relativePath: '冰柜/SKU-Q1-Q100/Q100-User Manual（网址编码）.png', fileName: 'Q100-User Manual（网址编码）.png', mimeType: 'image/png', isPresent: true, matchStatus: 'matched' }],
  pendingFiles: [{ id: 82, relativePath: '冰柜/SKU-Q1-Q100/待确认/Q100-User Manual（网址编码）.png', fileName: 'Q100-User Manual（网址编码）.png', mimeType: 'image/png', isPresent: false, matchStatus: 'pending' }],
};

describe('QrCodesPage', () => {
  it('lists independent QR management filters and keeps business and file status distinct in details', async () => {
    const api = { listQrCodes: vi.fn().mockResolvedValue({ items: [manual] }), getQrCode: vi.fn().mockResolvedValue(manual),
      updateQrCode: vi.fn(), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(), associateQrFile: vi.fn() };
    render(<QrCodesPage api={api as never} />);

    expect(await screen.findByRole('heading', { name: '二维码管理' })).toBeVisible();
    expect(screen.getByLabelText('SKU / 型号')).toBeVisible();
    expect(screen.getByLabelText('产品类别')).toBeVisible();
    expect(screen.getByLabelText('用途')).toBeVisible();
    expect(screen.getByLabelText('业务状态')).toBeVisible();
    expect(screen.getByLabelText('文件状态')).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: '查看 Q100 使用说明' }));
    expect(await screen.findByText('业务状态')).toBeVisible();
    expect(screen.getByText('启用中')).toBeVisible();
    expect(screen.getByText('文件状态')).toBeVisible();
    expect(screen.getAllByText('文件可用').length).toBeGreaterThan(0);
    expect(screen.getByText('创建时间')).toBeVisible();
    expect(screen.getByText('更新时间')).toBeVisible();
    expect(screen.getByText('待人工确认')).toBeVisible();
  });

  it('saves metadata and manually associates a pending file without changing the business status', async () => {
    const associated = { ...manual, files: [...manual.files, { ...manual.pendingFiles[0], isPresent: false, matchStatus: 'matched' }], pendingFiles: [] };
    const api = { listQrCodes: vi.fn().mockResolvedValue({ items: [manual] }), getQrCode: vi.fn().mockResolvedValue(manual),
      updateQrCode: vi.fn().mockResolvedValue({ ...manual, name: '新版说明书' }), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(),
      associateQrFile: vi.fn().mockResolvedValue(associated) };
    render(<QrCodesPage api={api as never} initialQrCodeId={manual.id} />);

    await screen.findByDisplayValue('Q100 使用说明');
    fireEvent.change(screen.getByLabelText('二维码名称'), { target: { value: '新版说明书' } });
    fireEvent.click(screen.getByRole('button', { name: '保存二维码信息' }));
    await waitFor(() => expect(api.updateQrCode).toHaveBeenCalledWith(11, { name: '新版说明书', targetUrl: 'https://example.test/manual' }));
    fireEvent.click(screen.getByRole('button', { name: '关联此文件' }));
    await waitFor(() => expect(api.associateQrFile).toHaveBeenCalledWith(11, 82));
    expect(api.deactivateQrCode).not.toHaveBeenCalled();
  });

  it('gives a clear desktop-only message instead of calling an unavailable local bridge', async () => {
    const api = { listQrCodes: vi.fn().mockResolvedValue({ items: [manual] }), getQrCode: vi.fn().mockResolvedValue(manual),
      updateQrCode: vi.fn(), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(), associateQrFile: vi.fn() };
    render(<QrCodesPage api={api as never} initialQrCodeId={manual.id} />);

    expect(await screen.findByRole('button', { name: '查看文件' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '查看文件' }));
    expect(await screen.findByText('请在 Windows 桌面版查看二维码文件')).toBeVisible();
  });
});
