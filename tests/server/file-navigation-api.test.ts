// @vitest-environment node
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { FileRepository } from '../../src/core/files/file-repository';
import { FileService } from '../../src/core/files/file-service';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';
import { parseDrawingCode } from '../../src/core/drawings/drawing-code';
import { parseMaterialBatch } from '../../src/core/files/material-batch-parser';
import type { FileScanRecord } from '../../src/core/files/file-types';
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
  return { app, db, repository };
}

describe('read-only PDF navigation endpoint', () => {
  it('returns manual-filtered navigation counts without changing any persisted data', async () => {
    const { app, db } = await fixture();
    try {
      const snapshot = db.serialize();
      const result = await app.inject('/api/files/navigation?presence=all&keyword=unknown&matchStatus=unmatched');
      expect(result.statusCode).toBe(200);
      expect(result.json()).toEqual({ total: 1, unassociatedProducts: 1, categories: [], products: [], batches: [], appearances: [], appearanceBatches: [] });
      expect((await app.inject('/api/files/navigation?conversionType=outlined')).json().total).toBe(0);
      expect((await app.inject('/api/files?unassociatedProduct=true&presence=all')).json().total).toBe(1);
      expect((await app.inject('/api/files?unassociatedProduct=false&presence=all')).json().total).toBe(0);
      expect(db.serialize().equals(snapshot)).toBe(true);
    } finally { await app.close(); }
  });

  it('returns every null-product indexed file with the same manual filters as its pending-product count', async () => {
    const { app, repository } = await fixture();
    const code = parseDrawingCode('02.0404.010.0401007')!;
    const root = '03.冰柜\\UNKNOWN-Z40\\03.量产后的变更文件';
    const records: FileScanRecord[] = [
      ...['00.首批大货', '01.20241210'].map(batch => ({
        relativePath: `${root}\\${batch}\\same.pdf`, fileName: 'same.pdf', drawingId: null,
        historicalFullCode: code.fullCode, matchStatus: 'matched' as const, detectedCodes: [code.fullCode],
        conversionType: 'source' as const, sizeBytes: 1, modifiedAt: '2026-10-19T00:00:00.000Z',
        materialBatch: parseMaterialBatch(`${root}\\${batch}\\same.pdf`),
      })),
      { relativePath: 'pending.pdf', fileName: 'pending.pdf', drawingId: null, matchStatus: 'pending',
        detectedCodes: [], conversionType: 'outlined', sizeBytes: 1, modifiedAt: '2026-10-19T00:00:00.000Z' },
      { relativePath: `${root}\\01.20241210\\missing.pdf`, fileName: 'missing.pdf', drawingId: null,
        matchStatus: 'unmatched', detectedCodes: [], conversionType: 'source', sizeBytes: 1,
        modifiedAt: '2026-10-19T00:00:00.000Z', materialBatch: parseMaterialBatch(`${root}\\01.20241210\\missing.pdf`) },
    ];
    repository.replaceScan(records, [{ ...code, directoryContext: null }], '2026-10-19T00:00:00.000Z');
    repository.replaceScan(records.slice(0, -1), [], '2026-10-19T00:00:00.000Z');
    try {
      for (const query of ['presence=all', 'presence=missing', 'presence=present',
        'presence=all&matchStatus=matched', 'presence=all&matchStatus=pending',
        'presence=all&conversionType=outlined', 'presence=all&keyword=same', 'presence=all&keyword=absent']) {
        const stats = await app.inject(`/api/files/navigation?${query}`);
        const list = await app.inject(`/api/files?unassociatedProduct=true&${query}`);
        expect(stats.statusCode, query).toBe(200); expect(list.statusCode, query).toBe(200);
        expect(list.json().total, query).toBe(stats.json().unassociatedProducts);
        expect(new Set(list.json().items.map((file: { id: number }) => file.id)).size).toBe(list.json().total);
      }
      const pending = (await app.inject('/api/files?presence=all&unassociatedProduct=true')).json();
      expect(pending.total).toBe(5); // Includes the preexisting unknown fixture index, now missing.
      expect(pending.items.filter((file: { matchStatus: string }) => file.matchStatus === 'matched')).toHaveLength(2);
      expect(pending.items.filter((file: { materialBatchId: number | null }) => file.materialBatchId !== null)).toHaveLength(3);
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
