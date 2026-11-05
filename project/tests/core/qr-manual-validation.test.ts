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

// V3: case/spacing are filename presentation, never product identity or URL-tail changes.
describe('V3 legacy QR filenames',()=>{
 it.each(['B500-Warranty（hwh0kd9）.pdf','B500-warranty（hwh0kd9）.pdf','B500-Warranty(hwh0kd9).pdf','B500-warranty (hwh0kd9).pdf','B500-WARRANTY （hwh0kd9）.PDF'])('accepts %s without an exception',name=>{
  expect(validateQrManualFilename(name,'B500','Warranty','https://qrs.ly/hwh0kd9/?a=1')).toEqual([]);
  expect(parseQrManualFilename(name)?.purpose).toBe('Warranty');
 });
 it.each([['B500-uSeR mAnUaL (hwh0kd9).pdf','User Manual'],['B500-rECIPE（hwh0kd9）.pdf','Recipe']])('normalizes only the supported English purpose in %s',(name,purpose)=>{
  expect(validateQrManualFilename(name,'B500',purpose,'https://qrs.ly/hwh0kd9')).toEqual([]);
 });
 it('keeps model and URL-tail case significant and unknown suffixes controlled',()=>{
  expect(validateQrManualFilename('b500-warranty (hwh0kd9).pdf','B500','Warranty','https://qrs.ly/hwh0kd9')).toEqual(['文件型号与产品型号不一致']);
  expect(validateQrManualFilename('B500-warranty (HWH0KD9).pdf','B500','Warranty','https://qrs.ly/hwh0kd9')).toEqual(['文件尾码与网址不一致']);
  expect(parseQrManualFilename('H10-warranty-avakyo（g8gwcl6）.pdf')).toBeNull();
  expect(qrManualDisplayName('B500-warranty (hwh0kd9).pdf')).toBe('B500-warranty');
 });
});
