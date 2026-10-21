export class QrManualError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
export function qrUrlTail(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new QrManualError('INVALID_TARGET_URL', '请输入完整的 HTTP 或 HTTPS 网址'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new QrManualError('INVALID_TARGET_URL', '网址必须使用 HTTP 或 HTTPS');
  const tail = url.pathname.split('/').filter(Boolean).at(-1) ?? '';
  if (!/^[a-zA-Z0-9]{7}$/.test(tail)) throw new QrManualError('INVALID_URL_TAIL', '网址最后一个非空路径段必须为7位字母或数字');
  return tail;
}
export function parseQrManualFilename(fileName: string) {
  const match = /^(.*)-(User Manual|Warranty|Recipe)[（(]([a-zA-Z0-9]{7})[）)]\.pdf$/.exec(fileName);
  return match ? { model: match[1], purpose: match[2], tail: match[3] } : null;
}
export function validateQrManualFilename(fileName: string, model: string, purpose: string, url: string): string[] {
  const tail = qrUrlTail(url); const parsed = parseQrManualFilename(fileName);
  if (!parsed) return ['文件名须为 型号-英文用途(7位网址尾码).pdf'];
  return [parsed.model !== model ? '文件型号与产品型号不一致' : '', parsed.purpose !== purpose ? '文件用途与所选用途不一致' : '', parsed.tail !== tail ? '文件尾码与网址不一致' : ''].filter(Boolean);
}
export function qrManualDisplayName(fileName: string): string {
  return fileName.replace(/[（(][^（）()]*[）)](?=\.[^.]+$)/u, '').replace(/\.[^.]+$/, '');
}
