import type { PlannerDatabase } from '../../db/database.js';

/** Product evidence is based on record IDs and explicit business actions, never a path,
 * a shared code prefix, detected SKU/model, or historical_drawing_numbers.product_id. */
export const drawingProductEvidenceSql = `(
 select 'planned' as origin,id as record_id,product_id,null as appearance_version_id,'planning' as source from drawing_numbers
 union all select origin,record_id,product_id,appearance_version_id,'confirmed' from drawing_appearance_bindings
 union all select case when item.drawing_id is not null then 'planned' else 'historical' end,
 coalesce(item.drawing_id,item.historical_drawing_id),version.product_id,version.appearance_version_id,'bom'
 from bom_items item join bom_versions version on version.id=item.bom_version_id
 where item.deleted_at is null and version.deleted_at is null and (item.drawing_id is not null or item.historical_drawing_id is not null)
 union all select case when item.drawing_id is not null then 'planned' else 'historical' end,
 coalesce(item.drawing_id,item.historical_drawing_id),package.product_id,null,'outbound'
 from outbound_package_items item join outbound_packages package on package.id=item.package_id
 where package.status='completed' and (item.drawing_id is not null or item.historical_drawing_id is not null)
 union all select case when file.drawing_id is not null then 'planned' else 'historical' end,
 coalesce(file.drawing_id,file.historical_drawing_id),version.product_id,version.id,'confirmed-batch-pdf'
 from pdf_files file join outbound_batch_scopes scope on scope.batch_id=file.material_batch_id
 join product_appearance_versions version on version.id=scope.appearance_version_id
 join material_batches batch on batch.id=file.material_batch_id
 where (file.drawing_id is not null or file.historical_drawing_id is not null)
 and coalesce((select canonical_product_id from product_identity_members where raw_product_id=batch.product_id),batch.product_id)=version.product_id
)`;

export const canonicalProductSql = (expression:string) => `coalesce((select canonical_product_id from product_identity_members where raw_product_id=${expression}),${expression})`;

/** A unique trustworthy attribution for each drawing identity. Conflicting unconfirmed
 * evidence remains NULL; an explicit binding is authoritative without erasing conflicts. */
export function effectiveDrawingProductSql(originExpression:string, recordIdExpression:string):string {
  return `coalesce((select ${canonicalProductSql('binding.product_id')} from drawing_appearance_bindings binding where binding.origin=${originExpression} and binding.record_id=${recordIdExpression}),
    (select min(${canonicalProductSql('evidence.product_id')}) from ${drawingProductEvidenceSql} evidence
      where evidence.origin=${originExpression} and evidence.record_id=${recordIdExpression}
      having count(distinct ${canonicalProductSql('evidence.product_id')})=1))`;
}
export interface DrawingProductEvidence {productId:number;appearanceVersionId:number|null;source:string}
export function getDrawingProductEvidence(db:PlannerDatabase,origin:'planned'|'historical',recordId:number):DrawingProductEvidence[] {
  return db.prepare(`select distinct ${canonicalProductSql('evidence.product_id')} as productId,appearance_version_id as appearanceVersionId,source
    from ${drawingProductEvidenceSql} evidence join products product on product.id=${canonicalProductSql('evidence.product_id')}
    where evidence.origin=? and evidence.record_id=? and product.deleted_at is null`).all(origin,recordId) as DrawingProductEvidence[];
}
