import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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
  const product = products.create({ sku: 'TEST-FILE-SERVICE', brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id,
    model: 'ZC100', productCategory: '冰柜' });
  const planning = new PlanningService(db); const input = { productId: product.id, rows: [{ clientId: 'row', colorId: color.id,
    mainCategoryId: main.id, projectItemId: project.id }] }; const preview = planning.preview(input);
  return planning.reserve({ ...input, rows: [{ ...input.rows[0], expectedFullCode: preview.rows[0].fullCode }] })[0];
}

describe('FileService', () => {
  it('registers reliable history and leaves malformed or ambiguous codes pending', async () => {
    const workspace = join(dataDir, 'library');
    const source = join(workspace, '01.洗碗机', 'SKDWT040JP-T40', '02.未转曲源文件');
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, '02.0404.010.0401007-history.pdf'), '%PDF');
    writeFileSync(join(source, '02.0404.010.0401000-invalid.pdf'), '%PDF');
    writeFileSync(join(source, '02.0404.010.0401008_02.0404.010.0401009.pdf'), '%PDF');
    const service = new FileService(repository, settings); service.updateSettings({ workspaceRoot: workspace });

    expect(await service.scan()).toMatchObject({ total: 3, matched: 1, pending: 2, historicalRegistered: 1 });
    expect(db.prepare('select full_code from historical_drawing_numbers').all())
      .toEqual([{ full_code: '02.0404.010.0401007' }]);
    expect(service.search({ matchStatus: 'pending' }).items).toHaveLength(2);
  });
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
    expect(db.prepare('select count(content_sha256) as count from pdf_files where is_present = 1').get()).toEqual({ count: 2 });
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
    [], '2026-08-25T00:00:00.000Z');
    const scanner = vi.fn().mockRejectedValue(new Error('access denied'));

    await expect(new FileService(repository, settings, scanner).scan()).rejects.toMatchObject({ code: 'SCAN_FAILED' });
    expect(repository.search({ presence: 'present' }).items).toEqual([expect.objectContaining({ fileName: 'kept.pdf' })]);
  });

  it('treats case-only batch path variants as the same Windows batch', () => {
    const firstPath = '01.洗碗机\\SKU-T40\\03.量产后的变更文件\\01.20241210';
    const secondPath = '01.洗碗机\\sku-t40\\03.量产后的变更文件\\01.20241210';
    const record = (relativePath: string, batchPath: string) => ({
      relativePath, fileName: 'same.pdf', drawingId: null, matchStatus: 'unmatched' as const,
      detectedCodes: [], conversionType: 'outlined' as const, sizeBytes: 1, modifiedAt: '2026-08-25T00:00:00.000Z',
      materialBatch: { relativePath: batchPath, productDirectory: batchPath.split('\\03.')[0], directoryContext: null,
        name: '01.20241210', sequenceNumber: 1, businessDate: '2024-12-10', recognitionStatus: 'recognized' as const,
        classificationWarning: null },
    });

    repository.replaceScan([record(`${firstPath}\\same.pdf`, firstPath)], [], '2026-08-25T00:00:00.000Z');
    repository.replaceScan([record(`${secondPath}\\same.pdf`, secondPath)], [], '2026-08-26T00:00:00.000Z');

    expect(db.prepare('select count(*) as count from material_batches').get()).toEqual({ count: 1 });
    expect(db.prepare('select count(*) as count from pdf_files').get()).toEqual({ count: 1 });
  });

  it('rejects a concurrent scan while the first scan is still running', async () => {
    const workspace = join(dataDir, 'library'); mkdirSync(workspace); settings.setWorkspaceRoot(workspace);
    let release!: (value: []) => void; const scanner = vi.fn(() => new Promise<[]>((resolve) => { release = resolve; }));
    const service = new FileService(repository, settings, scanner); const first = service.scan();

    await expect(service.scan()).rejects.toMatchObject({ code: 'SCAN_IN_PROGRESS' });
    release([]); await first;
  });

  it('does not allow the workspace root to change during an active scan', async () => {
    const firstRoot = join(dataDir, 'first'); const secondRoot = join(dataDir, 'second');
    mkdirSync(firstRoot); mkdirSync(secondRoot); settings.setWorkspaceRoot(firstRoot);
    let release!: (value: []) => void; const scanner = vi.fn(() => new Promise<[]>((resolve) => { release = resolve; }));
    const service = new FileService(repository, settings, scanner); const scan = service.scan();

    expect(() => service.updateSettings({ workspaceRoot: secondRoot }))
      .toThrowError(expect.objectContaining({ code: 'SCAN_IN_PROGRESS' }));
    expect(settings.get().workspaceRoot).toBe(realpathSync.native(firstRoot));
    release([]); await scan;
  });

  it('reports a configured root as unavailable if it is no longer a directory', () => {
    const workspace = join(dataDir, 'library'); mkdirSync(workspace); const service = new FileService(repository, settings);
    service.updateSettings({ workspaceRoot: workspace }); rmSync(workspace, { recursive: true }); writeFileSync(workspace, 'not a directory');

    expect(service.getSettings()).toMatchObject({ configured: true, available: false });
  });

  it('does not rename, move, or rewrite scanned PDF files', async () => {
    const workspace = join(dataDir, 'library'); mkdirSync(workspace);
    const filePath = join(workspace, '02.0404.010.0401007-history.pdf'); writeFileSync(filePath, '%PDF unchanged');
    const before = statSync(filePath); const service = new FileService(repository, settings);
    service.updateSettings({ workspaceRoot: workspace });

    await service.scan();

    const after = statSync(filePath);
    expect({ size: after.size, modifiedAt: after.mtimeMs }).toEqual({ size: before.size, modifiedAt: before.mtimeMs });
  });

  it('validates cleanup IDs before removing only missing PDF index records', () => {
    repository.replaceScan([{ relativePath: 'stale.pdf', fileName: 'stale.pdf', drawingId: null, matchStatus: 'unmatched',
      detectedCodes: [], conversionType: 'source', sizeBytes: 1, modifiedAt: '2026-08-25T00:00:00.000Z' }], [], '2026-08-25T00:00:00.000Z');
    repository.replaceScan([], [], '2026-08-26T00:00:00.000Z');
    const service = new FileService(repository, settings);
    const id = service.search({ presence: 'missing' }).items[0].id;

    for (const ids of [[], [id, id], [0], Array.from({ length: 501 }, (_, index) => index + 1)]) {
      expect(() => service.cleanup(ids)).toThrowError(expect.objectContaining({ code: 'INVALID_CLEANUP_IDS' }));
    }
    expect(service.cleanup([id])).toEqual({ cleaned: 1 });
  });

  it('requires the exact confirmation phrase before clearing scan indexes', () => {
    const service = new FileService(repository, settings);

    expect(() => service.clearIndex('清空资料库')).toThrowError(expect.objectContaining({
      code: 'INVALID_CLEAR_INDEX_CONFIRMATION',
    }));
  });

  it('rejects an index clear while a scan is active', async () => {
    const workspace = join(dataDir, 'library'); mkdirSync(workspace); settings.setWorkspaceRoot(workspace);
    let release!: (value: []) => void; const scanner = vi.fn(() => new Promise<[]>((resolve) => { release = resolve; }));
    const service = new FileService(repository, settings, scanner); const activeScan = service.scan();

    expect(() => service.clearIndex('清空资料库索引')).toThrowError(expect.objectContaining({ code: 'SCAN_IN_PROGRESS' }));

    release([]); await activeScan;
  });

  it('rebuilds an empty index without duplicating historical occupancy or changing library files', async () => {
    const drawing = createDrawing(); const workspace = join(dataDir, 'library'); mkdirSync(workspace);
    const historyPath = join(workspace, '02.0404.010.0401002-history.pdf'); writeFileSync(historyPath, '%PDF unchanged');
    const service = new FileService(repository, settings); service.updateSettings({ workspaceRoot: workspace });
    expect(await service.scan()).toMatchObject({ historicalRegistered: 1, total: 1 });
    const refs = db.prepare(`select product_id as productId, color_id as colorId, main_category_id as mainCategoryId,
      project_item_id as projectItemId from drawing_numbers where id = ?`).get(drawing.id) as {
        productId: number; colorId: number; mainCategoryId: number; projectItemId: number;
      };
    const planning = new PlanningService(db);
    const nextBefore = planning.preview({ productId: refs.productId, rows: [{ clientId: 'next', colorId: refs.colorId,
      mainCategoryId: refs.mainCategoryId, projectItemId: refs.projectItemId }] }).rows[0].sequence;
    const contentBefore = readFileSync(historyPath, 'utf8'); const metadataBefore = statSync(historyPath);

    expect(service.clearIndex('清空资料库索引')).toEqual({ pdfFiles: 1, qrCodeFiles: 0, materialBatches: 0, scanChanges: 1, scanRuns: 1 });
    expect(readFileSync(historyPath, 'utf8')).toBe(contentBefore);
    expect(statSync(historyPath).mtimeMs).toBe(metadataBefore.mtimeMs);
    expect(await service.scan()).toMatchObject({ historicalRegistered: 0, total: 1 });
    expect(db.prepare('select count(*) as count from historical_drawing_numbers').get()).toEqual({ count: 1 });
    expect(planning.preview({ productId: refs.productId, rows: [{ clientId: 'next', colorId: refs.colorId,
      mainCategoryId: refs.mainCategoryId, projectItemId: refs.projectItemId }] }).rows[0].sequence).toBe(nextBefore);
  });

  it('routes QR candidates before historical parsing, tracks their presence, and clears only their index rows', async () => {
    const dictionaries = new DictionaryService(db); const products = new ProductService(db);
    const brand = dictionaries.create({ type: 'brand', code: '03', name: 'QR brand' });
    const size = dictionaries.create({ type: 'product_size', code: '0405', name: 'QR size' });
    const appearance = dictionaries.create({ type: 'appearance', code: '02', name: 'QR appearance' });
    const product = products.create({ sku: 'SKUQR', model: 'QR100', productCategory: '冰柜',
      brandId: brand.id, productSizeId: size.id, defaultAppearanceId: appearance.id });
    const workspace = join(dataDir, 'library'); const directory = join(workspace, '冰柜', 'SKUQR-QR100');
    mkdirSync(directory, { recursive: true });
    const manual = join(directory, 'QR100-User Manual（二维码的网址编码）.png');
    const warranty = join(directory, 'QR100-Warranty（网址编码）.pdf');
    const history = join(workspace, '02.0404.010.0401007-history.pdf');
    writeFileSync(manual, 'png'); writeFileSync(warranty, '%PDF warranty'); writeFileSync(history, '%PDF history');
    const service = new FileService(repository, settings); service.updateSettings({ workspaceRoot: workspace });

    expect(await service.scan()).toMatchObject({ total: 1, historicalRegistered: 1 });
    expect(db.prepare('select count(*) as count from qr_code_files where match_status = ?').get('matched')).toEqual({ count: 2 });
    expect(db.prepare('select count(*) as count from historical_drawing_numbers').get()).toEqual({ count: 1 });
    const firstCodes = db.prepare('select count(*) as count from product_qr_codes where product_id = ?').get(product.id);
    db.prepare("update qr_purposes set status = 'inactive' where english_name = 'Warranty'").run();
    await service.scan();
    expect(db.prepare(`select match_status as matchStatus, qr_code_id as qrCodeId from qr_code_files
      where file_name like 'QR100-Warranty%'`).get()).toEqual({ matchStatus: 'pending', qrCodeId: null });
    expect(db.prepare('select count(*) as count from product_qr_codes where product_id = ?').get(product.id)).toEqual(firstCodes);
    unlinkSync(manual); await service.scan();
    expect(db.prepare(`select is_present as isPresent from qr_code_files where file_name like 'QR100-User Manual%'`).get())
      .toEqual({ isPresent: 0 });
    expect(db.prepare('select count(*) as count from product_qr_codes where product_id = ?').get(product.id)).toEqual(firstCodes);

    expect(service.clearIndex('清空资料库索引')).toMatchObject({ qrCodeFiles: 2 });
    expect(db.prepare('select count(*) as count from qr_code_files').get()).toEqual({ count: 0 });
    expect(db.prepare('select count(*) as count from product_qr_codes where product_id = ?').get(product.id)).toEqual(firstCodes);
  });
});
