import { closeSync, existsSync, mkdirSync, openSync, realpathSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type { PlannerDatabase } from './database.js';

export type BackupPurpose = 'migration' | 'daily' | 'import' | 'restore';

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').replace('Z', '').replace('.', '-');
}

export function isValidDatabaseBackup(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const backup = new Database(path, { readonly: true, fileMustExist: true });
    try {
      return backup.pragma('integrity_check', { simple: true }) === 'ok';
    } finally {
      backup.close();
    }
  } catch {
    return false;
  }
}

export function createDatabaseBackup(
  database: PlannerDatabase,
  source: string,
  backupsDir: string,
  purpose: BackupPurpose,
  now = new Date(),
  dateKey?: string,
): string {
  mkdirSync(backupsDir, { recursive: true });
  if (database.inTransaction) throw new Error('备份必须在业务事务之外执行');
  if (realpathSync(source) !== realpathSync(database.name)) throw new Error('备份源与当前数据库不一致');
  const precise = timestamp(now);
  const stem = dateKey ? `${purpose}-${dateKey}-${precise.slice(9)}` : `${purpose}-${precise}`;
  let suffix = 0;
  while (true) {
    const destination = join(backupsDir, `${stem}${suffix ? `-${suffix}` : ''}.db`);
    let owned = false;
    try {
      // Reserve the filename without overwriting an earlier backup. VACUUM INTO
      // reads a consistent SQLite snapshot, including committed WAL pages even
      // when another connection prevents a checkpoint.
      closeSync(openSync(destination, 'wx'));
      owned = true;
      database.prepare('VACUUM main INTO ?').run(destination);
      if (!isValidDatabaseBackup(destination)) {
        throw new Error('备份校验失败');
      }
      return destination;
    } catch (error) {
      if (owned && existsSync(destination)) unlinkSync(destination);
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'EEXIST') {
        suffix += 1;
        continue;
      }
      throw error;
    }
  }
}
