import type { PlannerDatabase } from '../../db/database.js';
import type { ParsedMaterialBatch } from './material-batch-types.js';

export class MaterialBatchRepository {
  constructor(private readonly db: PlannerDatabase) {}

  markAllMissing(): void {
    this.db.prepare('update material_batches set is_present = 0').run();
  }

  upsert(batch: ParsedMaterialBatch, scannedAt: string): number {
    const context = batch.directoryContext;
    const products = context
      ? this.db.prepare('select id from products where sku = ? collate nocase and model = ?')
        .all(context.sku, context.model) as Array<{ id: number }>
      : [];
    const row = this.db.prepare(`insert into material_batches
      (relative_path, product_directory, product_id, detected_product_category, detected_sku, detected_model,
       name, sequence_number, business_date, recognition_status, classification_warning,
       is_present, first_seen_at, last_seen_at)
      values (@relativePath, @productDirectory, @productId, @productCategory, @sku, @model,
       @name, @sequenceNumber, @businessDate, @recognitionStatus, @classificationWarning, 1, @scannedAt, @scannedAt)
      on conflict do update set
        product_directory = excluded.product_directory,
        product_id = coalesce(excluded.product_id, material_batches.product_id),
        detected_product_category = excluded.detected_product_category,
        detected_sku = excluded.detected_sku,
        detected_model = excluded.detected_model,
        name = excluded.name,
        sequence_number = excluded.sequence_number,
        business_date = excluded.business_date,
        recognition_status = excluded.recognition_status,
        classification_warning = excluded.classification_warning,
        is_present = 1,
        last_seen_at = excluded.last_seen_at
      returning id`).get({
      relativePath: batch.relativePath,
      productDirectory: batch.productDirectory,
      productId: products.length === 1 ? products[0].id : null,
      productCategory: context?.productCategory ?? null,
      sku: context?.sku ?? null,
      model: context?.model ?? null,
      name: batch.name,
      sequenceNumber: batch.sequenceNumber,
      businessDate: batch.businessDate,
      recognitionStatus: batch.recognitionStatus,
      classificationWarning: batch.classificationWarning,
      scannedAt,
    }) as { id: number };
    return row.id;
  }
}
