import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { QrCodesPage } from '../../src/renderer/pages/QrCodesPage';

const manual = {
  id: 11, productId: 3, sku: 'SKU-Q1', model: 'Q100', productCategory: '冰柜', purposeId: 1,
  key: 'user_manual', englishName: 'User Manual', displayName: '说明书二维码', purposeStatus: 'active',
  name: 'Q100 使用说明', targetUrl: 'https://example.test/manual', status: 'active',
  createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
  files: [{ id: 81, relativePath: '冰柜/SKU-Q1-Q100/Q100-User Manual（网址编码）.png', fileName: 'Q100-User Manual（网址编码）.png', mimeType: 'image/png', isPresent: true, matchStatus: 'matched', detectedIdentifier: '网址编码' }],
  pendingFiles: [{ id: 82, relativePath: '冰柜/SKU-Q1-Q100/待确认/Q100-User Manual（网址编码）.png', fileName: 'Q100-User Manual（网址编码）.png', mimeType: 'image/png', isPresent: false, matchStatus: 'pending' }],
};

describe('QrCodesPage', () => {
  it('keeps v2 path disclosure beneath the complete filename without changing file actions', async () => {
    const api={listQrCodes:vi.fn().mockResolvedValue({items:[manual]}),getQrCode:vi.fn().mockResolvedValue(manual)};
    render(<QrCodesPage api={api as never} initialQrCodeId={manual.id}/>);
    await screen.findByRole('heading',{name:manual.name});
    const toggle=screen.getAllByRole('button',{name:'查看路径'})[0];
    expect((toggle.closest('td') as HTMLTableCellElement).cellIndex).toBe(0);
    expect(toggle.closest('td')).toHaveTextContent(manual.files[0].fileName);
    fireEvent.click(toggle);
    expect(screen.getByText(manual.files[0].relativePath)).toBeVisible();
  });
  it('offers nearby create, edit, status, and protected delete controls with separate match status', async () => {
    const created = { ...manual, id: 99, name: 'Q100 新说明书', status: 'inactive' as const };
    const api = { listQrCodes: vi.fn().mockResolvedValue({ items: [manual] }), getQrCode: vi.fn().mockResolvedValue(manual),
      listQrPurposes: vi.fn().mockResolvedValue({ items: [{ id: 1, key: 'user_manual', englishName: 'User Manual', displayName: '说明书二维码', status: 'active', defaultForAll: true, productCategories: [] }] }),
      listProducts: vi.fn().mockResolvedValue([{ id: 3, sku: 'SKU-Q1', model: 'Q100', productCategory: '冰柜', status: 'active' }]),
      listPendingQrFiles: vi.fn().mockResolvedValue({ items: [manual.pendingFiles[0]] }),
      createQrCode: vi.fn().mockResolvedValue(created), deleteQrCode: vi.fn().mockResolvedValue({ deleted: true }),
      createQrPurpose: vi.fn(), updateQrCode: vi.fn(), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(), associateQrFile: vi.fn() };
    render(<QrCodesPage api={api as never} />);

    fireEvent.click(await screen.findByRole('button', { name: '新增二维码' }));
    expect(screen.getByLabelText('新增二维码产品')).toBeVisible();
    expect(screen.getByLabelText('新增二维码用途')).toBeVisible();
    expect(await screen.findByLabelText('待确认关联文件')).toBeVisible();
    fireEvent.change(screen.getByLabelText('新增二维码状态'), { target: { value: 'active' } });
    fireEvent.change(screen.getByLabelText('二维码名称'), { target: { value: 'Q100 新说明书' } });
    fireEvent.click(screen.getByRole('button', { name: '保存新增二维码' }));
    await waitFor(() => expect(api.createQrCode).toHaveBeenCalledWith(expect.objectContaining({ productId: 3, purposeId: 1,
      name: 'Q100 新说明书' })));
    expect(api.createQrCode).toHaveBeenCalledWith(expect.objectContaining({ status: 'active', qrFileId: 82 }));

    fireEvent.click(screen.getByRole('button', { name: '展开 Q100 的二维码用途' }));
    fireEvent.click(screen.getByRole('button', { name: '查看 Q100 使用说明' }));
    expect(await screen.findByText('扫描匹配状态')).toBeVisible();
    expect(screen.getByText('标识：网址编码')).toBeVisible();
    expect(screen.getByRole('button', { name: '删除二维码' })).toBeVisible();
  });
  it('lists independent QR management filters and keeps business and file status distinct in details', async () => {
    const api = { listQrCodes: vi.fn().mockResolvedValue({ items: [manual] }), getQrCode: vi.fn().mockResolvedValue(manual),
      updateQrCode: vi.fn(), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(), associateQrFile: vi.fn() };
    render(<QrCodesPage api={api as never} />);

    expect(await screen.findByRole('heading', { name: '二维码管理' })).toBeVisible();
    expect(screen.queryByRole('columnheader',{name:'二维码用途'})).not.toBeInTheDocument();
    expect(screen.getByLabelText('SKU / 型号')).toBeVisible();
    expect(screen.getByLabelText('产品类别')).toBeVisible();
    expect(screen.getByLabelText('用途')).toBeVisible();
    expect(screen.getByLabelText('业务状态')).toBeVisible();
    expect(screen.getByLabelText('文件状态')).toBeVisible();

    fireEvent.click(await screen.findByRole('button', { name: '展开 Q100 的二维码用途' }));
    fireEvent.click(screen.getByRole('button', { name: '查看 Q100 使用说明' }));
    expect(await screen.findByRole('heading', { name: 'Q100 使用说明' })).toBeVisible();
    expect(screen.getByText('业务状态')).toBeVisible();
    expect(screen.getAllByText('启用中')[0]).toBeVisible();
    expect(screen.getAllByText('文件状态')[0]).toBeVisible();
    expect(screen.getAllByText('文件可用').length).toBeGreaterThan(0);
    expect(screen.getByText('创建时间')).toBeVisible();
    expect(screen.getByText('更新时间')).toBeVisible();
    expect(screen.getByText('待人工确认')).toBeVisible();
  });

  it('shows partially missing when associated files include both present and missing instances', async () => {
    const mixed = { ...manual, files: [...manual.files, { ...manual.files[0], id: 83, isPresent: false }] };
    const api = { listQrCodes: vi.fn().mockResolvedValue({ items: [mixed] }), getQrCode: vi.fn().mockResolvedValue(mixed),
      updateQrCode: vi.fn(), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(), associateQrFile: vi.fn() };

    render(<QrCodesPage api={api as never} initialQrCodeId={mixed.id} />);

    expect(await screen.findByText('部分缺失')).toBeVisible();
    expect(screen.getByText('部分已匹配 · 仍有待确认')).toBeVisible();
    expect(screen.getAllByRole('button', { name: '查看文件' })[1]).toBeDisabled();
    expect(screen.getAllByRole('button', { name: '打开所在位置' })[1]).toBeDisabled();
    expect(screen.getByRole('button', { name: '关联此文件' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '关联此文件' }));
    expect(api.associateQrFile).not.toHaveBeenCalled();
  });

  it('groups QR purposes under one product row and keeps filter choices after narrowing results', async () => {
    const warranty = { ...manual, id: 12, purposeId: 2, key: 'warranty', displayName: '售后二维码', name: 'Q100 售后服务' };
    const fryer = { ...manual, id: 21, productId: 4, sku: 'SKU-A1', model: 'A100', productCategory: '空气炸锅', purposeId: 3, key: 'recipe', displayName: '菜谱二维码', name: 'A100 菜谱' };
    const api = {
      listQrCodes: vi.fn().mockResolvedValueOnce({ items: [manual, warranty, fryer] }).mockResolvedValueOnce({ items: [manual] }),
      getQrCode: vi.fn().mockResolvedValue(manual), updateQrCode: vi.fn(), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(), associateQrFile: vi.fn(),
    };
    const { container } = render(<QrCodesPage api={api as never} />);

    await screen.findByRole('button', { name: '展开 Q100 的二维码用途' });
    expect(container.querySelectorAll('tbody > tr')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: '展开 Q100 的二维码用途' }));
    expect(screen.getByRole('button', { name: '查看 Q100 使用说明' })).toBeVisible();
    expect(screen.getByRole('button', { name: '查看 Q100 售后服务' })).toBeVisible();

    fireEvent.change(screen.getByLabelText('产品类别'), { target: { value: '冰柜' } });
    fireEvent.click(screen.getByRole('button', { name: '筛选' }));
    await waitFor(() => expect(api.listQrCodes).toHaveBeenLastCalledWith(expect.objectContaining({ productCategory: '冰柜' })));
    expect(Array.from((screen.getByLabelText('产品类别') as HTMLSelectElement).options)).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: '空气炸锅' }),
    ]));
    expect(Array.from((screen.getByLabelText('用途') as HTMLSelectElement).options)).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: '售后' }),
      expect.objectContaining({ text: '菜谱' }),
    ]));
  });

  it('saves metadata and manually associates a pending file without changing the business status', async () => {
    const available = { ...manual, pendingFiles: [{ ...manual.pendingFiles[0], isPresent: true }] };
    const associated = { ...available, files: [...manual.files, { ...available.pendingFiles[0], matchStatus: 'matched' }], pendingFiles: [] };
    const api = { listQrCodes: vi.fn().mockResolvedValue({ items: [available] }), getQrCode: vi.fn().mockResolvedValue(available),
      updateQrCode: vi.fn().mockResolvedValue({ ...available, name: '新版说明书' }), activateQrCode: vi.fn(), deactivateQrCode: vi.fn(),
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

it('opens an unconfigured product purpose with exact preselection and never creates automatically',async()=>{
 const purpose={id:8,key:'recipe',englishName:'Recipe',displayName:'菜谱',status:'active',defaultForAll:false,productCategories:[]};
 const product={id:3,sku:'SKU-Q1',model:'Q100',productCategory:'冰柜',status:'inactive'};
 const api={listQrCodes:vi.fn().mockResolvedValue({items:[]}),listQrPurposes:vi.fn().mockResolvedValue({items:[purpose]}),listProducts:vi.fn().mockResolvedValue([product]),listPendingQrFiles:vi.fn().mockResolvedValue({items:[]}),createQrCode:vi.fn()};
 render(<QrCodesPage api={api as never} {...{productTarget:{productId:3,sku:'SKU-Q1',model:'Q100',productCategory:'冰柜',purposeKey:'recipe' as const,purposeLabel:'菜谱',purposeEnglishName:'Recipe'}}}/>);
 expect(await screen.findByLabelText('新增二维码产品')).toHaveValue('3');expect(screen.getByLabelText('新增二维码用途')).toHaveValue('8');
 expect(api.createQrCode).not.toHaveBeenCalled();expect(screen.getByRole('button',{name:'返回产品档案'})).toBeVisible();expect(screen.getByRole('button',{name:'保存新增二维码'})).toBeDisabled();expect(screen.getByText(/须在产品编辑中重新启用/)).toBeVisible();
});
it('shows all matching records instead of arbitrarily opening one',async()=>{
 const api={listQrCodes:vi.fn().mockResolvedValue({items:[manual,{...manual,id:12,name:'同用途第二条',status:'inactive'}]}),listQrPurposes:vi.fn().mockResolvedValue({items:[{id:1,key:'user_manual',status:'active',displayName:'说明书'}]}),listProducts:vi.fn().mockResolvedValue([{id:3,sku:'SKU-Q1',model:'Q100',status:'active'}]),getQrCode:vi.fn()};
 render(<QrCodesPage api={api as never} {...{productTarget:{productId:3,sku:'SKU-Q1',model:'Q100',productCategory:'冰柜',purposeKey:'user_manual' as const,purposeLabel:'说明书',purposeEnglishName:'User Manual'}}}/>);
 expect(await screen.findByRole('button',{name:'查看 同用途第二条'})).toBeVisible();expect(screen.getByRole('button',{name:'查看 Q100 使用说明'})).toBeVisible();expect(api.getQrCode).not.toHaveBeenCalled();
});
it('opens the inactive target record and retains its explicit enable action',async()=>{
 const inactive={...manual,status:'inactive'};
 const api={listQrCodes:vi.fn().mockResolvedValue({items:[inactive]}),listQrPurposes:vi.fn().mockResolvedValue({items:[{id:1,key:'user_manual',status:'active'}]}),listProducts:vi.fn().mockResolvedValue([{id:3,sku:'SKU-Q1',model:'Q100',status:'active'}]),getQrCode:vi.fn().mockResolvedValue(inactive),activateQrCode:vi.fn()};
 render(<QrCodesPage api={api as never} productTarget={{productId:3,sku:'SKU-Q1',model:'Q100',productCategory:'冰柜',purposeKey:'user_manual',purposeLabel:'说明书',purposeEnglishName:'User Manual'}}/>);
 expect(await screen.findByRole('heading',{name:manual.name})).toBeVisible();expect(screen.getByRole('button',{name:'启用二维码'})).toBeVisible();expect(api.activateQrCode).not.toHaveBeenCalled();
});
it('never falls back to an unrelated purpose when the target purpose is unavailable',async()=>{
 const api={listQrCodes:vi.fn().mockResolvedValue({items:[]}),listQrPurposes:vi.fn().mockResolvedValue({items:[{id:1,key:'user_manual',status:'active'}]}),listProducts:vi.fn().mockResolvedValue([{id:3,sku:'SKU-Q1',model:'Q100',status:'active'}]),createQrCode:vi.fn()};
 render(<QrCodesPage api={api as never} productTarget={{productId:3,sku:'SKU-Q1',model:'Q100',productCategory:'冰柜',purposeKey:'recipe',purposeLabel:'菜谱',purposeEnglishName:'Recipe'}}/>);
 expect(await screen.findByText(/对应资料用途尚未建立/)).toBeVisible();expect(screen.queryByLabelText('新增二维码用途')).toBeNull();expect(screen.getByRole('button',{name:'新增二维码'})).toBeDisabled();expect(api.createQrCode).not.toHaveBeenCalled();
});
