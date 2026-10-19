// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { registerFileRoutes } from '../../src/server/routes/files';

const databases: PlannerDatabase[] = [];
afterEach(() => databases.splice(0).forEach((db) => db.close()));
async function fixture() {
  const db = openDatabase(':memory:'); databases.push(db);
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  const repository = new FileRepository(db);
  repository.replaceScan([{ relativePath: 'unknown.pdf', fileName: 'unknown.pdf', drawingId: null,
    matchStatus: 'unmatched', detectedCodes: [], conversionType: 'source', sizeBytes: 1,
    modifiedAt: '2026-10-19T00:00:00.000Z' }], [], '2026-10-19T00:00:00.000Z');
  const service = new FileService(repository, new WorkspaceSettingsStore('/nonexistent/pdf-navigation-settings.json'));
  const app = Fastify(); registerFileRoutes(app, service);
  return { app, db };
}

describe('read-only PDF navigation endpoint', () => {
  it('returns manual-filtered navigation counts without changing any persisted data', async () => {
    const { app, db } = await fixture();
    try {
      const snapshot = db.serialize();
      const result = await app.inject('/api/files/navigation?presence=all&keyword=unknown&matchStatus=unmatched');
      expect(result.statusCode).toBe(200);
      expect(result.json()).toEqual({ total: 1, unassociatedProducts: 1, categories: [], products: [], batches: [] });
      expect((await app.inject('/api/files/navigation?conversionType=outlined')).json().total).toBe(0);
      expect((await app.inject('/api/files?unassociatedProduct=true&presence=all')).json().total).toBe(1);
      expect((await app.inject('/api/files?unassociatedProduct=false&presence=all')).json().total).toBe(0);
      expect(db.serialize().equals(snapshot)).toBe(true);
    } finally { await app.close(); }
  });

  it('rejects malformed filters and navigation scope on the statistics endpoint', async () => {
    const { app } = await fixture();
    try {
      for (const query of ['unknown=true', 'page=1', 'productId=1', 'materialBatchId=1',
        'productCategory=anything', 'unassociatedProduct=true', 'presence=invalid', 'matchStatus=invalid']) {
        expect((await app.inject(`/api/files/navigation?${query}`)).statusCode, query).toBe(400);
      }
      for (const query of ['unassociatedProduct=1', 'unassociatedProduct=', 'unassociatedProduct=no',
        'productCategory=', 'productId=-1', 'materialBatchId=0']) {
        expect((await app.inject(`/api/files?${query}`)).statusCode, query).toBe(400);
      }
    } finally { await app.close(); }
  });
});
