import type { PlannerDatabase } from '../../db/database.js';
import type { CreatedOutboundPackage, OutboundPackageMaterialType, OutboundPackageMode,
  OutboundPackagePreviewItem } from './outbound-types.js';

export interface OutboundProductIdentity {
  id: number;
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
  coalesce(drawing.full_code, historical.full_code) as full_code,
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

  listCompleted(productId?: number) {
    const packages = this.db.prepare(`select package.id, package.package_name as packageName,
      package.zip_relative_path as zipRelativePath, package.created_at as createdAt,
      (select count(*) from outbound_package_items item where item.package_id = package.id) as fileCount
      from outbound_packages package where (? is null or package.product_id = ?) and package.status = 'completed'
      order by package.created_at desc, package.id desc`).all(productId ?? null, productId ?? null) as Array<Omit<CreatedOutboundPackage, 'parts'>>;
    const parts = this.db.prepare(`select part_number as partNumber, zip_relative_path as zipRelativePath,
      size_bytes as sizeBytes from outbound_package_parts where package_id = ? order by part_number`);
    return packages.map((item) => ({ ...item, parts: parts.all(item.id) as Array<{
      partNumber: number; zipRelativePath: string; sizeBytes: number | null;
    }> }));
  }

  getProduct(id: number): OutboundProductIdentity | null {
    const row = this.db.prepare(`select product.id, brand.name as brand, product.model,
      product.product_category as productCategory from products product
      join dictionary_items brand on brand.id = product.brand_id where product.id = ?`).get(id) as OutboundProductIdentity | undefined;
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
      and file.match_status = 'matched' order by file.id`).all(productId, through.sequenceNumber) as FileRow[]).map(toFile);
  }

  saveCompleted(input: { productId: number; materialType: OutboundPackageMaterialType; packageMode: OutboundPackageMode;
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
      const insertItem = this.db.prepare(`insert into outbound_package_items
        (package_id, project_item_id, drawing_id, historical_drawing_id, pdf_file_id, source_material_batch_id,
         project_item_name_snapshot, drawing_code_snapshot, file_name_snapshot, relative_path_snapshot,
         source_batch_name_snapshot, change_details_snapshot, part_number) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      for (const item of input.items) {
        insertItem.run(packageId, item.projectItemId, item.drawingId, item.historicalDrawingId, item.pdfFileId,
          item.sourceBatchId, item.projectItemName, item.fullCode, item.fileName, item.relativePath, item.sourceBatchName,
          item.bomContext?.changeDetails ?? null, item.partNumber);
      }
      return { id: packageId, packageName: input.packageName, zipRelativePath: input.zipRelativePath,
        fileCount: input.items.length, createdAt: input.createdAt, parts: input.parts };
    }).immediate();
  }
}
