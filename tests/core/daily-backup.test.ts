import { existsSync, mkdtempSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureDailyBackup } from '../../src/core/backup/daily-backup';
import { createDatabaseBackup } from '../../src/db/backup';
import { openDatabase } from '../../src/db/database';

describe('daily first-launch backup', () => {
  it('creates only one successful backup per local day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-'));
    const databasePath = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    const database = openDatabase(databasePath); database.exec('create table records (value text)');

    const first = ensureDailyBackup(database, databasePath, backups, new Date('2026-08-24T08:00:00'));
    const second = ensureDailyBackup(database, databasePath, backups, new Date('2026-08-24T18:00:00'));

    expect(first.status).toBe('created');
    expect(second).toEqual({ status: 'skipped' });
    expect(readdirSync(backups).filter((name) => name.endsWith('.db'))).toHaveLength(1);
    database.close();
  });

  it('recreates the daily backup when the recorded file was removed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-missing-'));
    const databasePath = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    const database = openDatabase(databasePath); database.exec('create table records (value text)');
    const first = ensureDailyBackup(database, databasePath, backups, new Date('2026-08-24T08:00:00'));
    if (first.status !== 'created') throw new Error('expected created backup');
    unlinkSync(first.path);

    const replacement = ensureDailyBackup(database, databasePath, backups, new Date('2026-08-24T18:00:00'));

    expect(replacement.status).toBe('created');
    database.close();
  });

  it('keeps only the latest 30 daily backups without pruning import backups', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-retention-'));
    const databasePath = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    const database = openDatabase(databasePath); database.exec('create table records (value text)');
    for (let day = 1; day <= 31; day += 1) {
      ensureDailyBackup(database, databasePath, backups, new Date(2026, 7, day, 8));
    }
    const importBackup = createDatabaseBackup(database, databasePath, backups, 'import', new Date(2026, 7, 31, 9));

    const dailyFiles = readdirSync(backups).filter((name) => name.startsWith('daily-') && name.endsWith('.db'));
    expect(dailyFiles).toHaveLength(30);
    expect(existsSync(importBackup)).toBe(true);
    database.close();
  });

  it('reports a failed backup without deleting older copies', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-failure-'));
    const databasePath = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    const database = openDatabase(databasePath); database.exec('create table records (value text)');
    const older = join(dir, 'older.db'); writeFileSync(older, 'older-backup');

    const result = ensureDailyBackup(database, databasePath, backups, new Date('2026-08-24T08:00:00'), () => {
      throw new Error('backup unavailable');
    });

    expect(result).toEqual({ status: 'failed', error: 'backup unavailable' });
    expect(existsSync(older)).toBe(true);
    database.close();
  });
});
