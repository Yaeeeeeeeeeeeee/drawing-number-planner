import type { PlannerDatabase } from '../../db/database.js';
export interface OutboundBomCandidate {
  bomVersionId: number; bomItemId: number; businessDate: string | null;
  revision: number; changeDetails: string | null;
}
export interface OutboundBomContext {
  status: 'matched' | 'missing' | 'ambiguous'; changeDetails: string | null; candidates: OutboundBomCandidate[];
}
export class OutboundBomContextService {
  constructor(private readonly db: PlannerDatabase) {}
  resolve(input: { productId: number; batchId: number; projectItemId: number; fullCode: string; bomVersionId?: number }): OutboundBomContext {
    const candidates = this.db.prepare(`select version.id as bomVersionId, item.id as bomItemId,
      version.business_change_date as businessDate, version.edit_revision as revision, item.change_details as changeDetails
      from bom_items item join bom_versions version on version.id = item.bom_version_id
      join products product on product.id = version.product_id
      join material_batches batch on batch.id = @batchId and batch.product_id = product.id
      left join drawing_numbers drawing on drawing.id = item.drawing_id and drawing.deleted_at is null
      left join historical_drawing_numbers historical on historical.id = item.historical_drawing_id and historical.deleted_at is null
      where version.product_id = @productId and product.deleted_at is null and version.deleted_at is null
        and item.deleted_at is null and item.project_item_id = @projectItemId
        and coalesce(drawing.full_code, historical.full_code) = @fullCode
        and (item.effective_material_batch_id = batch.id or
          (item.effective_material_batch_id is null and item.effective_batch_relative_path = batch.relative_path))
        and (@bomVersionId is null or version.id = @bomVersionId)
      order by version.business_change_date desc, version.id desc, item.id`)
      .all({ ...input, bomVersionId: input.bomVersionId ?? null }) as OutboundBomCandidate[];
    if (candidates.length !== 1) return { status: candidates.length ? 'ambiguous' : 'missing', changeDetails: null, candidates };
    return { status: 'matched', changeDetails: candidates[0].changeDetails, candidates };
  }
}
