import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { backupDatabaseFile } from '../../db/backup.js';

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

export function ensureDailyBackup(
  databasePath: string,
  backupsDir: string,
  now = new Date(),
  createBackup: (source: string, destinationDir: string, date: Date) => string = backupDatabaseFile,
): DailyBackupResult {
  const marker = join(backupsDir, `.daily-${localDateKey(now)}`);
  if (existsSync(marker)) return { status: 'skipped' };
  try {
    const path = createBackup(databasePath, backupsDir, now);
    mkdirSync(backupsDir, { recursive: true });
    writeFileSync(marker, path, 'utf8');
    return { status: 'created', path };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'unknown backup error' };
  }
}
