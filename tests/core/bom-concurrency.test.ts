import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BomService } from '../../src/core/bom/bom-service';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

const databases: PlannerDatabase[] = [];
const directories: string[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('BomService concurrent drafts', () => {
  it('accepts only one draft based on the same current version without partial activation', () => {
    const directory = mkdtempSync(join(tmpdir(), 'planner-bom-concurrency-')); directories.push(directory);
    const path = join(directory, 'planner.db'); const firstDb = openDatabase(path); databases.push(firstDb);
    migrateDatabase(firstDb, { databaseExists: false, createBackup: () => undefined });
    const dictionaries = new DictionaryService(firstDb); const products = new ProductService(firstDb);
    const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
    const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
    const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '一号外观' });
    const gray = dictionaries.create({ type: 'color', code: '1', name: '灰色' });
    const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件类' });
    const logo = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
    const manual = dictionaries.create({ type: 'project_item', code: '02', name: '说明书', parentId: main.id });
    const product = products.create({ sku: 'TEST-BOM-CONCURRENT', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
      model: 'ZC100', productCategory: '冰柜' });
    const planning = new PlanningService(firstDb);
    const reserve = (clientId: string, projectItemId: number) => {
      const input = { productId: product.id, rows: [{ clientId, colorId: gray.id,
        mainCategoryId: main.id, projectItemId }] };
      const preview = planning.preview(input);
      return planning.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
    };
    const logoDrawing = reserve('logo', logo.id); const manualDrawing = reserve('manual', manual.id);
    const secondDb = openDatabase(path); databases.push(secondDb);
    const firstService = new BomService(firstDb); const secondService = new BomService(secondDb);

    firstService.saveVersion({ productId: product.id, colorId: gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId: logo.id, drawingId: logoDrawing.id, quantity: 1, usesWhiteMaterial: false }] });
    expect(() => secondService.saveVersion({ productId: product.id, colorId: gray.id, expectedCurrentVersionId: null,
      items: [{ projectItemId: manual.id, drawingId: manualDrawing.id, quantity: 1, usesWhiteMaterial: false }] }))
      .toThrowError(expect.objectContaining({ code: 'BOM_STALE' }));

    expect(firstDb.prepare('select count(*) as count from bom_versions').get()).toEqual({ count: 1 });
    expect(firstDb.prepare('select id, status from drawing_numbers order by id').all()).toEqual([
      { id: logoDrawing.id, status: 'active' }, { id: manualDrawing.id, status: 'reserved' },
    ]);
  });
});
