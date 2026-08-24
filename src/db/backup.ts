import { copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
}

export function backupDatabaseFile(source: string, backupsDir: string, now = new Date()): string {
  mkdirSync(backupsDir, { recursive: true });
  const destination = join(backupsDir, `planner-${timestamp(now)}.db`);
  copyFileSync(source, destination);
  return destination;
}
