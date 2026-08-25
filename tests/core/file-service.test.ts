import { mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { PlanningService } from '../../src/core/planning/planning-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase; let repository: FileRepository; let dataDir: string; let settings: WorkspaceSettingsStore;
beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  repository = new FileRepository(db); dataDir = mkdtempSync(join(tmpdir(), 'planner-file-service-'));
  settings = new WorkspaceSettingsStore(join(dataDir, 'settings.json'));
});
afterEach(() => db.close());

function createDrawing() {
  const dictionaries = new DictionaryService(db); const products = new ProductService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: '冰柜' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '外观' });
  const color = dictionaries.create({ type: 'color', code: '0', name: '白色' });
  const main = dictionaries.create({ type: 'main_category', code: '04', name: '印刷件' });
  const project = dictionaries.create({ type: 'project_item', code: '01', name: 'LOGO', parentId: main.id });
  const product = products.create({ brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC100', productCategory: '冰柜' });
  const planning = new PlanningService(db); const input = { productId: product.id, rows: [{ clientId: 'row', colorId: color.id,
    mainCategoryId: main.id, projectItemId: project.id }] }; const preview = planning.preview(input);
  return planning.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
}

describe('FileService', () => {
  it('requires a configured workspace before scanning', async () => {
    await expect(new FileService(repository, settings).scan())
      .rejects.toMatchObject({ code: 'WORKSPACE_NOT_CONFIGURED' });
  });

  it('scans real files, matches drawings, and marks absent files missing on the next complete scan', async () => {
    const drawing = createDrawing(); const workspace = join(dataDir, 'library'); mkdirSync(workspace);
    writeFileSync(join(workspace, `${drawing.fullCode}-LOGO.pdf`), '%PDF source');
    writeFileSync(join(workspace, `${drawing.fullCode}-LOGO（转曲）.PDF`), '%PDF outlined');
    const service = new FileService(repository, settings); service.updateSettings({ workspaceRoot: workspace });

    expect(await service.scan()).toMatchObject({ total: 2, matched: 2, unmatched: 0, conflict: 0, source: 1, outlined: 1, missing: 0 });
    unlinkSync(join(workspace, `${drawing.fullCode}-LOGO.pdf`));
    expect(await service.scan()).toMatchObject({ total: 1, matched: 1, missing: 1 });
    expect(service.search({ presence: 'missing' }).items).toEqual([
      expect.objectContaining({ fileName: `${drawing.fullCode}-LOGO.pdf`, isPresent: false }),
    ]);
  });

  it('does not alter the previous index when filesystem enumeration fails', async () => {
    const workspace = join(dataDir, 'library'); mkdirSync(workspace); settings.setWorkspaceRoot(workspace);
    repository.replaceScan([{ relativePath: 'kept.pdf', fileName: 'kept.pdf', drawingId: null, matchStatus: 'unmatched',
      detectedCodes: [], conversionType: 'source', sizeBytes: 1, modifiedAt: '2026-08-25T00:00:00.000Z' }],
    '2026-08-25T00:00:00.000Z');
    const scanner = vi.fn().mockRejectedValue(new Error('access denied'));

    await expect(new FileService(repository, settings, scanner).scan()).rejects.toMatchObject({ code: 'SCAN_FAILED' });
    expect(repository.search({ presence: 'present' }).items).toEqual([expect.objectContaining({ fileName: 'kept.pdf' })]);
  });

  it('rejects a concurrent scan while the first scan is still running', async () => {
    const workspace = join(dataDir, 'library'); mkdirSync(workspace); settings.setWorkspaceRoot(workspace);
    let release!: (value: []) => void; const scanner = vi.fn(() => new Promise<[]>((resolve) => { release = resolve; }));
    const service = new FileService(repository, settings, scanner); const first = service.scan();

    await expect(service.scan()).rejects.toMatchObject({ code: 'SCAN_IN_PROGRESS' });
    release([]); await first;
  });
});
