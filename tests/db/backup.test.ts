import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { createDatabaseBackup } from '../../src/db/backup';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';

const opened: PlannerDatabase[] = [];
afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});

describe('createDatabaseBackup', () => {
  it('creates a valid SQLite backup containing rows written in WAL mode', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-backup-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    database.exec("create table records (value text not null); insert into records values ('latest-row')");

    const result = createDatabaseBackup(database, source, join(dir, 'backups'), 'import', new Date('2026-08-24T08:30:00.123Z'));

    expect(existsSync(result)).toBe(true);
    expect(basename(result)).toMatch(/^import-20260824-083000-123(?:-\d+)?\.db$/);
    const backup = new Database(result, { readonly: true }); opened.push(backup);
    expect(backup.prepare('select value from records').get()).toEqual({ value: 'latest-row' });
    expect(backup.pragma('integrity_check', { simple: true })).toBe('ok');
  });

  it('never overwrites a backup when two purposes run in the same millisecond', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-backup-collision-'));
    const source = join(dir, 'planner.db');
    const database = openDatabase(source); opened.push(database);
    database.exec('create table records (value text not null)');
    const now = new Date('2026-08-24T08:30:00.123Z');

    const migration = createDatabaseBackup(database, source, join(dir, 'backups'), 'migration', now);
    const daily = createDatabaseBackup(database, source, join(dir, 'backups'), 'daily', now);
    const secondDaily = createDatabaseBackup(database, source, join(dir, 'backups'), 'daily', now);

    expect(new Set([migration, daily, secondDaily]).size).toBe(3);
    expect([migration, daily, secondDaily].every(existsSync)).toBe(true);
  });
});
