import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { BomHistoryAsset } from '../../src/renderer/pages/bom/BomHistoryAsset';
const asset={id:5,assetId:8,role:'image' as const,inheritedFromBomItemAssetId:2,relativePath:'BOM/历史/说明书.png',originalFileName:'完整-说明书-20260928.png',mimeType:'image/png',sizeBytes:99,contentSha256:'a'.repeat(64),createdAt:'2026-09-28'};
afterEach(()=>vi.unstubAllGlobals());
it('opens only a verified original association and hides path until requested',()=>{
 const open=vi.fn();render(<BomHistoryAsset asset={asset} onOpen={open} previewOnly={false}/>);
 const button=screen.getByRole('button',{name:/打开附件位置/});expect(button).toBeDisabled();expect(screen.getByText(asset.relativePath)).not.toBeVisible();
 fireEvent.load(screen.getByRole('img'));expect(screen.getByText('文件存在 · 预览可用')).toBeVisible();expect(button).toBeEnabled();fireEvent.click(button);expect(open).toHaveBeenCalledWith(8);
 fireEvent.click(screen.getByText('查看完整路径'));expect(screen.getByText(asset.relativePath)).toBeVisible();
});
it.each([['ASSET_NOT_FOUND',404,'附件记录不存在，或文件缺失／不可读取'],['ASSET_PATH_INVALID',422,'附件路径无效'],['ASSET_CONTENT_INVALID',422,'附件内容校验失败，不能确认原始文件']])('reports %s and never enables opening',async(code,status,label)=>{
 const fetch=vi.fn().mockResolvedValue({ok:false,status,json:async()=>({error:{code}})});vi.stubGlobal('fetch',fetch);
 render(<BomHistoryAsset asset={asset} onOpen={vi.fn()} previewOnly={false}/>);fireEvent.error(screen.getByRole('img'));
 expect(await screen.findByText(label)).toBeVisible();expect(screen.getByRole('button',{name:/打开附件位置/})).toBeDisabled();expect(fetch.mock.calls[0][0]).toBe('/api/boms/assets/8/preview');
});
it('distinguishes preview decoding failure from missing files',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,body:{cancel:vi.fn().mockResolvedValue(undefined)}}));render(<BomHistoryAsset asset={asset} onOpen={vi.fn()} previewOnly={false}/>);fireEvent.error(screen.getByRole('img'));
 expect(await screen.findByText('文件已读取；上次预览未成功')).toBeVisible();expect(screen.getByRole('button',{name:/打开附件位置/})).toBeEnabled();
});
it('does not classify a network error as a missing file',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));render(<BomHistoryAsset asset={asset} onOpen={vi.fn()} previewOnly={false}/>);fireEvent.error(screen.getByRole('img'));
 expect(await screen.findByText(/未确认文件缺失/)).toBeVisible();expect(screen.getByRole('button',{name:/打开附件位置/})).toBeDisabled();
});
it('retries the actual image after a transient failure and restores preview availability',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('temporary')));render(<BomHistoryAsset asset={asset} onOpen={vi.fn()} previewOnly={false}/>);fireEvent.error(screen.getByRole('img'));
 await screen.findByText(/未确认文件缺失/);fireEvent.click(screen.getByRole('button',{name:'重试预览'}));
 const image=screen.getByRole('img');fireEvent.load(image);expect(screen.getByText('文件存在 · 预览可用')).toBeVisible();expect(screen.getByRole('button',{name:/打开附件位置/})).toBeEnabled();
});
it('ignores old verification completion after a successful image retry',async()=>{
 let finish!:()=>void;const cancel=vi.fn(()=>new Promise<void>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,body:{cancel}}));
 render(<BomHistoryAsset asset={asset} onOpen={vi.fn()} previewOnly={false}/>);fireEvent.error(screen.getByRole('img'));
 await vi.waitFor(()=>expect(cancel).toHaveBeenCalled());fireEvent.click(screen.getByRole('button',{name:'重试预览'}));fireEvent.load(screen.getByRole('img'));await act(async()=>finish());
 await vi.waitFor(()=>expect(screen.getByText('文件存在 · 预览可用')).toBeVisible());expect(screen.getByRole('img')).toBeVisible();
});
it('shows the complete selectable BOM value without copy controls',async()=>{
 const {BomValue}=await import('../../src/renderer/pages/bom/BomValue');
 const text='02.0404.010.0401001-完整长图号-不可截断';render(<BomValue value={text} code/>);
 expect(screen.getByText(text)).toBeVisible();expect(screen.queryByRole('button')).toBeNull();
});
