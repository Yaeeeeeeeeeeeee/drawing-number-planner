export type BomErrorCode =
  | 'BOM_NOT_FOUND' | 'BOM_STALE' | 'PRODUCT_NOT_ACTIVE' | 'COLOR_NOT_ACTIVE'
  | 'DUPLICATE_PROJECT' | 'INVALID_QUANTITY' | 'DRAWING_NOT_FOUND'
  | 'DRAWING_NOT_ELIGIBLE' | 'DRAWING_WRONG_PRODUCT' | 'DRAWING_WRONG_PROJECT'
  | 'DRAWING_WRONG_COLOR' | 'WHITE_DRAWING_REQUIRED';

export class BomError extends Error {
  constructor(public readonly code: BomErrorCode, message: string) { super(message); }
}
