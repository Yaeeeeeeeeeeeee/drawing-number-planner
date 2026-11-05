export type PlanningErrorCode =
  | 'PRODUCT_NOT_ACTIVE' | 'APPEARANCE_REQUIRED' | 'DICTIONARY_NOT_ACTIVE'
  | 'INVALID_PROJECT_PARENT' | 'INVALID_PLAN' | 'SEQUENCE_EXHAUSTED'
  | 'PLAN_STALE' | 'DRAWING_CODE_CONFLICT' | 'WHITE_BASE_REQUIRED' | 'WHITE_BASE_AMBIGUOUS';

export class PlanningError extends Error {
  constructor(public readonly code: PlanningErrorCode, message: string) { super(message); }
}
