import { join } from 'node:path';

export interface DirectoryProductContext {
  productCategory: string;
  sku: string;
  model: string;
}

function safeSegment(value: string): string {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '');
  return cleaned || '_';
}

export function buildProductDirectory(input: {
  productCategory: string;
  sku: string;
  model: string;
}): string {
  return join(safeSegment(input.productCategory), `${safeSegment(input.sku)}-${safeSegment(input.model)}`);
}

export function parseProductDirectory(relativePath: string): DirectoryProductContext | null {
  const segments = relativePath.split(/[\\/]+/).filter(Boolean);
  if (segments.length < 2) return null;
  const separator = segments[1].indexOf('-');
  if (separator <= 0 || separator === segments[1].length - 1) return null;
  return {
    productCategory: segments[0],
    sku: segments[1].slice(0, separator),
    model: segments[1].slice(separator + 1),
  };
}

/** V5 scope is literal; legacy names remain readable in historical records only. */
export function isProductionChangeDirectory(segment: string): boolean {
  return segment === '03.量产后的变更文件';
}
export function isMaterialDirectory(segment: string): boolean {
  return segment === '02.未转曲源文件' || isProductionChangeDirectory(segment);
}
export function isMaterialPdfPath(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length >= 4 && isMaterialDirectory(segments[2]);
}
export function isSourcePdfPath(path: string): boolean {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  return segments.length >= 4 && segments[2] === '02.未转曲源文件';
}
