import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { OutboundBomContextService } from '../../src/core/outbound/outbound-bom-context';

let db: PlannerDatabase;
beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  db.exec(`insert into dictionary_items(id,type,code,name,status,created_at) values
    (1,'brand','02','B','active','now'),(2,'product_size','0209','S','active','now'),
    (3,'main_category','04','印刷','active','now');
    insert into dictionary_items(id,type,code,name,parent_id,status,created_at) values (4,'project_item','01','说明书',3,'active','now');
    insert into products(id,sku,brand_id,product_size_id,model,product_category,status,created_at)
    values (1,'SKU',1,2,'T40','洗碗机','active','now');
    insert into historical_drawing_numbers(id,full_code,brand_code,product_size_code,appearance_code,color_code,
      main_category_code,project_item_code,sequence,product_id,first_seen_at,last_seen_at)
    values(1,'02.0209.010.0401001','02','0209','01','0','04','01',1,1,'now','now');
    insert into material_batches(id,relative_path,product_directory,product_id,name,sequence_number,recognition_status,first_seen_at,last_seen_at)
    values(1,'cat/SKU-T40/01.20260924','cat/SKU-T40',1,'01.20260924',1,'recognized','now','now');
    insert into bom_versions(id,product_id,version_number,created_at,business_change_date) values(1,1,1,'now','2026-09-24');
    insert into bom_items(id,bom_version_id,project_item_id,historical_drawing_id,effective_material_batch_id,change_details,notes)
    values(1,1,4,1,1,'更正说明文字','内部备注不可自动发出');`);
});
afterEach(() => db.close());
const input = { productId: 1, batchId: 1, projectItemId: 4, fullCode: '02.0209.010.0401001' };
it('uses explicit change details from the exact product, batch, project and drawing', () => {
  const service = new OutboundBomContextService(db);
  expect(service.resolve(input)).toMatchObject({ status: 'matched', changeDetails: '更正说明文字' });
  expect(service.resolve({ ...input, fullCode: '02.0209.010.0401002' }).status).toBe('missing');
  expect(service.resolve({ ...input, productId: 2 }).status).toBe('missing');
});
it('does not silently choose between conflicting BOM records', () => {
  db.exec(`insert into bom_versions(id,product_id,version_number,created_at) values(2,1,2,'later');
    insert into bom_items(bom_version_id,project_item_id,historical_drawing_id,effective_material_batch_id,change_details)
    values(2,4,1,1,'另一个修改');`);
  const service = new OutboundBomContextService(db);
  expect(service.resolve(input)).toMatchObject({ status: 'ambiguous', changeDetails: null });
  expect(service.resolve({ ...input, bomVersionId: 2 })).toMatchObject({ status: 'matched', changeDetails: '另一个修改' });
});
it('does not use deleted items or substitute notes for missing change details', () => {
  const service = new OutboundBomContextService(db);
  db.exec('update bom_items set change_details = null');
  expect(service.resolve(input)).toMatchObject({ status: 'matched', changeDetails: null });
  db.exec("update bom_items set deleted_at = 'now'");
  expect(service.resolve(input).status).toBe('missing');
});
