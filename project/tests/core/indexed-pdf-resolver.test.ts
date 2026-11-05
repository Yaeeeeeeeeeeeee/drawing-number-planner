import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FileRepository } from '../../src/core/files/file-repository';
import { IndexedPdfResolver } from '../../src/core/files/indexed-pdf-resolver';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase; let root: string; let workspace: string;
let repository: FileRepository; let settings: WorkspaceSettingsStore; let resolver: IndexedPdfResolver;

beforeEach(() => {
  db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  root = mkdtempSync(join(tmpdir(), 'planner-open-pdf-')); workspace = join(root, 'library'); mkdirSync(workspace);
  repository = new FileRepository(db); settings = new WorkspaceSettingsStore(join(root, 'settings.json'));
  settings.setWorkspaceRoot(workspace); resolver = new IndexedPdfResolver(repository, settings);
});
afterEach(() => { db.close(); rmSync(root, { recursive: true, force: true }); });

function index(relativePath = 'inside.pdf', isPresent = true): number {
  const result = db.prepare(`insert into pdf_files
    (relative_path, file_name, match_status, detected_codes_json, conversion_type, size_bytes, modified_at, scanned_at, is_present)
    values (?, ?, 'unmatched', '[]', 'source', 1, '2026-08-26T00:00:00.000Z', '2026-08-26T00:00:00.000Z', ?)`)
    .run(relativePath, relativePath.split(/[\\/]/).at(-1), isPresent ? 1 : 0);
  return Number(result.lastInsertRowid);
}

describe('IndexedPdfResolver', () => {
  it('opens a real file even when the previous scan marked its index missing', () => {
    const target = join(workspace, 'returned.pdf'); writeFileSync(target, '%PDF-1.4');
    const id = index('returned.pdf', false);
    expect(resolver.resolve(id)).toBe(realpathSync.native(target));
    expect(repository.getIndexedFile(id)?.isPresent).toBe(false);
  });

  it('returns the canonical path for a present indexed file inside the configured workspace', () => {
    const target = join(workspace, 'nested', 'inside.pdf'); mkdirSync(join(workspace, 'nested')); writeFileSync(target, '%PDF');
    const id = index(join('nested', 'inside.pdf'));

    expect(resolver.resolve(id)).toBe(realpathSync.native(target));
  });

  it.each([0, -1, 1.5, '1', null])('rejects invalid PDF index ID %s', (id) => {
    expect(() => resolver.resolve(id)).toThrowError(expect.objectContaining({ code: 'INVALID_PDF_FILE_ID' }));
  });

  it('rejects unknown, missing-index, unconfigured-workspace, and disappeared-file cases', () => {
    expect(() => resolver.resolve(999)).toThrowError(expect.objectContaining({ code: 'PDF_FILE_NOT_FOUND' }));
    const missingId = index('missing.pdf', false);
    expect(() => resolver.resolve(missingId)).toThrowError(expect.objectContaining({ code: 'PDF_FILE_MISSING' }));

    const target = join(workspace, 'present.pdf'); writeFileSync(target, '%PDF'); const presentId = index('present.pdf');
    const unconfigured = new IndexedPdfResolver(repository, new WorkspaceSettingsStore(join(root, 'empty-settings.json')));
    expect(() => unconfigured.resolve(presentId)).toThrowError(expect.objectContaining({ code: 'WORKSPACE_NOT_CONFIGURED' }));
    unlinkSync(target);
    expect(() => resolver.resolve(presentId)).toThrowError(expect.objectContaining({ code: 'PDF_FILE_UNAVAILABLE' }));
  });

  it('rejects an unavailable workspace root and an indexed directory that is not a file', () => {
    const directoryId = index('folder.pdf'); mkdirSync(join(workspace, 'folder.pdf'));
    expect(() => resolver.resolve(directoryId)).toThrowError(expect.objectContaining({ code: 'PDF_FILE_UNAVAILABLE' }));

    rmSync(workspace, { recursive: true, force: true });
    expect(() => resolver.resolve(directoryId)).toThrowError(expect.objectContaining({ code: 'WORKSPACE_INVALID' }));
  });

  it('rejects unsafe stored paths and a junction whose real target escapes the workspace', () => {
    const corruptRowResolver = new IndexedPdfResolver({ getIndexedFile: () => ({ relativePath: '..\\outside.pdf', isPresent: true }) }, settings);
    expect(() => corruptRowResolver.resolve(1)).toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));

    const outside = join(root, 'outside'); mkdirSync(outside); writeFileSync(join(outside, 'escape.pdf'), '%PDF');
    const link = join(workspace, 'linked-outside');
    try { symlinkSync(outside, link, 'junction'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }
    const escapedId = index(join('linked-outside', 'escape.pdf'));
    expect(() => resolver.resolve(escapedId)).toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));
  });
});
