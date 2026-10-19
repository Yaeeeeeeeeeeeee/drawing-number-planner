import type { PlannerDatabase } from '../../db/database.js';
import { MaterialBatchService } from '../files/material-batch-service.js';
import { DrawingDeletionService } from './drawing-deletion-service.js';
import type { DeleteDrawingInput } from './drawing-deletion-types.js';
import { DrawingRepository } from './drawing-repository.js';
import type { DrawingDetailRecord, DrawingNavigationBatch, DrawingSearchFilters, HistoricalDrawingStatus, PagedDrawingResult } from './drawing-types.js';

export class DrawingQueryError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'INVALID_TRANSITION' | 'HISTORICAL_READ_ONLY' | 'PDF_NOT_AVAILABLE', message: string) { super(message); }
}

export class DrawingQueryService {
  private readonly repository: DrawingRepository;
  private readonly batches: MaterialBatchService;
  private readonly deletion: DrawingDeletionService;
  constructor(database: PlannerDatabase) {
    this.repository = new DrawingRepository(database);
    this.batches = new MaterialBatchService(database);
    this.deletion = new DrawingDeletionService(database);
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

  navigationCounts(filters: DrawingSearchFilters = {}) { return this.repository.navigationCounts(filters); }

  navigation(): { batches: DrawingNavigationBatch[] } {
    const usage = this.repository.businessUsage();
    return { batches: this.batches.list().map((batch) => {
      const evidence = usage.filter((item) => item.batchId === batch.id);
      const identities = (items: typeof evidence) => new Set(items.map((item) => `${item.origin}:${item.recordId}`)).size;
      const productIds = [...new Set(evidence.map((item) => item.productId))];
      return { ...batch,
        currentState: evidence.some((item) => item.current) ? 'current' : evidence.length ? 'historical' : 'indeterminate',
        confirmedDrawingCount: identities(evidence),
        usageProducts: productIds.map((productId) => {
          const items = evidence.filter((item) => item.productId === productId);
          return { productId, state: items.some((item) => item.current) ? 'current' : 'historical', drawingCount: identities(items) };
        }),
      };
    }) };
  }

  get(id: number): DrawingDetailRecord {
    const drawing = this.repository.getDetail(id);
    if (!drawing) throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    return { ...drawing, batchUsage: this.batches.getDrawingUsage(drawing.fullCode, drawing.status) };
  }

  transition(id: number, target: 'active' | 'voided'): DrawingDetailRecord {
    const drawing = this.get(id);
    if (drawing.deletedAt) throw new DrawingQueryError('INVALID_TRANSITION', '请先恢复已删除的图号记录');
    if (drawing.readOnly) throw new DrawingQueryError('HISTORICAL_READ_ONLY', '历史图号的编码和文件关联不可修改；停用不释放号码。');
    const allowed = (drawing.status === 'reserved' && (target === 'active' || target === 'voided'))
      || (drawing.status === 'active' && target === 'voided')
      || (drawing.status === 'voided' && target === 'active');
    if (!allowed) {
      const labels: Record<string, string> = { reserved: '已占号', active: '正式使用', voided: '作废' };
      throw new DrawingQueryError('INVALID_TRANSITION', `不支持从${labels[drawing.status] ?? drawing.status}变更为${labels[target] ?? target}`);
    }
    this.repository.updateStatus(id, target);
    return this.get(id);
  }

  previewDeletion(id: number) { return this.deletion.preview(id); }

  deleteDrawing(input: DeleteDrawingInput) { return this.deletion.delete(input); }
  deleteDrawings(inputs: DeleteDrawingInput[]) { return this.deletion.deleteBatch(inputs); }

  restoreDrawing(id: number) { return this.deletion.restore(id); }

  resolveDeletedScan(id: number, resolution: 'reimport' | 'ignore') {
    return this.deletion.resolveScan(id, resolution);
  }

  updateHistoricalStatus(historicalId: number, status: HistoricalDrawingStatus): DrawingDetailRecord {
    const drawing = this.get(-historicalId);
    if (drawing.deletedAt) throw new DrawingQueryError('INVALID_TRANSITION', '请先恢复已删除的图号记录');
    if (drawing.origin !== 'historical') throw new DrawingQueryError('NOT_FOUND', '图号记录不存在');
    this.repository.updateHistoricalStatus(historicalId, status);
    return this.get(-historicalId);
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
