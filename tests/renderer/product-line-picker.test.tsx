import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { ProductLinePicker } from '../../src/renderer/components/ProductLinePicker';

const products = [
  { id: 1, model: 'T40', sku: 'WT010', brandName: 'SAMKYO', productCategory: '清洁家电' },
  { id: 2, model: 'T40', sku: 'AF031', brandName: 'AVAKYO', productCategory: '厨房家电' },
  { id: 3, model: 'T60', sku: 'WT020', brandName: 'SAMKYO', productCategory: '清洁家电' },
];

function Fixture({ mode = 'multiple' }: { mode?: 'single' | 'multiple' }) {
  const [selectedIds, onChange] = useState<number[]>([]);
  return <><ProductLinePicker products={products} selectedIds={selectedIds} onChange={onChange} mode={mode} />
    <output data-testid="selected">{selectedIds.join(',')}</output></>;
}

describe('product line picker', () => {
  it('groups models by product line and selects only search results without discarding other selections', () => {
    render(<Fixture />);
    const kitchen = screen.getByRole('group', { name: '厨房家电' });
    fireEvent.click(within(kitchen).getByRole('checkbox', { name: /T40/ }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'WT' } });
    expect(screen.queryByRole('group', { name: '厨房家电' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '全选当前结果' }));
    expect(screen.getByTestId('selected')).toHaveTextContent('2,1,3');
    expect(screen.getByText('已选 3 个型号')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '清空选择' }));
    expect(screen.getByTestId('selected')).toBeEmptyDOMElement();
  });

  it('keeps a single selected product ID when different lines use the same model name', () => {
    render(<Fixture mode="single" />);
    fireEvent.click(within(screen.getByRole('group', { name: '清洁家电' })).getByRole('radio', { name: /T40/ }));
    fireEvent.click(within(screen.getByRole('group', { name: '厨房家电' })).getByRole('radio', { name: /T40/ }));
    expect(screen.getByTestId('selected')).toHaveTextContent(/^2$/);
    expect(screen.queryByRole('button', { name: '全选当前结果' })).toBeNull();
  });
});
