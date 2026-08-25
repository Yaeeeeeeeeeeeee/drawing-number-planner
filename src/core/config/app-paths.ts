import { join } from 'node:path';

export interface AppPaths {
  baseDir: string;
  database: string;
  backups: string;
  logs: string;
  exports: string;
  settings: string;
}

export function resolveAppPaths(baseDir: string): AppPaths {
  return {
    baseDir,
    database: join(baseDir, 'planner.db'),
    backups: join(baseDir, 'backups'),
    logs: join(baseDir, 'logs'),
    exports: join(baseDir, 'exports'),
    settings: join(baseDir, 'settings.json'),
  };
}
