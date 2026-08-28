import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingStatus } from '../drawings/drawing-types.js';
import type {
  BatchFileInstance,
  BatchUsageState,
  CurrentBatchSelection,
  DrawingBatchOccurrence,
  DrawingBatchUsage,
  MaterialBatchFileView,
  MaterialBatchRecognitionStatus,
  MaterialBatchView,
} from './material-batch-types.js';

interface OccurrenceRow {
  batch_id: number;
  product_directory: string;
  batch_name: string;
  sequence_number: number | null;
  recognition_status: MaterialBatchRecognitionStatus;
  pdf_index_id: number;
  file_name: string;
  relative_path: string;
  is_present: number;
  conversion_type: BatchFileInstance['conversionType'];
}

export class MaterialBatchService {
  constructor(private readonly db: PlannerDatabase) {}

  getCurrentBatchSelection(productDirectory: string): CurrentBatchSelection {
    const rows = this.db.prepare(`select id, sequence_number as sequenceNumber
      from material_batches
      where product_directory = ? and is_present = 1 and recognition_status = 'recognized'
        and sequence_number is not null
      order by sequence_number desc, id desc`).all(productDirectory) as Array<{ id: number; sequenceNumber: number }>;
    if (rows.length === 0) return { status: 'none', batchId: null };
    const highest = rows[0].sequenceNumber;
    const candidates = rows.filter((row) => row.sequenceNumber === highest);
    return candidates.length === 1
      ? { status: 'selected', batchId: candidates[0].id }
      : { status: 'indeterminate', batchId: null };
  }

  list(filters: { search?: string; productId?: number } = {}): MaterialBatchView[] {
    const where: string[] = [];
    const params: Record<string, unknown> = {};
    if (filters.search?.trim()) {
      where.push(`(batch.product_directory like @search or batch.detected_sku like @search
        or batch.detected_model like @search or batch.name like @search)`);
      params.search = `%${filters.search.trim()}%`;
    }
    if (filters.productId !== undefined) {
      where.push('batch.product_id = @productId');
      params.productId = filters.productId;
    }
    const whereSql = where.length > 0 ? `where ${where.join(' and ')}` : '';
    const rows = this.db.prepare(`select batch.id, batch.relative_path as relativePath,
        batch.product_directory as productDirectory, batch.product_id as productId,
        coalesce(product.product_category, batch.detected_product_category) as productCategory,
        coalesce(product.sku, batch.detected_sku) as sku,
        coalesce(product.model, batch.detected_model) as model,
        batch.name, batch.sequence_number as sequenceNumber, batch.business_date as businessDate,
        batch.recognition_status as recognitionStatus, batch.classification_warning as classificationWarning,
        batch.is_present as isPresent, count(file.id) as fileCount
      from material_batches batch
      left join products product on product.id = batch.product_id
      left join pdf_files file on file.material_batch_id = batch.id
      ${whereSql}
      group by batch.id`).all(params) as Array<Omit<MaterialBatchView, 'isPresent' | 'currentState'> & { isPresent: number }>;
    const selections = new Map<string, CurrentBatchSelection>();
    const items = rows.map((row): MaterialBatchView => {
      let selection = selections.get(row.productDirectory);
      if (!selection) {
        selection = this.getCurrentBatchSelection(row.productDirectory);
        selections.set(row.productDirectory, selection);
      }
      const currentState: BatchUsageState = row.recognitionStatus === 'pending'
        || selection.status !== 'selected' ? 'indeterminate'
        : selection.batchId === row.id ? 'current' : 'historical';
      return { ...row, isPresent: row.isPresent === 1, currentState };
    });
    return items.sort((left, right) => {
      const rank = (item: MaterialBatchView) => item.currentState === 'current' ? 0
        : item.currentState === 'historical' ? 1 : 2;
      return left.productDirectory.localeCompare(right.productDirectory, 'zh-CN')
        || rank(left) - rank(right)
        || (right.sequenceNumber ?? -1) - (left.sequenceNumber ?? -1)
        || right.id - left.id;
    });
  }

  getFiles(batchId: number): MaterialBatchFileView[] | null {
    if (!this.db.prepare('select 1 from material_batches where id = ?').get(batchId)) return null;
    const rows = this.db.prepare(`select file.id as pdfIndexId, file.file_name as fileName,
        file.relative_path as relativePath, file.is_present as isPresent, file.conversion_type as conversionType,
        coalesce(drawing.full_code, historical.full_code) as fullCode,
        file.match_status as matchStatus, file.classification_warning as classificationWarning
      from pdf_files file
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where file.material_batch_id = ?
      order by file.relative_path collate nocase, file.id`).all(batchId) as Array<
        Omit<MaterialBatchFileView, 'isPresent'> & { isPresent: number }
      >;
    return rows.map((row) => ({ ...row, isPresent: row.isPresent === 1 }));
  }

  getDrawingUsage(fullCode: string, businessStatus: DrawingStatus): DrawingBatchUsage {
    const rows = this.db.prepare(`select batch.id as batch_id, batch.product_directory,
        batch.name as batch_name, batch.sequence_number, batch.recognition_status,
        file.id as pdf_index_id, file.file_name, file.relative_path, file.is_present, file.conversion_type
      from pdf_files file
      join material_batches batch on batch.id = file.material_batch_id
      left join drawing_numbers drawing on drawing.id = file.drawing_id
      left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      where file.is_present = 1 and coalesce(drawing.full_code, historical.full_code) = ?
      order by batch.product_directory, batch.sequence_number desc, batch.id desc, file.id`)
      .all(fullCode) as OccurrenceRow[];

    const selectionByProduct = new Map<string, CurrentBatchSelection>();
    const grouped = new Map<number, DrawingBatchOccurrence>();
    for (const row of rows) {
      let selection = selectionByProduct.get(row.product_directory);
      if (!selection) {
        selection = this.getCurrentBatchSelection(row.product_directory);
        selectionByProduct.set(row.product_directory, selection);
      }
      const usageState: BatchUsageState = row.recognition_status === 'pending' ? 'indeterminate'
        : selection.status === 'selected'
        ? selection.batchId === row.batch_id ? 'current' : 'historical'
        : 'indeterminate';
      let occurrence = grouped.get(row.batch_id);
      if (!occurrence) {
        occurrence = {
          batchId: row.batch_id,
          productDirectory: row.product_directory,
          batchName: row.batch_name,
          sequenceNumber: row.sequence_number,
          recognitionStatus: row.recognition_status,
          usageState,
          files: [],
        };
        grouped.set(row.batch_id, occurrence);
      }
      occurrence.files.push({
        pdfIndexId: row.pdf_index_id,
        fileName: row.file_name,
        relativePath: row.relative_path,
        isPresent: row.is_present === 1,
        conversionType: row.conversion_type,
      });
    }
    const occurrences = [...grouped.values()].sort((left, right) =>
      left.productDirectory.localeCompare(right.productDirectory, 'zh-CN')
      || (right.sequenceNumber ?? -1) - (left.sequenceNumber ?? -1)
      || right.batchId - left.batchId);
    const productStates = new Map<string, BatchUsageState>();
    for (const occurrence of occurrences) {
      const current = productStates.get(occurrence.productDirectory);
      if (occurrence.usageState === 'current' || current === undefined) {
        productStates.set(occurrence.productDirectory, occurrence.usageState);
      }
    }
    const currentProductCount = [...productStates.values()].filter((state) => state === 'current').length;
    const historicalProductCount = [...productStates.values()].filter((state) => state === 'historical').length;
    const state: BatchUsageState = currentProductCount > 0 ? 'current'
      : historicalProductCount > 0 ? 'historical'
        : occurrences.length > 0 ? 'indeterminate' : 'unbatched';
    return {
      state,
      occurrenceCount: occurrences.length,
      currentProductCount,
      historicalProductCount,
      conflictWithBusinessStatus: businessStatus === 'voided' && currentProductCount > 0,
      occurrences,
    };
  }
}
