import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OutboundPackageService, OutboundPackageError, type OutboundArchiveWriter } from '../../src/core/outbound/outbound-package-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { TaskRegistry } from '../../src/core/tasks/task-registry';

let db: PlannerDatabase;
let root: string;
let workspace: string;
let output: string;
let productId: number;
let batchId: number;
let pdfId: number;
let service: OutboundPackageService;
const now = '2026-09-10T01:30:00.000Z';
const fixedNow = () => new Date(2026, 8, 10, 9, 30);

function dictionary(type: string, code: string, name: string, parentId: number | null = null): number {
  return Number(db.prepare(`insert into dictionary_items (type, code, name, parent_id, status, created_at)
    values (?, ?, ?, ?, 'active', ?)`).run(type, code, name, parentId, now).lastInsertRowid);
}

function addOutlined(options: { relativePath?: string; conversionType?: 'source' | 'outlined'; present?: boolean;
  batch?: number; fullCode?: string } = {}): number {
  const fullCode = options.fullCode ?? '02.0209.010.0401001';
  db.prepare(`insert or ignore into historical_drawing_numbers
    (full_code, brand_code, product_size_code, appearance_code, color_code, main_category_code,
     project_item_code, sequence, product_id, first_seen_at, last_seen_at)
    values (?, '02', '0209', '01', '0', '04', '01', 1, ?, ?, ?)`).run(fullCode, productId, now, now);
  const historicalId = (db.prepare('select id from historical_drawing_numbers where full_code = ?').get(fullCode) as { id: number }).id;
  const path = options.relativePath ?? '01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件\\00.首批大货\\manual（转曲）.pdf';
  const absolute = join(workspace, path);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, 'outlined fixture');
  return Number(db.prepare(`insert into pdf_files
    (relative_path, path_key, material_batch_id, file_name, historical_drawing_id, match_status,
     detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present, content_sha256)
    values (?, lower(?), ?, ?, ?, 'matched', '[]', ?, 16, ?, ?, ?, 'fixture-hash')`)
    .run(path, path, options.batch ?? batchId, path.split('\\').at(-1), historicalId, options.conversionType ?? 'outlined', now, now,
      options.present === false ? 0 : 1).lastInsertRowid);
}

function addBatch(name: string, sequence: number): number {
  return Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, product_id, name, sequence_number, business_date,
     recognition_status, is_present, first_seen_at, last_seen_at)
    values (?, '01.洗碗机\\SKDWT040JP-T40', ?, ?, ?, null, 'recognized', 1, ?, ?)`)
    .run(`01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件\\${name}`, productId, name, sequence, now, now).lastInsertRowid);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'outbound-package-'));
  workspace = join(root, 'workspace'); output = join(root, 'exports');
  mkdirSync(workspace); mkdirSync(output);
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const brandId = dictionary('brand', '02', 'SAMKYO');
  const sizeId = dictionary('product_size', '0209', '洗碗机');
  const appearanceId = dictionary('appearance', '01', '标准');
  const mainId = dictionary('main_category', '04', '印刷件类');
  dictionary('project_item', '01', '说明书', mainId);
  productId = Number(db.prepare(`insert into products
    (brand_id, product_size_id, default_appearance_id, sku, model, product_category, status, created_at)
    values (?, ?, ?, 'SKDWT040JP', 'T40', '洗碗机', 'active', ?)`)
    .run(brandId, sizeId, appearanceId, now).lastInsertRowid);
  batchId = Number(db.prepare(`insert into material_batches
    (relative_path, product_directory, product_id, name, sequence_number, business_date,
     recognition_status, is_present, first_seen_at, last_seen_at)
    values ('01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件\\00.首批大货',
      '01.洗碗机\\SKDWT040JP-T40', ?, '00.首批大货', 0, null, 'recognized', 1, ?, ?)`)
    .run(productId, now, now).lastInsertRowid);
  pdfId = addOutlined();
  service = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output, now: fixedNow });
});

afterEach(() => { if (db.open) db.close(); rmSync(root, { recursive: true, force: true }); });

const request = () => ({ productId, selectedMaterialBatchId: batchId, materialType: 'initial' as const,
  packageMode: 'current_complete' as const });

describe('OutboundPackageService', () => {
  it('previews current complete materials with database-derived identity and an opaque version token', () => {
    const preview = service.previewPackage(request());
    expect(preview.packageName).toBe('D&D - SAMKYO T40洗碗机 【包材资料-2026年9月10日】');
    expect(preview.previewToken).toMatch(/^[a-f0-9-]{20,}$/i);
    expect(preview.items).toEqual([expect.objectContaining({ pdfFileId: pdfId, projectItemName: '说明书',
      fullCode: '02.0209.010.0401001', sourceBatchName: '00.首批大货', status: 'normal', selectable: true })]);
  });

  it('includes only genuinely changed slots in change-only mode', () => {
    const nextBatch = Number(db.prepare(`insert into material_batches
      (relative_path, product_directory, product_id, name, sequence_number, business_date,
       recognition_status, is_present, first_seen_at, last_seen_at)
      values ('01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件\\01.20260910',
        '01.洗碗机\\SKDWT040JP-T40', ?, '01.20260910', 1, '2026-09-10', 'recognized', 1, ?, ?)`)
      .run(productId, now, now).lastInsertRowid);
    const nextPath = '01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件\\01.20260910\\manual-copy（转曲）.pdf';
    addOutlined({ relativePath: nextPath, batch: nextBatch });

    expect(() => service.previewPackage({ ...request(), selectedMaterialBatchId: nextBatch, materialType: 'update',
      packageMode: 'change_only' })).toThrowError(expect.objectContaining({ code: 'PACKAGE_EMPTY' }));
  });

  it('does not offer a source file as an outbound package item', () => {
    db.prepare("update pdf_files set conversion_type = 'source' where id = ?").run(pdfId);
    expect(() => service.previewPackage(request())).toThrowError(expect.objectContaining({ code: 'PACKAGE_EMPTY' }));
  });

  it('shows a missing outlined material in preview and blocks package creation', async () => {
    db.prepare('update pdf_files set is_present = 0 where id = ?').run(pdfId);
    const preview = service.previewPackage(request());
    expect(preview.items).toEqual([expect.objectContaining({ fullCode: '02.0209.010.0401001',
      status: 'missing', selectable: false })]);
    await expect(service.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [] })).rejects.toThrowError(expect.objectContaining({ code: 'PACKAGE_HAS_BLOCKERS' }));
  });

  it('turns a physically deleted current file into a structured missing preview item', () => {
    const indexed = db.prepare('select relative_path as path from pdf_files where id = ?').get(pdfId) as { path: string };
    rmSync(join(workspace, indexed.path));
    expect(service.previewPackage(request()).items).toEqual([expect.objectContaining({
      pdfFileId: pdfId, status: 'missing', selectable: false,
    })]);
  });

  it('does not fail a current preview because an unrelated superseded historical file disappeared', () => {
    const old = db.prepare('select relative_path as path from pdf_files where id = ?').get(pdfId) as { path: string };
    rmSync(join(workspace, old.path));
    const nextBatch = addBatch('01.20260910', 1);
    const replacementId = addOutlined({ batch: nextBatch, fullCode: '02.0209.010.0401002',
      relativePath: '01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件\\01.20260910\\manual-v2（转曲）.pdf' });
    expect(service.previewPackage({ ...request(), selectedMaterialBatchId: nextBatch }).items)
      .toEqual([expect.objectContaining({ pdfFileId: replacementId, status: 'normal', selectable: true })]);
  });

  it('shows a same-slot drawing conflict and refuses to hide it by deselection', async () => {
    addOutlined({ fullCode: '02.0209.010.0401002',
      relativePath: '01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件\\00.首批大货\\manual-v2（转曲）.pdf' });
    const preview = service.previewPackage(request());
    expect(preview.items).toEqual([expect.objectContaining({ status: 'conflict', selectable: false,
      conflictFullCodes: ['02.0209.010.0401001', '02.0209.010.0401002'] })]);
    await expect(service.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [] })).rejects.toThrowError(expect.objectContaining({ code: 'PACKAGE_HAS_BLOCKERS' }));
  });

  it('rejects a canonical path that escapes through a filesystem link', () => {
    const externalDir = join(root, 'outside'); mkdirSync(externalDir); writeFileSync(join(externalDir, 'escape.pdf'), 'outside');
    symlinkSync(externalDir, join(workspace, 'linked-outside'), 'junction');
    db.prepare(`update pdf_files set relative_path = 'linked-outside\\escape.pdf', path_key = 'linked-outside\\escape.pdf',
      file_name = 'escape.pdf' where id = ?`).run(pdfId);
    expect(() => service.previewPackage(request())).toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));
  });

  it('rejects two indexes resolving to the same canonical actual path', () => {
    const original = db.prepare('select relative_path as path from pdf_files where id = ?').get(pdfId) as { path: string };
    const originalDirectory = join(workspace, original.path, '..');
    symlinkSync(originalDirectory, join(workspace, 'same-directory'), 'junction');
    const alias = 'same-directory\\manual（转曲）.pdf';
    const aliasId = addOutlined({ relativePath: alias });
    db.prepare('update pdf_files set material_batch_id = ? where id = ?').run(batchId, aliasId);
    expect(() => service.previewPackage(request())).toThrowError(expect.objectContaining({ code: 'DUPLICATE_ACTUAL_PATH' }));
  });

  it('rejects an indexed filename that could escape the ZIP when extracted', () => {
    db.prepare("update pdf_files set file_name = '..\\escape.pdf' where id = ?").run(pdfId);
    expect(() => service.previewPackage(request())).toThrowError(expect.objectContaining({ code: 'UNSAFE_ARCHIVE_ENTRY' }));
  });

  it('rejects a stale preview after the indexed file state changes', async () => {
    const preview = service.previewPackage(request());
    db.prepare('update pdf_files set is_present = 0 where id = ?').run(pdfId);
    await expect(service.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrowError(expect.objectContaining({ code: 'PREVIEW_STALE' }));
    expect(readdirSync(output)).toEqual([]);
  });

  it('rejects creation as stale when the physical file disappears after preview', async () => {
    const preview = service.previewPackage(request());
    const indexed = db.prepare('select relative_path as path from pdf_files where id = ?').get(pdfId) as { path: string };
    rmSync(join(workspace, indexed.path));
    await expect(service.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrowError(expect.objectContaining({ code: 'PREVIEW_STALE' }));
    expect(readdirSync(output)).toEqual([]);
  });

  it('expires preview tokens after the configured TTL', async () => {
    let clock = new Date(2026, 8, 10, 9, 30);
    const expiring = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output,
      now: () => clock, previewTokenTtlMs: 1_000 });
    const preview = expiring.previewPackage(request());
    clock = new Date(clock.getTime() + 1_001);
    await expect(expiring.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrowError(expect.objectContaining({ code: 'PREVIEW_STALE' }));
  });

  it('evicts the oldest token when the bounded preview cache is full', async () => {
    const bounded = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output,
      now: fixedNow, maxPreviewTokens: 2 });
    const oldest = bounded.previewPackage(request());
    bounded.previewPackage(request());
    const newest = bounded.previewPackage(request());
    await expect(bounded.createPackage({ ...request(), previewToken: oldest.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrowError(expect.objectContaining({ code: 'PREVIEW_STALE' }));
    await expect(bounded.createPackage({ ...request(), previewToken: newest.previewToken,
      selectedPdfFileIds: [pdfId] })).resolves.toEqual(expect.objectContaining({ fileCount: 1 }));
  });

  it('never writes an outbound archive inside the read-only source workspace', async () => {
    const unsafe = new OutboundPackageService(db, { workspaceRoot: () => workspace,
      outputRoot: () => workspace, now: fixedNow });
    const preview = unsafe.previewPackage(request());
    await expect(unsafe.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrowError(expect.objectContaining({ code: 'OUTPUT_INSIDE_WORKSPACE' }));
    expect(readdirSync(workspace).some((name) => name.endsWith('.zip') || name.endsWith('.tmp'))).toBe(false);
  });

  it('publishes one complete ZIP atomically and saves its immutable package-item snapshot', async () => {
    const preview = service.previewPackage(request());
    const created = await service.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] });

    expect(created.fileCount).toBe(1);
    expect(created.zipRelativePath).toBe(`${preview.packageName}.zip`);
    expect(existsSync(join(output, created.zipRelativePath))).toBe(true);
    expect(readdirSync(output).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    expect(readFileSync(join(output, created.zipRelativePath)).includes(Buffer.from('manual'))).toBe(true);
    expect(db.prepare('select status, zip_relative_path from outbound_packages where id = ?').get(created.id))
      .toEqual({ status: 'completed', zip_relative_path: created.zipRelativePath });
    expect(db.prepare(`select pdf_file_id, source_batch_name_snapshot, relative_path_snapshot
      from outbound_package_items where package_id = ?`).get(created.id)).toEqual({
      pdf_file_id: pdfId, source_batch_name_snapshot: '00.首批大货',
      relative_path_snapshot: (db.prepare('select relative_path as path from pdf_files where id = ?').get(pdfId) as { path: string }).path,
    });
  });

  it('allows only one same-name concurrent publisher and leaves no claim or temporary files', async () => {
    const firstPreview = service.previewPackage(request());
    const secondPreview = service.previewPackage(request());
    const results = await Promise.allSettled([
      service.createPackage({ ...request(), previewToken: firstPreview.previewToken, selectedPdfFileIds: [pdfId] }),
      service.createPackage({ ...request(), previewToken: secondPreview.previewToken, selectedPdfFileIds: [pdfId] }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected').map((result) => (result as PromiseRejectedResult).reason))
      .toEqual([expect.objectContaining({ code: 'OUTPUT_ALREADY_EXISTS' })]);
    expect(readdirSync(output).filter((name) => name.endsWith('.tmp') || name.endsWith('.claim'))).toEqual([]);
    expect(readdirSync(output).filter((name) => name.endsWith('.zip'))).toHaveLength(1);
  });

  it('cleans the closed temporary archive and claim when atomic rename fails', async () => {
    const writer: OutboundArchiveWriter = { write: async ({ temporaryPath, entries }) => {
      writeFileSync(temporaryPath, 'complete but removed before publish');
      rmSync(temporaryPath);
      return entries.length;
    } };
    const failing = new OutboundPackageService(db, { workspaceRoot: () => workspace,
      outputRoot: () => output, now: fixedNow, archiveWriter: writer });
    const preview = failing.previewPackage(request());
    await expect(failing.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrowError(expect.objectContaining({ code: 'PACKAGE_PUBLISH_FAILED' }));
    expect(readdirSync(output)).toEqual([]);
  });

  it.each([
    ['SAM/KYO', 'T40', '洗碗机'],
    ['SAMKYO', 'T40.', '洗碗机'],
    ['SAMKYO', 'T40', 'CON'],
  ])('rejects unsafe Windows package-name component %s / %s / %s', (brand, model, category) => {
    db.prepare('update dictionary_items set name = ? where id = (select brand_id from products where id = ?)')
      .run(brand, productId);
    db.prepare('update products set model = ?, product_category = ? where id = ?').run(model, category, productId);
    expect(() => service.previewPackage(request())).toThrowError(expect.objectContaining({ code: 'UNSAFE_PACKAGE_NAME' }));
  });

  it('consumes a preview token after successful generation', async () => {
    const preview = service.previewPackage(request());
    await service.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: [pdfId] });
    await expect(service.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrowError(expect.objectContaining({ code: 'PREVIEW_STALE' }));
  });

  it('leaves no final or temporary archive when cancellation interrupts a partial write', async () => {
    const writer: OutboundArchiveWriter = { write: async ({ temporaryPath, signal }) => {
      writeFileSync(temporaryPath, 'partial');
      await new Promise<void>((_resolve, reject) => signal?.addEventListener('abort', () => reject(signal.reason), { once: true }));
      return 0;
    } };
    const cancellable = new OutboundPackageService(db, { workspaceRoot: () => workspace,
      outputRoot: () => output, now: fixedNow, archiveWriter: writer });
    const preview = cancellable.previewPackage(request());
    const controller = new AbortController();
    const operation = cancellable.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] }, { signal: controller.signal });
    controller.abort(new Error('cancelled'));
    await expect(operation).rejects.toThrow();
    expect(readdirSync(output)).toEqual([]);
    expect(db.prepare('select count(*) as count from outbound_packages').get()).toEqual({ count: 0 });
  });

  it('runs as a cancellable registered task and writes owned claim metadata only while active', async () => {
    let release!: () => void;
    let claimText = '';
    const writer: OutboundArchiveWriter = { write: async ({ temporaryPath, signal }) => {
      writeFileSync(temporaryPath, 'partial');
      const claim = readdirSync(output).find((name) => name.endsWith('.claim'))!;
      claimText = readFileSync(join(output, claim), 'utf8');
      await new Promise<void>((resolve) => { release = resolve; });
      signal?.throwIfAborted();
      return 1;
    } };
    const cancellable = new OutboundPackageService(db, { workspaceRoot: () => workspace,
      outputRoot: () => output, now: fixedNow, archiveWriter: writer });
    const preview = cancellable.previewPackage(request());
    const registry = new TaskRegistry();
    registry.register('outbound_package', (_payload, context) => cancellable.createPackage({ ...request(),
      previewToken: preview.previewToken, selectedPdfFileIds: [pdfId] }, {
      signal: context.signal, taskId: context.id, onFinalizing: () => context.beginFinalizing(),
    }));
    const task = registry.create('outbound_package', {}); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(JSON.parse(claimText)).toMatchObject({ taskId: task.id, lifecycle: 'active' });
    registry.cancel(task.id); release(); await registry.wait(task.id);
    expect(registry.get(task.id)?.status).toBe('cancelled');
    expect(readdirSync(output)).toEqual([]);
    expect(db.prepare('select count(*) as count from outbound_packages').get()).toEqual({ count: 0 });
  });

  it('removes the published archive when the database transaction fails', async () => {
    db.exec(`create trigger reject_outbound_package before insert on outbound_packages
      begin select raise(abort, 'fixture database failure'); end`);
    const preview = service.previewPackage(request());
    await expect(service.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] })).rejects.toThrow('fixture database failure');
    expect(readdirSync(output)).toEqual([]);
  });
});
