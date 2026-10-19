import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ProductsPage } from '../../src/renderer/pages/ProductsPage';

const dictionaries = {
  brand: [{ id: 1, code: 'B', name: '新增品牌', status: 'active' }],
  product_size: [{ id: 2, code: 'S', name: '新增尺寸', status: 'active' }],
  appearance: [{ id: 3, code: 'A', name: '新增外观', status: 'active' }],
};
const product = { id: 9, sku: 'SKU', model: 'M1', productCategory: '冰柜', brandId: 41, brandName: '旧品牌',
  productSizeId: 42, productSizeName: '旧尺寸', defaultAppearanceId: 43, defaultAppearanceName: '旧外观',
  referenceProductId: null, referenceProductModel: null, status: 'active' };
const makeApi = () => ({ listProducts: vi.fn().mockResolvedValue([]),
  listDictionaries: vi.fn((type: keyof typeof dictionaries) => Promise.resolve(dictionaries[type])),
  listQrCodes: vi.fn().mockResolvedValue({ items: [] }), createProduct: vi.fn(), updateProduct: vi.fn(),
});
const expectChoices = async () => {
  for (const [label, name] of [['品牌', '新增品牌'], ['品类尺寸', '新增尺寸'], ['默认外观', '新增外观']]) {
    await waitFor(() => expect(within(screen.getByRole('combobox', { name: label })).getByRole('option', { name })).toBeEnabled());
  }
};

describe('product dictionary refresh', () => {
  it('refreshes all dictionaries when a retained workspace becomes active, keeping the editor draft', async () => {
    const api = makeApi();
    api.listDictionaries.mockImplementation(() => Promise.resolve([]));
    const { rerender } = render(<ProductsPage api={api as never} active />);
    await screen.findByText('还没有产品档案');
    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: '未保存草稿' } });
    rerender(<ProductsPage api={api as never} active={false} />);
    api.listDictionaries.mockImplementation(type => Promise.resolve(dictionaries[type]));
    rerender(<ProductsPage api={api as never} active />);
    await expectChoices();
    expect(screen.getByLabelText('型号')).toHaveValue('未保存草稿');
    for (const type of Object.keys(dictionaries)) expect(api.listDictionaries).toHaveBeenCalledWith(type, false);
  });

  it('reads current options whenever the create editor opens without leaving the workspace', async () => {
    const api = makeApi();
    api.listDictionaries.mockImplementation(() => Promise.resolve([]));
    render(<ProductsPage api={api as never} />);
    await screen.findByText('还没有产品档案');
    api.listDictionaries.mockImplementation(type => Promise.resolve(dictionaries[type]));
    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    await expectChoices();
  });

  it('shows a refresh failure with a retry and preserves the draft until options recover', async () => {
    const api = makeApi();
    render(<ProductsPage api={api as never} />);
    await screen.findByText('还没有产品档案');
    api.listDictionaries.mockRejectedValue(new Error('字典网络断开'));
    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    fireEvent.change(screen.getByLabelText('型号'), { target: { value: '草稿' } });
    await screen.findByText(/字典网络断开/);
    expect(screen.getByRole('button', { name: '保存产品' })).toBeDisabled();
    api.listDictionaries.mockImplementation(type => Promise.resolve(dictionaries[type]));
    fireEvent.click(screen.getByRole('button', { name: '重试加载字典' }));
    await expectChoices();
    await waitFor(() => expect(screen.getByRole('button', { name: '保存产品' })).toBeEnabled());
    expect(screen.getByLabelText('型号')).toHaveValue('草稿');
  });


  it('ignores an older dictionary response after a newer refresh completes', async () => {
    const api = makeApi();
    render(<ProductsPage api={api as never} />);
    await screen.findByText('还没有产品档案');
    const resolveOlder: Array<(items: typeof dictionaries.brand) => void> = [];
    api.listDictionaries.mockImplementation(() => new Promise(resolve => { resolveOlder.push(resolve); }));
    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    fireEvent.click(screen.getByRole('button', { name: '返回产品档案' }));
    api.listDictionaries.mockImplementation(type => Promise.resolve(dictionaries[type]));
    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    await expectChoices();
    await act(async () => { resolveOlder.forEach(resolve => resolve([])); });
    await expectChoices();
  });

  it('keeps historical selected dictionary values visible and disabled without offering them to a new product', async () => {
    const api = makeApi();
    api.listProducts.mockResolvedValue([product] as never);
    render(<ProductsPage api={api as never} />);
    fireEvent.click(await screen.findByRole('button', { name: '编辑 M1' }));
    for (const [label, id, name] of [['品牌', '41', '旧品牌'], ['品类尺寸', '42', '旧尺寸'], ['默认外观', '43', '旧外观']]) {
      const select = screen.getByRole('combobox', { name: label });
      expect(select).toHaveValue(id);
      expect(within(select).getByRole('option', { name: new RegExp(name) })).toBeDisabled();
    }
    await expectChoices();
    fireEvent.click(screen.getByRole('button', { name: '返回产品档案' }));
    fireEvent.click(screen.getByRole('button', { name: '新建产品' }));
    for (const label of ['品牌', '品类尺寸', '默认外观']) {
      expect(within(screen.getByRole('combobox', { name: label })).queryByRole('option', { name: /旧品牌|旧尺寸|旧外观/ })).not.toBeInTheDocument();
    }
  });
});
