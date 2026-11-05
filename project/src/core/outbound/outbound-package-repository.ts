import { listRawProductIds } from '../products/appearance-identity.js';
import type { PlannerDatabase } from '../../db/database.js';
import type { CreatedOutboundPackage, OutboundPackageMaterialType, OutboundPackageMode,
  OutboundPackagePreviewItem, OutboundHistoryFilters } from './outbound-types.js';

export interface OutboundProductIdentity {
  id: number;
  sku:string|null;
  brand: string;
  model: string;
  productCategory: string;
}

export interface OutboundIndexedFile {
  id: number;
  relativePath: string;
  fileName: string;
  isPresent: boolean;
  conversionType: 'source' | 'outlined';
  matchStatus: 'matched' | 'pending' | 'unmatched' | 'conflict';
  drawingId: number | null;
  historicalDrawingId: number | null;
  fullCode: string | null;
  projectItemId: number | null;
  projectItemName: string | null;
  sourceBatchId: number | null;
  sourceBatchName: string | null;
}

interface FileRow {
  id: number; relative_path: string; file_name: string; is_present: number;
  conversion_type: 'source' | 'outlined'; match_status: OutboundIndexedFile['matchStatus'];
  drawing_id: number | null; historical_drawing_id: number | null; full_code: string | null;
  project_item_id: number | null; project_item_name: string | null;
  source_batch_id: number | null; source_batch_name: string | null;
}

const fileSelect = `select file.id, file.relative_path, file.file_name, file.is_present, file.conversion_type,
  file.match_status, file.drawing_id, file.historical_drawing_id,
  coalesce(drawing.deleted_full_code,drawing.full_code,historical.deleted_full_code,historical.full_code) as full_code,
  coalesce(drawing.project_item_id, historical_project.id) as project_item_id,
  coalesce(planned_project.name, historical_project.name) as project_item_name,
  batch.id as source_batch_id, batch.name as source_batch_name
  from pdf_files file
  left join drawing_numbers drawing on drawing.id = file.drawing_id
  left join historical_drawing_numbers historical on historical.id = file.historical_drawing_id
  left join dictionary_items planned_project on planned_project.id = drawing.project_item_id
  left join dictionary_items historical_main on historical_main.type = 'main_category'
    and historical_main.code = historical.main_category_code and historical_main.parent_id is null
  left join dictionary_items historical_project on historical_project.type = 'project_item'
    and historical_project.code = historical.project_item_code and historical_project.parent_id = historical_main.id
  left join material_batches batch on batch.id = file.material_batch_id`;

function toFile(row: FileRow): OutboundIndexedFile {
  return { id: row.id, relativePath: row.relative_path, fileName: row.file_name, isPresent: row.is_present === 1,
    conversionType: row.conversion_type, matchStatus: row.match_status, drawingId: row.drawing_id,
    historicalDrawingId: row.historical_drawing_id, fullCode: row.full_code, projectItemId: row.project_item_id,
    projectItemName: row.project_item_name, sourceBatchId: row.source_batch_id, sourceBatchName: row.source_batch_name };
}

export class OutboundPackageRepository {
  constructor(private readonly db: PlannerDatabase) {}

  listCompleted(productId?: number, filters: OutboundHistoryFilters = {}) {
    const ids=productId===undefined?[]:listRawProductIds(this.db,productId);if(productId!==undefined&&!ids.length)ids.push(productId);
    const rows=this.db.prepare(`select package.id,package.product_id as productId,package.material_type as materialType,
      package.package_mode as packageMode,package.selected_material_batch_id as selectedMaterialBatchId,
      package.package_name as packageName,package.zip_relative_path as zipRelativePath,package.created_at as createdAt,
      package.product_identity_json as identityJson,frozen.context_json as contextJson,frozen.files_json as filesJson,
      frozen.parts_json as partsJson,(select count(*) from outbound_package_items item where item.package_id=package.id) as legacyFileCount
      from outbound_packages package left join outbound_v2_snapshots frozen on frozen.package_id=package.id
      where (? is null or package.product_id in (select value from json_each(?))) and package.status='completed'
      order by package.created_at desc,package.id desc`).all(productId??null,JSON.stringify(ids)) as Array<{
      id:number;productId:number;materialType:OutboundPackageMaterialType;packageMode:OutboundPackageMode;selectedMaterialBatchId:number;
      packageName:string;zipRelativePath:string;createdAt:string;identityJson:string|null;contextJson:string|null;filesJson:string|null;partsJson:string|null;legacyFileCount:number;
    }>;
    const legacyParts=this.db.prepare(`select package_id as packageId,part_number as partNumber,zip_relative_path as zipRelativePath,
      size_bytes as sizeBytes from outbound_package_parts where package_id in (select value from json_each(?)) order by package_id,part_number`)
      .all(JSON.stringify(rows.filter(row=>!row.partsJson).map(row=>row.id))) as Array<{packageId:number;partNumber:number;zipRelativePath:string;sizeBytes:number}>;
    const contains=(value:string|null|undefined,search?:string)=>!search||String(value??'').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
    return rows.map(row=>{
      const identity=row.identityJson?JSON.parse(row.identityJson):null;
      const context=row.contextJson?JSON.parse(row.contextJson):identity?.appearanceContext??null;
      const product=context?.product??identity;
      const appearance=context?.appearance;
      return {id:row.id,productId:row.productId,packageName:row.packageName,zipRelativePath:row.zipRelativePath,createdAt:row.createdAt,
        materialType:row.materialType,packageMode:row.packageMode,selectedMaterialBatchId:row.selectedMaterialBatchId,
        fileCount:row.filesJson?JSON.parse(row.filesJson).length:row.legacyFileCount,
        parts:row.partsJson?JSON.parse(row.partsJson):legacyParts.filter(part=>part.packageId===row.id).map(({packageId:_,...part})=>part),
        context,brand:product?.brand??product?.brandName??null,model:product?.model??null,sku:product?.sku??null,
        productCategory:product?.productCategory??null,appearanceVersionId:appearance?.id??context?.appearanceVersionId??null,
        appearanceLabel:appearance?.label??null,batchName:context?.batch?.name??null};
    }).filter(row=>contains(row.brand,filters.brand)&&contains(row.model,filters.model)&&contains(row.sku,filters.sku)
      &&(filters.appearanceVersionId===undefined||row.appearanceVersionId===filters.appearanceVersionId)
      &&(filters.batchId===undefined||row.selectedMaterialBatchId===filters.batchId)
      &&(!filters.materialType||row.materialType===filters.materialType)
      &&(!filters.dateFrom||row.createdAt.slice(0,10)>=filters.dateFrom)&&(!filters.dateTo||row.createdAt.slice(0,10)<=filters.dateTo));
  }

  historyDetail(id:number) {
    const packageRow=this.db.prepare("select * from outbound_packages where id=? and status='completed'").get(id) as Record<string,unknown>|undefined;
    if(!packageRow)return null;
    const frozen=this.db.prepare('select * from outbound_v2_snapshots where package_id=?').get(id) as {context_json:string;files_json:string;parts_json:string}|undefined;
    if(frozen)return {id,context:JSON.parse(frozen.context_json),files:JSON.parse(frozen.files_json),parts:JSON.parse(frozen.parts_json)};
    return {id,context:{legacy:true,package:packageRow,identity:packageRow.product_identity_json?JSON.parse(String(packageRow.product_identity_json)):null},files:this.db.prepare('select * from outbound_package_items where package_id=? order by id').all(id),parts:this.listCompleted().find(row=>row.id===id)?.parts??[]};
  }

  getProduct(id: number): OutboundProductIdentity | null {
    const row = this.db.prepare(`select product.id, product.sku, brand.name as brand, product.model,
      product.product_category as productCategory from products product
      join dictionary_items brand on brand.id = product.brand_id where product.id = ? and product.status='active' and product.deleted_at is null`).get(id) as OutboundProductIdentity | undefined;
    return row ?? null;
  }

  getFile(id: number): OutboundIndexedFile | null {
    const row = this.db.prepare(`${fileSelect} where file.id = ?`).get(id) as FileRow | undefined;
    return row ? toFile(row) : null;
  }

  getProjectItemByCode(fullCode: string): { id: number; name: string } | null {
    const parsed = /^\d{2}\.\d{4}\.\d{2}\d\.([0-9]{2})([0-9]{2})\d{3}$/.exec(fullCode);
    if (!parsed) return null;
    return (this.db.prepare(`select project.id, project.name from dictionary_items main
      join dictionary_items project on project.parent_id = main.id and project.type = 'project_item'
      where main.type = 'main_category' and main.parent_id is null and main.code = ? and project.code = ?`)
      .get(parsed[1], parsed[2]) as { id: number; name: string } | undefined) ?? null;
  }

  listPresentOutlinedFiles(productId: number, throughBatchId: number): OutboundIndexedFile[] {
    const through = this.db.prepare(`select sequence_number as sequenceNumber from material_batches
      where id = ? and product_id = ? and is_present = 1 and recognition_status = 'recognized'
        and sequence_number is not null`).get(throughBatchId, productId) as { sequenceNumber: number } | undefined;
    if (!through) return [];
    return (this.db.prepare(`${fileSelect} where batch.product_id = ? and batch.is_present = 1
      and batch.recognition_status = 'recognized' and batch.sequence_number is not null
      and batch.sequence_number <= ? and file.is_present = 1 and file.conversion_type = 'outlined'
      and file.match_status = 'matched' and file.management_state='included' order by file.id`).all(productId, through.sequenceNumber) as FileRow[]).map(toFile);
  }

  saveCompleted(input: { workflowVersion?:2; appearanceFacts?: unknown; productId: number; materialType: OutboundPackageMaterialType; packageMode: OutboundPackageMode;
    selectedMaterialBatchId: number; packageName: string; zipRelativePath: string; createdAt: string;
    parts: Array<{ partNumber: number; zipRelativePath: string; sizeBytes: number }>;
    items: Array<OutboundPackagePreviewItem & { drawingId: number | null; historicalDrawingId: number | null; partNumber: number }>;
  }): CreatedOutboundPackage {
    return this.db.transaction(() => {
      const packageId = Number(this.db.prepare(`insert into outbound_packages
        (product_id, material_type, package_mode, selected_material_batch_id, package_name,
         zip_relative_path, status, created_at) values (?, ?, ?, ?, ?, ?, 'completed', ?)`)
        .run(input.productId, input.materialType, input.packageMode, input.selectedMaterialBatchId,
          input.packageName, input.zipRelativePath, input.createdAt).lastInsertRowid);
      for (const part of input.parts) this.db.prepare(`insert into outbound_package_parts(package_id, part_number, zip_relative_path, size_bytes)
        values (?, ?, ?, ?)`).run(packageId, part.partNumber, part.zipRelativePath, part.sizeBytes);
      this.db.prepare(`update outbound_packages set product_identity_json = (
        select json_object('sku', product.sku, 'model', product.model, 'brandName', brand.name,
          'productCategory', product.product_category) from products product
        join dictionary_items brand on brand.id = product.brand_id where product.id = ?
      ) where id = ?`).run(input.productId, packageId);
      if(input.appearanceFacts!==undefined) {
        const identity=this.db.prepare('select product_identity_json as identity from outbound_packages where id=?').get(packageId) as {identity:string};
        this.db.prepare('update outbound_packages set product_identity_json=? where id=?').run(JSON.stringify({...JSON.parse(identity.identity),appearanceContext:input.appearanceFacts}),packageId);
      }
      const insertItem = this.db.prepare(`insert into outbound_package_items
        (package_id, project_item_id, drawing_id, historical_drawing_id, pdf_file_id, source_material_batch_id,
         project_item_name_snapshot, drawing_code_snapshot, file_name_snapshot, relative_path_snapshot,
         source_batch_name_snapshot, change_details_snapshot, part_number) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of input.items) {
        // V2's immutable file manifest also supports explicitly confirmed unrecognized indexed PDFs.
        // The legacy item table requires a drawing/project; never invent those identities to satisfy it.
        if(input.workflowVersion===2 && (!item.projectItemId || !item.fullCode || item.drawingId===null && item.historicalDrawingId===null)) continue;
        insertItem.run(packageId, item.projectItemId, item.drawingId, item.historicalDrawingId, item.pdfFileId,
          item.sourceBatchId, item.projectItemName, item.fullCode, item.fileName, item.relativePath, item.sourceBatchName,
          item.bomContext?.changeDetails ?? null, item.partNumber);
      }
      return { id: packageId, packageName: input.packageName, zipRelativePath: input.zipRelativePath,
        fileCount: input.items.length, createdAt: input.createdAt, parts: input.parts };
    }).immediate();
  }
}
