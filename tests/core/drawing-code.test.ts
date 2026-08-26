import { describe, expect, it } from 'vitest';

import {
  composeDrawingCode,
  composeDrawingPrefix,
  inspectDrawingCodesInFilename,
  parseDrawingCode,
} from '../../src/core/drawings/drawing-code';

describe('verified Excel drawing code contract', () => {
  it.each([
    [{ brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '0', mainCategoryCode: '04', projectItemCode: '01' }, 1, '02.0404.010.0401001'],
    [{ brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '0', mainCategoryCode: '01', projectItemCode: '03' }, 1, '02.0404.010.0103001'],
    [{ brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '2', mainCategoryCode: '01', projectItemCode: '03' }, 1, '02.0404.012.0103001'],
    [{ brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '0', mainCategoryCode: '04', projectItemCode: '02' }, 1, '02.0404.010.0402001'],
  ] as const)('generates a real workbook case %#', (parts, sequence, expected) => {
    expect(composeDrawingCode(parts, sequence)).toBe(expected);
  });

  it('uses appearance code in the allocation prefix', () => {
    const first = { brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '0', mainCategoryCode: '04', projectItemCode: '01' };
    const second = { ...first, appearanceCode: '02' };
    expect(composeDrawingPrefix(first)).toBe('02.0404.010.0401');
    expect(composeDrawingPrefix(second)).toBe('02.0404.020.0401');
  });

  it('parses every required segment from a real workbook code', () => {
    expect(parseDrawingCode('02.0404.012.0103001')).toEqual({
      fullCode: '02.0404.012.0103001', prefix: '02.0404.012.0103', sequence: 1,
      brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '2',
      mainCategoryCode: '01', projectItemCode: '03',
    });
  });

  it.each(['02.0404.012.0103000', '2.0404.012.0103001', '02.0404.012.0103001x', '02.0404.012.01030001'])
    ('rejects malformed full code %s', (value) => {
      expect(parseDrawingCode(value)).toBeNull();
    });
});

describe('drawing codes found in PDF filenames', () => {
  it('accepts one complete formal code', () => {
    expect(inspectDrawingCodesInFilename('02.0404.010.0401007-SAMKYO-ZC200白色-LOGO.pdf')).toMatchObject({
      status: 'reliable', candidates: ['02.0404.010.0401007'], code: { sequence: 7, appearanceCode: '01' },
    });
  });

  it('deduplicates the same complete code', () => {
    expect(inspectDrawingCodesInFilename('02.0404.010.0401007-复核-02.0404.010.0401007.pdf')).toMatchObject({
      status: 'reliable', candidates: ['02.0404.010.0401007'],
    });
  });

  it('sends multiple different complete codes to pending', () => {
    expect(inspectDrawingCodesInFilename('02.0404.010.0401007-02.0404.010.0401008.pdf')).toEqual({
      status: 'pending', reason: 'ambiguous', candidates: ['02.0404.010.0401007', '02.0404.010.0401008'],
    });
  });

  it.each([
    '02.0404.010.0401000-LOGO.pdf',
    '02.0404.010.04010-LOGO.pdf',
    '1022.0404.010.0401007.pdf',
    '02.0404.010.0401007x.pdf',
  ])
    ('sends a code-like but invalid token to pending: %s', (fileName) => {
      expect(inspectDrawingCodesInFilename(fileName)).toMatchObject({ status: 'pending', reason: 'invalid-format' });
    });

  it('leaves a filename without any code candidate unmatched', () => {
    expect(inspectDrawingCodesInFilename('旧版铭牌.pdf')).toEqual({ status: 'unmatched', candidates: [] });
  });
});
