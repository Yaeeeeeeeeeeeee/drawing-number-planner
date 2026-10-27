import { materialDirectoryScopeSql } from './material-directory-sql.js';
import type { PlannerDatabase } from '../../db/database.js';
import type { MaterialBatchDeletionReference, ParsedMaterialBatch } from './material-batch-types.js';

export class MaterialBatchRepository {
  constructor(private readonly db: PlannerDatabase) {}

  /** Include SET NULL FKs: deleting an index must never erase business evidence. */
  deletionReferences(id: number, relativePath: string): MaterialBatchDeletionReference[] {
    const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
    const labels: Record<string, string> = {
      pdf_files: 'PDF 索引（含图号关联）', pdf_product_assignments: 'PDF 人工归纳',
      bom_items: 'BOM 生效批次', outbound_packages: '外发记录', outbound_package_items: '外发文件快照',
      outbound_batch_scopes: '外发批次范围', outbound_batch_scope_audit: '外发批次历史',
    };
    const references: MaterialBatchDeletionReference[] = [];
    const tables = this.db.prepare("select name from sqlite_master where type='table' and name not like 'sqlite_%' order by name").all() as Array<{name:string}>;
    for (const {name} of tables) {
      const keys = this.db.prepare(`pragma foreign_key_list(${quote(name)})`).all() as Array<{table:string;from:string}>;
      for (const key of keys.filter(key => key.table === 'material_batches')) {
        const {count} = this.db.prepare(`select count(*) as count from ${quote(name)} where ${quote(key.from)}=?`).get(id) as {count:number};
        if (count) references.push({source:`${name}.${key.from}`, label:labels[name] ?? name, count});
      }
    }
    // Legacy BOM context survives detached FKs; compare the actual saved path.
    const {count} = this.db.prepare(`select count(*) as count from bom_items
      where lower(replace(effective_batch_relative_path,'/','\\'))=lower(replace(?,'/','\\'))
      and effective_material_batch_id is not ?`).get(relativePath,id) as {count:number};
    if (count) references.push({source:'bom_items.effective_batch_relative_path',label:'BOM 批次路径',count});
    const batchKeys = ['batchId','materialBatchId','selectedMaterialBatchId','sourceBatchId','baselineBatchId','effectiveMaterialBatchId',
      'material_batch_id','batch_id','baseline_batch_id','effective_material_batch_id','selected_material_batch_id','source_material_batch_id'];
    const pathKeys = ['effectiveBatchRelativePath','effective_batch_relative_path'];
    const jsonSources: Array<[string,string[],string]> = [
      ['pdf_product_assignment_audit',['previous_json','target_json'],'PDF 人工归纳历史'],
      ['bom_revision_snapshots',['before_snapshot_json','after_snapshot_json'],'BOM 历史快照'],
      ['outbound_v2_snapshots',['context_json','files_json','parts_json'],'外发历史快照'],
      ['outbound_packages',['product_identity_json'],'外发批次上下文'],
      ['outbound_batch_scope_audit',['before_json','after_json'],'外发范围历史依据'],
    ];
    for (const [table,columns,label] of jsonSources) {
      const conditions = columns.map(column => `exists(select 1 from json_tree(${quote(column)}) j where
        (j.key in (${batchKeys.map(key=>`'${key}'`).join(',')}) and j.type='integer' and j.value=@id)
        or (j.fullkey in ('$.batch.id','$.baseline.id','$.appearanceContext.batch.id','$.appearanceContext.baseline.id') and j.type='integer' and j.value=@id)
        or (j.key in (${pathKeys.map(key=>`'${key}'`).join(',')}) and j.type='text'
          and lower(replace(j.value,'/','\\'))=lower(replace(@path,'/','\\'))))`).join(' or ');
      const result = this.db.prepare(`select count(*) as count from ${quote(table)} where ${conditions}`).get({id,path:relativePath}) as {count:number};
      if (result.count) references.push({source:`${table}.json`,label,count:result.count});
    }
    // Product merge snapshots tag ID arrays with their source table. A numeric ID
    // in another table (or rawProductIds) is not a batch reference.
    const mergeConditions = ['before_json','after_json'].map(column => `exists(
      select 1 from json_each(${quote(column)}, '$.references') reference,
        json_each(reference.value, '$.ids') listed_id
      where json_extract(reference.value, '$.table') = 'material_batches'
        and json_type(reference.value, '$.ids') = 'array'
        and listed_id.type = 'integer' and listed_id.value = @id
    )`).join(' or ');
    const mergeReferences = this.db.prepare(`select count(*) as count from product_merge_events where ${mergeConditions}`).get({id}) as {count:number};
    if (mergeReferences.count) references.push({source:'product_merge_events.json',label:'产品归并历史',count:mergeReferences.count});
    return references;
  }

  markAllMissing(): void {
    this.db.prepare(`update material_batches set is_present = 0 where ${materialDirectoryScopeSql("relative_path || char(92)",'production')}`).run();
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
