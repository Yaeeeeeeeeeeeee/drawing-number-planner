import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildProductDirectory, parseProductDirectory } from '../../src/core/files/directory-policy';

describe('default product directory policy', () => {
  it('keeps the product category, sku, and model rule centralized', () => {
    expect(buildProductDirectory({ productCategory: ' 01.洗碗机 ', sku: ' SKDWT040JP ', model: ' T40 ' }))
      .toBe(join('01.洗碗机', 'SKDWT040JP-T40'));
  });

  it('replaces Windows-invalid characters and removes trailing dots or spaces', () => {
    expect(buildProductDirectory({ productCategory: '冰柜. ', sku: 'SKU/01', model: 'ZC<220>?' }))
      .toBe(join('冰柜', 'SKU_01-ZC_220__'));
  });

  it('uses a safe visible segment when a value becomes empty', () => {
    expect(buildProductDirectory({ productCategory: '.', sku: '   ', model: 'ZC100' }))
      .toBe(join('_', '_-ZC100'));
  });

  it('parses a product context from a deeper historical relative path', () => {
    expect(parseProductDirectory(join('01.洗碗机', 'SKDWT040JP-T40', '02.未转曲源文件', 'drawing.pdf'))).toEqual({
      productCategory: '01.洗碗机', sku: 'SKDWT040JP', model: 'T40',
    });
    expect(parseProductDirectory(join('01.洗碗机', 'invalid', 'drawing.pdf'))).toBeNull();
  });
});
