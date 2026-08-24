import { constants, copyFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
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
): string {
  mkdirSync(backupsDir, { recursive: true });
  database.pragma('wal_checkpoint(TRUNCATE)');
  const stem = `${purpose}-${timestamp(now)}`;
  let suffix = 0;
  while (true) {
    const destination = join(backupsDir, `${stem}${suffix ? `-${suffix}` : ''}.db`);
    try {
      copyFileSync(source, destination, constants.COPYFILE_EXCL);
      if (!isValidDatabaseBackup(destination)) {
        unlinkSync(destination);
        throw new Error('备份校验失败');
      }
      return destination;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? (error as NodeJS.ErrnoException).code : undefined;
      if (code === 'EEXIST') {
        suffix += 1;
        continue;
      }
      throw error;
    }
  }
}
