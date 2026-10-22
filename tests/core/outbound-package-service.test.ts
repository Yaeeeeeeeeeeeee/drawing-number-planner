import { BomService } from '../../src/core/bom/bom-service';
import { ensureProductAppearance } from '../../src/core/products/appearance-identity';
import { AppearanceService } from '../../src/core/products/appearance-service';
import { closeSync, existsSync, ftruncateSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { cleanupStaleOutboundArtifacts } from '../../src/core/outbound/outbound-artifact-ownership';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ArchiverOutboundArchiveWriter, OutboundPackageService, OutboundPackageError, type OutboundArchiveWriter,
  type OutboundClaimFileOperations } from '../../src/core/outbound/outbound-package-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { TaskRegistry } from '../../src/core/tasks/task-registry';
import { ProductCleanupService } from '../../src/core/products/product-cleanup-service';

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
  db = openDatabase(join(root,'planner.sqlite'));
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

// Independent ZIP32 reader for the real writer's small test archives; never extracts to disk.
function decodedZipEntries(path: string): Map<string, Buffer> {
  const zip = readFileSync(path);
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  expect(end).toBeGreaterThanOrEqual(0);
  const count = zip.readUInt16LE(end + 10);
  let cursor = zip.readUInt32LE(end + 16);
  const entries = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    expect(zip.readUInt32LE(cursor)).toBe(0x02014b50);
    const method = zip.readUInt16LE(cursor + 10);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const local = zip.readUInt32LE(cursor + 42);
    const name = zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    expect(entries.has(name)).toBe(false);
    expect(zip.readUInt32LE(local)).toBe(0x04034b50);
    const start = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const compressed = zip.subarray(start, start + compressedSize);
    expect([0, 8]).toContain(method);
    const decoded = method === 8 ? inflateRawSync(compressed) : compressed;
    expect(decoded.length).toBe(zip.readUInt32LE(cursor + 24));
    entries.set(name, decoded);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

describe('OutboundPackageService', () => {
  it('packages only the selected appearance effective BOM and freezes its identity and correction facts', async()=>{
    ensureProductAppearance(db,productId);
    const oldAppearance=(db.prepare("select id from product_appearance_versions where product_id=?").get(productId) as {id:number}).id;
    const project=(db.prepare("select id from dictionary_items where type='project_item' limit 1").get() as {id:number}).id;
    const oldDrawing=(db.prepare('select id from historical_drawing_numbers limit 1').get() as {id:number}).id;
    const boms=new BomService(db);
    const old=boms.saveVersion({productId,appearanceVersionId:oldAppearance,entryMode:'historical',businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[{projectItemId:project,drawingReference:{origin:'historical',historicalDrawingId:oldDrawing},usesWhiteMaterial:false,effectiveMaterialBatchId:batchId,changeDetails:'旧版'}]}).version;
    const nextId=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,2,'第二外观','draft','2026-10-20')").run(productId).lastInsertRowid);
    const nextPdf=addOutlined({fullCode:'02.0209.020.0401001',relativePath:'new-appearance.pdf'});
    const nextDrawing=(db.prepare("select id from historical_drawing_numbers where full_code='02.0209.020.0401001'").get() as {id:number}).id;
    const next=boms.saveVersion({productId,appearanceVersionId:nextId,entryMode:'historical',businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[{projectItemId:project,drawingReference:{origin:'historical',historicalDrawingId:nextDrawing},usesWhiteMaterial:false,effectiveMaterialBatchId:batchId,changeDetails:'新版'}]}).version;
    const input={...request(),appearanceVersionId:nextId};
    const preview=service.previewPackage(input);
    expect(preview.items).toEqual([expect.objectContaining({pdfFileId:nextPdf,fullCode:'02.0209.020.0401001',selectable:true})]);
    const completed=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[nextPdf]});
    const frozen=()=> (db.prepare('select product_identity_json as json from outbound_packages where id=?').get(completed.id) as {json:string}).json;
    const original=frozen();expect(JSON.parse(original).appearanceContext.bom.id).toBe(next.id);
    boms.updateVersion(next.id,{productId,appearanceVersionId:nextId,entryMode:'historical',expectedCurrentVersionId:next.id,items:[{projectItemId:project,drawingReference:{origin:'historical',historicalDrawingId:nextDrawing},usesWhiteMaterial:false,effectiveMaterialBatchId:batchId,changeDetails:'纠错'}]},0);
    expect(frozen()).toBe(original);expect(boms.getCurrent(productId,oldAppearance)?.id).toBe(old.id);
  });

  it('never records half a multipart publication as completed after abrupt process exit', async () => {
    const main = db.prepare("select id from dictionary_items where type = 'main_category'").get() as { id: number };
    dictionary('project_item', '02', '售后卡', main.id);
    const second = addOutlined({ relativePath: 'card.pdf', fullCode: '02.0209.010.0402001' });
    db.exec("update historical_drawing_numbers set project_item_code = substr(full_code, 15, 2)");
    for (const id of [pdfId, second]) {
      const row = db.prepare('select relative_path from pdf_files where id = ?').get(id) as { relative_path: string };
      const fd = openSync(join(workspace, row.relative_path), 'r+');
      try { ftruncateSync(fd, 30_000_000); } finally { closeSync(fd); }
    }
    await db.backup(join(root, 'crash.sqlite'));
    const child = spawnSync(process.execPath, ['--import', 'tsx',
      join(process.cwd(), 'tests/fixtures/crash-outbound-publication.ts'), root,
      String(productId), String(batchId), JSON.stringify([pdfId, second])], { encoding: 'utf8', timeout: 15_000 });
    expect(child.error, child.stderr).toBeUndefined();
    expect(child.status, child.stderr).toBe(79);
    const recovered = openDatabase(join(root, 'crash.sqlite'));
    try {
      expect(recovered.prepare('select count(*) as total from outbound_packages').get()).toEqual({ total: 0 });
      expect(recovered.prepare('select count(*) as total from outbound_package_parts').get()).toEqual({ total: 0 });
      expect(recovered.pragma('integrity_check')).toEqual([{ integrity_check: 'ok' }]);
    } finally { recovered.close(); }
    const published = readdirSync(output).filter((name) => name.endsWith('.zip'));
    expect(published).toHaveLength(1);
    const hash = createHash('sha256').update(readFileSync(join(output, published[0]))).digest('hex');
    const cleanup = cleanupStaleOutboundArtifacts(output, { activeTaskIds: new Set(),
      nowMs: Date.parse('2026-09-11T00:00:00Z'), minimumAgeMs: 3_600_000 });
    expect(cleanup).toEqual({ claimsRemoved: 2, temporaryFilesRemoved: 2 });
    expect(readdirSync(output)).toEqual(published);
    expect(createHash('sha256').update(readFileSync(join(output, published[0]))).digest('hex')).toBe(hash);
    const preview = service.previewPackage(request());
    await expect(service.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: [pdfId, second] }))
      .rejects.toThrowError(expect.objectContaining({ code: 'OUTPUT_ALREADY_EXISTS' }));
  }, 20_000);

  it('does not overwrite an unrelated ZIP created after preflight but before publication', async () => {
    const preview = service.previewPackage(request());
    const finalPath = join(output, `${preview.packageName}.zip`);
    const raced = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output, now: fixedNow,
      archiveWriter: { async write({ temporaryPath, entries }) {
        writeFileSync(temporaryPath, 'new package');
        writeFileSync(finalPath, 'existing external file', { flag: 'wx' });
        return entries.length;
      } } });
    const fresh = raced.previewPackage(request());
    await expect(raced.createPackage({ ...request(), previewToken: fresh.previewToken, selectedPdfFileIds: [pdfId] }))
      .rejects.toThrow();
    expect(readFileSync(finalPath, 'utf8')).toBe('existing external file');
    expect(db.prepare('select count(*) as total from outbound_packages').get()).toEqual({ total: 0 });
    expect(readdirSync(output)).toEqual([`${preview.packageName}.zip`]);
  });

  it('decodes every real multipart ZIP to the exact original bytes without changing the sources', async () => {
    const main = db.prepare("select id from dictionary_items where type = 'main_category'").get() as { id: number };
    dictionary('project_item', '02', '售后卡', main.id); dictionary('project_item', '03', '外箱', main.id);
    const ids = [pdfId, addOutlined({ relativePath: 'card.pdf', fullCode: '02.0209.010.0402001' }),
      addOutlined({ relativePath: 'box.pdf', fullCode: '02.0209.010.0403001' })];
    db.exec("update historical_drawing_numbers set project_item_code = substr(full_code, 15, 2)");
    const originals = ids.map((id, index) => {
      const row = db.prepare('select relative_path, file_name from pdf_files where id = ?').get(id) as { relative_path: string; file_name: string };
      const path = join(workspace, row.relative_path);
      const fd = openSync(path, 'r+');
      try { ftruncateSync(fd, [22_000_000, 5_000_000, 31_000_000][index]); } finally { closeSync(fd); }
      return { path, name: row.file_name, hash: createHash('sha256').update(readFileSync(path)).digest('hex') };
    });
    const preview = service.previewPackage(request());
    const result = await service.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: ids });
    expect(result.parts).toHaveLength(2);
    const decoded = result.parts!.map((part) => {
      expect(statSync(join(output, part.zipRelativePath)).size).toBeLessThanOrEqual(50_000_000);
      return decodedZipEntries(join(output, part.zipRelativePath));
    });
    expect(decoded.map((entries) => entries.size)).toEqual([2, 1]);
    const all = decoded.flatMap((entries) => [...entries]);
    expect(all.map(([name]) => name).sort()).toEqual(originals.map((item) => item.name).sort());
    for (const original of originals) {
      const bytes = all.find(([name]) => name === original.name)![1];
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(original.hash);
      expect(createHash('sha256').update(readFileSync(original.path)).digest('hex')).toBe(original.hash);
    }
  });

  for (const failure of ['write failure', 'cancellation'] as const) {
    it(`leaves no partial multi-package history or files after ${failure} in the final part`, async () => {
      const main = db.prepare("select id from dictionary_items where type = 'main_category'").get() as { id: number };
      dictionary('project_item', '02', '售后卡', main.id);
      const second = addOutlined({ relativePath: 'card.pdf', fullCode: '02.0209.010.0402001' });
      writeFileSync(join(output, 'keep.txt'), 'do not touch');
      const controller = new AbortController();
      let calls = 0;
      const grouped = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output, now: fixedNow,
        archiveWriter: { async write({ temporaryPath, entries }) {
          calls += 1;
          const fd = openSync(temporaryPath, 'wx');
          try { ftruncateSync(fd, entries.length > 1 ? 50_000_001 : 100); } finally { closeSync(fd); }
          if (calls === 3) {
            if (failure === 'write failure') throw new Error('second part failed');
            controller.abort(new Error('user cancelled'));
          }
          return entries.length;
        } } });
      const preview = grouped.previewPackage(request());
      await expect(grouped.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: [pdfId, second] },
        { signal: controller.signal })).rejects.toThrow(failure === 'write failure' ? 'second part failed' : 'user cancelled');
      expect(readdirSync(output)).toEqual(['keep.txt']);
      expect(db.prepare('select count(*) as total from outbound_packages').get()).toEqual({ total: 0 });
      expect(db.prepare('select count(*) as total from outbound_package_parts').get()).toEqual({ total: 0 });
      expect(readFileSync(join(output, 'keep.txt'), 'utf8')).toBe('do not touch');
    });
  }
  it('regroups when measured ZIP size exceeds the target and publishes only the final parts', async () => {
    const main = db.prepare("select id from dictionary_items where type = 'main_category'").get() as { id: number };
    dictionary('project_item', '02', '售后卡', main.id);
    const second = addOutlined({ relativePath: 'card.pdf', fullCode: '02.0209.010.0402001' });
    const grouped = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output, now: fixedNow,
      archiveWriter: { async write({ temporaryPath, entries }) {
        const fd = openSync(temporaryPath, 'wx');
        try { ftruncateSync(fd, entries.length > 1 ? 50_000_001 : 100); } finally { closeSync(fd); }
        return entries.length;
      } } });
    const preview = grouped.previewPackage(request());
    const result = await grouped.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: [pdfId, second] });
    expect(readdirSync(output).sort()).toEqual([`${result.packageName}-1.zip`, `${result.packageName}-2.zip`]);
    expect(db.prepare('select size_bytes from outbound_package_parts order by part_number').all()).toEqual([{ size_bytes: 100 }, { size_bytes: 100 }]);
  });
  it('publishes whole-file groups as two numbered ZIPs in one completed business package', async () => {
    const main = db.prepare("select id from dictionary_items where type = 'main_category'").get() as { id: number };
    dictionary('project_item', '02', '售后卡', main.id); dictionary('project_item', '03', '外箱', main.id);
    const ids = [pdfId, addOutlined({ relativePath: 'card.pdf', fullCode: '02.0209.010.0402001' }),
      addOutlined({ relativePath: 'box.pdf', fullCode: '02.0209.010.0403001' })];
    db.exec("update historical_drawing_numbers set project_item_code = substr(full_code, 15, 2)");
    ids.forEach((id, index) => {
      const row = db.prepare('select relative_path from pdf_files where id = ?').get(id) as { relative_path: string };
      const fd = openSync(join(workspace, row.relative_path), 'r+');
      try { ftruncateSync(fd, [22_000_000, 5_000_000, 31_000_000][index]); } finally { closeSync(fd); }
    });
    const written: string[][] = [];
    const grouped = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output, now: fixedNow,
      archiveWriter: { async write({ temporaryPath, entries }) {
        written.push(entries.map((entry) => entry.archiveName)); writeFileSync(temporaryPath, 'ZIP fixture'); return entries.length;
      } } });
    const preview = grouped.previewPackage(request());
    const result = await grouped.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: ids });
    expect(written.map((part) => part.length)).toEqual([2, 1]);
    expect(written.flat().sort()).toEqual(['manual（转曲）.pdf', 'card.pdf', 'box.pdf'].sort());
    expect(readdirSync(output).sort()).toEqual([`${result.packageName}-1.zip`, `${result.packageName}-2.zip`]);
    expect(db.prepare('select part_number from outbound_package_parts where package_id = ? order by part_number').all(result.id))
      .toEqual([{ part_number: 1 }, { part_number: 2 }]);
    expect(db.prepare('select count(*) as total from outbound_packages').get()).toEqual({ total: 1 });
  });
  it('registers the measured first ZIP part together with the completed package', async () => {
    const preview = service.previewPackage(request());
    const result = await service.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: [pdfId] });
    expect(db.prepare('select part_number, zip_relative_path, size_bytes from outbound_package_parts where package_id = ?')
      .all(result.id)).toEqual([{ part_number: 1, zip_relative_path: result.zipRelativePath,
        size_bytes: statSync(join(output, result.zipRelativePath)).size }]);
  });
  it('rejects an oversized actual source before creating any ZIP or history record', () => {
    const row = db.prepare('select relative_path from pdf_files where id = ?').get(pdfId) as { relative_path: string };
    const descriptor = openSync(join(workspace, row.relative_path), 'r+');
    try { ftruncateSync(descriptor, 63_000_000); } finally { closeSync(descriptor); }
    expect(() => service.previewPackage(request())).toThrowError(expect.objectContaining({ code: 'FILE_TOO_LARGE', message: expect.stringContaining('63.00MB') }));
    expect(readdirSync(output)).toEqual([]);
    expect(db.prepare('select count(*) as total from outbound_packages').get()).toEqual({ total: 0 });
  });
  it('rejects a measured single-file ZIP above 50MB and removes only its temporary output', async () => {
    writeFileSync(join(output, 'keep.txt'), 'existing');
    const archiveWriter: OutboundArchiveWriter = { async write({ temporaryPath, entries }) {
      const descriptor = openSync(temporaryPath, 'wx');
      try { ftruncateSync(descriptor, 50_000_001); } finally { closeSync(descriptor); }
      return entries.length;
    } };
    const oversized = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output,
      now: fixedNow, archiveWriter });
    const preview = oversized.previewPackage(request());
    await expect(oversized.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: [pdfId] }))
      .rejects.toThrowError(expect.objectContaining({ code: 'ZIP_TOO_LARGE' }));
    expect(readdirSync(output)).toEqual(['keep.txt']);
    expect(db.prepare('select count(*) as total from outbound_packages').get()).toEqual({ total: 0 });
  });
  it('requires an explicit BOM choice when the same material has conflicting change records', () => {
    const project = db.prepare("select id from dictionary_items where type = 'project_item'").get() as { id: number };
    const historical = db.prepare('select id from historical_drawing_numbers').get() as { id: number };
    for (const version of [1, 2]) {
      db.prepare("insert into bom_versions(id, product_id, version_number, created_at) values (?, ?, ?, 'now')").run(version, productId, version);
      db.prepare(`insert into bom_items(bom_version_id, project_item_id, historical_drawing_id, effective_material_batch_id, change_details)
        values (?, ?, ?, ?, ?)`).run(version, project.id, historical.id, batchId, `修改${version}`);
    }
    expect(service.previewPackage(request()).items[0]).toMatchObject({ selectable: false, bomContext: { status: 'ambiguous' } });
    expect(service.previewPackage({ ...request(), bomSelections: { [String(project.id)]: 2 } }).items[0])
      .toMatchObject({ selectable: true, bomContext: { status: 'matched', changeDetails: '修改2' } });
  });
  it('loads exact BOM changes into preview, rejects a changed preview and freezes completed changes', async () => {
    const project = db.prepare("select id from dictionary_items where type = 'project_item'").get() as { id: number };
    const historical = db.prepare('select id from historical_drawing_numbers').get() as { id: number };
    db.prepare("insert into bom_versions(product_id, version_number, created_at) values (?, 1, 'now')").run(productId);
    db.prepare(`insert into bom_items(bom_version_id, project_item_id, historical_drawing_id, effective_material_batch_id, change_details)
      values (1, ?, ?, ?, '修改说明文字')`).run(project.id, historical.id, batchId);
    const first = service.previewPackage(request());
    expect(first.items[0]).toMatchObject({ bomContext: { status: 'matched', changeDetails: '修改说明文字' } });
    db.exec("update bom_items set change_details = '校正文案'");
    await expect(service.createPackage({ ...request(), previewToken: first.previewToken, selectedPdfFileIds: [pdfId] }))
      .rejects.toThrowError(expect.objectContaining({ code: 'PREVIEW_STALE' }));
    const fresh = service.previewPackage(request());
    await service.createPackage({ ...request(), previewToken: fresh.previewToken, selectedPdfFileIds: [pdfId] });
    db.exec("update bom_items set change_details = '后续新内容'");
    expect(db.prepare('select change_details_snapshot from outbound_package_items').get()).toEqual({ change_details_snapshot: '校正文案' });
    const identity = db.prepare('select product_identity_json as identity from outbound_packages').get() as { identity: string };
    expect(JSON.parse(identity.identity)).toMatchObject({ model: 'T40', sku: 'SKDWT040JP' });
  });
  it('keeps completed outbound snapshots and original PDF bytes unchanged when the product exits', async () => {
    const preview = service.previewPackage(request());
    await service.createPackage({ ...request(), previewToken: preview.previewToken, selectedPdfFileIds: [pdfId] });
    const packages = db.prepare('select * from outbound_packages').all();
    const entries = db.prepare('select * from outbound_package_items').all();
    const file = db.prepare('select relative_path as path from pdf_files where id = ?').get(pdfId) as { path: string };
    const bytes = readFileSync(join(workspace, file.path));
    const cleanup = new ProductCleanupService(db);
    expect(cleanup.preview(productId).preservedSnapshots).toBe(1);
    cleanup.cleanup(productId, { confirmedModel: 'T40' });
    expect(db.prepare('select * from outbound_packages').all()).toEqual(packages);
    expect(db.prepare('select * from outbound_package_items').all()).toEqual(entries);
    expect(readFileSync(join(workspace, file.path))).toEqual(bytes);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
  it('reports ZIP progress after every archived entry', async () => {
    const sources = ['one.pdf', 'two.pdf', 'three.pdf'];
    for (const file of sources) writeFileSync(join(root, file), file);
    const progress: number[] = [];
    const written = await new ArchiverOutboundArchiveWriter().write({
      temporaryPath: join(output, 'progress.tmp'),
      entries: sources.map((file) => ({ sourcePath: join(root, file), archiveName: file })),
      onProgress: (processed) => progress.push(processed),
    });
    expect(written).toBe(3);
    expect(progress).toEqual([1, 2, 3]);
  });
  it('previews current complete materials with database-derived identity and an opaque version token', () => {
    const preview = service.previewPackage(request());
    expect(preview.packageName).toBe('D&D - SAMKYO T40 洗碗机【初次包材资料-2026年9月10日】');
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
    const alias = 'same-file.pdf';
    symlinkSync(join(workspace,original.path),join(workspace,alias),'file');
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

  it.each(['write', 'close'] as const)('closes the claim descriptor and removes artifacts when claim %s fails', async (failure) => {
    let closeCalls = 0; let closed = false; let removedAfterClose = false;
    const operations: OutboundClaimFileOperations = {
      openExclusive: (path) => openSync(path, 'wx'),
      write: (descriptor, content) => {
        if (failure === 'write') throw new Error('fixture claim write failure');
        writeFileSync(descriptor, content, 'utf8');
      },
      close: (descriptor) => {
        closeCalls += 1;
        if (failure === 'close' && closeCalls === 1) throw new Error('fixture claim close failure');
        closeSync(descriptor); closed = true;
      },
      remove: (path) => {
        if (!closed) throw new Error('Windows would reject deletion of an open claim');
        removedAfterClose = true; rmSync(path, { force: true });
      },
    };
    const failing = new OutboundPackageService(db, { workspaceRoot: () => workspace, outputRoot: () => output,
      now: fixedNow, claimFileOperations: operations });
    const preview = failing.previewPackage(request());
    const error = await failing.createPackage({ ...request(), previewToken: preview.previewToken,
      selectedPdfFileIds: [pdfId] }).catch((caught) => caught as OutboundPackageError);
    expect(error).toMatchObject({ code: 'PACKAGE_PUBLISH_FAILED',
      cause: expect.objectContaining({ message: `fixture claim ${failure} failure` }) });
    expect(closed).toBe(true);
    expect(removedAfterClose).toBe(true);
    expect(readdirSync(output)).toEqual([]);
    expect(db.prepare('select count(*) as count from outbound_packages').get()).toEqual({ count: 0 });
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

describe('batch-first V2 workflow',()=>{
  function version(){ensureProductAppearance(db,productId);return(db.prepare('select id from product_appearance_versions where product_id=?').get(productId) as {id:number}).id;}
  function scope(id:number,appearanceVersionId:number,sequenceComplete=true){db.prepare(`insert into outbound_batch_scopes(batch_id,appearance_version_id,completeness,revision,updated_at,reason) values(?,?,?,1,?,'人工确认历史批次归属')`).run(id,appearanceVersionId,sequenceComplete?'complete':'pending',now);}
  function bind(id:number,appearanceVersionId:number){const row=db.prepare('select historical_drawing_id as id from pdf_files where id=?').get(id) as {id:number};db.prepare("insert into drawing_appearance_bindings(origin,record_id,product_id,appearance_version_id,source,updated_at) values('historical',?,?,?,'manual',?)").run(row.id,productId,appearanceVersionId,now);}
  function pdfBytes(id:number,text:string){const file=db.prepare('select relative_path as path from pdf_files where id=?').get(id) as {path:string};writeFileSync(join(workspace,file.path),'%PDF-1.7\n'+text);}
  it('packages selected batch without BOM and persists real part manifests',async()=>{
    const appearanceVersionId=version();scope(batchId,appearanceVersionId);bind(pdfId,appearanceVersionId);pdfBytes(pdfId,'actual current');
    const input={...request(),workflowVersion:2 as const,appearanceVersionId};const preview=service.previewPackage(input);
    expect(preview.items[0].selectable).toBe(true);
    const result=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    expect(result.parts?.[0].fileCount).toBe(1);expect(result.parts?.[0].files?.[0].contentSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(decodedZipEntries(join(output,result.zipRelativePath)).values().next().value?.toString()).toContain('actual current');
    const resources=new AppearanceService(db).resources(appearanceVersionId);
    expect(resources.outboundPackages.map(item=>item.id)).toEqual([result.id]);expect(resources.unboundCounts.outboundPackages).toBe(0);
    expect(()=>db.prepare("update outbound_v2_snapshots set files_json='[]'").run()).toThrow('外发快照不可修改');
  });
  it('does not infer legacy batch appearance and does not require a BOM to preview',()=>{
    const input={...request(),workflowVersion:2 as const,appearanceVersionId:version()};expect(()=>service.previewPackage(input)).toThrow('批次外观归属待确认');
  });
  it('does not backfill missing current files from historical batch',()=>{
    const appearanceVersionId=version();scope(batchId,appearanceVersionId);bind(pdfId,appearanceVersionId);pdfBytes(pdfId,'old');const newer=addBatch('第二批',1);scope(newer,appearanceVersionId);
    const missing=addOutlined({batch:newer,relativePath:'second\\manual（转曲）.pdf',present:false});pdfBytes(missing,'new');
    const preview=service.previewPackage({...request(),workflowVersion:2,appearanceVersionId,selectedMaterialBatchId:newer});
    expect(preview.items.filter(item=>item.selectable)).toEqual([]);expect(preview.items[0].sourceBatchId).toBe(newer);
  });
  it('compares actual content rather than indexed hash or modification dates',()=>{
    const appearanceVersionId=version();scope(batchId,appearanceVersionId);bind(pdfId,appearanceVersionId);pdfBytes(pdfId,'same');const newer=addBatch('第二批',1);scope(newer,appearanceVersionId);
    const copied=addOutlined({batch:newer,relativePath:'second\\manual（转曲）.pdf'});pdfBytes(copied,'same');
    const input={...request(),workflowVersion:2 as const,appearanceVersionId,selectedMaterialBatchId:newer,packageMode:'change_only' as const};
    expect(service.previewPackage(input).items[0]).toMatchObject({change:'copied',defaultSelected:false});pdfBytes(copied,'DIFF');
    expect(service.previewPackage(input).items[0]).toMatchObject({status:'conflict',selectable:false});
  });  function ready(){const appearanceVersionId=version();scope(batchId,appearanceVersionId);bind(pdfId,appearanceVersionId);pdfBytes(pdfId,'first');return {...request(),workflowVersion:2 as const,appearanceVersionId};}
  it('rejects nonexistent explicit comparison baselines instead of silently choosing another',()=>{
    const input=ready();expect(()=>service.previewPackage({...input,baselineBatchId:999999})).toThrowError(expect.objectContaining({code:'INVALID_BASELINE'}));
  });
  it('compares actual business projects and requires confirmation for same-content new drawing codes',()=>{
    const input=ready();const next=addBatch('第二批',1);scope(next,input.appearanceVersionId);
    const changed=addOutlined({batch:next,fullCode:'02.0209.010.0401002',relativePath:'second-new（转曲）.pdf'});bind(changed,input.appearanceVersionId);pdfBytes(changed,'first');
    const preview=service.previewPackage({...input,selectedMaterialBatchId:next,packageMode:'change_only'});
    expect(preview.items[0]).toMatchObject({change:'replaced',selectable:false,defaultSelected:false});expect(preview.items[0].detail).toMatch(/内容相同/);
  });
  it('makes manual file confirmation specific to the actual PDF hash',()=>{
    const input=ready();const next=addBatch('第二批',1);scope(next,input.appearanceVersionId);const changed=addOutlined({batch:next,relativePath:'changed（转曲）.pdf'});pdfBytes(changed,'different');
    const request={...input,selectedMaterialBatchId:next};const preview=service.previewPackage(request);const hash=preview.items[0].contentSha256!;
    expect(service.previewPackage({...request,fileConfirmations:[{pdfFileId:changed,reason:'已经逐项核对内容',contentSha256:hash}]}).items[0].selectable).toBe(true);
    pdfBytes(changed,'changed again');expect(service.previewPackage({...request,fileConfirmations:[{pdfFileId:changed,reason:'已经逐项核对内容',contentSha256:hash}]}).items[0].selectable).toBe(false);
  });
  it('does not package ignored files, even as manually confirmed extra material',()=>{
    const input=ready();db.prepare("update pdf_files set management_state='ignored' where id=?").run(pdfId);const source=readFileSync(join(workspace,(db.prepare('select relative_path as path from pdf_files where id=?').get(pdfId) as {path:string}).path));
    expect(service.previewPackage(input).items).toEqual([]);const next=addBatch('第二批',1);scope(next,input.appearanceVersionId);
    expect(()=>service.previewPackage({...input,selectedMaterialBatchId:next,extraPdfFileIds:[pdfId],fileConfirmations:[{pdfFileId:pdfId,reason:'不能绕过忽略状态',contentSha256:createHash('sha256').update(source).digest('hex')}]})).toThrowError(expect.objectContaining({code:'EXTRA_UNAVAILABLE'}));
    expect(readFileSync(join(workspace,(db.prepare('select relative_path as path from pdf_files where id=?').get(pdfId) as {path:string}).path))).toEqual(source);
  });
  it('allows valid selected files when an unselected index is missing or only has an unoutlined source',async()=>{
    const input=ready();const source=addOutlined({conversionType:'source',fullCode:'02.0209.011.0401001',relativePath:'source-only.pdf'});pdfBytes(source,'source');
    const missing=addOutlined({present:false,fullCode:'02.0209.012.0401001',relativePath:'missing（转曲）.pdf'});pdfBytes(missing,'missing');
    const preview=service.previewPackage(input);expect(preview.items.find(item=>item.pdfFileId===source)).toMatchObject({selectable:false,defaultSelected:false,detail:'缺少转曲后文件'});
    const result=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});expect(result.fileCount).toBe(1);
  });
  it('marks removed baseline projects without adding them to current complete ZIP',()=>{
    const input=ready();const next=addBatch('第二批',1);scope(next,input.appearanceVersionId);
    const preview=service.previewPackage({...input,selectedMaterialBatchId:next,packageMode:'change_only'});
    expect(preview.items).toEqual([expect.objectContaining({source:'baseline_removed',change:'removed',selectable:false,pdfFileId:null})]);
  });
  it('requires an explicit reason for a cross-appearance comparison and keeps batch ownership intact',()=>{
    const input=ready();const other=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,2,'历史外观','historical',?)").run(productId,now).lastInsertRowid);
    const next=addBatch('另一外观批次',1);scope(next,other);const nextPdf=addOutlined({batch:next,relativePath:'other（转曲）.pdf'});pdfBytes(nextPdf,'new');
    expect(()=>service.previewPackage({...input,baselineBatchId:next})).toThrowError(expect.objectContaining({code:'INVALID_BASELINE'}));
    const confirmed=service.previewPackage({...input,baselineBatchId:next,baselineConfirmationReason:'明确人工跨外观核查'});expect(confirmed.warnings?.join('')).toMatch(/跨外观/);
    expect(db.prepare('select appearance_version_id from outbound_batch_scopes where batch_id=?').get(next)).toEqual({appearance_version_id:other});
  });
  it('cannot authorize an old exterior by referencing an arbitrary historical BOM revision',()=>{
    const input=ready();const other=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,2,'其他外观','historical',?)").run(productId,now).lastInsertRowid);
    db.prepare('update drawing_appearance_bindings set appearance_version_id=?').run(other);
    const project=(db.prepare('select id from dictionary_items where type=\'project_item\' limit 1').get() as {id:number}).id;
    const drawing=(db.prepare('select historical_drawing_id as id from pdf_files where id=?').get(pdfId) as {id:number}).id;
    const boms=new BomService(db);const old=boms.saveVersion({productId,appearanceVersionId:input.appearanceVersionId,entryMode:'historical',businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[{projectItemId:project,drawingReference:{origin:'historical',historicalDrawingId:drawing},usesWhiteMaterial:false}]}).version;
    db.prepare('delete from appearance_bom_current where appearance_version_id=?').run(input.appearanceVersionId);db.prepare('delete from bom_current where version_id=?').run(old.id);
    expect(service.previewPackage(input).items[0].selectable).toBe(false);
  });
  it('rejects unsafe source filenames before handing them to the ZIP writer',()=>{
    const input=ready();db.prepare("update pdf_files set file_name='../escape（转曲）.pdf' where id=?").run(pdfId);
    expect(service.previewPackage(input).items[0]).toMatchObject({selectable:false});
  });
  it('aborts a source mutation during ZIP writing without saving success or leaving an archive',async()=>{
    const input=ready();const actual=new ArchiverOutboundArchiveWriter();const writer:OutboundArchiveWriter={write:async args=>{const count=await actual.write(args);pdfBytes(pdfId,'mutated during generation');return count;}};
    const guarded=new OutboundPackageService(db,{workspaceRoot:()=>workspace,outputRoot:()=>output,now:fixedNow,archiveWriter:writer});const preview=guarded.previewPackage(input);
    await expect(guarded.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]})).rejects.toThrowError(expect.objectContaining({code:'PREVIEW_STALE'}));expect(service.listCompleted(productId)).toEqual([]);expect(readdirSync(output)).toEqual([]);
  });
  it('rejects a corrupt ZIP writer despite a matching claimed file count',async()=>{
    const input=ready();const writer:OutboundArchiveWriter={write:async args=>{writeFileSync(args.temporaryPath,'not zip');return args.entries.length;}};
    const guarded=new OutboundPackageService(db,{workspaceRoot:()=>workspace,outputRoot:()=>output,now:fixedNow,archiveWriter:writer});const preview=guarded.previewPackage(input);
    await expect(guarded.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]})).rejects.toThrow();expect(service.listCompleted(productId)).toEqual([]);expect(readdirSync(output)).toEqual([]);
  });
  it('keeps all V2 history facts stable after BOM, batch and PDF index changes or ZIP removal',async()=>{
    const input=ready();const preview=service.previewPackage(input);const saved=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});const before=service.historyDetail(saved.id);
    db.prepare("update material_batches set display_name='后来改名' where id=?").run(batchId);db.prepare("update pdf_files set file_name='后来索引（转曲）.pdf' where id=?").run(pdfId);
    rmSync(join(output,saved.zipRelativePath));const after=service.historyDetail(saved.id);expect(after.context).toEqual(before.context);expect(after.files).toEqual(before.files);expect(after.parts[0]).toMatchObject({isPresent:false,fileCount:1});
  });
  it('adds old-exterior PDFs only as hash-confirmed extra material without changing their attribution',async()=>{
    const input=ready();const newer=addBatch('第二批',1);scope(newer,input.appearanceVersionId);
    const next=addOutlined({batch:newer,fullCode:'02.0209.011.0401001',relativePath:'new-color（转曲）.pdf'});bind(next,input.appearanceVersionId);pdfBytes(next,'newcolor');
    const args={...input,selectedMaterialBatchId:newer,extraPdfFileIds:[pdfId]};const first=service.previewPackage(args);
    expect(first.items.find(item=>item.pdfFileId===pdfId)).toMatchObject({source:'extra',selectable:false});
    const hash=first.items.find(item=>item.pdfFileId===pdfId)!.contentSha256!;
    const confirmed={...args,fileConfirmations:[{pdfFileId:pdfId,reason:'人工确认需要添加旧批次资料',contentSha256:hash}]};const preview=service.previewPackage(confirmed);
    const result=await service.createPackage({...confirmed,previewToken:preview.previewToken,selectedPdfFileIds:[next,pdfId]});expect(result.fileCount).toBe(2);
    expect(service.historyDetail(result.id).files.find((file:{pdfFileId:number})=>file.pdfFileId===pdfId)).toMatchObject({source:'extra',sourceBatchId:batchId,confirmationReason:'人工确认需要添加旧批次资料'});
  });
  it('accepts a manually confirmed unrecognized indexed PDF without inventing a drawing or BOM',async()=>{
    const input=ready();db.prepare("update pdf_files set historical_drawing_id=null,match_status='unmatched' where id=?").run(pdfId);
    const first=service.previewPackage(input);expect(first.items[0].selectable).toBe(false);
    const args={...input,fileConfirmations:[{pdfFileId:pdfId,reason:'已人工核查此未识别项目',contentSha256:first.items[0].contentSha256!}]};const preview=service.previewPackage(args);
    expect(preview.items[0].selectable).toBe(true);const result=await service.createPackage({...args,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    expect(service.listCompleted(productId)[0].fileCount).toBe(1);expect(service.historyDetail(result.id).files[0]).toMatchObject({fullCode:null,projectItemId:null,pdfFileId:pdfId});
    expect(db.prepare('select count(*) as count from drawing_numbers').get()).toEqual({count:0});expect(db.prepare('select count(*) as count from bom_versions').get()).toEqual({count:0});
  });
  it('reports a partial BOM while allowing other correctly attributed batch files',async()=>{
    const input=ready();const first=(db.prepare('select historical_drawing_id as id from pdf_files where id=?').get(pdfId) as {id:number}).id;
    const project=(db.prepare("select id from dictionary_items where type='project_item' limit 1").get() as {id:number}).id;
    new BomService(db).saveVersion({productId,appearanceVersionId:input.appearanceVersionId,entryMode:'historical',businessChangeDate:'2026-10-20',expectedCurrentVersionId:null,items:[{projectItemId:project,drawingReference:{origin:'historical',historicalDrawingId:first},usesWhiteMaterial:false}]});
    const other=addOutlined({fullCode:'02.0209.011.0401001',relativePath:'other-color（转曲）.pdf'});bind(other,input.appearanceVersionId);pdfBytes(other,'othercolor');
    const preview=service.previewPackage(input);expect(preview.bomCheck).toMatchObject({status:'partial',extraPdfFileIds:[other]});expect(preview.items.every(item=>item.selectable)).toBe(true);
    const result=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId,other]});expect(result.fileCount).toBe(2);
  });
  it('freezes filterable history identity and returns all part details without live-data joins',async()=>{
    const input=ready();const preview=service.previewPackage(input);const result=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    db.prepare("update products set sku='CHANGED',model='Changed model' where id=?").run(productId);db.prepare("update material_batches set display_name='Renamed batch' where id=?").run(batchId);
    const rows=service.listCompleted(productId,{brand:'SAMKYO',model:'T40',sku:'SKDWT040JP',appearanceVersionId:input.appearanceVersionId,batchId,materialType:'initial',dateFrom:'2026-09-10',dateTo:'2026-09-10'});
    expect(rows).toHaveLength(1);expect(rows[0]).toMatchObject({id:result.id,sku:'SKDWT040JP',model:'T40',batchName:'00.首批大货'});expect(rows[0].parts[0]).toMatchObject({fileCount:1});
    expect(service.listCompleted(productId,{sku:'CHANGED'})).toEqual([]);expect(service.listCompleted(productId,{appearanceVersionId:999})).toEqual([]);
  });
  it('validates two independent ZIPs and exactly fourteen real source files with accurate per-part manifests',async()=>{
    const input=ready();const main=(db.prepare("select id from dictionary_items where type='main_category' limit 1").get() as {id:number}).id;
    const ids=[pdfId];const bytes=Buffer.alloc(4_000_000,65);bytes.write('%PDF-1.7\n');
    for(let index=2;index<=14;index++){
      const code=String(index).padStart(2,'0');dictionary('project_item',code,`项目${index}`,main);
      const file=addOutlined({fullCode:`02.0209.010.04${code}001`,relativePath:`item-${index}（转曲）.pdf`});
      const historical=(db.prepare('select historical_drawing_id as id from pdf_files where id=?').get(file) as {id:number}).id;
      db.prepare('update historical_drawing_numbers set project_item_code=? where id=?').run(code,historical);bind(file,input.appearanceVersionId);ids.push(file);
    }
    for(const id of ids){const path=(db.prepare('select relative_path as path from pdf_files where id=?').get(id) as {path:string}).path;writeFileSync(join(workspace,path),bytes);}
    const before=new Map(ids.map(id=>{const path=(db.prepare('select relative_path as path from pdf_files where id=?').get(id) as {path:string}).path;return[id,createHash('sha256').update(readFileSync(join(workspace,path))).digest('hex')];}));
    const preview=service.previewPackage(input);expect(preview.items.filter(item=>item.selectable)).toHaveLength(14);
    const result=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:ids});expect(result.parts).toHaveLength(2);
    expect(result.parts!.reduce((total,part)=>total+(part.fileCount??0),0)).toBe(14);expect(new Set(result.parts!.flatMap(part=>part.files?.map(file=>file.pdfFileId)??[])).size).toBe(14);
    for(const part of result.parts!){const entries=decodedZipEntries(join(output,part.zipRelativePath));expect(entries.size).toBe(part.fileCount);for(const file of part.files!){expect(createHash('sha256').update(entries.get(file.fileName)!).digest('hex')).toBe(before.get(file.pdfFileId));}}
    for(const id of ids){const path=(db.prepare('select relative_path as path from pdf_files where id=?').get(id) as {path:string}).path;expect(createHash('sha256').update(readFileSync(join(workspace,path))).digest('hex')).toBe(before.get(id));}
  },30000);

  it('regenerates from immutable history into a new record after rechecking actual source hashes',async()=>{
    const input=ready();const preview=service.previewPackage(input);
    const original=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    const frozen=service.historyDetail(original.id);
    const plan=service.prepareRegeneration(original.id);
    expect(plan).toMatchObject({sourcePackageId:original.id,selectedPdfFileIds:[pdfId],request:{workflowVersion:2}});
    expect(service.preflightPackage({...plan.request,previewToken:plan.preview.previewToken,selectedPdfFileIds:plan.selectedPdfFileIds}).blockingErrors).toEqual([]);
    output=join(root,'regenerated');mkdirSync(output);
    const second=await service.createPackage({...plan.request,previewToken:plan.preview.previewToken,selectedPdfFileIds:plan.selectedPdfFileIds});
    expect(second.id).not.toBe(original.id);expect(service.listCompleted(productId)).toHaveLength(2);
    expect(service.historyDetail(original.id)).toEqual(frozen);
  });
  it('rejects changed same-name source bytes during history regeneration without changing the original record',async()=>{
    const input=ready();const preview=service.previewPackage(input);
    const original=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    const frozen=service.historyDetail(original.id);pdfBytes(pdfId,'different bytes under the same original path');
    expect(()=>service.prepareRegeneration(original.id)).toThrowError(expect.objectContaining({code:'PREVIEW_STALE'}));
    expect(service.historyDetail(original.id)).toEqual(frozen);expect(service.listCompleted(productId)).toHaveLength(1);
  });
  it('rejects a preview token that became stale before server preflight',()=>{
    const input=ready();const preview=service.previewPackage(input);pdfBytes(pdfId,'changed after preview');
    expect(()=>service.preflightPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]})).toThrowError(expect.objectContaining({code:'PREVIEW_STALE'}));
  });

  it('accepts an explicit appearance usage without rewriting primary attribution or inventing BOM',()=>{
    const input=ready();const other=Number(db.prepare("insert into product_appearance_versions(product_id,version_number,label,status,created_at) values(?,2,'其他外观','historical',?)").run(productId,now).lastInsertRowid);
    db.prepare('update drawing_appearance_bindings set appearance_version_id=?').run(other);
    expect(service.previewPackage(input).items[0].selectable).toBe(false);
    const record=(db.prepare('select historical_drawing_id as id from pdf_files where id=?').get(pdfId) as {id:number}).id;
    db.prepare("insert into drawing_appearance_usages(origin,record_id,product_id,appearance_version_id,reason,created_at) values('historical',?,?,?,'人工明确沿用旧图号',?)").run(record,productId,input.appearanceVersionId,now);
    expect(service.previewPackage(input).items[0].selectable).toBe(true);
    expect(db.prepare('select appearance_version_id as id from drawing_appearance_bindings').get()).toEqual({id:other});
    expect(db.prepare('select count(*) as count from bom_versions').get()).toEqual({count:0});
  });

  it('cannot bypass historical hash validation by self-reporting regeneratedFromPackageId on ordinary preview',async()=>{
    const input=ready();const preview=service.previewPackage(input);const original=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    pdfBytes(pdfId,'different source bytes');
    expect(()=>service.previewPackage({...input,regeneratedFromPackageId:original.id})).toThrowError(expect.objectContaining({code:'PREVIEW_STALE'}));
  });
  it('rejects nonexistent regeneration provenance and altered historical selections',async()=>{
    const input=ready();expect(()=>service.previewPackage({...input,regeneratedFromPackageId:999999})).toThrow();
    const extra=addOutlined({fullCode:'02.0209.011.0401001',relativePath:'other（转曲）.pdf'});bind(extra,input.appearanceVersionId);pdfBytes(extra,'other');
    const preview=service.previewPackage(input);const original=await service.createPackage({...input,previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    const plan=service.prepareRegeneration(original.id);
    output=join(root,'regeneration-other');mkdirSync(output);
    await expect(service.createPackage({...plan.request,previewToken:plan.preview.previewToken,selectedPdfFileIds:[extra]})).rejects.toThrow();
    expect(()=>service.preflightPackage({...plan.request,previewToken:plan.preview.previewToken,selectedPdfFileIds:[extra]})).toThrow();
    expect(service.listCompleted(productId)).toHaveLength(1);
  });

});

// V3 uses indexed batch ownership and dictionary appearance codes, without creating a version object.
describe('simplified outbound batch workflow', () => {
  const bytes=(id:number,text='real PDF content')=>{
    const file=db.prepare('select relative_path as path from pdf_files where id=?').get(id) as {path:string};
    writeFileSync(join(workspace,file.path),`%PDF-1.7\n${text}`);
  };
  const input=()=>({...request(),workflowVersion:2 as const});
  it('packages selected outlined PDFs without BOM, independent version or drawing attribution',async()=>{
    db.prepare('update historical_drawing_numbers set product_id=null').run();bytes(pdfId);
    addOutlined({relativePath:'source.pdf',conversionType:'source',fullCode:'02.0209.010.0402001'});
    const preview=service.previewPackage(input());
    expect(preview.items.map(item=>item.pdfFileId)).toEqual([pdfId]);
    expect(preview.items[0]).toMatchObject({selectable:true,defaultSelected:true});
    const result=await service.createPackage({...input(),previewToken:preview.previewToken,selectedPdfFileIds:[pdfId]});
    expect(decodedZipEntries(join(output,result.zipRelativePath)).size).toBe(1);
    expect(db.prepare('select count(*) as count from product_appearance_versions').get()).toEqual({count:0});
    expect(db.prepare('select product_id as productId from historical_drawing_numbers where full_code=?').get('02.0209.010.0401001')).toEqual({productId:null});
  });
  it('compares only the unique previous business batch with the same dictionary appearance code',()=>{
    bytes(pdfId,'identical');const next=addBatch('new batch',2);
    const current=addOutlined({batch:next,relativePath:'new（转曲）.pdf'});bytes(current,'identical');
    const foreign=addBatch('other appearance',1);
    const other=addOutlined({batch:foreign,relativePath:'foreign（转曲）.pdf',fullCode:'02.0209.020.0401001'});bytes(other,'different');
    const preview=service.previewPackage({...input(),selectedMaterialBatchId:next,packageMode:'change_only'});
    expect(preview.baselineBatchId).toBe(batchId);
    expect(preview.items[0]).toMatchObject({pdfFileId:current,change:'copied',selectable:true,defaultSelected:false});
  });
  it('uses explicit business dates when sequences are unavailable and never guesses from path or mtime',()=>{
    bytes(pdfId,'identical');const next=addBatch('older looking folder',99);
    const current=addOutlined({batch:next,relativePath:'dated（转曲）.pdf'});bytes(current,'identical');
    db.prepare('update material_batches set sequence_number=null,business_date=? where id=?').run('2026-09-01',batchId);
    db.prepare('update material_batches set sequence_number=null,business_date=? where id=?').run('2026-09-10',next);
    const preview=service.previewPackage({...input(),selectedMaterialBatchId:next,packageMode:'change_only'});
    expect(preview.baselineBatchId).toBe(batchId);expect(preview.items[0].defaultSelected).toBe(false);
    db.prepare('update material_batches set business_date=null where id=?').run(batchId);
    const unknown=service.previewPackage({...input(),selectedMaterialBatchId:next,packageMode:'change_only'});
    expect(unknown.baselineBatchId).toBeNull();expect(unknown.items[0]).toMatchObject({selectable:true,defaultSelected:false});
  });
  it('keeps date ordering when only the current batch lacks a sequence',()=>{
    bytes(pdfId,'older');const newer=addBatch('newer by date',-1);
    bytes(addOutlined({batch:newer,relativePath:'date-newer（转曲）.pdf'}),'newer');
    const current=addBatch('current without sequence',3);bytes(addOutlined({batch:current,relativePath:'date-current（转曲）.pdf'}),'newer');
    db.prepare('update material_batches set sequence_number=2,business_date=? where id=?').run('2026-10-20',batchId);
    db.prepare('update material_batches set sequence_number=1,business_date=? where id=?').run('2026-10-21',newer);
    db.prepare('update material_batches set sequence_number=null,business_date=? where id=?').run('2026-10-22',current);
    const preview=service.previewPackage({...input(),selectedMaterialBatchId:current,packageMode:'change_only'});
    expect(preview.baselineBatchId).toBe(newer);
    expect(preview.items[0]).toMatchObject({change:'copied',selectable:true,defaultSelected:false});
  });
  it('does not compare a mixed appearance batch and preserves manual ZIP selection and immutable regeneration',async()=>{
    bytes(pdfId);const next=addBatch('mixed',1);
    const first=addOutlined({batch:next,relativePath:'mixed-first（转曲）.pdf'});bytes(first);
    const second=addOutlined({batch:next,relativePath:'mixed-second（转曲）.pdf',fullCode:'02.0209.021.0402001'});bytes(second,'other appearance');
    const req={...input(),selectedMaterialBatchId:next,packageMode:'change_only' as const};const preview=service.previewPackage(req);
    expect(preview.baselineBatchId).toBeNull();expect(preview.warnings?.join('')).toMatch(/外观编码不唯一/);
    expect(preview.items.every(item=>item.selectable&&!item.defaultSelected)).toBe(true);
    const created=await service.createPackage({...req,previewToken:preview.previewToken,selectedPdfFileIds:[first]});
    const frozen=JSON.stringify(service.historyDetail(created.id));
    const plan=service.prepareRegeneration(created.id);expect(plan.request).not.toHaveProperty('appearanceVersionId');
    bytes(first,'changed actual file');expect(()=>service.prepareRegeneration(created.id)).toThrow();
    expect(JSON.stringify(service.historyDetail(created.id))).toBe(frozen);
  });
  it('leaves files manually selectable without defaulting to new when prior batch order is tied',async()=>{
    bytes(pdfId);const tied=addBatch('another initial batch',0);
    bytes(addOutlined({batch:tied,relativePath:'tie（转曲）.pdf'}));
    const next=addBatch('new batch',1);const current=addOutlined({batch:next,relativePath:'current（转曲）.pdf'});bytes(current,'updated');
    const request={...input(),selectedMaterialBatchId:next,packageMode:'change_only' as const};
    const preview=service.previewPackage(request);
    expect(preview.baselineBatchId).toBeNull();
    expect(preview.items[0]).toMatchObject({selectable:true,defaultSelected:false});
    expect(preview.warnings?.join('')).toMatch(/顺序|可靠/);
    const result=await service.createPackage({...request,previewToken:preview.previewToken,selectedPdfFileIds:[current]});
    expect(result.fileCount).toBe(1);
  });
});
