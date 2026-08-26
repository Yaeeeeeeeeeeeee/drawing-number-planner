import { join } from 'node:path';

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

export function parseProductDirectory(relativePath: string): {
  productCategory: string;
  sku: string;
  model: string;
} | null {
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
