import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { createQrMockApi } from '../../src/renderer/pages/qr-mock';
import { QrCodesPage } from '../../src/renderer/pages/QrCodesPage';
describe('QR renderer-only mock',()=>{
 it('mutates only adapter memory and denies unknown methods',async()=>{
  const api=createQrMockApi(),other=createQrMockApi();await api.deactivateQrCode(-1000);expect((await api.getQrCode(-1000)).status).toBe('inactive');expect((await other.getQrCode(-1000)).status).toBe('active');await expect(api.listBomQrCandidates(1)).rejects.toThrow('禁止真实服务回退');await expect(api.deleteQrCode(-1000)).rejects.toThrow('引用');
 });
 it('removes pending flow and blocks every real API, fetch and desktop bridge during file/detail/manual operations',async()=>{
  window.history.replaceState({},'','/?mock=qr');const real=vi.fn(()=>{throw new Error('real API forbidden');}),bridge=vi.fn();window.plannerDesktop={qrFileAction:bridge,qrManualSelectFile:bridge,qrManualAction:bridge} as never;const fetchSpy=vi.spyOn(globalThis,'fetch');
  try{
   render(<QrCodesPage api={new Proxy({} as never,{get:()=>real})} initialQrCodeId={-1003}/>);await screen.findByRole('heading',{name:'F61 说明书二维码'});
   fireEvent.click(screen.getAllByRole('button',{name:'查看文件'})[1]);fireEvent.click(screen.getAllByRole('button',{name:'打开所在位置'})[1]);
   expect(screen.queryByRole('button',{name:'关联此文件'})).not.toBeInTheDocument();expect(screen.queryByText('待人工确认')).not.toBeInTheDocument();expect(screen.queryByText('扫描匹配状态')).not.toBeInTheDocument();
   fireEvent.click(screen.getByRole('button',{name:'更换文件'}));const dialog=screen.getByRole('dialog');fireEvent.click(within(dialog).getByRole('button',{name:'选择本地PDF'}));await within(dialog).findByText('Mock 不访问本地文件；请退出开发预览后使用真实文件关联。');fireEvent.click(within(dialog).getByRole('button',{name:'取消'}));
   fireEvent.click(screen.getByRole('button',{name:'停用二维码'}));await waitFor(()=>expect(screen.getByRole('button',{name:'启用二维码'})).toBeVisible());fireEvent.click(screen.getByRole('button',{name:'保存二维码信息'}));await screen.findByText('二维码信息已保存。');
   const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'删除二维码'}));await screen.findByText('Error: 二维码仍被文件引用，不能删除');confirm.mockRestore();expect(real).not.toHaveBeenCalled();expect(bridge).not.toHaveBeenCalled();expect(fetchSpy).not.toHaveBeenCalled();
  }finally{fetchSpy.mockRestore();delete window.plannerDesktop;window.history.replaceState({},'','/');}
 });
});
