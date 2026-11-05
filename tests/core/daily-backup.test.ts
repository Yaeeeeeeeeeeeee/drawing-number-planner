import { existsSync, mkdtempSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureDailyBackup } from '../../src/core/backup/daily-backup';
import { createDatabaseBackup, isValidDatabaseBackup } from '../../src/db/backup';
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

  it('uses the local calendar day before the UTC date boundary', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-local-day-'));
    const databasePath = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    const database = openDatabase(databasePath); database.exec('create table records (value text)');

    const first = ensureDailyBackup(database, databasePath, backups, new Date(2026, 7, 24, 1));
    const second = ensureDailyBackup(database, databasePath, backups, new Date(2026, 7, 24, 18));

    expect(first.status).toBe('created');
    expect(second).toEqual({ status: 'skipped' });
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
  }, 30_000);

  it('does not let a corrupt daily-looking file evict a valid backup', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-corrupt-'));
    const databasePath = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    const database = openDatabase(databasePath); database.exec('create table records (value text)');
    for (let day = 1; day <= 30; day += 1) ensureDailyBackup(database, databasePath, backups, new Date(2026, 6, day, 8));
    const corrupt = join(backups, 'daily-99991231-235959-999.db'); writeFileSync(corrupt, 'not a database');

    ensureDailyBackup(database, databasePath, backups, new Date(2026, 6, 31, 8));

    const validDaily = readdirSync(backups).filter((name) => name.startsWith('daily-') && name.endsWith('.db') && isValidDatabaseBackup(join(backups, name)));
    expect(validDaily).toHaveLength(30);
    expect(existsSync(corrupt)).toBe(true);
    database.close();
  }, 30_000);

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


it('backs up validated planning drafts immutably with the daily database and prunes only owned companions',()=>{
 const dir=mkdtempSync(join(tmpdir(),'drawing-planner-draft-backup-'));
 const databasePath=join(dir,'planner.db'),backups=join(dir,'backups');
 const database=openDatabase(databasePath);database.exec('create table records(value text)');
 const draft={version:1,revisions:{new:1},modes:{new:{revision:1,updatedAt:'2026-08-01T00:00:00.000Z',input:{step:2,groups:[]}}}};
 writeFileSync(join(dir,'planning-drafts.json'),JSON.stringify(draft));
 const first=ensureDailyBackup(database,databasePath,backups,new Date(2026,7,1,8));
 if(first.status!=='created')throw new Error('expected created backup');
 const companion=`${first.path}.planning-drafts.json`;
 expect(JSON.parse(readFileSync(companion,'utf8'))).toMatchObject({kind:'planning-drafts-backup',drafts:draft});
 const original=readFileSync(companion,'utf8');
 draft.modes.new.input.step=4;writeFileSync(join(dir,'planning-drafts.json'),JSON.stringify(draft));
 expect(ensureDailyBackup(database,databasePath,backups,new Date(2026,7,1,9)).status).toBe('skipped');
 expect(readFileSync(companion,'utf8')).toBe(original);
 const unrelated=join(backups,'daily-20260731-080000-000.db.planning-drafts.json');writeFileSync(unrelated,'user data');
 for(let day=2;day<=31;day++)ensureDailyBackup(database,databasePath,backups,new Date(2026,7,day,8));
 expect(existsSync(first.path)).toBe(false);expect(existsSync(companion)).toBe(false);
 expect(readFileSync(unrelated,'utf8')).toBe('user data');
 expect(readdirSync(backups).filter(name=>name.endsWith('.planning-drafts.json'))).toHaveLength(31);
 database.close();
},30000);
it('reports invalid drafts before creating a daily database and preserves the invalid source',()=>{
 const dir=mkdtempSync(join(tmpdir(),'drawing-planner-invalid-draft-backup-'));
 const databasePath=join(dir,'planner.db'),backups=join(dir,'backups');
 const database=openDatabase(databasePath);database.exec('create table records(value text)');
 writeFileSync(join(dir,'planning-drafts.json'),'{invalid');
 expect(ensureDailyBackup(database,databasePath,backups,new Date(2026,7,1,8)).status).toBe('failed');
 expect(readFileSync(join(dir,'planning-drafts.json'),'utf8')).toBe('{invalid');
 expect(readdirSync(backups)).toEqual([]);database.close();
});
