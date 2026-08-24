export interface DrawingCodeParts {
  brandCode: string;
  productSizeCode: string;
  appearanceCode: string;
  colorCode: string;
  mainCategoryCode: string;
  projectItemCode: string;
}

export interface DisplayNameParts {
  brandName: string;
  model: string;
  colorName: string;
  projectItemName: string;
}

export function composeDrawingPrefix(parts: DrawingCodeParts): string {
  return `${parts.brandCode}.${parts.productSizeCode}.${parts.appearanceCode}${parts.colorCode}.${parts.mainCategoryCode}${parts.projectItemCode}`;
}

export function composeDrawingCode(parts: DrawingCodeParts, sequence: number): string {
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > 999) {
    throw new Error('流水号必须在 001 至 999 之间');
  }
  return `${composeDrawingPrefix(parts)}${String(sequence).padStart(3, '0')}`;
}

export function formatDisplayName(parts: DisplayNameParts): string {
  return `${parts.brandName}-${parts.model}${parts.colorName}-${parts.projectItemName}`;
}
