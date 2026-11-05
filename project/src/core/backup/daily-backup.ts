import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

import { createDatabaseBackup, isValidDatabaseBackup } from '../../db/backup.js';
import type { PlannerDatabase } from '../../db/database.js';

export type DailyBackupResult =
  | { status: 'created'; path: string }
  | { status: 'skipped' }
  | { status: 'failed'; error: string };

const localDateKey = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
};

function pruneDailyBackups(backupsDir: string): void {
  const daily = readdirSync(backupsDir)
    .filter((name) => /^daily-\d{8}-\d{6}-\d{3}(?:-\d+)?\.db$/.test(name))
    .filter((name) => isValidDatabaseBackup(join(backupsDir, name)))
    .sort();
  for (const name of daily.slice(0, Math.max(0, daily.length - 30))) unlinkSync(join(backupsDir, name));
}

export function ensureDailyBackup(
  database: PlannerDatabase,
  databasePath: string,
  backupsDir: string,
  now = new Date(),
  createBackup: typeof createDatabaseBackup = createDatabaseBackup,
): DailyBackupResult {
  try {
    mkdirSync(backupsDir, { recursive: true });
    const prefix = `daily-${localDateKey(now)}-`;
    const validExists = readdirSync(backupsDir)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.db'))
      .some((name) => isValidDatabaseBackup(join(backupsDir, name)));
    if (validExists) return { status: 'skipped' };
    const path = createBackup(database, databasePath, backupsDir, 'daily', now, localDateKey(now));
    pruneDailyBackups(backupsDir);
    return { status: 'created', path };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'unknown backup error' };
  }
}
