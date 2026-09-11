import { describe, expect, it } from 'vitest';

import { classifyQrFile } from '../../src/core/qr/qr-file-classifier';

describe('classifyQrFile', () => {
  it('matches a canonical QR filename to its uniquely consistent product and purpose', () => {
    const result = classifyQrFile({
      relativePath: '空气炸锅/SKUAF-AF30/AF30-User Manual（二维码的网址编码）.png',
      fileName: 'AF30-User Manual（二维码的网址编码）.png',
      products: [{ id: 7, sku: 'SKUAF', model: 'AF30', productCategory: '空气炸锅' }],
      purposes: [{ id: 3, englishName: 'User Manual' }],
    });

    expect(result).toEqual({
      matchStatus: 'matched', productId: 7, purposeId: 3, model: 'AF30',
      detectedIdentifier: '二维码的网址编码',
      classificationWarning: null,
    });
  });

  it('accepts historical URL-encoding names and recognizes Warranty regardless of case', () => {
    const result = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/ZC100-wARRANTY（网址编码）.jpg',
      fileName: 'ZC100-wARRANTY（网址编码）.jpg',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });

    expect(result).toEqual({
      matchStatus: 'matched', productId: 4, purposeId: 2, model: 'ZC100',
      detectedIdentifier: '网址编码',
      classificationWarning: null,
    });
  });

  it('leaves unknown purposes and directory-model mismatches pending instead of guessing', () => {
    const unknownPurpose = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/ZC100-Coupon（二维码的网址编码）.png',
      fileName: 'ZC100-Coupon（二维码的网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });
    const modelMismatch = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC200/ZC100-Warranty（二维码的网址编码）.png',
      fileName: 'ZC100-Warranty（二维码的网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });
    const categoryMismatch = classifyQrFile({
      relativePath: '空气炸锅/SKUZC-ZC100/ZC100-Warranty（二维码的网址编码）.png',
      fileName: 'ZC100-Warranty（二维码的网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });

    expect(unknownPurpose).toMatchObject({ matchStatus: 'pending', productId: null, purposeId: null,
      classificationWarning: 'qr-purpose-unrecognized' });
    expect(modelMismatch).toMatchObject({ matchStatus: 'pending', productId: null, purposeId: null });
    expect(categoryMismatch).toMatchObject({ matchStatus: 'pending', productId: null, purposeId: null });
  });

  it('resolves hyphenated SKU, model, and data-defined purpose only as one full directory and filename combination', () => {
    const result = classifyQrFile({
      relativePath: '空气炸锅/SKU-AF-AF-30/AF-30-Recipe Guide-V2（二维码的网址编码）.png',
      fileName: 'AF-30-Recipe Guide-V2（二维码的网址编码）.png',
      products: [{ id: 8, sku: 'SKU-AF', model: 'AF-30', productCategory: '空气炸锅' }],
      purposes: [{ id: 5, englishName: 'Recipe Guide-V2' }],
    });

    expect(result).toMatchObject({ matchStatus: 'matched', productId: 8, purposeId: 5, model: 'AF-30' });
  });

  it('captures a non-empty identifier and normalizes purpose case and repeated spaces', () => {
    const result = classifyQrFile({
      relativePath: '空气炸锅/SKUAF-AF30/AF30-user   manual（qagp85g）.pdf',
      fileName: 'AF30-user   manual（qagp85g）.pdf',
      products: [{ id: 7, sku: 'SKUAF', model: 'AF30', productCategory: '空气炸锅' }],
      purposes: [{ id: 3, englishName: 'User Manual' }],
    });

    expect(result).toMatchObject({ matchStatus: 'matched', productId: 7, purposeId: 3,
      detectedIdentifier: 'qagp85g', classificationWarning: null });
  });

  it('matches numbered category folders to the same product category without weakening SKU-model checks', () => {
    const result = classifyQrFile({
      relativePath: '02.空气炸锅/SKAFF020JP-F20/F20-Recipe（l7fet8r）.pdf',
      fileName: 'F20-Recipe（l7fet8r）.pdf',
      products: [{ id: 12, sku: 'SKAFF020JP', model: 'F20', productCategory: '空气炸锅' }],
      purposes: [{ id: 3, englishName: 'Recipe' }],
    });

    expect(result).toMatchObject({ matchStatus: 'matched', productId: 12, purposeId: 3,
      detectedIdentifier: 'l7fet8r' });
  });

  it('keeps empty identifiers and ambiguous products pending without guessing', () => {
    const emptyIdentifier = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/ZC100-Warranty（）.pdf', fileName: 'ZC100-Warranty（）.pdf',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });
    const ambiguousProduct = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/ZC100-Warranty（pdgp845）.pdf', fileName: 'ZC100-Warranty（pdgp845）.pdf',
      products: [
        { id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' },
        { id: 5, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' },
      ],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });

    expect(emptyIdentifier).toMatchObject({ matchStatus: 'pending', detectedIdentifier: null,
      classificationWarning: 'qr-identifier-empty' });
    expect(ambiguousProduct).toMatchObject({ matchStatus: 'pending', productId: null, purposeId: null,
      detectedIdentifier: 'pdgp845', classificationWarning: 'qr-product-ambiguous' });
  });

  it('leaves nested candidates, inactive purposes, and case-colliding purpose combinations pending', () => {
    const nested = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/二维码/ZC100-Warranty（网址编码）.png',
      fileName: 'ZC100-Warranty（网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }],
    });
    const inactive = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/ZC100-Warranty（网址编码）.png',
      fileName: 'ZC100-Warranty（网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty', status: 'inactive' }],
    });
    const caseCollision = classifyQrFile({
      relativePath: '冰柜/SKUZC-ZC100/ZC100-WARRANTY（网址编码）.png',
      fileName: 'ZC100-WARRANTY（网址编码）.png',
      products: [{ id: 4, sku: 'SKUZC', model: 'ZC100', productCategory: '冰柜' }],
      purposes: [{ id: 2, englishName: 'Warranty' }, { id: 6, englishName: 'warranty' }],
    });

    expect(nested).toMatchObject({ matchStatus: 'pending', classificationWarning: 'qr-nested-directory' });
    expect(inactive).toMatchObject({ matchStatus: 'pending', purposeId: null, classificationWarning: 'qr-purpose-unrecognized' });
    expect(caseCollision).toMatchObject({ matchStatus: 'pending', purposeId: null });
  });
});
