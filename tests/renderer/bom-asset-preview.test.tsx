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
    expect(screen.getByText('图片缺失或无法预览')).toBeVisible();
  });
});
