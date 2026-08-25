import { join } from 'node:path';

function safeSegment(value: string): string {
  const cleaned = value.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[ .]+$/g, '');
  return cleaned || '_';
}

export function buildDefaultProductDirectory(input: {
  brandName: string;
  productCategory: string;
  model: string;
}): string {
  return join(safeSegment(input.brandName), safeSegment(input.productCategory), safeSegment(input.model));
}
