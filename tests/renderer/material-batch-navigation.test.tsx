import { fireEvent, render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProductBatchNavigation } from '../../src/renderer/components/ProductBatchNavigation';

const cases = [
  ['13.20260815（新桶配新桶贴）', '20260815（新桶配新桶贴）'],
  ['06.20231030~20231204~20240408', '20231030~20231204~20240408'],
  ['04.黑色次批（20230817）', '黑色次批（20230817）'],
  ['03.黑色首批（20230801）', '黑色首批（20230801）'],
  ['01.白色首批（20230423）', '白色首批（20230423）'],
  ['08.20260815（新桶配新桶贴）', '20260815（新桶配新桶贴）'],
];

it.each(['drawings', 'files'] as const)('formats unassociated batch labels in %s navigation and retains distinct batch IDs', mode => {
  const batches = cases.map(([name], index) => ({ id: index + 1, name, productId: null, recognitionStatus: 'recognized', relativePath: `library/${name}` }));
  const before = structuredClone(batches);
  const onSelect = vi.fn();
  render(<ProductBatchNavigation mode={mode} products={[]} batches={batches as never} scope={{ kind: 'all', title: '全部' }} onSelect={onSelect} />);
  const summary = screen.getByText('未关联产品的批次（6）', { selector: 'summary' });
  fireEvent.click(summary);
  const buttons = within(summary.parentElement!).getAllByRole('button');
  expect(buttons).toHaveLength(cases.length);
  buttons.forEach((button, index) => {
    expect(button).toHaveTextContent(`${cases[index][1]} · 未关联产品`);
    expect(button).not.toHaveTextContent(cases[index][0]);
    fireEvent.click(button);
    expect(onSelect).toHaveBeenLastCalledWith({ kind: 'batch', batchId: index + 1, title: cases[index][1] });
  });
  expect(batches).toEqual(before);
});
