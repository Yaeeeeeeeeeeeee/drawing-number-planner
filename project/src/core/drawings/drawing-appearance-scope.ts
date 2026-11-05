/** Explicit attribution and actual usage share one version predicate across the library and PDF index. */
export const drawingAppearanceRelationsSql = `(
 select origin,record_id,product_id,appearance_version_id from drawing_appearance_bindings
 union select origin,record_id,product_id,appearance_version_id from drawing_appearance_usages
 union select case when item.drawing_id is not null then 'planned' else 'historical' end,
 coalesce(item.drawing_id,item.historical_drawing_id),version.product_id,version.appearance_version_id
 from bom_items item join bom_versions version on version.id=item.bom_version_id
 where item.deleted_at is null and version.deleted_at is null and version.appearance_version_id is not null
 and (item.drawing_id is not null or item.historical_drawing_id is not null)
)`;
