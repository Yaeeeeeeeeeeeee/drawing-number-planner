import { describe, expect, it } from 'vitest';

import { classifyQrFile } from '../../src/core/qr/qr-file-classifier';

describe('classifyQrFile', () => {
  it('matches a canonical QR filename to its uniquely consistent product and purpose', () => {
    const result = classifyQrFile({
      relativePath: '空气炸锅/SKUAF-AF30/说明书/AF30-User Manual（二维码的网址编码）.png',
      fileName: 'AF30-User Manual（二维码的网址编码）.png',
      products: [{ id: 7, sku: 'SKUAF', model: 'AF30', productCategory: '空气炸锅' }],
      purposes: [{ id: 3, englishName: 'User Manual' }],
    });

    expect(result).toEqual({
      matchStatus: 'matched', productId: 7, purposeId: 3, model: 'AF30',
      classificationWarning: null,
    });
  });

  it('accepts historical URL-encoding names and recognizes Warranty regardless of case', () => {
    const result = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/二维码/ZC100-wARRANTY（网址编码）.jpg',
      fileName: 'ZC100-wARRANTY（网址编码）.jpg',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });

    expect(result).toEqual({
      matchStatus: 'matched', productId: 4, purposeId: 2, model: 'ZC100',
      classificationWarning: null,
    });
  });

  it('leaves unknown purposes and directory-model mismatches pending instead of guessing', () => {
    const unknownPurpose = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/二维码/ZC100-Coupon（二维码的网址编码）.png',
      fileName: 'ZC100-Coupon（二维码的网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });
    const modelMismatch = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC200/二维码/ZC100-Warranty（二维码的网址编码）.png',
      fileName: 'ZC100-Warranty（二维码的网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });
    const categoryMismatch = classifyQrFile({
      relativePath: '空气炸锅/SKUZC-ZC100/二维码/ZC100-Warranty（二维码的网址编码）.png',
      fileName: 'ZC100-Warranty（二维码的网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });

    expect(unknownPurpose).toMatchObject({ matchStatus: 'pending', productId: null, purposeId: null,
      classificationWarning: 'qr-purpose-unrecognized' });
    expect(modelMismatch).toMatchObject({ matchStatus: 'pending', productId: null, purposeId: null,
      classificationWarning: 'qr-product-unresolved' });
    expect(categoryMismatch).toMatchObject({ matchStatus: 'pending', productId: null, purposeId: null,
      classificationWarning: 'qr-product-unresolved' });
  });
});
