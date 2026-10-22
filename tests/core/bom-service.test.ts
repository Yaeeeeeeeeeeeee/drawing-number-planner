import {ensureProductAppearance} from '../../src/core/products/appearance-identity';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BomService } from '../../src/core/bom/bom-service';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { DrawingDeletionService } from '../../src/core/drawings/drawing-deletion-service';
import { DrawingRepository } from '../../src/core/drawings/drawing-repository';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let temporaryRoot: string;
let db: PlannerDatabase; let dictionaries: DictionaryService; let products: ProductService; let planning: PlanningService; let service: BomService;
beforeEach(() => { temporaryRoot=mkdtempSync(join(tmpdir(),'bom-appearance-')); db = openDatabase(join(temporaryRoot,'planner.sqlite')); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); dictionaries = new DictionaryService(db); products = new ProductService(db); planning = new PlanningService(db); service = new BomService(db); });
afterEach(() => { db.close(); rmSync(temporaryRoot,{recursive:true,force:true}); });
function setup() {
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'B' }); const size = dictionaries.create({ type: 'product_size', code: '0404', name: 'S' }); const appearance = dictionaries.create({ type: 'appearance', code: '01', name: 'A' });
  const white = dictionaries.create({ type: 'color', code: '0', name: '白' }); const gray = dictionaries.create({ type: 'color', code: '1', name: '灰' }); const main = dictionaries.create({ type: 'main_category', code: '04', name: 'M' }); const logo = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id }); const manual = dictionaries.create({ type: 'project_item', code: '02', name: '说明书', parentId: main.id });
  const product = products.create({ sku: 'SKU1', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id, model: 'X1', productCategory: '冰柜' }); const other = products.create({ sku: 'SKU2', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id, model: 'X2', productCategory: '冰柜' });
  db.prepare(`insert into product_qr_codes(product_id,purpose_id,name,status,created_at,updated_at) select product.id,purpose.id,product.model || purpose.display_name,'inactive','2026-10-20','2026-10-20' from products product cross join qr_purposes purpose where not exists(select 1 from product_qr_codes qr where qr.product_id=product.id and qr.purpose_id=purpose.id)`).run();
  const draw = (productId: number, colorId: number, projectItemId: number) => { const input = { productId, rows: [{ clientId: `${productId}-${colorId}-${projectItemId}-${Math.random()}`, colorId, mainCategoryId: main.id, projectItemId }] }; const preview = planning.preview(input); return planning.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0]; };
  return { white, gray, logo, manual, product, other, draw };
}
function insertBatch(productId: number | null, relativePath: string, name = '01.20260901', isPresent = true): number {
  return Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, product_id, name, sequence_number, business_date, recognition_status,
      is_present, first_seen_at, last_seen_at)
    values (?, ?, ?, ?, 1, '2026-09-01', 'recognized', ?, '2026-09-01', '2026-09-01')`)
    .run(relativePath, relativePath.split('\\03.')[0], productId, name, isPresent ? 1 : 0).lastInsertRowid);
}
function insertAsset(name: string): number {
  return Number(db.prepare(`insert into bom_assets
    (relative_path, original_file_name, mime_type, size_bytes, content_sha256, created_at)
    values (?, ?, 'image/png', 8, ?, '2026-09-01')`)
    .run(`_图号规划器\\BOM附件\\${name}`, name, name.padEnd(64, '0').slice(0, 64)).lastInsertRowid);
}
function insertHistorical(productId: number | null, projectItemCode: string, status: 'active' | 'inactive' = 'active',
  sequence = 1): number {
  const fullCode = `02.0404.010.04${projectItemCode}${String(sequence).padStart(3, '0')}`;
  return Number(db.prepare(`insert into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
      project_item_code, sequence, product_id, detected_sku, detected_model, detected_product_category,
      first_seen_at, last_seen_at, status)
    values (?, '02', '0404', '01', '0', '04', ?, ?, ?, 'SKU1', 'X1', '冰柜', '2026-09-01', '2026-09-01', ?)`)
    .run(fullCode, projectItemCode, sequence, productId, status).lastInsertRowid);
}
describe('product-level BOM service', () => {
  it('explicitly reuses samecanonical alias drawings without rewriting raw historical identities',()=>{
    const r=setup();ensureProductAppearance(db,r.product.id); const aliasDrawing=r.draw(r.other.id,r.white.id,r.logo.id);
    db.prepare('update product_identity_members set canonical_product_id=? where raw_product_id=?').run(r.product.id,r.other.id);
    const appearance=(db.prepare("select id from product_appearance_versions where product_id=? and status='current'").get(r.product.id) as {id:number}).id;
    const candidates=service.listCandidates({productId:r.product.id,appearanceVersionId:appearance,includeReusableMaterials:true,projectItemId:r.logo.id,usesWhiteMaterial:false});
    expect(candidates).toEqual(expect.arrayContaining([expect.objectContaining({drawingId:aliasDrawing.id})]));
    const saved=service.saveVersion({productId:r.product.id,appearanceVersionId:appearance,businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[{projectItemId:r.logo.id,drawingId:aliasDrawing.id,usesWhiteMaterial:false}]}).version;
    expect(saved.items[0].fullCode).toBe(aliasDrawing.fullCode);
    expect(db.prepare('select product_id from drawing_numbers where id=?').get(aliasDrawing.id)).toEqual({product_id:r.other.id});
    expect(()=>service.saveVersion({productId:r.product.id,appearanceVersionId:appearance,businessChangeDate:'2026-10-20',expectedCurrentVersionId:saved.id,items:[{projectItemId:r.manual.id,drawingId:aliasDrawing.id,usesWhiteMaterial:false}]})).toThrow(/项目不一致/);
  });
  it('keeps an independent current BOM per appearance and records immutable correction snapshots', () => {
    const r = setup();ensureProductAppearance(db,r.product.id); const drawing = r.draw(r.product.id,r.white.id,r.logo.id);
    const currentAppearance = db.prepare("select id from product_appearance_versions where product_id=? and status='current'").get(r.product.id) as {id:number};
    const image=insertAsset('appearance-copy.png');
    const item = {projectItemId:r.logo.id,drawingId:drawing.id,usesWhiteMaterial:false,assets:[{role:'image' as const,assetId:image}]};
    const first = service.saveVersion({productId:r.product.id,appearanceVersionId:currentAppearance.id,businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[item]}).version;
    const draftId = Number(db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,2,'新版','draft','2026-10-20')").run(r.product.id).lastInsertRowid);
    const copied = service.copyToAppearance(first.id,draftId,'2026-10-20');
    expect(copied.diff.map(row=>row.type)).toEqual(['unchanged']);
    expect(copied.version.items[0].assets[0]).toMatchObject({assetId:image,inherited:true});
    expect(service.getCurrent(r.product.id,currentAppearance.id)?.id).toBe(first.id);
    expect(service.getCurrent(r.product.id,draftId)?.id).toBe(copied.version.id);
    expect(service.getCurrent(r.product.id)?.id).toBe(first.id);
    const correction = service.updateVersion(first.id,{productId:r.product.id,appearanceVersionId:currentAppearance.id,expectedCurrentVersionId:first.id,items:[{...item,notes:'历史纠错'}]},0).version;
    const audit = db.prepare('select before_snapshot_json,after_snapshot_json from bom_revision_snapshots where bom_version_id=?').get(first.id) as {before_snapshot_json:string;after_snapshot_json:string};
    expect(JSON.parse(audit.before_snapshot_json)).toEqual(first);
    expect(JSON.parse(audit.after_snapshot_json)).toEqual(correction);
    expect(()=>db.prepare('delete from bom_revision_snapshots where bom_version_id=?').run(first.id)).toThrow(/不可删除/);
    expect(correction).toMatchObject({id:first.id,createdAt:first.createdAt,businessChangeDate:first.businessChangeDate,previousVersionId:first.previousVersionId});
  });

  it('allows editing notes with the same formerly valid drawing without allowing a new voided reference', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.white.id, r.logo.id);
    const replacement = r.draw(r.product.id, r.white.id, r.logo.id);
    const item = { projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null, items: [item] };
    const first = service.saveVersion(input).version;
    db.prepare("update drawing_numbers set status = 'voided' where id in (?, ?)").run(drawing.id, replacement.id);
    const edited = service.updateVersion(first.id, { ...input, items: [{ ...item, notes: '补录历史说明' }] }, 0).version;
    expect(edited.items[0].notes).toBe('补录历史说明');
    expect(edited.items[0].status).toBe('voided');
    expect(() => service.updateVersion(first.id, { ...input, items: [{ ...item, drawingId: replacement.id }] }, 1)).toThrow(/作废/);
    expect(() => service.saveVersion({ ...input, expectedCurrentVersionId: first.id })).toThrow(/作废/);
  });
  it('does not reuse an attachment from an item removed from the previous BOM', () => {
    const r = setup(); const logo = r.draw(r.product.id, r.white.id, r.logo.id);
    const manual = r.draw(r.product.id, r.white.id, r.manual.id); const image = insertAsset('removed.png');
    const keep = { projectItemId: r.manual.id, drawingId: manual.id, usesWhiteMaterial: false };
    const old = { projectItemId: r.logo.id, drawingId: logo.id, usesWhiteMaterial: false };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null,
      items: [keep, { ...old, assets: [{ role: 'image' as const, assetId: image }] }] };
    const first = service.saveVersion(input).version;
    service.updateVersion(first.id, { ...input, items: [keep] }, 0);
    expect(() => service.saveVersion({ ...input, expectedCurrentVersionId: first.id,
      items: [keep, { ...old, assets: [{ role: 'image', reusePrevious: true }] }] }))
      .toThrowError(expect.objectContaining({ code: 'ASSET_REUSE_NOT_FOUND' }));
    expect(service.listVersions(r.product.id)).toHaveLength(1);
  });
  it('allows text edits retaining a missing original batch but rejects assigning that batch to a new BOM', () => {
    const r = setup(); const d = r.draw(r.product.id, r.white.id, r.logo.id);
    const batch = insertBatch(r.product.id, '01.冰柜\\SKU1-X1\\03.量产后的变更文件\\01.20260901');
    const item = { projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, effectiveMaterialBatchId: batch };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null, items: [item] };
    const first = service.saveVersion(input).version;
    db.prepare('update material_batches set is_present = 0 where id = ?').run(batch);
    const edited = service.updateVersion(first.id, { ...input, items: [{ ...item, notes: '补录' }] }, 0).version;
    expect(edited.items[0]).toMatchObject({ effectiveMaterialBatchId: batch, effectiveBatchName: '01.20260901', notes: '补录' });
    expect(() => service.saveVersion({ ...input, expectedCurrentVersionId: first.id }))
      .toThrowError(expect.objectContaining({ code: 'BATCH_NOT_ELIGIBLE' }));
    const cleared = service.updateVersion(first.id, { ...input, items: [{ ...item, effectiveMaterialBatchId: null }] }, 1).version;
    expect(cleared.items[0]).toMatchObject({ effectiveMaterialBatchId: null, effectiveBatchRelativePath: null, effectiveBatchName: null });
  });
  it('keeps an old batch snapshot when editing text after the batch index has disappeared', () => {
    const r = setup(); const d = r.draw(r.product.id, r.white.id, r.logo.id);
    const path = '01.冰柜\\SKU1-X1\\03.量产后的变更文件\\01.20260901';
    const batch = insertBatch(r.product.id, path);
    const item = { projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null,
      items: [{ ...item, effectiveMaterialBatchId: batch }] };
    const first = service.saveVersion(input).version;
    db.prepare('update bom_items set effective_material_batch_id = null where bom_version_id = ?').run(first.id);
    db.prepare('delete from material_batches where id = ?').run(batch);
    const edited = service.updateVersion(first.id, { ...input, items: [{ ...item, changeDetails: '补充说明' }] }, 0).version;
    expect(edited.items[0]).toMatchObject({ effectiveMaterialBatchId: null,
      effectiveBatchRelativePath: path, effectiveBatchName: '01.20260901', changeDetails: '补充说明' });
  });
  it('preserves an existing QR reference when a hidden QR field is omitted from a new revision', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.white.id, r.logo.id);
    const qr = db.prepare('select id from product_qr_codes where product_id = ? limit 1').get(r.product.id) as { id: number };
    db.prepare("update product_qr_codes set status = 'active' where id = ?").run(qr.id);
    const item = { projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null, items: [{ ...item, qrCodeIds: [qr.id] }] };
    const first = service.saveVersion(input).version;
    db.prepare("update product_qr_codes set status = 'inactive' where id = ?").run(qr.id);
    const next = service.saveVersion({ ...input, expectedCurrentVersionId: first.id, items: [item] }).version;
    expect(next.items[0].qrCodes).toEqual([expect.objectContaining({ id: qr.id, status: 'inactive' })]);
  });
  it('does not treat a removed BOM item as a current query match or deletion blocker', () => {
    const r = setup(); const logo = r.draw(r.product.id, r.white.id, r.logo.id);
    const manual = r.draw(r.product.id, r.white.id, r.manual.id);
    const keep = { projectItemId: r.manual.id, drawingId: manual.id, usesWhiteMaterial: false };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: logo.id, usesWhiteMaterial: false }, keep] };
    const first = service.saveVersion(input).version;
    service.updateVersion(first.id, { ...input, items: [keep] }, 0);
    expect(service.queryVersions({ fullCode: logo.fullCode })).toEqual([]);
    expect(new DrawingDeletionService(db).preview(logo.id).references.currentBom).toBe(0);
    expect(new DrawingRepository(db).getDetail(logo.id)?.currentBomUsage).toEqual([]);
    expect(service.getVersion(first.id).items).toHaveLength(1);
    expect(db.prepare('select count(*) as count from bom_items where bom_version_id = ?').get(first.id)).toEqual({ count: 2 });
  });
  it('reports edits to change details even when the drawing and other fields are unchanged', () => {
    const r = setup(); const d = r.draw(r.product.id, r.white.id, r.logo.id);
    const item = { projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, changeDetails: '初稿' };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null, items: [item] };
    const first = service.saveVersion(input).version;
    const result = service.updateVersion(first.id, { ...input, items: [{ ...item, changeDetails: '更新印刷文字' }] }, 0);
    expect(result.diff[0].type).toBe('replaced');
    expect(result.version.items[0].changeDetails).toBe('更新印刷文字');
  });
  it('keeps a later BOM inherited image readable when an earlier BOM image is replaced', () => {
    const r = setup(); const d = r.draw(r.product.id, r.white.id, r.logo.id);
    const firstAsset = insertAsset('first.png'); const secondAsset = insertAsset('replacement.png');
    const item = { projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false };
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null,
      items: [{ ...item, assets: [{ role: 'image' as const, assetId: firstAsset }] }] };
    const first = service.saveVersion(input).version;
    const later = service.saveVersion({ ...input, expectedCurrentVersionId: first.id,
      items: [{ ...item, assets: [{ role: 'image', reusePrevious: true }] }] }).version;
    service.updateVersion(first.id, { ...input, items: [{ ...item, assets: [{ role: 'image', assetId: secondAsset }] }] }, 0);
    expect(service.getVersion(later.id).items[0].assets[0]).toMatchObject({ assetId: firstAsset, originalFileName: 'first.png', inherited: true });
    expect(service.getCurrent(r.product.id)?.id).toBe(later.id);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it('edits the selected BOM record in place while preserving submission time and rejecting stale edits', () => {
    const r = setup(); const d = r.draw(r.product.id, r.white.id, r.logo.id);
    const input = { productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, material: 'PET', changeDetails: '初稿' }] };
    const first = service.saveVersion(input).version;
    const edited = service.updateVersion(first.id, { ...input, items: [{ ...input.items[0], material: '亚银', changeDetails: '更新排版' }] }, 0).version;
    expect(edited).toMatchObject({ id: first.id, createdAt: first.createdAt, editRevision: 1 });
    expect(edited.items[0]).toMatchObject({ material: '亚银', changeDetails: '更新排版', bomItemId: first.items[0].bomItemId });
    expect(service.listVersions(r.product.id)).toHaveLength(1);
    expect(() => service.updateVersion(first.id, input, 0)).toThrowError(expect.objectContaining({ code: 'BOM_STALE' }));
  });
  it('offers planned drawings in both entry modes and confirmed historical drawings only in historical mode', () => {
    const r = setup();
    const planned = r.draw(r.product.id, r.white.id, r.logo.id);
    const activeHistorical = insertHistorical(r.product.id, '01', 'active', 7);
    const inactiveHistorical = insertHistorical(r.product.id, '01', 'inactive', 8);
    insertHistorical(null, '01', 'active', 9);
    insertHistorical(r.other.id, '01', 'active', 10);
    const current = service.listCandidates({ productId: r.product.id, projectItemId: r.logo.id,
      usesWhiteMaterial: true, entryMode: 'current' });
    expect(current).toEqual([expect.objectContaining({ origin: 'planned', drawingId: planned.id })]);
    const historical = service.listCandidates({ productId: r.product.id, projectItemId: r.logo.id,
      usesWhiteMaterial: true, entryMode: 'historical' });
    expect(historical).toEqual(expect.arrayContaining([
      expect.objectContaining({ origin: 'planned', drawingId: planned.id, status: 'reserved' }),
      expect.objectContaining({ origin: 'historical', historicalDrawingId: activeHistorical, status: 'active' }),
      expect.objectContaining({ origin: 'historical', historicalDrawingId: inactiveHistorical, status: 'inactive' }),
    ]));
    expect(historical.filter((item) => item.origin === 'historical')).toHaveLength(2);
  });

  it('persists, queries and diffs a confirmed historical drawing reference without losing its origin', () => {
    const r = setup(); const historicalDrawingId = insertHistorical(r.product.id, '01', 'inactive', 11);
    const saved = service.saveVersion({ productId: r.product.id, entryMode: 'historical', businessChangeDate: '2020-01-02',
      expectedCurrentVersionId: null, items: [{ projectItemId: r.logo.id,
        drawingReference: { origin: 'historical', historicalDrawingId }, usesWhiteMaterial: true }] });
    expect(saved.version.items[0]).toMatchObject({ origin: 'historical', historicalDrawingId,
      fullCode: '02.0404.010.0401011', status: 'inactive' });
    expect(saved.diff[0]).toMatchObject({ type: 'added', drawingReference: { origin: 'historical', historicalDrawingId } });
    expect(service.queryVersions({ fullCode: '0401011' })).toEqual([expect.objectContaining({ id: saved.version.id })]);
    expect(service.getVersion(saved.version.id).items[0]).toMatchObject({ origin: 'historical', historicalDrawingId });
  });

  it('rejects historical references outside historical mode, another product, or an unconfirmed product assignment', () => {
    const r = setup(); const own = insertHistorical(r.product.id, '01'); const other = insertHistorical(r.other.id, '01', 'active', 2);
    const unconfirmed = insertHistorical(null, '01', 'active', 3);
    const save = (entryMode: 'current' | 'historical', historicalDrawingId: number) => () => service.saveVersion({
      productId: r.product.id, entryMode, businessChangeDate: '2020-01-02', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingReference: { origin: 'historical', historicalDrawingId }, usesWhiteMaterial: true }],
    });
    expect(save('current', own)).toThrow(/历史 BOM/);
    expect(save('historical', other)).toThrow(/其他型号/);
    expect(save('historical', unconfirmed)).toThrow(/确认产品归属/);
  });
  it('saves immutable product snapshots with date, formal fields, fixed quantity, and field diffs', () => { const r = setup(); const d = r.draw(r.product.id, r.gray.id, r.logo.id); const first = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [{ projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, material: 'PET', dimensions: '10', position: 'front', notes: 'n' }] }); const second = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: first.version.id, items: [{ projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, material: 'PP', dimensions: '10', position: 'front', notes: 'n' }] }); expect(first.version.items[0]).toMatchObject({ quantity: 1, material: 'PET' }); expect(second.diff[0].type).toBe('replaced'); expect(service.getVersion(first.version.id).items[0].material).toBe('PET'); });
  it('rejects invalid drawings, duplicates, empty BOMs and invalid dates', () => { const r = setup(); const own = r.draw(r.product.id, r.gray.id, r.logo.id); const other = r.draw(r.other.id, r.gray.id, r.logo.id); const wrong = r.draw(r.product.id, r.gray.id, r.manual.id); db.prepare("update drawing_numbers set status = 'voided' where id = ?").run(own.id); const save = (item: object) => () => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [item as never] }); expect(save({ projectItemId: r.logo.id, drawingId: other.id, usesWhiteMaterial: false })).toThrow(/其他型号/); expect(save({ projectItemId: r.logo.id, drawingId: wrong.id, usesWhiteMaterial: false })).toThrow(/项目不一致/); expect(save({ projectItemId: r.logo.id, drawingId: own.id, usesWhiteMaterial: false })).toThrow(/作废/); expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: 'bad', expectedCurrentVersionId: null, items: [] })).toThrow(/日期/); });
  it('requires exactly one modern or legacy drawing reference for direct core calls', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const save = (item: object) => () => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02',
      expectedCurrentVersionId: null, items: [item as never] });
    expect(save({ projectItemId: r.logo.id, drawingId: drawing.id,
      drawingReference: { origin: 'planned', drawingId: drawing.id }, usesWhiteMaterial: false }))
      .toThrowError(expect.objectContaining({ code: 'DRAWING_REFERENCE_INVALID' }));
    expect(save({ projectItemId: r.logo.id, usesWhiteMaterial: false }))
      .toThrowError(expect.objectContaining({ code: 'DRAWING_REFERENCE_INVALID' }));
  });
  it('enforces white-share and returns product/project candidates only', () => { const r = setup(); const gray = r.draw(r.product.id, r.gray.id, r.logo.id); const white = r.draw(r.product.id, r.white.id, r.logo.id); r.draw(r.other.id, r.gray.id, r.logo.id); expect(service.listCandidates({ productId: r.product.id, projectItemId: r.logo.id, usesWhiteMaterial: true }).map(x => x.origin === 'planned' ? x.drawingId : -1)).toEqual([white.id]); expect(service.listCandidates({ productId: r.product.id, projectItemId: r.logo.id, usesWhiteMaterial: false }).map(x => x.origin === 'planned' ? x.drawingId : -1)).toContain(gray.id); expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [{ projectItemId: r.logo.id, drawingId: gray.id, usesWhiteMaterial: true }] })).toThrow(/白色/); });
  it('keeps legacy NULL date label and filters/sorts by date, batch, project and drawing', () => { const r = setup(); const d = r.draw(r.product.id, r.gray.id, r.logo.id); db.prepare(`insert into bom_versions (product_id, version_number, business_change_date, created_at) values (?, 99, null, ?)`).run(r.product.id, '2020-01-01T00:00:00Z'); const batchPath = '01.冰柜\\SKU1-X1\\03.量产后的变更文件\\01.20260901'; const batchId = insertBatch(r.product.id, batchPath); const saved = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [{ projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, effectiveMaterialBatchId: batchId }] }); expect(service.queryVersions({ businessChangeDate: '2026-09-02', effectiveBatchRelativePath: '20260901', projectItemId: r.logo.id, fullCode: d.fullCode })[0].id).toBe(saved.version.id); expect(service.listVersions(r.product.id).at(-1)?.businessChangeDateLabel).toBe('未补录'); });
  it('rejects invalid QR references and missing predecessor assets', () => { const r = setup(); const d = r.draw(r.product.id, r.gray.id, r.logo.id); const qr = db.prepare('select id from product_qr_codes where product_id = ? limit 1').get(r.product.id) as { id: number }; expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [{ projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, qrCodeIds: [qr.id] }] })).toThrow(/启用/); expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [{ projectItemId: r.logo.id, drawingId: d.id, usesWhiteMaterial: false, assets: [{ role: 'image', reusePrevious: true }] }] })).toThrow(/上一版/); });

  it('rejects an empty BOM and duplicate projects using an otherwise valid request', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_BOM_ITEM_COUNT' }));
    const item = { projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false };
    expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null, items: [item, item] }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_PROJECT' }));
  });

  it('derives batch snapshots on the server and relinks only the owning product', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const path = '01.冰柜\\SKU1-X1\\03.量产后的变更文件\\01.20260901';
    const batchId = insertBatch(r.product.id, path);
    expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false,
        effectiveMaterialBatchId: batchId, effectiveBatchRelativePath: 'client\\forged', effectiveBatchName: 'forged' }] }))
      .toThrowError(expect.objectContaining({ code: 'BATCH_SNAPSHOT_MISMATCH' }));
    const saved = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false, effectiveMaterialBatchId: batchId }] });
    expect(saved.version.items[0]).toMatchObject({ effectiveMaterialBatchId: batchId, effectiveBatchRelativePath: path,
      effectiveBatchName: '01.20260901' });

    db.prepare('update bom_items set effective_material_batch_id = null where bom_version_id = ?').run(saved.version.id);
    const otherDrawing = r.draw(r.other.id, r.gray.id, r.logo.id);
    const otherVersion = Number(db.prepare(`insert into bom_versions (product_id, version_number, business_change_date, created_at)
      values (?, 1, '2026-09-02', '2026-09-02')`).run(r.other.id).lastInsertRowid);
    const otherItem = Number(db.prepare(`insert into bom_items
      (bom_version_id, project_item_id, drawing_id, quantity, effective_batch_relative_path, effective_batch_name, uses_white_material)
      values (?, ?, ?, 1, ?, '01.20260901', 0)`).run(otherVersion, r.logo.id, otherDrawing.id, path).lastInsertRowid);
    expect(service.relinkMaterialBatch(batchId)).toEqual({ relinked: 1 });
    expect(db.prepare('select effective_material_batch_id as id from bom_items where id = ?').get(otherItem)).toEqual({ id: null });
    const unowned = insertBatch(null, '01.冰柜\\UNKNOWN-X\\03.量产后的变更文件\\01.20260901');
    expect(() => service.relinkMaterialBatch(unowned)).toThrowError(expect.objectContaining({ code: 'BATCH_NOT_ELIGIBLE' }));
  });

  it('treats inherited links and later batch relinking as semantic no-ops, but detects actual asset changes', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id); const firstAsset = insertAsset('first.png');
    const first = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false,
        assets: [{ role: 'image', assetId: firstAsset }] }] });
    const inherited = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: first.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false,
        assets: [{ role: 'image', reusePrevious: true }] }] });
    expect(inherited.diff).toEqual([expect.objectContaining({ type: 'unchanged' })]);
    expect(inherited.version.items[0].assets[0]).toMatchObject({ assetId: firstAsset,
      inheritedFromBomItemAssetId: first.version.items[0].assets[0].id });
    const replacement = insertAsset('replacement.png');
    const replaced = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-04', expectedCurrentVersionId: inherited.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false,
        assets: [{ role: 'image', assetId: replacement }] }] });
    expect(replaced.diff).toEqual([expect.objectContaining({ type: 'replaced' })]);
  });

  it('does not report a replacement when a rescanned batch keeps the same snapshot but receives a new database id', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const path = '01.冰柜\\SKU1-X1\\03.量产后的变更文件\\01.20260901';
    const firstBatch = insertBatch(r.product.id, path);
    const first = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false,
        effectiveMaterialBatchId: firstBatch }] });
    db.prepare('delete from material_batches where id = ?').run(firstBatch);
    const rescannedBatch = insertBatch(r.product.id, path);
    const second = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-03',
      expectedCurrentVersionId: first.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false,
        effectiveMaterialBatchId: rescannedBatch }] });
    expect(second.diff).toEqual([expect.objectContaining({ type: 'unchanged' })]);
  });

  it('accepts only active same-product QR codes for new BOMs while preserving later inactive history', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const ownQr = db.prepare('select id from product_qr_codes where product_id = ? limit 1').get(r.product.id) as { id: number };
    const otherQr = db.prepare('select id from product_qr_codes where product_id = ? limit 1').get(r.other.id) as { id: number };
    db.prepare("update product_qr_codes set status = 'active' where id in (?, ?)").run(ownQr.id, otherQr.id);
    expect(() => service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false, qrCodeIds: [otherQr.id] }] }))
      .toThrowError(expect.objectContaining({ code: 'QR_CODE_NOT_ELIGIBLE' }));
    const saved = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false, qrCodeIds: [ownQr.id] }] });
    db.prepare("update product_qr_codes set status = 'inactive' where id = ?").run(ownQr.id);
    expect(service.getVersion(saved.version.id).items[0].qrCodes).toEqual([expect.objectContaining({ id: ownQr.id, status: 'inactive' })]);
  });

  it('soft-deletes a non-current history record without changing the current BOM', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const first = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-01', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    const second = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: first.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });

    expect(service.deleteBomVersion(first.version.id, true)).toMatchObject({ deletedVersionId: first.version.id,
      productId: r.product.id, wasCurrent: false, currentVersionId: second.version.id });
    expect(service.getCurrent(r.product.id)?.id).toBe(second.version.id);
    expect(service.listVersions(r.product.id).map((version) => version.id)).toEqual([second.version.id]);
    expect(service.queryVersions({}).map((version) => version.id)).toEqual([second.version.id]);
    expect(() => service.getVersion(first.version.id)).toThrowError(expect.objectContaining({ code: 'BOM_NOT_FOUND' }));
  });

  it('requires confirmation and rolls the current BOM back to the latest undeleted predecessor', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const first = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-01', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    const second = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: first.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    const third = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-03', expectedCurrentVersionId: second.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    service.deleteBomVersion(second.version.id, true);

    expect(service.previewBomVersionDeletion(third.version.id)).toMatchObject({ isCurrent: true,
      fallbackVersionId: first.version.id, fallbackVersionNumber: 1 });
    expect(() => service.deleteBomVersion(third.version.id, false)).toThrowError(expect.objectContaining({ code: 'BOM_DELETE_CONFIRMATION_REQUIRED' }));
    expect(service.deleteBomVersion(third.version.id, true)).toMatchObject({ wasCurrent: true,
      currentVersionId: first.version.id, currentVersionNumber: 1 });
    expect(service.getCurrent(r.product.id)?.id).toBe(first.version.id);

    const fourth = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-04', expectedCurrentVersionId: first.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    expect(fourth.version.versionNumber).toBe(4);
  });

  it('clears the current pointer when deleting the only BOM version and rejects repeat deletion', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const only = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-01', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });

    expect(service.deleteBomVersion(only.version.id, true)).toMatchObject({ wasCurrent: true, currentVersionId: null });
    expect(service.getCurrent(r.product.id)).toBeNull();
    expect(() => service.deleteBomVersion(only.version.id, true)).toThrowError(expect.objectContaining({ code: 'BOM_ALREADY_DELETED' }));
  });

  it('deletes an entire product BOM only after exact model confirmation and leaves other products intact', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id); const otherDrawing = r.draw(r.other.id, r.gray.id, r.logo.id);
    service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-01', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    service.saveVersion({ productId: r.other.id, businessChangeDate: '2026-09-01', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: otherDrawing.id, usesWhiteMaterial: false }] });

    expect(() => service.deleteProductBom(r.product.id, 'x1')).toThrowError(expect.objectContaining({ code: 'BOM_MODEL_CONFIRMATION_MISMATCH' }));
    expect(service.listVersions(r.product.id)).toHaveLength(1);
    expect(service.deleteProductBom(r.product.id, 'X1')).toMatchObject({ productId: r.product.id, deletedCount: 1, currentVersionId: null });
    expect(service.listVersions(r.product.id)).toHaveLength(0);
    expect(service.listVersions(r.other.id)).toHaveLength(1);
  });

  it('rolls back the version tombstone when updating the current pointer fails', () => {
    const r = setup(); const drawing = r.draw(r.product.id, r.gray.id, r.logo.id);
    const first = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-01', expectedCurrentVersionId: null,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    const current = service.saveVersion({ productId: r.product.id, businessChangeDate: '2026-09-02', expectedCurrentVersionId: first.version.id,
      items: [{ projectItemId: r.logo.id, drawingId: drawing.id, usesWhiteMaterial: false }] });
    db.exec(`create trigger fail_bom_current_update before update on bom_current begin select raise(abort, 'forced rollback'); end`);

    expect(() => service.deleteBomVersion(current.version.id, true)).toThrow(/forced rollback/);
    expect(db.prepare('select deleted_at from bom_versions where id = ?').get(current.version.id)).toEqual({ deleted_at: null });
    expect(service.getCurrent(r.product.id)?.id).toBe(current.version.id);
  });
});
it('preserves all three record identities, dates, submission times and neighbors when editing the middle record',()=>{
 const r=setup(),drawing=r.draw(r.product.id,r.white.id,r.logo.id);const item={projectItemId:r.logo.id,drawingId:drawing.id,usesWhiteMaterial:false,material:'原材质'};
 const one=service.saveVersion({productId:r.product.id,businessChangeDate:'2026-09-01',expectedCurrentVersionId:null,items:[item]}).version;
 const two=service.saveVersion({productId:r.product.id,businessChangeDate:'2026-09-02',expectedCurrentVersionId:one.id,items:[item]}).version;
 const three=service.saveVersion({productId:r.product.id,businessChangeDate:'2026-09-03',expectedCurrentVersionId:two.id,items:[item]}).version;
 const changed=service.updateVersion(two.id,{productId:r.product.id,expectedCurrentVersionId:three.id,items:[{...item,material:'修订材质'}]},two.editRevision).version;
 expect(service.listVersions(r.product.id)).toHaveLength(3);expect(changed).toMatchObject({id:two.id,createdAt:two.createdAt,businessChangeDate:two.businessChangeDate,previousVersionId:one.id,versionNumber:two.versionNumber,editRevision:two.editRevision+1});
 expect(changed.items[0].material).toBe('修订材质');expect(service.getVersion(one.id)).toEqual(one);expect(service.getVersion(three.id)).toEqual(three);expect(service.getCurrent(r.product.id)?.id).toBe(three.id);
 expect(()=>service.updateVersion(two.id,{productId:r.product.id,businessChangeDate:'2030-01-01',expectedCurrentVersionId:three.id,items:[item]},changed.editRevision)).toThrow(/不能更改.*业务变更日期/);
 expect(service.getVersion(two.id)).toEqual(changed);expect(service.listVersions(r.product.id)).toHaveLength(3);
});
