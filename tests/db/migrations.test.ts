import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

const databases: ReturnType<typeof openDatabase>[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));

describe('database migrations', () => {
  it('creates schema version one and is idempotent', () => {
    const db = openDatabase(':memory:');
    databases.push(db);
    const backup = vi.fn();

    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 0, to: 1 });
    expect(migrateDatabase(db, { databaseExists: false, createBackup: backup })).toEqual({ from: 1, to: 1 });
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.prepare('select version from schema_migrations').all()).toEqual([{ version: 1 }]);
    expect(backup).not.toHaveBeenCalled();
  });

  it('does not migrate an existing database when its safety backup fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-migration-'));
    const path = join(dir, 'planner.db');
    writeFileSync(path, '');
    expect(existsSync(path)).toBe(true);
    const db = openDatabase(path);
    databases.push(db);

    expect(() => migrateDatabase(db, {
      databaseExists: true,
      createBackup: () => { throw new Error('backup unavailable'); },
    })).toThrow('backup unavailable');
    expect(db.prepare("select count(*) as count from sqlite_master where name = 'schema_migrations'").get()).toEqual({ count: 0 });
  });
});
