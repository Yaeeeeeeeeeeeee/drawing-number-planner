import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildDefaultProductDirectory } from '../../src/core/files/directory-policy';

describe('default product directory policy', () => {
  it('keeps the default brand, product category, and model rule centralized', () => {
    expect(buildDefaultProductDirectory({ brandName: ' SAMKYO ', productCategory: ' 冰柜 ', model: ' ZC220 ' }))
      .toBe(join('SAMKYO', '冰柜', 'ZC220'));
  });

  it('replaces Windows-invalid characters and removes trailing dots or spaces', () => {
    expect(buildDefaultProductDirectory({ brandName: 'D&D/包:材', productCategory: '冰柜. ', model: 'ZC<220>?' }))
      .toBe(join('D&D_包_材', '冰柜', 'ZC_220__'));
  });

  it('uses a safe visible segment when a value becomes empty', () => {
    expect(buildDefaultProductDirectory({ brandName: '   ', productCategory: '.', model: 'ZC100' }))
      .toBe(join('_', '_', 'ZC100'));
  });
});
