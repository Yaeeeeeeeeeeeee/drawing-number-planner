import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { BomService } from '../../src/core/bom/bom-service';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let dictionaries: DictionaryService;
let products: ProductService;
let planning: PlanningService;
let service: BomService;

beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  dictionaries = new DictionaryService(db); products = new ProductService(db);
  planning = new PlanningService(db); service = new BomService(db);
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
  const manual = dictionaries.create({ type: 'project_item', code: '02', name: '说明书', parentId: main.id });
  const product = products.create({ brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC100', productCategory: '冰柜' });
  const otherProduct = products.create({ brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC220', productCategory: '冰柜' });
  return { appearance, white, gray, main, logo, manual, product, otherProduct };
}

function reserveDrawing(refs: ReturnType<typeof fixture>, productId: number, colorId: number, projectItemId: number) {
  const input = { productId, rows: [{ clientId: `row-${productId}-${colorId}-${projectItemId}`,
    colorId, mainCategoryId: refs.main.id, projectItemId }] };
  const preview = planning.preview(input);
  return planning.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
}

describe('BomService', () => {
  it('creates a complete initial gray BOM and promotes adopted drawings to active', () => {
    const refs = fixture();
    const grayLogo = reserveDrawing(refs, refs.product.id, refs.gray.id, refs.logo.id);
    const whiteManual = reserveDrawing(refs, refs.product.id, refs.white.id, refs.manual.id);

    const saved = service.saveVersion({ productId: refs.product.id, colorId: refs.gray.id,
      expectedCurrentVersionId: null, notes: '首版', items: [
        { projectItemId: refs.logo.id, drawingId: grayLogo.id, quantity: 1, usesWhiteMaterial: false },
        { projectItemId: refs.manual.id, drawingId: whiteManual.id, quantity: 2, notes: '共用', usesWhiteMaterial: true },
      ] });

    expect(saved.version).toMatchObject({ productId: refs.product.id, colorId: refs.gray.id,
      versionNumber: 1, previousVersionId: null, notes: '首版' });
    expect(saved.version.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectItemId: refs.logo.id, drawingId: grayLogo.id, usesWhiteMaterial: false, quantity: 1 }),
      expect.objectContaining({ projectItemId: refs.manual.id, drawingId: whiteManual.id, usesWhiteMaterial: true, quantity: 2, notes: '共用' }),
    ]));
    expect(saved.diff.map((entry) => entry.type)).toEqual(['added', 'added']);
    expect(service.getCurrent(refs.product.id, refs.gray.id)).toEqual(saved.version);
    expect(db.prepare('select id, status from drawing_numbers order by id').all()).toEqual([
      { id: grayLogo.id, status: 'active' }, { id: whiteManual.id, status: 'active' },
    ]);
  });

  it('creates a replacement version without modifying the previous snapshot', () => {
    const refs = fixture();
    const grayLogo = reserveDrawing(refs, refs.product.id, refs.gray.id, refs.logo.id);
    const whiteLogo = reserveDrawing(refs, refs.product.id, refs.white.id, refs.logo.id);
    const whiteManual = reserveDrawing(refs, refs.product.id, refs.white.id, refs.manual.id);
    const first = service.saveVersion({ productId: refs.product.id, colorId: refs.gray.id,
      expectedCurrentVersionId: null, items: [
        { projectItemId: refs.logo.id, drawingId: grayLogo.id, quantity: 1, usesWhiteMaterial: false },
        { projectItemId: refs.manual.id, drawingId: whiteManual.id, quantity: 1, usesWhiteMaterial: true },
      ] });

    const second = service.saveVersion({ productId: refs.product.id, colorId: refs.gray.id,
      expectedCurrentVersionId: first.version.id, items: [
        { projectItemId: refs.logo.id, drawingId: whiteLogo.id, quantity: 1, usesWhiteMaterial: true },
      ] });

    expect(second.version).toMatchObject({ versionNumber: 2, previousVersionId: first.version.id });
    expect(second.diff.map((entry) => ({ projectItemId: entry.projectItemId, type: entry.type }))).toEqual([
      { projectItemId: refs.logo.id, type: 'replaced' },
      { projectItemId: refs.manual.id, type: 'removed' },
    ]);
    expect(service.getVersion(first.version.id).items.map((item) => item.drawingId)).toEqual([grayLogo.id, whiteManual.id]);
    expect(service.listVersions(refs.product.id, refs.gray.id).map((version) => version.versionNumber)).toEqual([2, 1]);
  });

  it('rejects cross-product, wrong-project, voided, and wrong-color drawings', () => {
    const refs = fixture();
    const other = reserveDrawing(refs, refs.otherProduct.id, refs.gray.id, refs.logo.id);
    const wrongProject = reserveDrawing(refs, refs.product.id, refs.gray.id, refs.manual.id);
    const voided = reserveDrawing(refs, refs.product.id, refs.gray.id, refs.logo.id);
    db.prepare("update drawing_numbers set status = 'voided' where id = ?").run(voided.id);
    const white = reserveDrawing(refs, refs.product.id, refs.white.id, refs.logo.id);

    const save = (drawingId: number, projectItemId = refs.logo.id, usesWhiteMaterial = false) => () => service.saveVersion({
      productId: refs.product.id, colorId: refs.gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId, drawingId, quantity: 1, usesWhiteMaterial }],
    });
    expect(save(other.id)).toThrowError(expect.objectContaining({ code: 'DRAWING_WRONG_PRODUCT' }));
    expect(save(wrongProject.id)).toThrowError(expect.objectContaining({ code: 'DRAWING_WRONG_PROJECT' }));
    expect(save(voided.id)).toThrowError(expect.objectContaining({ code: 'DRAWING_NOT_ELIGIBLE' }));
    expect(save(white.id)).toThrowError(expect.objectContaining({ code: 'DRAWING_WRONG_COLOR' }));
    expect(save(wrongProject.id, refs.manual.id, true)).toThrowError(expect.objectContaining({ code: 'WHITE_DRAWING_REQUIRED' }));
    expect(db.prepare('select count(*) as count from bom_versions').get()).toEqual({ count: 0 });
  });

  it('rejects duplicate projects and non-positive or fractional quantities', () => {
    const refs = fixture(); const drawing = reserveDrawing(refs, refs.product.id, refs.gray.id, refs.logo.id);
    const input = { productId: refs.product.id, colorId: refs.gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId: refs.logo.id, drawingId: drawing.id, quantity: 1, usesWhiteMaterial: false }] };
    expect(() => service.saveVersion({ ...input, items: [...input.items, ...input.items] }))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_PROJECT' }));
    expect(() => service.saveVersion({ ...input, items: [{ ...input.items[0], quantity: 0 }] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
    expect(() => service.saveVersion({ ...input, items: [{ ...input.items[0], quantity: 1.5 }] }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_QUANTITY' }));
  });

  it('lists only eligible direct-color or white candidates for the same product and project', () => {
    const refs = fixture();
    const grayLogo = reserveDrawing(refs, refs.product.id, refs.gray.id, refs.logo.id);
    const whiteLogo = reserveDrawing(refs, refs.product.id, refs.white.id, refs.logo.id);
    reserveDrawing(refs, refs.product.id, refs.white.id, refs.manual.id);
    reserveDrawing(refs, refs.otherProduct.id, refs.gray.id, refs.logo.id);

    expect(service.listCandidates({ productId: refs.product.id, bomColorId: refs.gray.id,
      projectItemId: refs.logo.id, usesWhiteMaterial: false }).map((item) => item.id)).toEqual([grayLogo.id]);
    expect(service.listCandidates({ productId: refs.product.id, bomColorId: refs.gray.id,
      projectItemId: refs.logo.id, usesWhiteMaterial: true }).map((item) => item.id)).toEqual([whiteLogo.id]);
    expect(() => service.listCandidates({ productId: refs.product.id, bomColorId: refs.white.id,
      projectItemId: refs.logo.id, usesWhiteMaterial: true }))
      .toThrowError(expect.objectContaining({ code: 'WHITE_DRAWING_REQUIRED' }));
  });
});
