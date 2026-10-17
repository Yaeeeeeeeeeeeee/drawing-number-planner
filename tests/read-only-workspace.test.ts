// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDatabase } from '../src/db/database';
import { migrateDatabase } from '../src/db/migrations';
import { createReadonlyWorkspace } from '../scripts/readonly-workspace';

it('serves existing data read-only, rejects writes before handlers, and preserves database bytes and rows', async () => {
  // Disposable service-test fixture; never used as business-data screenshot evidence.
  const dir = mkdtempSync(join(tmpdir(), 'planner-readonly-tool-test-'));
  const path = join(dir, 'planner.db');
  const setup = openDatabase(path);
  migrateDatabase(setup, { databaseExists: false, createBackup: () => undefined }); setup.close();
  const before = readFileSync(path);
  const tool = await createReadonlyWorkspace({ databasePath: path, settingsPath: join(dir, 'settings.json') });
  try {
    expect((await tool.app.inject({ url: '/api/products' })).statusCode).toBe(200);
    for (const [method,url] of [['POST','/api/products'],['POST','/api/planning/reserve'],['DELETE','/api/products/1'],['PUT','/api/workspace-settings']] as const) {
      const result = await tool.app.inject({ method, url, headers: { origin: 'http://127.0.0.1:5190', 'x-planner-token': tool.token }, payload: {} });
      expect(result.statusCode).toBe(403); expect(result.json().error.code).toBe('READ_ONLY_ACCEPTANCE');
    }
    expect(tool.snapshot().tables.products.count).toBe(0);
    expect(tool.snapshot()).toEqual(tool.before);
  } finally { await tool.app.close(); }
  expect(readFileSync(path)).toEqual(before);
  rmSync(dir, { recursive: true, force: true });
});
