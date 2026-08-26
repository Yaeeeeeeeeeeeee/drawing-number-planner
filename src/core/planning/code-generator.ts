export { composeDrawingCode, composeDrawingPrefix } from '../drawings/drawing-code.js';
export type { DrawingCodeParts } from '../drawings/drawing-code.js';

export interface DisplayNameParts {
  brandName: string;
  model: string;
  colorName: string;
  projectItemName: string;
}

export function formatDisplayName(parts: DisplayNameParts): string {
  return `${parts.brandName}-${parts.model}${parts.colorName}-${parts.projectItemName}`;
}
