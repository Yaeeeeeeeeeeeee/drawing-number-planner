import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ensureDailyBackup } from '../../src/core/backup/daily-backup';

describe('daily first-launch backup', () => {
  it('creates only one successful backup per local day', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-'));
    const database = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    writeFileSync(database, 'database-content');

    const first = ensureDailyBackup(database, backups, new Date('2026-08-24T08:00:00'));
    const second = ensureDailyBackup(database, backups, new Date('2026-08-24T18:00:00'));

    expect(first.status).toBe('created');
    expect(second).toEqual({ status: 'skipped' });
    expect(readdirSync(backups).filter((name) => name.endsWith('.db'))).toHaveLength(1);
  });

  it('reports a failed backup without deleting older copies', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-daily-failure-'));
    const database = join(dir, 'planner.db'); const backups = join(dir, 'backups');
    writeFileSync(database, 'database-content');
    const older = join(dir, 'older.db'); writeFileSync(older, 'older-backup');

    const result = ensureDailyBackup(database, backups, new Date('2026-08-24T08:00:00'), () => {
      throw new Error('backup unavailable');
    });

    expect(result).toEqual({ status: 'failed', error: 'backup unavailable' });
    expect(existsSync(older)).toBe(true);
  });
});
