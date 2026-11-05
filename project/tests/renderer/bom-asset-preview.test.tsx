import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BomAssetPreview } from '../../src/renderer/pages/bom/BomAssetPreview';

describe('BOM image preview', () => {
  it('uses the controlled asset endpoint and replaces a broken image with a clear unavailable state', () => {
    render(<BomAssetPreview assetId={31} name="铭牌图片.png" />);
    const image = screen.getByRole('img', { name: '铭牌图片.png' });
    expect(image).toHaveAttribute('src', '/api/boms/assets/31/preview');
    fireEvent.error(image);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('预览失败，正在核验文件状态…')).toBeVisible();
  });
});

it('opens the zoom viewer without displaying filename tooltips or file-location actions',()=>{
 render(<BomAssetPreview assetId={31} name="private-original-name.png"/>);
 const thumbnail=screen.getByRole('button',{name:'放大图片'});
 expect(thumbnail).not.toHaveAttribute('title','private-original-name.png');
 fireEvent.click(thumbnail);expect(screen.getByRole('dialog',{name:'图片预览'})).toBeVisible();
 expect(document.querySelector('[title="private-original-name.png"]')).toBeNull();
 expect(screen.queryByText('private-original-name.png')).toBeNull();expect(screen.queryByRole('button',{name:'打开所在位置'})).toBeNull();
});
