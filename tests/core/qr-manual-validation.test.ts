import { describe, expect, it } from 'vitest';
import { parseQrManualFilename, qrUrlTail, validateQrManualFilename, qrManualDisplayName } from '../../src/core/qr/qr-manual-validation';
describe('manual QR validation', () => {
  it('uses last nonempty URL segment ignoring query and accepts both parentheses', () => {
    expect(qrUrlTail('https://qrs.ly/c2hg2h8/?q=other')).toBe('c2hg2h8');
    expect(validateQrManualFilename('ZU70SD-User Manual（c2hg2h8）.pdf', 'ZU70SD', 'User Manual', 'https://qrs.ly/c2hg2h8')).toEqual([]);
    expect(parseQrManualFilename('ZU70SD-Warranty(pdgp845).pdf')?.purpose).toBe('Warranty');
    expect(qrManualDisplayName('ZU70SD-Warranty(pdgp845).pdf')).toBe('ZU70SD-Warranty');
  });
  it('blocks mismatched fields and malformed names and unsafe URLs', () => {
    expect(validateQrManualFilename('WRONG-Warranty(pdgp845).pdf', 'ZU70SD', 'User Manual', 'https://qrs.ly/c2hg2h8')).toHaveLength(3);
    expect(parseQrManualFilename('ZU70SD-Warranty(pdgp845).png')).toBeNull();
    expect(() => qrUrlTail('javascript:alert(1)')).toThrow();
    expect(() => qrUrlTail('https://qrs.ly/')).toThrow();
  });
});
