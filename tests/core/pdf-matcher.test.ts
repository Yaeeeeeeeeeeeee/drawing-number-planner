import { describe, expect, it } from 'vitest';

import { matchPdfFilename } from '../../src/core/files/pdf-matcher';

const first = { id: 10, fullCode: '02.0404.010.0401001' };
const second = { id: 11, fullCode: '02.0404.010.0401002' };

describe('PDF filename matching', () => {
  it('matches one complete known code and recognizes the exact outlined marker', () => {
    expect(matchPdfFilename(`${first.fullCode}-SAMKYO-ZC100-LOGO（转曲）.PDF`, [first, second])).toEqual({
      matchStatus: 'matched', drawingId: first.id, detectedCodes: [first.fullCode], conversionType: 'outlined',
    });
  });

  it('treats repeated occurrences of the same complete code as one match', () => {
    expect(matchPdfFilename(`${first.fullCode}-${first.fullCode}.pdf`, [first])).toMatchObject({
      matchStatus: 'matched', drawingId: first.id, detectedCodes: [first.fullCode], conversionType: 'source',
    });
  });

  it('leaves files without candidates unmatched and sends malformed candidates to pending', () => {
    expect(matchPdfFilename('ordinary.pdf', [first])).toMatchObject({ matchStatus: 'unmatched', drawingId: null, detectedCodes: [] });
    expect(matchPdfFilename(`${first.fullCode.slice(0, -1)}.pdf`, [first])).toMatchObject({ matchStatus: 'pending' });
    expect(matchPdfFilename(`${first.fullCode}9.pdf`, [first])).toMatchObject({ matchStatus: 'pending' });
  });

  it('keeps two distinct complete codes pending without choosing a drawing', () => {
    expect(matchPdfFilename(`${first.fullCode}_${second.fullCode}.pdf`, [second, first])).toEqual({
      matchStatus: 'pending', drawingId: null, detectedCodes: [first.fullCode, second.fullCode], conversionType: 'source',
    });
  });

  it('ignores non-PDF files and does not accept incomplete outlined text', () => {
    expect(matchPdfFilename(`${first.fullCode}（转曲）.ai`, [first])).toBeNull();
    expect(matchPdfFilename(`${first.fullCode}转曲.pdf`, [first])).toMatchObject({ conversionType: 'source' });
  });
});
