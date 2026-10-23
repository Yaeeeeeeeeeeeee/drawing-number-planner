import {ensureProductAppearance} from '../../src/core/products/appearance-identity';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let dictionaries: DictionaryService;
let products: ProductService;
let service: PlanningService;

beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  dictionaries = new DictionaryService(db); products = new ProductService(db); service = new PlanningService(db);
});
afterEach(() => db.close());

function fixture() {
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '一号外观' });
  const white = dictionaries.create({ type: 'color', code: '0', name: '白色' });
  const gray = dictionaries.create({ type: 'color', code: '1', name: '灰色' });
  const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
  const logo = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const label = dictionaries.create({ type: 'project_item', code: '02', name: '铭牌', parentId: main.id });
  const product = products.create({ sku: 'TEST-PLANNING-SERVICE', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC200', productCategory: '冰柜' });
  return { brand, size, appearance, white, gray, main, logo, label, product };
}

function input(refs: ReturnType<typeof fixture>) {
  return { productId: refs.product.id, rows: [{ clientId: 'row-1', colorId: refs.white.id,
    mainCategoryId: refs.main.id, projectItemId: refs.logo.id }] };
}

function insertExisting(refs: ReturnType<typeof fixture>, sequence: number, status: 'reserved' | 'active' | 'voided') {
  db.prepare(`insert into drawing_numbers
    (full_code, display_name, product_id, appearance_id, color_id, main_category_id, project_item_id,
     brand_code, product_size_code, appearance_code, color_code, main_category_code, project_item_code,
     sequence, status, created_at) values (?, 'existing', ?, ?, ?, ?, ?, '02', '0404', '01', '0', '04', '01', ?, ?, ?)`)
    .run(`02.0404.010.0401${String(sequence).padStart(3, '0')}`, refs.product.id, refs.appearance.id,
      refs.white.id, refs.main.id, refs.logo.id, sequence, status, '2026-08-24T00:00:00Z');
}

function insertHistorical(sequence: number, appearanceCode = '01') {
  const prefix = `02.0404.${appearanceCode}0.0401`;
  db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, first_seen_at, last_seen_at)
    values (?, '02', '0404', ?, '0', '04', '01', ?, '2026-08-26', '2026-08-26')`)
    .run(`${prefix}${String(sequence).padStart(3, '0')}`, appearanceCode, sequence);
}

describe('PlanningService preview', () => {
  it('recommends 001 for an unused prefix without writing the database', () => {
    const refs = fixture();
    expect(service.preview(input(refs)).rows).toEqual([expect.objectContaining({
      clientId: 'row-1', fullCode: '02.0404.010.0401001', sequence: 1,
      displayName: 'SAMKYO-ZC200白色-LOGO', available: true,
    })]);
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({ count: 0 });
  });

  it.each(['reserved', 'active', 'voided'] as const)('treats %s numbers as permanently occupied', (status) => {
    const refs = fixture(); insertExisting(refs, 1, status);
    expect(service.preview(input(refs)).rows[0].fullCode).toBe('02.0404.010.0401002');
  });

  it('continues after a reliably scanned historical number', () => {
    const refs = fixture(); insertHistorical(7);
    expect(service.preview(input(refs)).rows[0].fullCode).toBe('02.0404.010.0401008');
  });

  it('keeps different appearance codes in separate sequence groups', () => {
    const refs = fixture(); insertHistorical(7, '02');
    expect(service.preview(input(refs)).rows[0].fullCode).toBe('02.0404.010.0401001');
  });

  it('allocates consecutive numbers per prefix in request order', () => {
    const refs = fixture(); insertExisting(refs, 1, 'active');
    const preview = service.preview({ productId: refs.product.id, rows: [
      { ...input(refs).rows[0], clientId: 'first' },
      { ...input(refs).rows[0], clientId: 'second' },
      { clientId: 'gray-label', colorId: refs.gray.id, mainCategoryId: refs.main.id, projectItemId: refs.label.id },
    ] });
    expect(preview.rows.map((entry) => entry.fullCode)).toEqual([
      '02.0404.010.0401002', '02.0404.010.0401003', '02.0404.011.0402001',
    ]);
  });

  it('rejects exhausted prefixes and malformed batches', () => {
    const refs = fixture(); insertExisting(refs, 999, 'voided');
    expect(() => service.preview(input(refs))).toThrowError(expect.objectContaining({ code: 'SEQUENCE_EXHAUSTED' }));
    expect(() => service.preview({ productId: refs.product.id, rows: [] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
    expect(() => service.preview({ productId: refs.product.id, rows: [input(refs).rows[0], input(refs).rows[0]] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
    expect(() => service.preview({ productId: refs.product.id, rows: Array.from({ length: 101 }, (_, index) => ({
      ...input(refs).rows[0], clientId: `row-${index}`,
    })) })).toThrowError(expect.objectContaining({ code: 'INVALID_PLAN' }));
  });
});

describe('appearance version context',()=>{
  it('accepts dictionary-only planning while preserving explicitly requested legacy versions',()=>{
    const refs=fixture();
    const appearance=dictionaries.create({type:'appearance',code:'02',name:'二号外观'});
    const version=Number(db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'二代','draft','2026')`).run(refs.product.id,appearance.id).lastInsertRowid);
    expect(service.preview(input(refs)).rows[0].fullCode).toBe('02.0404.010.0401001');
    insertHistorical(4,'02');
    const context={...input(refs),appearanceVersionId:version};
    const preview=service.preview(context);expect(preview.rows[0].fullCode).toBe('02.0404.020.0401005');
    const reserved=service.reserve({...context,rows:context.rows.map((row,i)=>({...row,expectedFullCode:preview.rows[i].fullCode}))});
    expect(db.prepare('select record_id,appearance_version_id from drawing_appearance_bindings').get()).toEqual({record_id:reserved[0].id,appearance_version_id:version});
  });
});

it('integrates an explicit plan, atomic reservation and appearance-scoped library without changing occupation',async()=>{
  const refs=fixture();ensureProductAppearance(db,refs.product.id);const version=db.prepare('select id from product_appearance_versions where product_id=?').get(refs.product.id) as {id:number};
  const request={...input(refs),appearanceVersionId:version.id};const preview=service.preview(request);
  const reserved=service.reserve({...request,rows:request.rows.map((row,i)=>({...row,expectedFullCode:preview.rows[i].fullCode}))});
  const {DrawingQueryService}=await import('../../src/core/drawings/drawing-query-service');
  const library=new DrawingQueryService(db);const found=library.search({productId:refs.product.id,appearanceVersionId:version.id});
  expect(found.items).toHaveLength(1);expect(found.items[0]).toMatchObject({id:reserved[0].id,fullCode:preview.rows[0].fullCode,appearanceVersionId:version.id});
  expect(service.preview(request).rows[0].sequence).toBe(2);
});

it('rejects a soft deleted product even when its legacy business status still says active',()=>{
  const refs=fixture();db.prepare("update products set deleted_at='2026-10-20' where id=?").run(refs.product.id);
  expect(()=>service.preview(input(refs))).toThrow('产品不存在或已停用');
});

it('rejects reserving a version without its own valid appearance code rather than falling back to product defaults',()=>{
  const refs=fixture();const version=Number(db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,null,'待补外观','draft','now')`).run(refs.product.id).lastInsertRowid);
  expect(()=>service.preview({...input(refs),appearanceVersionId:version})).toThrow('外观');
  expect(db.prepare('select * from drawing_numbers').all()).toEqual([]);
});

it('rolls back every reservation and occupancy when persisting the version binding fails',()=>{
  const refs=fixture();const request=input(refs),preview=service.preview(request);
  db.exec(`create trigger reject_planning_binding before insert on drawing_appearance_bindings begin select raise(abort,'binding persistence failed'); end`);
  expect(()=>service.reserve({...request,rows:request.rows.map((row,i)=>({...row,expectedFullCode:preview.rows[i].fullCode}))})).toThrow('binding persistence failed');
  expect(db.prepare('select * from drawing_numbers').all()).toEqual([]);
  expect(service.preview(request).rows[0].fullCode).toBe(preview.rows[0].fullCode);
});

it('explicitly reuses a reserved drawing in a new version without changing attribution, occupation or creating BOM',async()=>{
 const refs=fixture();ensureProductAppearance(db,refs.product.id);const firstVersion=(db.prepare('select id from product_appearance_versions where product_id=?').get(refs.product.id) as {id:number}).id;const request={...input(refs),appearanceVersionId:firstVersion},preview=service.preview(request);
 const reserved=service.reserve({...request,rows:request.rows.map((row,i)=>({...row,expectedFullCode:preview.rows[i].fullCode}))})[0];
 const primary=db.prepare('select * from drawing_appearance_bindings where record_id=?').get(reserved.id);
 const version=Number(db.prepare(`insert into product_appearance_versions(product_id,version_number,appearance_id,label,status,created_at) values(?,2,?,'二代','draft','now')`).run(refs.product.id,refs.appearance.id).lastInsertRowid);
 const {DrawingQueryService}=await import('../../src/core/drawings/drawing-query-service');const library=new DrawingQueryService(db);
 const target={signedId:reserved.id,productId:refs.product.id,appearanceVersionId:version,reason:'新外观沿用已核验物料'};
 expect(library.search({appearanceVersionId:version}).items).toEqual([]);
 const reuse=library.reuse.preview(target);expect(db.prepare('select * from drawing_appearance_usages').all()).toEqual([]);
 expect(library.reuse.confirm({...target,fingerprint:reuse.fingerprint,confirmed:true})).toEqual({updated:1});
 expect(library.search({productId:refs.product.id,appearanceVersionId:version}).items.map(row=>row.id)).toEqual([reserved.id]);
 expect(library.navigationCounts({}).appearances).toContainEqual({appearanceVersionId:version,count:1});
 expect(db.prepare('select * from drawing_appearance_bindings where record_id=?').get(reserved.id)).toEqual(primary);
 expect(db.prepare('select * from bom_versions').all()).toEqual([]);expect(service.preview({...request,appearanceVersionId:(primary as {appearance_version_id:number}).appearance_version_id}).rows[0].sequence).toBe(2);
 expect(db.prepare('select count(*) as n from drawing_appearance_usage_audit').get()).toEqual({n:1});
 const usagesBefore=db.prepare('select * from drawing_appearance_usages').all();
 const auditBefore=db.prepare('select * from drawing_appearance_usage_audit').all();
 expect(library.transition(reserved.id,'voided')).toMatchObject({status:'voided',fullCode:reserved.fullCode,occupied:true});
 expect(library.transition(reserved.id,'active')).toMatchObject({status:'active',fullCode:reserved.fullCode,occupied:true});
 expect(db.prepare('select * from drawing_appearance_usages').all()).toEqual(usagesBefore);
 expect(db.prepare('select * from drawing_appearance_usage_audit').all()).toEqual(auditBefore);
 expect(db.prepare('select * from drawing_appearance_bindings where record_id=?').get(reserved.id)).toEqual(primary);
 expect(()=>library.associations.correct(target,'不允许改写沿用图号的原始归属')).toThrow('不能改写原始归属');
 expect(library.previewDeletion(reserved.id)).toMatchObject({deletable:false,blockers:[expect.objectContaining({kind:'appearance_usage'})]});
 expect(library.reuse.confirm({...target,fingerprint:library.reuse.preview(target).fingerprint,confirmed:true})).toEqual({updated:0});
 const stale=library.reuse.preview(target);db.prepare("update product_appearance_versions set label='变更' where id=?").run(version);
 expect(()=>library.reuse.confirm({...target,fingerprint:stale.fingerprint,confirmed:true})).toThrow('重新预览');
});
