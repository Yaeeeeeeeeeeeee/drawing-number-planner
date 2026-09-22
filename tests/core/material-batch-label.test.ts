import { expect, it } from 'vitest';
import { materialBatchLabel } from '../../src/core/files/material-batch-label';

it.each([
  ['06.20260309', '20260309'], ['00.首批大货', '首批大货'],
  ['20260309', '20260309'], ['06.待确认', '06.待确认'], ['01.20260230', '01.20260230'],
])('formats business batch label %s without changing unknown folders', (input, expected) => {
  expect(materialBatchLabel(input)).toBe(expected);
});
