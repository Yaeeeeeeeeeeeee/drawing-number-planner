import { describe, expect, it } from 'vitest';

import { composeDrawingCode, composeDrawingPrefix, formatDisplayName } from '../../src/core/planning/code-generator';

const parts = {
  brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '0',
  mainCategoryCode: '04', projectItemCode: '01',
};

describe('drawing code generator', () => {
  it('keeps every dictionary segment verbatim and pads only the sequence', () => {
    expect(composeDrawingPrefix(parts)).toBe('02.0404.010.0401');
    expect(composeDrawingCode(parts, 1)).toBe('02.0404.010.0401001');
  });

  it.each([0, 1000, 1.5])('rejects an invalid sequence %s', (sequence) => {
    expect(() => composeDrawingCode(parts, sequence)).toThrow('流水号必须在 001 至 999 之间');
  });

  it('formats the display suffix independently from the immutable code', () => {
    expect(formatDisplayName({ brandName: 'SAMKYO', model: 'ZC200', colorName: '白色', projectItemName: 'LOGO' }))
      .toBe('SAMKYO-ZC200白色-LOGO');
  });
});
