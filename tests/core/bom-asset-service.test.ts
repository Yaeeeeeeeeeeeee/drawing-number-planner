import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { BomAssetService } from '../../src/core/bom/bom-asset-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

const directories: string[] = [];
const databases: PlannerDatabase[] = [];
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  directories.splice(0).forEach((directory) => rmSync(directory, { recursive: true, force: true }));
});

describe('BomAssetService', () => {
  it('keeps the old asset usable when archive registration fails', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'planner-bom-archive-fail-')); directories.push(workspace);
    const source = join(workspace, 'image.png'); const content = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]); writeFileSync(source, content);
    const db = openDatabase(':memory:'); databases.push(db); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const service = new BomAssetService(db, workspace); const old = service.import({ sku: 'SKU', model: 'M', sourcePath: source });
    db.exec("create trigger reject_archive before insert on bom_assets begin select raise(abort, 'archive-failed'); end");
    expect(() => service.archive({ assetId: old.id, model: 'M', businessDate: '2026-09-23', project: '铭牌', role: 'image' })).toThrow('archive-failed');
    expect(service.preview(old.id).content).toEqual(content);
    expect(readdirSync(join(workspace, 'BOM附件', 'M', '20260923'))).toEqual([]);
    expect(() => service.archive({ assetId: old.id, model: '../escape', businessDate: '2026-09-23', project: '铭牌', role: 'image' })).toThrow(/路径/);
    expect(() => service.archive({ assetId: old.id, model: 'M', businessDate: '2026-02-30', project: '铭牌', role: 'image' })).toThrow(/日期/);
  });
  it('archives by business date and role without overwriting a prior copy or changing its source', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'planner-bom-archive-')); directories.push(workspace);
    const source = join(workspace, 'image.png'); const content = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    writeFileSync(source, content);
    const db = openDatabase(':memory:'); databases.push(db); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const service = new BomAssetService(db, workspace);
    const old = service.import({ sku: 'SKU', model: 'M', sourcePath: source });
    const context = { assetId: old.id, model: 'M', businessDate: '2026-09-23', project: '铭牌', role: 'image' as const };
    const first = service.archive(context); const second = service.archive(context);
    const diagram = service.archive({ ...context, role: 'diagram' });
    expect(first.relativePath).toBe(join('BOM附件', 'M', '20260923', '铭牌-20260923.png'));
    expect(second.originalFileName).toBe('铭牌-20260923-1.png');
    expect(diagram.originalFileName).toBe('铭牌-20260923-位置示意图.png');
    for (const item of [old, first, second, diagram]) expect(readFileSync(join(workspace, item.relativePath))).toEqual(content);
    expect(readFileSync(source)).toEqual(content);
    writeFileSync(join(workspace, old.relativePath), 'changed');
    expect(() => service.archive(context)).toThrow(/内容/);
    expect(db.prepare('select count(*) as n from bom_assets').get()).toEqual({ n: 4 });
  });
  it('previews only a registered image and rejects a missing or replaced attachment', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'planner-bom-preview-')); directories.push(workspace);
    const source = join(workspace, 'image.png'); const content = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    writeFileSync(source, content);
    const db = openDatabase(':memory:'); databases.push(db); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const service = new BomAssetService(db, workspace);
    const asset = service.import({ sku: 'SKU', model: 'M', sourcePath: source });
    expect(service.preview(asset.id)).toEqual({ content, mimeType: 'image/png' });
    expect(() => service.preview(999)).toThrow(/不存在/);
    writeFileSync(join(workspace, asset.relativePath), 'not-an-image');
    expect(() => service.preview(asset.id)).toThrow(/内容/);
    rmSync(join(workspace, asset.relativePath));
    expect(() => service.preview(asset.id)).toThrow(/缺失/);
  });
  it('rejects fake image content and oversized files without creating a managed asset', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'planner-bom-assets-invalid-')); directories.push(workspace);
    const fake = join(workspace, 'fake.png'); writeFileSync(fake, Buffer.from('not-an-image'));
    const huge = join(workspace, 'huge.png'); writeFileSync(huge, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.alloc(10 * 1024 * 1024)]));
    const db = openDatabase(':memory:'); databases.push(db); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    const assets = new BomAssetService(db, workspace);
    expect(() => assets.import({ sku: 'SKU', model: 'M', sourcePath: fake })).toThrow(/内容/);
    expect(() => assets.import({ sku: 'SKU', model: 'M', sourcePath: huge })).toThrow(/超过/);
    expect(db.prepare('select count(*) as count from bom_assets').get()).toEqual({ count: 0 });
  });
  it('copies a supported source into the managed workspace path without changing the source', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'planner-bom-assets-')); directories.push(workspace);
    const source = join(workspace, 'incoming.png'); const original = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    writeFileSync(source, original);
    const db = openDatabase(':memory:'); databases.push(db); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });

    const asset = new BomAssetService(db, workspace).import({ sku: 'SKU-1', model: 'X100', sourcePath: source });

    expect(asset.relativePath).toMatch(/^_图号规划器[\\/]BOM附件[\\/]SKU-1-X100[\\/]/);
    expect(readFileSync(source)).toEqual(original);
    expect(readFileSync(join(workspace, asset.relativePath))).toEqual(original);
    expect(db.prepare('select relative_path from bom_assets').all()).toEqual([{ relative_path: asset.relativePath }]);
  });

  it('removes only its new managed copy when database registration fails', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'planner-bom-assets-fail-')); directories.push(workspace);
    const source = join(workspace, 'incoming.jpg'); writeFileSync(source, Buffer.from([0xff, 0xd8, 0xff]));
    const db = openDatabase(':memory:'); databases.push(db); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
    db.exec("create trigger reject_bom_asset before insert on bom_assets begin select raise(abort, 'blocked'); end");

    expect(() => new BomAssetService(db, workspace).import({ sku: 'SKU-2', model: 'X200', sourcePath: source })).toThrow('blocked');
    expect(readFileSync(source)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(db.prepare('select count(*) as count from bom_assets').get()).toEqual({ count: 0 });
  });
});
