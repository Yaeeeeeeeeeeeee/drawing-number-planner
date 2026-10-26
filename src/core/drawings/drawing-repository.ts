import {effectiveDrawingProductSql} from './drawing-product-evidence.js';
import {drawingAppearanceRelationsSql} from './drawing-appearance-scope.js';
import { resolveCanonicalProductId } from '../products/appearance-identity.js';
import type { PlannerDatabase } from '../../db/database.js';
import type { DrawingBusinessUsage, DrawingBomUsage, DrawingDetailRecord, DrawingFileRecord, DrawingRecord, DrawingNavigationCounts, DrawingSearchFilters, HistoricalDrawingStatus } from './drawing-types.js';

interface DrawingRow {
  id: number; origin: DrawingRecord['origin']; sku: string | null; full_code: string; display_name: string;
  product_id: number | null; model: string; product_category: string; brand_id: number | null; brand_name: string;
  color_id: number | null; color_name: string; appearance_id: number | null; appearance_name: string;
  main_category_id: number | null; main_category_name: string; project_item_id: number | null; project_item_name: string;
  brand_code: string; product_size_code: string; appearance_code: string; color_code: string;
  main_category_code: string; project_item_code: string; sequence: number; status: DrawingRecord['status'];
  previous_drawing_id: number | null; previous_full_code: string | null; change_reason: string | null;
  source_product_id: number | null; source_product_model: string | null; source_drawing_id: number | null;
  source_drawing_full_code: string | null; notes: string | null; created_at: string;
  has_source_file: number; has_outlined_file: number; dictionary_mapping_status: DrawingRecord['dictionaryMappingStatus'];
  deleted_at: string | null; deletion_mode: 'retain_occupied' | 'release' | null;
  deleted_previous_status: string | null; deleted_reason: string | null;
}

interface DrawingBomUsageRow extends Omit<DrawingBomUsage, 'usesWhiteMaterial'> {
  usesWhiteMaterial: number;
}

// Business evidence uses immutable identity, never codes, PDF occurrence, or path guesses.
const businessUsageCte = `with raw_business_usage as (
  select case when item.drawing_id is not null then 'planned' else 'historical' end as origin,
    coalesce(item.drawing_id, item.historical_drawing_id) as record_id,
    coalesce((select canonical_product_id from product_identity_members where raw_product_id=version.product_id),version.product_id) as product_id, item.effective_material_batch_id as batch_id, 'bom' as source,
    version.id as source_id,
    exists(select 1 from bom_current current_bom where current_bom.product_id = version.product_id
      and current_bom.version_id = version.id) as is_current
  from bom_items item join bom_versions version on version.id = item.bom_version_id
  where item.deleted_at is null and version.deleted_at is null
  union all
  select case when item.drawing_id is not null then 'planned' else 'historical' end,
    coalesce(item.drawing_id, item.historical_drawing_id), coalesce((select canonical_product_id from product_identity_members where raw_product_id=package.product_id),package.product_id),
    package.selected_material_batch_id, 'outbound', package.id, 0
  from outbound_package_items item join outbound_packages package on package.id = item.package_id
  where package.status = 'completed'
), business_usage as (
  select distinct usage.* from raw_business_usage usage
  where (usage.origin = 'planned' and exists(select 1 from drawing_numbers drawing
      where drawing.id = usage.record_id and drawing.deleted_at is null))
    or (usage.origin = 'historical' and exists(select 1 from historical_drawing_numbers drawing
      where drawing.id = usage.record_id and drawing.deleted_at is null))
)`;

const exactUsageIdentity = `(usage.origin = record.origin and usage.record_id = abs(record.id))`;

const unifiedCte = (scoped = false) => `${businessUsageCte}, drawing_records as (
  select drawing.id, 'planned' as origin, product.sku, coalesce(drawing.deleted_full_code, drawing.full_code) as full_code, drawing.display_name,
    product.id as product_id, product.model, product.product_category, product.brand_id, brand.name as brand_name,
    drawing.appearance_id, appearance.name as appearance_name, drawing.color_id, color.name as color_name,
    drawing.main_category_id, main_category.name as main_category_name,
    drawing.project_item_id, project_item.name as project_item_name,
    drawing.brand_code, drawing.product_size_code, drawing.appearance_code, drawing.color_code,
    drawing.main_category_code, drawing.project_item_code, drawing.sequence, drawing.status,
    drawing.previous_drawing_id, coalesce(previous.deleted_full_code,previous.full_code) as previous_full_code, drawing.change_reason,
    drawing.source_product_id, source_product.model as source_product_model,
    drawing.source_drawing_id, coalesce(source_drawing.deleted_full_code,source_drawing.full_code) as source_drawing_full_code,
    drawing.notes, drawing.created_at, drawing.deleted_at, drawing.deletion_mode,
    drawing.deleted_previous_status, drawing.deleted_reason,
    exists(select 1 from pdf_files file left join historical_drawing_numbers file_history
      on file_history.id = file.historical_drawing_id
      where file.is_present = 1 and file.conversion_type = 'source'
        and (file.drawing_id = drawing.id or file_history.full_code = drawing.full_code)) as has_source_file,
    exists(select 1 from pdf_files file left join historical_drawing_numbers file_history
      on file_history.id = file.historical_drawing_id
      where file.is_present = 1 and file.conversion_type = 'outlined'
        and (file.drawing_id = drawing.id or file_history.full_code = drawing.full_code)) as has_outlined_file,
    'mapped' as dictionary_mapping_status
  from drawing_numbers drawing
  left join drawing_appearance_bindings binding on binding.origin='planned' and binding.record_id=drawing.id
  join products product on product.id = coalesce((select canonical_product_id from product_identity_members where raw_product_id=coalesce(binding.product_id,drawing.product_id)),binding.product_id,drawing.product_id)
  join dictionary_items brand on brand.id = product.brand_id
  join dictionary_items appearance on appearance.id = drawing.appearance_id
  join dictionary_items color on color.id = drawing.color_id
  join dictionary_items main_category on main_category.id = drawing.main_category_id
  join dictionary_items project_item on project_item.id = drawing.project_item_id
  left join drawing_numbers previous on previous.id = drawing.previous_drawing_id
  left join products source_product on source_product.id = drawing.source_product_id
  left join drawing_numbers source_drawing on source_drawing.id = drawing.source_drawing_id
  where not exists(select 1 from drawing_force_releases r where r.origin='planned' and r.record_id=drawing.id)

  union all

  select -historical.id as id, 'historical' as origin, coalesce(product.sku, historical.detected_sku) as sku,
    coalesce(historical.deleted_full_code, historical.full_code) as full_code,
    coalesce(historical.deleted_full_code, historical.full_code) as display_name, product.id as product_id,
    coalesce(product.model, case when historical.detected_model is not null then historical.detected_model || '（目录候选，未确认）' end, '待识别') as model,
    coalesce(product.product_category, historical.detected_product_category, '待识别') as product_category,
    coalesce(product.brand_id, brand.id) as brand_id, coalesce(brand.name, historical.brand_code) as brand_name,
    appearance.id as appearance_id, coalesce(appearance.name, historical.appearance_code) as appearance_name,
    color.id as color_id, coalesce(color.name, '未识别') as color_name,
    main_category.id as main_category_id, coalesce(main_category.name, historical.main_category_code) as main_category_name,
    project_item.id as project_item_id, coalesce(project_item.name, historical.project_item_code) as project_item_name,
    historical.brand_code, historical.product_size_code, historical.appearance_code, historical.color_code,
    historical.main_category_code, historical.project_item_code, historical.sequence, historical.status,
    null as previous_drawing_id, null as previous_full_code, null as change_reason,
    null as source_product_id, null as source_product_model, null as source_drawing_id,
    null as source_drawing_full_code, null as notes, historical.first_seen_at as created_at,
    historical.deleted_at, historical.deletion_mode, historical.deleted_previous_status, historical.deleted_reason,
    exists(select 1 from pdf_files file left join drawing_numbers file_drawing on file_drawing.id = file.drawing_id
      where (file.historical_drawing_id = historical.id or file_drawing.full_code = historical.full_code)
      and file.is_present = 1 and file.conversion_type = 'source') as has_source_file,
    exists(select 1 from pdf_files file left join drawing_numbers file_drawing on file_drawing.id = file.drawing_id
      where (file.historical_drawing_id = historical.id or file_drawing.full_code = historical.full_code)
      and file.is_present = 1 and file.conversion_type = 'outlined') as has_outlined_file,
    case when brand.id is not null and product_size.id is not null and appearance.id is not null
      and color.id is not null and main_category.id is not null and project_item.id is not null
      then 'mapped' else 'unmapped' end as dictionary_mapping_status
  from historical_drawing_numbers historical
  left join drawing_appearance_bindings binding on binding.origin='historical' and binding.record_id=historical.id
  left join products product on product.id = ${effectiveDrawingProductSql("'historical'",'historical.id')}
  left join dictionary_items brand on brand.type = 'brand' and brand.code = historical.brand_code
  left join dictionary_items product_size on product_size.type = 'product_size' and product_size.code = historical.product_size_code
  left join dictionary_items appearance on appearance.type = 'appearance' and appearance.code = historical.appearance_code
  left join dictionary_items color on color.type = 'color' and color.code = historical.color_code
  left join dictionary_items main_category on main_category.type = 'main_category' and main_category.code = historical.main_category_code
  left join dictionary_items project_item on project_item.type = 'project_item'
    and project_item.code = historical.project_item_code and project_item.parent_id = main_category.id
  where not exists(select 1 from drawing_force_releases r where r.origin='historical' and r.record_id=historical.id)
  ${scoped ? '' : `and (historical.deleted_at is not null or not exists(select 1 from drawing_numbers drawing
    where drawing.deleted_at is null and drawing.full_code = historical.full_code))`}
)`;

const mapRow = (row: DrawingRow): DrawingRecord => ({
  id: row.id, origin: row.origin, sku: row.sku, fullCode: row.full_code, displayName: row.display_name,
  productId: row.product_id, model: row.model, productCategory: row.product_category,
  appearanceId: row.appearance_id, appearanceName: row.appearance_name,
  brandId: row.brand_id, brandName: row.brand_name, colorId: row.color_id, colorName: row.color_name,
  mainCategoryId: row.main_category_id, mainCategoryName: row.main_category_name,
  projectItemId: row.project_item_id, projectItemName: row.project_item_name,
  brandCode: row.brand_code, productSizeCode: row.product_size_code, appearanceCode: row.appearance_code,
  colorCode: row.color_code, mainCategoryCode: row.main_category_code, projectItemCode: row.project_item_code,
  sequence: row.sequence, status: row.status, previousDrawingId: row.previous_drawing_id,
  previousFullCode: row.previous_full_code, changeReason: row.change_reason,
  sourceProductId: row.source_product_id, sourceProductModel: row.source_product_model,
  sourceDrawingId: row.source_drawing_id, sourceDrawingFullCode: row.source_drawing_full_code,
  notes: row.notes, createdAt: row.created_at, hasSourceFile: row.has_source_file === 1,
  hasOutlinedFile: row.has_outlined_file === 1, dictionaryMappingStatus: row.dictionary_mapping_status,
  deletedAt: row.deleted_at, deletionMode: row.deletion_mode, deletedPreviousStatus: row.deleted_previous_status,
  deletedReason: row.deleted_reason, occupied: row.deleted_at === null || row.deletion_mode === 'retain_occupied',
});

const canonicalSql = (expression: string) => `coalesce((select canonical_product_id from product_identity_members where raw_product_id=${expression}),${expression})`;
function buildConditions(filters: DrawingSearchFilters): { sql: string; values: Array<string | number> } {
  const conditions: string[] = []; const values: Array<string | number> = [];
  const deletionState = filters.deletionState ?? 'normal';
  if (deletionState === 'normal') conditions.push('record.deleted_at is null');
  else if (deletionState === 'deleted') conditions.push('record.deleted_at is not null');
  else if (deletionState === 'deleted-retained') conditions.push("record.deleted_at is not null and record.deletion_mode = 'retain_occupied'");
  else if (deletionState === 'deleted-released') conditions.push("record.deleted_at is not null and record.deletion_mode = 'release'");
  if (filters.drawingNumber?.trim()) {
    conditions.push(filters.exactDrawingNumber ? 'record.full_code = ?' : 'record.full_code like ?');
    values.push(filters.exactDrawingNumber ? filters.drawingNumber.trim() : `%${filters.drawingNumber.trim()}%`);
  }
  if (filters.sku?.trim()) { conditions.push('record.sku like ?'); values.push(`%${filters.sku.trim()}%`); }
  if (filters.model?.trim()) { conditions.push('record.model like ?'); values.push(`%${filters.model.trim()}%`); }
  if (filters.productCategory?.trim()) { conditions.push('record.product_category like ?'); values.push(`%${filters.productCategory.trim()}%`); }
  if (filters.navigationProductCategory !== undefined) {
    conditions.push(`(exists(select 1 from products navigation_product where navigation_product.id = ${canonicalSql('coalesce((select binding.product_id from drawing_appearance_bindings binding where binding.origin=record.origin and binding.record_id=abs(record.id)),record.product_id)')}
      and navigation_product.product_category = ?) or exists(select 1 from business_usage usage
      join products navigation_product on navigation_product.id = usage.product_id
      where ${exactUsageIdentity} and navigation_product.product_category = ?))`);
    values.push(filters.navigationProductCategory, filters.navigationProductCategory);
  }
  if (filters.associationState === 'unassociated') conditions.push(`${effectiveDrawingProductSql('record.origin','abs(record.id)')} is null`);
  if (filters.appearanceVersionId !== undefined) {
    conditions.push(`exists(select 1 from ${drawingAppearanceRelationsSql} relation where relation.origin=record.origin and relation.record_id=abs(record.id) and relation.appearance_version_id=?)`);
    values.push(filters.appearanceVersionId);
  }
  if (filters.brandId !== undefined) { conditions.push('record.brand_id = ?'); values.push(filters.brandId); }
  if (filters.appearanceId !== undefined) { conditions.push('record.appearance_id = ?'); values.push(filters.appearanceId); }
  if (filters.mainCategoryId !== undefined) { conditions.push('record.main_category_id = ?'); values.push(filters.mainCategoryId); }
  if (filters.projectItemId !== undefined) { conditions.push('record.project_item_id = ?'); values.push(filters.projectItemId); }
  if (filters.colorId !== undefined) { conditions.push('record.color_id = ?'); values.push(filters.colorId); }
  if (filters.materialBatchId !== undefined) {
    conditions.push(`exists(select 1 from pdf_files file where file.material_batch_id = ? and (
      (record.origin = 'planned' and file.drawing_id = record.id)
      or (record.origin = 'planned' and exists(select 1 from historical_drawing_numbers historical
        where historical.id = file.historical_drawing_id and historical.full_code = record.full_code))
      or (record.origin = 'historical' and (file.historical_drawing_id = -record.id
        or exists(select 1 from drawing_numbers formal where formal.id=file.drawing_id and formal.full_code=record.full_code)))
    ))`);
    values.push(filters.materialBatchId);
  }
  if (filters.productId !== undefined) {
    conditions.push(`(${canonicalSql("coalesce((select product_id from drawing_appearance_bindings binding where binding.origin=record.origin and binding.record_id=abs(record.id)),record.product_id)")} = ? or exists(select 1 from business_usage usage
      where ${exactUsageIdentity} and ${canonicalSql("usage.product_id")} = ?))`);
    values.push(filters.productId, filters.productId);
  }
  if (filters.usageBatchId !== undefined) {
    conditions.push(`exists(select 1 from business_usage usage where ${exactUsageIdentity}
      and usage.batch_id = ?${filters.productId !== undefined ? ' and usage.product_id = ?' : ''})`);
    values.push(filters.usageBatchId);
    if (filters.productId !== undefined) values.push(filters.productId);
  }
  if (filters.associationState === 'pending') {
    conditions.push(`(record.product_id is null or not exists(select 1 from business_usage usage
      where ${exactUsageIdentity} and usage.batch_id is not null))`);
  }
  if (filters.status === 'inactive') conditions.push("record.status in ('reserved', 'voided', 'inactive')");
  else if (filters.status !== undefined) { conditions.push('record.status = ?'); values.push(filters.status); }
  if (filters.sourcePresence && filters.sourcePresence !== 'all') {
    conditions.push('record.has_source_file = ?'); values.push(filters.sourcePresence === 'present' ? 1 : 0);
  }
  if (filters.outlinedPresence && filters.outlinedPresence !== 'all') {
    conditions.push('record.has_outlined_file = ?'); values.push(filters.outlinedPresence === 'present' ? 1 : 0);
  }
  if (filters.keyword?.trim()) {
    const keyword = `%${filters.keyword.trim()}%`;
    conditions.push(`(record.full_code like ? or record.display_name like ? or record.sku like ? or record.model like ?
      or record.brand_name like ? or record.color_name like ? or record.main_category_name like ? or record.project_item_name like ?)`);
    values.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
  }
  return { sql: conditions.length ? ` where ${conditions.join(' and ')}` : '', values };
}

export class DrawingRepository {
  constructor(private readonly db: PlannerDatabase) {}

  private enrich(record: DrawingRecord): DrawingRecord {
    const binding=this.db.prepare(`select binding.product_id, binding.appearance_version_id, version.label, product.model, product.sku from drawing_appearance_bindings binding left join product_appearance_versions version on version.id=binding.appearance_version_id join products product on product.id=binding.product_id where binding.origin=? and binding.record_id=?`).get(record.origin,Math.abs(record.id)) as {product_id:number;appearance_version_id:number;label:string;model:string;sku:string}|undefined;
    if(binding) Object.assign(record,{productId:binding.product_id,model:binding.model,sku:binding.sku,appearanceVersionId:binding.appearance_version_id,appearanceVersionLabel:binding.label});
    if(record.productId!==null){const id=resolveCanonicalProductId(this.db,record.productId);const product=this.db.prepare('select model,sku,product_category as productCategory from products where id=?').get(id) as {model:string;sku:string|null;productCategory:string}|undefined;if(product)Object.assign(record,product,{productId:id});}
    return record;
  }

  search(filters: DrawingSearchFilters, page: number, pageSize: number): { items: DrawingRecord[]; total: number } {
    const condition = buildConditions(filters);
    const cte = unifiedCte(filters.productId !== undefined || filters.usageBatchId !== undefined
      || filters.associationState !== undefined || filters.navigationProductCategory !== undefined);
    const total = (this.db.prepare(`${cte} select count(*) as total from drawing_records record${condition.sql}`)
      .get(...condition.values) as { total: number }).total;
    const rows = this.db.prepare(`${cte} select * from drawing_records record${condition.sql}
      order by record.created_at desc, record.id desc limit ? offset ?`)
      .all(...condition.values, pageSize, (page - 1) * pageSize) as DrawingRow[];
    return { items: rows.map(row=>this.enrich(mapRow(row))), total };
  }

  navigationCounts(filters: DrawingSearchFilters): DrawingNavigationCounts {
    // Navigation ranges must not leak into global counts. All compatible manual filters remain.
    const { productId: _product, usageBatchId: _batch, navigationProductCategory: _category,
      appearanceVersionId: _appearanceVersion, associationState: _association, page: _page, pageSize: _size, deletionState: _deletion, ...manual } = filters;
    const base = { ...manual, deletionState: _deletion === 'all' ? 'all' as const : 'normal' as const };
    return this.db.transaction(() => {
      const count = (scope: DrawingSearchFilters = {}) => {
        const condition = buildConditions({ ...base, ...scope });
        const scoped = scope.productId !== undefined || scope.usageBatchId !== undefined
          || scope.associationState !== undefined || scope.navigationProductCategory !== undefined;
        return (this.db.prepare(`${unifiedCte(scoped)} select count(distinct record.id) as total
          from drawing_records record${condition.sql}`).get(...condition.values) as { total: number }).total;
      };
      const manualCondition = buildConditions(base);
      const catalogCte = `${unifiedCte(true)}, filtered_records as (
        select record.* from drawing_records record${manualCondition.sql}
      ), product_associations as (
        select record.id as drawing_id, ${canonicalSql("coalesce((select binding.product_id from drawing_appearance_bindings binding where binding.origin=record.origin and binding.record_id=abs(record.id)),record.product_id)")} as product_id from filtered_records record where record.product_id is not null or exists(select 1 from drawing_appearance_bindings binding where binding.origin=record.origin and binding.record_id=abs(record.id))
        union
        select record.id, ${canonicalSql("usage.product_id")} from filtered_records record join business_usage usage
          on ${exactUsageIdentity} where usage.product_id is not null
      )`;
      const products = this.db.prepare(`${catalogCte} select product_id as productId,
        count(distinct drawing_id) as count from product_associations group by product_id order by product_id`)
        .all(...manualCondition.values) as DrawingNavigationCounts['products'];
      const categories = this.db.prepare(`${catalogCte} select product.product_category as name,
        count(distinct association.drawing_id) as count from product_associations association
        join products product on product.id = association.product_id group by product.product_category order by product.product_category`)
        .all(...manualCondition.values) as DrawingNavigationCounts['categories'];
      const batches = this.db.prepare(`${catalogCte} select usage.product_id as productId,
        usage.batch_id as materialBatchId, count(distinct record.id) as count
        from filtered_records record join business_usage usage on ${exactUsageIdentity}
        where usage.product_id is not null and usage.batch_id is not null
        group by usage.product_id, usage.batch_id order by usage.product_id, usage.batch_id`)
        .all(...manualCondition.values) as DrawingNavigationCounts['batches'];
      const appearances=this.db.prepare(`${catalogCte} select relation.appearance_version_id as appearanceVersionId,count(distinct record.id) as count from filtered_records record join ${drawingAppearanceRelationsSql} relation on relation.origin=record.origin and relation.record_id=abs(record.id) group by relation.appearance_version_id`).all(...manualCondition.values) as DrawingNavigationCounts['appearances'];
      const mainCategories=this.db.prepare(`${catalogCte} select association.product_id as productId,
        category.id as mainCategoryId,category.name,category.code,count(distinct record.id) as count
        from product_associations association join filtered_records record on record.id=association.drawing_id
        join dictionary_items category on category.id=record.main_category_id and category.type='main_category'
        group by association.product_id,category.id order by association.product_id,category.code,category.id`)
        .all(...manualCondition.values) as NonNullable<DrawingNavigationCounts['mainCategories']>;
      return { total: count(), categories, products, batches, appearances,mainCategories,
        unassociated: count({ associationState: 'unassociated' }),
        recycle: count({ deletionState: _deletion === 'deleted-retained' || _deletion === 'deleted-released' ? _deletion : 'deleted' }) };
    }).deferred();
  }

  get(id: number): DrawingRecord | undefined {
    const row = this.db.prepare(`${unifiedCte(true)} select * from drawing_records where id = ?`).get(id) as DrawingRow | undefined;
    return row ? this.enrich(mapRow(row)) : undefined;
  }

  getDetail(id: number): Omit<DrawingDetailRecord, 'batchUsage'> | undefined {
    const drawing = this.get(id);
    if (!drawing) return undefined;
    const historicalId = drawing.origin === 'historical' ? -drawing.id : null;
    const fileRows = this.db.prepare(`select file.id as pdfIndexId, file.material_batch_id as materialBatchId, file.file_name as fileName,
      file.relative_path as relativePath, file.is_present as isPresent, file.conversion_type as conversionType
      from pdf_files file left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
      left join drawing_numbers formal on formal.id = file.drawing_id
      where (? is not null and (file.historical_drawing_id = ? or formal.full_code = ?))
        or (? is null and (file.drawing_id = ? or historical.full_code = ?))
      order by file.file_name collate nocase, file.id`)
      .all(historicalId, historicalId, drawing.fullCode, historicalId, drawing.id, drawing.fullCode) as Array<{
        pdfIndexId: number; materialBatchId: number | null; fileName: string; relativePath: string; isPresent: number;
        conversionType: DrawingFileRecord['conversionType'];
      }>;
    const files = fileRows.map((file): DrawingFileRecord => ({ ...file, isPresent: file.isPresent === 1 }));
    const currentBomUsage = (this.db.prepare(`select version.id as bomVersionId,
      version.product_id as productId, product.model, ? as colorId, ? as colorName,
      version.version_number as versionNumber, item.project_item_id as projectItemId,
      project.name as projectItemName, item.quantity, item.uses_white_material as usesWhiteMaterial
      from bom_current current_bom
      join bom_versions version on version.id = current_bom.version_id and version.product_id = current_bom.product_id
      join products product on product.id = version.product_id
      join bom_items item on item.bom_version_id = version.id
      join dictionary_items project on project.id = item.project_item_id
      where ${drawing.origin === 'planned' ? 'item.drawing_id' : 'item.historical_drawing_id'} = ?
        and item.deleted_at is null and version.deleted_at is null
      order by product.model, project.name`)
      .all(drawing.colorId, drawing.colorName, Math.abs(drawing.id)) as DrawingBomUsageRow[]).map((row): DrawingBomUsage => ({
        ...row, usesWhiteMaterial: row.usesWhiteMaterial === 1,
      }));
    return { ...drawing,
      sourceFiles: files.filter((file) => file.conversionType === 'source'),
      outlinedFiles: files.filter((file) => file.conversionType === 'outlined'),
      currentBomUsage, businessUsage: this.businessUsage(id), readOnly: drawing.origin === 'historical',
      readOnlyMessage: drawing.origin === 'historical' ? '历史图号的编码和文件关联不可修改；停用不释放号码。' : null };
  }

  businessUsage(id?: number): DrawingBusinessUsage[] {
    const rows = this.db.prepare(`${businessUsageCte}
      select distinct usage.origin, usage.record_id as recordId, usage.product_id as productId,
        usage.batch_id as batchId, batch.name as batchName, usage.source, usage.source_id as sourceId,
        usage.is_current as current, coalesce(product.sku, '') as sku, coalesce(product.model, '') as model
      from ${id === undefined ? 'business_usage' : 'raw_business_usage'} usage
      left join products product on product.id = usage.product_id
      left join material_batches batch on batch.id = usage.batch_id
      ${id === undefined ? '' : 'where usage.origin = ? and usage.record_id = ?'}
      order by usage.product_id, usage.batch_id, usage.source, usage.source_id`)
      .all(...(id === undefined ? [] : [id < 0 ? 'historical' : 'planned', Math.abs(id)])) as
      Array<Omit<DrawingBusinessUsage, 'current'> & { current: number }>;
    return rows.map((row) => ({ ...row, current: row.current === 1 }));
  }

  updateStatus(id: number, status: 'active' | 'voided'): void {
    this.db.prepare('update drawing_numbers set status = ? where id = ? and deleted_at is null').run(status, id);
  }

  updateHistoricalStatus(id: number, status: HistoricalDrawingStatus): void {
    this.db.prepare('update historical_drawing_numbers set status = ? where id = ? and deleted_at is null').run(status, id);
  }

  associatePdf(drawingId: number, pdfIndexId: number, conversionType: 'source' | 'outlined'): boolean {
    return this.db.transaction(() => {
      const drawing = this.db.prepare('select full_code as fullCode from drawing_numbers where id = ?')
        .get(drawingId) as { fullCode: string } | undefined;
      const pdf = this.db.prepare(`select detected_codes_json as detectedCodesJson from pdf_files
        where id = ? and is_present = 1 and management_state = 'included'`).get(pdfIndexId) as { detectedCodesJson: string } | undefined;
      if (!drawing || !pdf) return false;
      const parsed = JSON.parse(pdf.detectedCodesJson) as unknown;
      const detectedCodes = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
      if (!detectedCodes.includes(drawing.fullCode)) detectedCodes.push(drawing.fullCode);
      this.db.prepare(`update pdf_files set drawing_id = ?, historical_drawing_id = null,
        match_status = 'matched', conversion_type = ?, detected_codes_json = ? where id = ? and is_present = 1 and management_state = 'included'`)
        .run(drawingId, conversionType, JSON.stringify(detectedCodes), pdfIndexId);
      return true;
    }).immediate();
  }
}
