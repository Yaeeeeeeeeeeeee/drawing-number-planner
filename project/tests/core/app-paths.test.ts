import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveAppPaths } from '../../src/core/config/app-paths';

describe('resolveAppPaths', () => {
  it('keeps application data separate from the future document workspace', () => {
    const baseDir = mkdtempSync(join(tmpdir(), 'drawing-planner-paths-'));
    const paths = resolveAppPaths(baseDir);

    expect(paths.baseDir).toBe(baseDir);
    expect(paths.database).toBe(join(baseDir, 'planner.db'));
    expect(paths.backups).toBe(join(baseDir, 'backups'));
    expect(paths.logs).toBe(join(baseDir, 'logs'));
    expect(paths.exports).toBe(join(baseDir, 'exports'));
    expect(paths.settings).toBe(join(baseDir, 'settings.json'));
    expect(Object.keys(paths)).not.toContain('workspaceRoot');
  });
});
