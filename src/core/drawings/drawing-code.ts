export interface DrawingCodeParts {
  brandCode: string;
  productSizeCode: string;
  appearanceCode: string;
  colorCode: string;
  mainCategoryCode: string;
  projectItemCode: string;
}

export interface ParsedDrawingCode extends DrawingCodeParts {
  fullCode: string;
  prefix: string;
  sequence: number;
}

export type FilenameCodeInspection =
  | { status: 'reliable'; code: ParsedDrawingCode; candidates: string[] }
  | { status: 'pending'; reason: 'invalid-format' | 'ambiguous'; candidates: string[] }
  | { status: 'unmatched'; candidates: [] };

const completePattern = /^(\d{2})\.(\d{4})\.(\d{2})(\d)\.(\d{2})(\d{2})(\d{3})$/;
const codeLikePattern = /\d{1,3}\.\d{1,6}\.\d{1,5}\.\d{1,10}/g;

function validParts(parts: DrawingCodeParts): boolean {
  return /^\d{2}$/.test(parts.brandCode) && /^\d{4}$/.test(parts.productSizeCode)
    && /^\d{2}$/.test(parts.appearanceCode) && /^\d$/.test(parts.colorCode)
    && /^\d{2}$/.test(parts.mainCategoryCode) && /^\d{2}$/.test(parts.projectItemCode);
}

export function composeDrawingPrefix(parts: DrawingCodeParts): string {
  if (!validParts(parts)) throw new Error('图号编码段格式无效');
  return `${parts.brandCode}.${parts.productSizeCode}.${parts.appearanceCode}${parts.colorCode}.${parts.mainCategoryCode}${parts.projectItemCode}`;
}

export function composeDrawingCode(parts: DrawingCodeParts, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error('流水号必须在 001 至 999 之间');
  }
  return `${composeDrawingPrefix(parts)}${String(sequence).padStart(3, '0')}`;
}

export function parseDrawingCode(fullCode: string): ParsedDrawingCode | null {
  const match = completePattern.exec(fullCode);
  if (!match) return null;
  const sequence = Number(match[7]);
  if (sequence < 1 || sequence > 999) return null;
  const parts: DrawingCodeParts = {
    brandCode: match[1], productSizeCode: match[2], appearanceCode: match[3], colorCode: match[4],
    mainCategoryCode: match[5], projectItemCode: match[6],
  };
  return { ...parts, fullCode, prefix: composeDrawingPrefix(parts), sequence };
}

function isCodeCharacter(value: string | undefined): boolean {
  return value !== undefined && /[a-z0-9]/i.test(value);
}

export function inspectDrawingCodesInFilename(fileName: string): FilenameCodeInspection {
  const tokens: string[] = [];
  for (const match of fileName.matchAll(codeLikePattern)) {
    const start = match.index ?? 0;
    const token = match[0];
    if (isCodeCharacter(fileName[start - 1]) || isCodeCharacter(fileName[start + token.length])) continue;
    if (!tokens.includes(token)) tokens.push(token);
  }
  if (tokens.length === 0) return { status: 'unmatched', candidates: [] };
  const parsed = tokens.map(parseDrawingCode);
  if (parsed.some((value) => value === null)) return { status: 'pending', reason: 'invalid-format', candidates: tokens };
  const distinct = [...new Map((parsed as ParsedDrawingCode[]).map((value) => [value.fullCode, value])).values()];
  if (distinct.length !== 1) return { status: 'pending', reason: 'ambiguous', candidates: tokens };
  return { status: 'reliable', code: distinct[0], candidates: [distinct[0].fullCode] };
}
