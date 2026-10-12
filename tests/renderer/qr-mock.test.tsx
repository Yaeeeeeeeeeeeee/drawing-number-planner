import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createQrMockApi } from '../../src/renderer/pages/qr-mock';
import { QrCodesPage } from '../../src/renderer/pages/QrCodesPage';

describe('QR renderer-only mock',()=>{
  it('mutates only adapter memory and denies unknown methods',async()=>{
    const api=createQrMockApi();const other=createQrMockApi();
    await api.deactivateQrCode(-1000);
    expect((await api.getQrCode(-1000)).status).toBe('inactive');
    expect((await other.getQrCode(-1000)).status).toBe('active');
    await expect(api.listBomQrCandidates(1)).rejects.toThrow('禁止真实服务回退');
    await expect(api.deleteQrCode(-1000)).rejects.toThrow('引用');
    await expect(api.associateQrFile(-1003,-5003)).rejects.toThrow('缺失');
  });
  it('blocks real API, fetch and desktop bridge through detail operations',async()=>{
    window.history.replaceState({},'', '/?mock=qr');
    const real=vi.fn(()=>{throw new Error('real API forbidden');});
    const bridge=vi.fn();window.plannerDesktop={qrFileAction:bridge} as never;
    const fetchSpy=vi.spyOn(globalThis,'fetch');
    try {
      render(<QrCodesPage api={new Proxy({} as never,{get:()=>real})} initialQrCodeId={-1003}/>);
      await screen.findByRole('heading',{name:'F61 说明书二维码'});
      fireEvent.click(screen.getAllByRole('button',{name:'查看文件'})[0]);
      fireEvent.click(screen.getAllByRole('button',{name:'打开所在位置'})[0]);
      fireEvent.click(screen.getByRole('button',{name:'停用二维码'}));
      fireEvent.click(screen.getByRole('button',{name:'保存二维码信息'}));
      fireEvent.click(screen.getAllByRole('button',{name:'关联此文件'})[0]);
      await waitFor(()=>expect(screen.getByText('已完成文件人工关联，二维码业务状态保持不变。')).toBeVisible());
      const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
      fireEvent.click(screen.getByRole('button',{name:'删除二维码'}));
      await screen.findByText('二维码仍被文件引用，不能删除');confirm.mockRestore();
      expect(real).not.toHaveBeenCalled();expect(bridge).not.toHaveBeenCalled();expect(fetchSpy).not.toHaveBeenCalled();
    } finally {fetchSpy.mockRestore();delete window.plannerDesktop;window.history.replaceState({},'','/');}
  });
});
