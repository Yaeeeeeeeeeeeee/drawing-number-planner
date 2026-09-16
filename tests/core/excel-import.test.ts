import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { auditRows } from '../../src/core/import/excel-audit';
import { importApprovedRows, prepareApprovedRows } from '../../src/core/import/excel-import';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

type Cell = string | number | null;
let db: PlannerDatabase;

function sourceRows(): Cell[][] {
  const rows = Array.from({ length: 23 }, () => Array<Cell>(14).fill(null));
  rows[20][8] = '电子元件类';
  rows[21] = [null, null, '0', '白色', '01', 'SAMKYO', null, '电子元件类', 'PCB面板'];
  rows[22] = [null, null, '1', '黑色', '02', 'VIBMI', null, null, '数码管'];
  return rows;
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
});
afterEach(() => db.close());

describe('approved Excel import', () => {
  it('precomputes selected rows incrementally and can cancel in the middle without writing', async () => {
    const report = auditRows(sourceRows()); const controller = new AbortController(); const progress: number[] = [];
    const operation = prepareApprovedRows(report, ['brand:F22', 'main_category:H22', 'project_item:I22'], db, {
      signal: controller.signal,
      onProgress: (processed) => { progress.push(processed); if (processed === 2) controller.abort(new Error('cancelled')); },
    });
    await expect(operation).rejects.toThrow('cancelled');
    expect(progress).toEqual([1, 2]);
    expect(db.prepare('select count(*) as count from dictionary_items').get()).toEqual({ count: 0 });
  });

  it('reports every prepared row before returning a commit-ready plan', async () => {
    const report = auditRows(sourceRows()); const progress: number[] = [];
    const prepared = await prepareApprovedRows(report,
      ['brand:F22', 'main_category:H22', 'project_item:I22'], db,
      { onProgress: (processed) => progress.push(processed) });
    expect(progress).toEqual([1, 2, 3]);
    expect(prepared).toMatchObject({ imported: 3, skipped: report.candidates.length - 3 });
    expect(db.prepare('select count(*) as count from dictionary_items').get()).toEqual({ count: 0 });
  });
  it('imports only explicitly selected conflict-free rows and resolves project parents', () => {
    const report = auditRows(sourceRows());

    const result = importApprovedRows(report, [
      'brand:F22', 'main_category:H22', 'project_item:I22',
    ], db);

    expect(result).toEqual({ imported: 3, skipped: report.candidates.length - 3 });
    expect(db.prepare('select type, code, name from dictionary_items order by id').all()).toEqual([
      { type: 'brand', code: '01', name: 'SAMKYO' },
      { type: 'main_category', code: '01', name: '电子元件类' },
      { type: 'project_item', code: '01', name: 'PCB面板' },
    ]);
    expect(db.prepare(`select parent.name as parent_name from dictionary_items item
      join dictionary_items parent on parent.id = item.parent_id
      where item.type = 'project_item'`).get()).toEqual({ parent_name: '电子元件类' });
  });

  it('rejects a selected audit conflict without writing any rows', () => {
    const rows = sourceRows();
    rows[21][0] = '0209'; rows[21][1] = 'ZC200冰柜';
    rows[22][0] = '0209'; rows[22][1] = 'ZC220冰柜';
    const report = auditRows(rows);

    expect(() => importApprovedRows(report, ['brand:F22', 'product_size:B22'], db))
      .toThrowError(expect.objectContaining({ code: 'IMPORT_CONFLICT' }));
    expect(db.prepare('select count(*) as count from dictionary_items').get()).toEqual({ count: 0 });
  });

  it('rolls back earlier inserts when a database conflict occurs', () => {
    db.prepare(`insert into dictionary_items (type, code, name, created_at)
      values ('brand', '01', '已有品牌', '2026-08-24T00:00:00Z')`).run();
    const report = auditRows(sourceRows());

    expect(() => importApprovedRows(report, ['color:D22', 'brand:F22'], db))
      .toThrowError(expect.objectContaining({ code: 'DUPLICATE_CODE' }));
    expect(db.prepare("select count(*) as count from dictionary_items where type = 'color'").get())
      .toEqual({ count: 0 });
  });
});
