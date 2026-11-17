import {act,render,screen,waitFor} from '@testing-library/react';
import {expect,it,vi} from 'vitest';
import {QrPixelComparison} from '../../src/renderer/components/QrPixelComparison';
import {compareQrFirstPagePixels} from '../../src/renderer/data/qr-first-page-pixels';
vi.mock('../../src/renderer/data/qr-first-page-pixels',()=>({compareQrFirstPagePixels:vi.fn()}));
const bytes={status:'ready' as const,selectedPdfBase64:'selected',currentPdfBase64:'current'};
it.each(['equal','different'] as const)('displays %s first-page pixels without any association/status action',async(result)=>{
 vi.mocked(compareQrFirstPagePixels).mockResolvedValue(result);const qrManualComparison=vi.fn().mockResolvedValue(bytes);
 render(<QrPixelComparison previewId="one" api={{qrManualComparison}}/>);
 expect(await screen.findByText(result==='equal'?'首页像素相同':'首页像素不同')).toBeVisible();expect(qrManualComparison).toHaveBeenCalledWith('one');
 expect(compareQrFirstPagePixels).toHaveBeenCalledWith('selected','current',expect.any(AbortSignal));
});
it('distinguishes a first association from failed decoding and private read failure',async()=>{
 const qrManualComparison=vi.fn().mockResolvedValue({status:'not-compared'});const {rerender}=render(<QrPixelComparison previewId="first" api={{qrManualComparison}}/>);
 expect(await screen.findByText('无当前关联文件，未比较首页像素')).toBeVisible();
 qrManualComparison.mockResolvedValue(bytes);vi.mocked(compareQrFirstPagePixels).mockRejectedValue(new Error('损坏PDF'));
 rerender(<QrPixelComparison previewId="broken" api={{qrManualComparison}}/>);expect(await screen.findByText('无法比较首页像素：损坏PDF')).toBeVisible();expect(screen.queryByText('首页像素相同')).toBeNull();
 qrManualComparison.mockResolvedValue({status:'unavailable',message:'文件已变化'});rerender(<QrPixelComparison previewId="changed" api={{qrManualComparison}}/>);expect(await screen.findByText('无法比较首页像素：文件已变化')).toBeVisible();
});
it('ignores an old async selection result after a new preview, and after closing',async()=>{
 let finish!:(result:'equal')=>void;vi.mocked(compareQrFirstPagePixels).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue('different');
 const qrManualComparison=vi.fn().mockResolvedValue(bytes);const {rerender,unmount}=render(<QrPixelComparison previewId="old" api={{qrManualComparison}}/>);
 await waitFor(()=>expect(finish).toBeDefined());rerender(<QrPixelComparison previewId="new" api={{qrManualComparison}}/>);
 expect(await screen.findByText('首页像素不同')).toBeVisible();await act(async()=>finish('equal'));expect(screen.getByText('首页像素不同')).toBeVisible();expect(screen.queryByText('首页像素相同')).toBeNull();unmount();
});
