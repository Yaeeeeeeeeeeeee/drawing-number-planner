import { describe, expect, it } from 'vitest';

import { parseMaterialBatch } from '../../src/core/files/material-batch-parser';

const productionRoot = '03.量产后的变更文件（已量产的产品看最新日期）';

describe('material batch parser', () => {
  it('recognizes a dated numbered batch from the real product directory shape', () => {
    expect(parseMaterialBatch(`01.洗碗机\\SKDWT040JP-T40\\${productionRoot}\\06.20260309\\x.pdf`))
      .toEqual({
        relativePath: `01.洗碗机\\SKDWT040JP-T40\\${productionRoot}\\06.20260309`,
        productDirectory: '01.洗碗机\\SKDWT040JP-T40',
        directoryContext: { productCategory: '01.洗碗机', sku: 'SKDWT040JP', model: 'T40' },
        name: '06.20260309',
        sequenceNumber: 6,
        businessDate: '2026-03-09',
        recognitionStatus: 'recognized',
        classificationWarning: null,
      });
  });

  it('recognizes numbered and unnumbered initial batches as sequence zero', () => {
    expect(parseMaterialBatch(`01.洗碗机\\SKU-T40\\${productionRoot}\\00.首批大货\\x.pdf`))
      .toMatchObject({ name: '00.首批大货', sequenceNumber: 0, recognitionStatus: 'recognized' });
    expect(parseMaterialBatch(`01.洗碗机\\SKU-T40\\${productionRoot}\\首批大货\\x.pdf`))
      .toMatchObject({ name: '首批大货', sequenceNumber: 0, recognitionStatus: 'recognized' });
  });

  it('keeps plans and ambiguous names pending instead of guessing', () => {
    expect(parseMaterialBatch(`01.洗碗机\\SKU-T40\\${productionRoot}\\预案\\x.pdf`))
      .toMatchObject({ name: '预案', sequenceNumber: null, recognitionStatus: 'pending' });
    expect(parseMaterialBatch(`01.洗碗机\\SKU-T40\\${productionRoot}\\待整理\\x.pdf`))
      .toMatchObject({ name: '待整理', sequenceNumber: null, recognitionStatus: 'pending' });
  });

  it('does not choose a business date when a batch name has multiple valid dates', () => {
    expect(parseMaterialBatch(`01.洗碗机\\SKU-T40\\${productionRoot}\\03.20250526-20250707\\x.pdf`))
      .toMatchObject({
        sequenceNumber: 3,
        businessDate: null,
        recognitionStatus: 'recognized',
        classificationWarning: '批次名称包含多个有效日期，需确认',
      });
  });

  it('ignores PDFs directly under the production root and retains batches with malformed product context', () => {
    expect(parseMaterialBatch(`01.洗碗机\\SKU-T40\\${productionRoot}\\x.pdf`)).toBeNull();
    expect(parseMaterialBatch(`01.洗碗机\\invalid\\${productionRoot}\\01.20241210\\x.pdf`))
      .toMatchObject({
        productDirectory: '01.洗碗机\\invalid',
        directoryContext: null,
        sequenceNumber: 1,
        businessDate: '2024-12-10',
      });
  });
});

it('does not turn excluded historical production aliases into new batches', () => {
  expect(parseMaterialBatch('吸尘器/AKVCH010JP-H10/03.量产后的变更明细（已量产的产品看最新日期）/00.首批大货/铭牌.pdf'))
    .toBeNull();
});
