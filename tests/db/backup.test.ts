import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { backupDatabaseFile } from '../../src/db/backup';

describe('backupDatabaseFile', () => {
  it('creates a timestamped copy without changing the source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drawing-planner-backup-'));
    const source = join(dir, 'planner.db');
    const backups = join(dir, 'backups');
    writeFileSync(source, 'database-content');

    const result = backupDatabaseFile(source, backups, new Date('2026-08-24T08:30:00Z'));

    expect(result).toBe(join(backups, 'planner-20260824-083000.db'));
    expect(existsSync(result)).toBe(true);
    expect(readFileSync(result, 'utf8')).toBe('database-content');
    expect(readFileSync(source, 'utf8')).toBe('database-content');
  });
});
