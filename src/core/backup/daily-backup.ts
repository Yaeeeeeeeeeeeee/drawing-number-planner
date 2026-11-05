import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { createDatabaseBackup, isValidDatabaseBackup } from '../../db/backup.js';
import type { PlannerDatabase } from '../../db/database.js';
import { parsePlanningDraftFile } from '../planning/planning-draft-store.js';

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
const companionPath = (path: string) => `${path}.planning-drafts.json`;
function ownedCompanion(databasePath: string): boolean {
  try {
    const companion = JSON.parse(readFileSync(companionPath(databasePath), 'utf8')) as { kind?: string; databaseFile?: string; drafts?: unknown };
    if (companion.kind !== 'planning-drafts-backup' || companion.databaseFile !== basename(databasePath)) return false;
    parsePlanningDraftFile(JSON.stringify(companion.drafts));
    return true;
  } catch { return false; }
}
function pruneDailyBackups(backupsDir: string): void {
  const daily = readdirSync(backupsDir)
    .filter((name) => /^daily-\d{8}-\d{6}-\d{3}(?:-\d+)?\.db$/.test(name))
    .filter((name) => isValidDatabaseBackup(join(backupsDir, name)))
    .sort();
  for (const name of daily.slice(0, Math.max(0, daily.length - 30))) {
    const path = join(backupsDir, name);
    const hasOwnedCompanion = ownedCompanion(path);
    unlinkSync(path);
    if (hasOwnedCompanion) unlinkSync(companionPath(path));
  }
}

export function ensureDailyBackup(
  database: PlannerDatabase,
  databasePath: string,
  backupsDir: string,
  now = new Date(),
  createBackup: typeof createDatabaseBackup = createDatabaseBackup,
  draftsPath = join(dirname(databasePath), 'planning-drafts.json'),
): DailyBackupResult {
  try {
    mkdirSync(backupsDir, { recursive: true });
    const prefix = `daily-${localDateKey(now)}-`;
    const validExists = readdirSync(backupsDir)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.db'))
      .some((name) => isValidDatabaseBackup(join(backupsDir, name)));
    if (validExists) return { status: 'skipped' };
    let drafts: unknown;
    try {
      const contents = readFileSync(draftsPath, 'utf8');
      parsePlanningDraftFile(contents);
      drafts = JSON.parse(contents);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const path = createBackup(database, databasePath, backupsDir, 'daily', now, localDateKey(now));
    let owned = false;
    try {
      if (drafts !== undefined) {
        const contents = `${JSON.stringify({ kind: 'planning-drafts-backup', databaseFile: basename(path), drafts }, null, 2)}\n`;
        const fd = openSync(companionPath(path), 'wx'); owned = true;
        try { writeFileSync(fd, contents); fsyncSync(fd); } finally { closeSync(fd); }
        if (readFileSync(companionPath(path), 'utf8') !== contents || !ownedCompanion(path)) throw new Error('规划草稿备份校验失败');
      }
    } catch (error) {
      if (owned && existsSync(companionPath(path))) unlinkSync(companionPath(path));
      unlinkSync(path);
      throw error;
    }
    pruneDailyBackups(backupsDir);
    return { status: 'created', path };
  } catch (error) {
    return { status: 'failed', error: error instanceof Error ? error.message : 'unknown backup error' };
  }
}
