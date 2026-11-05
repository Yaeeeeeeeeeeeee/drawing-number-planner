import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { classifyHistoricalPdf } from '../../src/core/files/historical-file-classifier';

const known = [{ id: 7, fullCode: '02.0404.010.0401001' }];

describe('historical PDF classification', () => {
  it('links a reliable known code to the formal drawing', () => {
    expect(classifyHistoricalPdf({
      relativePath: join('01.洗碗机', 'SKDWT040JP-T40', 'drawing.pdf'),
      fileName: '02.0404.010.0401001-SAMKYO-T40-LOGO.pdf', drawings: known,
    })).toMatchObject({ matchStatus: 'matched', drawingId: 7, historicalCode: null,
      detectedCodes: ['02.0404.010.0401001'] });
  });

  it('registers only a single reliable unknown formal code as historical', () => {
    expect(classifyHistoricalPdf({
      relativePath: join('01.洗碗机', 'SKDWT040JP-T40', 'history.pdf'),
      fileName: '02.0404.010.0401007-SAMKYO-T40-LOGO.pdf', drawings: known,
    })).toMatchObject({ matchStatus: 'matched', drawingId: null,
      historicalCode: { fullCode: '02.0404.010.0401007', appearanceCode: '01', sequence: 7 },
      directoryContext: { productCategory: '01.洗碗机', sku: 'SKDWT040JP', model: 'T40' } });
  });

  it.each([
    ['02.0404.010.0401000-invalid.pdf', 'invalid-format'],
    ['02.0404.010.0401007_02.0404.010.0401008.pdf', 'ambiguous'],
    ['02.0404.010.0401-incomplete.pdf', 'invalid-format'],
  ])('keeps unreliable candidate %s pending without occupying it', (fileName, warning) => {
    expect(classifyHistoricalPdf({ relativePath: join('01.洗碗机', 'SKDWT040JP-T40', fileName), fileName, drawings: known }))
      .toMatchObject({ matchStatus: 'pending', drawingId: null, historicalCode: null,
        classificationWarning: expect.stringContaining(warning) });
  });

  it('leaves a filename with no code unmatched', () => {
    expect(classifyHistoricalPdf({ relativePath: 'ordinary.pdf', fileName: 'ordinary.pdf', drawings: known }))
      .toMatchObject({ matchStatus: 'unmatched', historicalCode: null, detectedCodes: [] });
  });

  it('keeps the source directory role but classifies production by the filename marker', () => {
    const source = classifyHistoricalPdf({
      relativePath: join('01.洗碗机', 'SKDWT040JP-T40', '02.未转曲源文件', '02.0404.010.0401007（转曲）.pdf'),
      fileName: '02.0404.010.0401007（转曲）.pdf', drawings: [],
    });
    expect(source).toMatchObject({ conversionType: 'source', classificationWarning: expect.stringContaining('conversion-conflict') });

    const outlined = classifyHistoricalPdf({
      relativePath: join('01.洗碗机', 'SKDWT040JP-T40', '03.量产后的变更文件（已量产的产品看最新日期）', '01.20241210', '02.0404.010.0401007.pdf'),
      fileName: '02.0404.010.0401007.pdf', drawings: [],
    });
    expect(outlined).toMatchObject({ conversionType: 'source', classificationWarning: null });

    expect(classifyHistoricalPdf({ relativePath: 'other\\02.0404.010.0401007（转曲）.pdf',
      fileName: '02.0404.010.0401007（转曲）.pdf', drawings: [] }).conversionType).toBe('outlined');
  });
});

it('does not infer conversion from excluded historical change-details directories', () => {
  expect(classifyHistoricalPdf({relativePath:'吸尘器/AKVCH010JP-H10/03.量产后的变更明细（已量产的产品看最新日期）/00.首批大货/铭牌.pdf',fileName:'铭牌.pdf',drawings:[]}))
    .toMatchObject({conversionType:'source',matchStatus:'unmatched'});
});
