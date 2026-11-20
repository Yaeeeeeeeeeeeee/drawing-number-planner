import { expect, it } from 'vitest';
import { materialBatchLabel } from '../../src/core/files/material-batch-label';

it.each([
  ['06.20260309', '20260309'], ['00.首批大货', '首批大货'],
  ['13.20260815（新桶配新桶贴）', '20260815（新桶配新桶贴）'],
  ['06.20231030~20231204~20240408', '20231030~20231204~20240408'],
  ['04.黑色次批（20230817）', '黑色次批（20230817）'],
  ['03.黑色首批（20230801）', '黑色首批（20230801）'],
  ['01.白色首批（20230423）', '白色首批（20230423）'],
  ['08.20260815（新桶配新桶贴）', '20260815（新桶配新桶贴）'],
  ['02.20240229(换包装)', '20240229(换包装)'],
  ['02.黑色次批(20230817)', '黑色次批(20230817)'],
  ['02.黑色第三批（20230817）', '黑色第三批（20230817）'],
  ['02.黑色首批', '黑色首批'],
  ['02.20231030~20231204（调整包装）', '20231030~20231204（调整包装）'],
])('removes a recognized ordinal prefix from business label %s', (input, expected) => {
  expect(materialBatchLabel(input)).toBe(expected);
});

it.each([
  '20260309', '20260815（新桶配新桶贴）', '黑色首批（20230801）',
  '06.待确认', '01.20260230', '01.20260230（新包装）',
  '06.20231030~20230229', '03.黑色首批（20230230）',
  '01.25', '01.5升', '1.20260815', '123.20260815',
  '01.版本2', '01.v2.0', '02.20260815.v2', '02.202608150',
])('preserves dates, unknown folders, decimals and version-like names: %s', name => {
  expect(materialBatchLabel(name)).toBe(name);
});

it('does not mutate source records or merge identities with the same display label', () => {
  const batches = [
    { id: 13, name: '13.20260815（新桶配新桶贴）', relativePath: 'A/13.20260815（新桶配新桶贴）' },
    { id: 8, name: '08.20260815（新桶配新桶贴）', relativePath: 'B/08.20260815（新桶配新桶贴）' },
  ];
  const before = structuredClone(batches);
  const labels = batches.map(batch => ({ id: batch.id, label: materialBatchLabel(batch.name) }));
  expect(labels).toEqual([
    { id: 13, label: '20260815（新桶配新桶贴）' },
    { id: 8, label: '20260815（新桶配新桶贴）' },
  ]);
  expect(batches).toEqual(before);
});
