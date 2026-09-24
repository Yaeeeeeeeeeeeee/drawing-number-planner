import type { PlannerDatabase } from '../../db/database.js';
import type { ParsedMaterialBatch } from './material-batch-types.js';

export class MaterialBatchRepository {
  constructor(private readonly db: PlannerDatabase) {}

  markAllMissing(): void {
    this.db.prepare('update material_batches set is_present = 0').run();
  }

  upsert(batch: ParsedMaterialBatch, scannedAt: string, scanRunId: number): number {
    const context = batch.directoryContext;
    const products = context
      ? this.db.prepare('select id, deleted_at as deletedAt from products where sku = ? collate nocase and model = ?')
        .all(context.sku, context.model) as Array<{ id: number; deletedAt: string | null }>
      : [];
    const exited = products.some((product) => product.deletedAt !== null);
    const row = this.db.prepare(`insert into material_batches
      (relative_path, product_directory, product_id, detected_product_category, detected_sku, detected_model,
       name, sequence_number, business_date, recognition_status, classification_warning,
        is_present, first_seen_at, last_seen_at, last_seen_scan_run_id)
      values (@relativePath, @productDirectory, @productId, @productCategory, @sku, @model,
        @name, @sequenceNumber, @businessDate, @recognitionStatus, @classificationWarning, 1, @scannedAt, @scannedAt, @scanRunId)
      on conflict do update set
        product_directory = excluded.product_directory,
        product_id = case when @exited = 1 then null else coalesce(excluded.product_id, material_batches.product_id) end,
        detected_product_category = excluded.detected_product_category,
        detected_sku = excluded.detected_sku,
        detected_model = excluded.detected_model,
        name = excluded.name,
        sequence_number = excluded.sequence_number,
        business_date = excluded.business_date,
        recognition_status = excluded.recognition_status,
        classification_warning = excluded.classification_warning,
        is_present = 1,
        last_seen_at = excluded.last_seen_at,
        last_seen_scan_run_id = excluded.last_seen_scan_run_id
      returning id`).get({
      relativePath: batch.relativePath,
      productDirectory: batch.productDirectory,
      productId: !exited && products.length === 1 ? products[0].id : null,
      exited: exited ? 1 : 0,
      productCategory: context?.productCategory ?? null,
      sku: context?.sku ?? null,
      model: context?.model ?? null,
      name: batch.name,
      sequenceNumber: batch.sequenceNumber,
      businessDate: batch.businessDate,
      recognitionStatus: exited ? 'pending' : batch.recognitionStatus,
      classificationWarning: exited ? '产品已退出当前业务' : batch.classificationWarning,
      scannedAt, scanRunId,
    }) as { id: number };
    return row.id;
  }
}
