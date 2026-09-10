import type { PlannerDatabase } from '../../db/database.js';
import { MaterialBatchService } from '../files/material-batch-service.js';
import { DrawingRepository } from './drawing-repository.js';
import type { DrawingDetailRecord, DrawingReferenceSummary, DrawingSearchFilters, HistoricalDrawingStatus, PagedDrawingResult } from './drawing-types.js';

export class DrawingQueryError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'HISTORICAL_READ_ONLY' | 'PDF_NOT_AVAILABLE' | 'DRAWING_NOT_DELETABLE' | 'DRAWING_REFERENCED', message: string, public readonly referenceSummary?: DrawingReferenceSummary) { super(message); }
}

export class DrawingQueryService {
  private readonly repository: DrawingRepository;
  private readonly batches: MaterialBatchService;
  constructor(database: PlannerDatabase) {
    this.repository = new DrawingRepository(database);
    this.batches = new MaterialBatchService(database);
  }

  search(filters: DrawingSearchFilters = {}): PagedDrawingResult {
    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 20;
    const result = this.repository.search(filters, page, pageSize);
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        batchUsage: this.batches.getDrawingUsage(item.fullCode, item.status),
      })),
      page,
      pageSize,
    };
  }

  get(id: number): DrawingDetailRecord {
    const drawing = this.repository.getDetail(id);
    if (!drawing) throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    return { ...drawing, batchUsage: this.batches.getDrawingUsage(drawing.fullCode, drawing.status) };
  }

  transition(id: number, target: 'active' | 'voided'): DrawingDetailRecord {
    const drawing = this.get(id);
    if (drawing.readOnly) throw new DrawingQueryError('HISTORICAL_READ_ONLY', '历史图号的编码和文件关联不可修改；停用不释放号码。');
    const allowed = (drawing.status === 'reserved' && (target === 'active' || target === 'voided'))
      || (drawing.status === 'active' && target === 'voided');
    if (!allowed) {
      const labels: Record<string, string> = { reserved: '已占号', active: '正式使用', voided: '作废' };
      throw new DrawingQueryError('INVALID_TRANSITION', `不支持从${labels[drawing.status] ?? drawing.status}变更为${labels[target] ?? target}`);
    }
    this.repository.updateStatus(id, target);
    return this.get(id);
  }

  updateHistoricalStatus(historicalId: number, status: HistoricalDrawingStatus): DrawingDetailRecord {
    const drawing = this.get(-historicalId);
    if (drawing.origin !== 'historical') throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    this.repository.updateHistoricalStatus(historicalId, status);
    return this.get(-historicalId);
  }

  deleteReservedDrawing(id: number, confirmed: boolean): { deleted: true } {
    if (!confirmed) throw new DrawingQueryError('DRAWING_NOT_DELETABLE', '删除未使用预留图号需要明确确认');
    if (id < 0) throw new DrawingQueryError('HISTORICAL_READ_ONLY', '永久占号，不支持普通删除');
    const result = this.repository.deleteUnusedReservation(id);
    if (result.kind === 'not-found') throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    if (result.kind === 'not-deletable') {
      throw new DrawingQueryError('DRAWING_NOT_DELETABLE', '仅允许删除从未使用的已占号图号', result.preview?.referenceSummary);
    }
    if (result.kind === 'referenced') {
      throw new DrawingQueryError('DRAWING_REFERENCED', '图号仍被文件、BOM 或版本关系引用，不能删除', result.preview?.referenceSummary);
    }
    return { deleted: true };
  }

  associatePdf(id: number, pdfIndexId: number, conversionType: 'source' | 'outlined'): DrawingDetailRecord {
    const drawing = this.get(id);
    if (drawing.readOnly) throw new DrawingQueryError('HISTORICAL_READ_ONLY', '历史图号的编码和文件关联不可修改；停用不释放号码。');
    if (!this.repository.associatePdf(id, pdfIndexId, conversionType)) {
      throw new DrawingQueryError('PDF_NOT_AVAILABLE', 'PDF 索引不存在或文件当前缺失');
    }
    return this.get(id);
  }
}
