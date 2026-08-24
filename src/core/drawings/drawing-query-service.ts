import type { PlannerDatabase } from '../../db/database.js';
import { DrawingRepository } from './drawing-repository.js';
import type { DrawingRecord, DrawingSearchFilters, PagedDrawingResult } from './drawing-types.js';

export class DrawingQueryError extends Error {
  constructor(public readonly code: 'NOT_FOUND', message: string) { super(message); }
}

export class DrawingQueryService {
  private readonly repository: DrawingRepository;
  constructor(database: PlannerDatabase) { this.repository = new DrawingRepository(database); }

  search(filters: DrawingSearchFilters = {}): PagedDrawingResult {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const result = this.repository.search(filters, page, pageSize);
    return { ...result, page, pageSize };
  }

  get(id: number): DrawingRecord {
    const drawing = this.repository.get(id);
    if (!drawing) throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    return drawing;
  }
}
