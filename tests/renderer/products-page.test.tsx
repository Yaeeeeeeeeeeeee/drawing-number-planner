import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ProductsPage } from '../../src/renderer/pages/ProductsPage';

describe('ProductsPage', () => {
  it('creates a product archive record with active dictionary selections', async () => {
    const dictionaries = {
      brand: [{ id: 1, code: '02', name: 'SAMKYO', status: 'active' }],
      product_size: [{ id: 2, code: '0209', name: 'ZC220冰柜', status: 'active' }],
      appearance: [{ id: 3, code: '1', name: '1号外观', status: 'active' }],
    };
    const created = { id: 9, brandId: 1, brandName: 'SAMKYO', productSizeId: 2,
      productSizeName: 'ZC220冰柜', defaultAppearanceId: 3, defaultAppearanceName: '1号外观',
      model: 'ZC220', productCategory: '冰柜', referenceProductId: null, referenceProductModel: null, status: 'active' };
    const api = {
      listProducts: vi.fn().mockResolvedValue([]),
      listDictionaries: vi.fn((type: keyof typeof dictionaries) => Promise.resolve(dictionaries[type])),
      createProduct: vi.fn().mockResolvedValue(created),
    };
    render(<ProductsPage api={api as never} />);
    await screen.findByText('还没有产品档案');

    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: 'ZC220' } });
    fireEvent.change(screen.getByLabelText('产品类别'), { target: { value: '冰柜' } });
    fireEvent.change(screen.getByLabelText('品牌'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('品类尺寸'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('默认外观'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: '保存产品' }));

    expect(await screen.findByText('ZC220')).toBeVisible();
    expect(api.createProduct).toHaveBeenCalledWith(expect.objectContaining({ model: 'ZC220', brandId: 1 }));
  });
});
