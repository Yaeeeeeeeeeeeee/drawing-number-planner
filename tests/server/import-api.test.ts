import Fastify from 'fastify';
import writeXlsxFile from 'write-excel-file/node';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { registerImportRoutes } from '../../src/server/routes/import';

type Cell = string | null;
let db: PlannerDatabase;

function multipartFile(buffer: Buffer, filename: string) {
  const boundary = '----drawing-planner-test-boundary';
  const start = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n',
  );
  const end = Buffer.from(`\r\n--${boundary}--\r\n`);
  return {
    payload: Buffer.concat([start, buffer, end]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

async function workbook(): Promise<Buffer> {
  const rows = Array.from({ length: 22 }, () => Array<Cell>(14).fill(null));
  rows[20][8] = '电子元件类';
  rows[21] = [null, null, '0', '白色', '01', 'SAMKYO', null, '电子元件类', 'PCB面板'];
  return writeXlsxFile([{ sheet: '新版图号', data: rows }]).toBuffer();
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
});
afterEach(() => db.close());

describe('Excel import API', () => {
  it('audits an uploaded workbook then imports only confirmed candidates', async () => {
    const app = Fastify();
    let backups = 0;
    await registerImportRoutes(app, db, () => { backups += 1; });

    const auditResponse = await app.inject({ method: 'POST', url: '/api/import/excel/audit', ...multipartFile(await workbook(), '规划.xlsx') });
    expect(auditResponse.statusCode).toBe(200);
    const audit = auditResponse.json();
    expect(audit.auditId).toEqual(expect.any(String));
    expect(audit.report.candidates).toContainEqual(expect.objectContaining({ id: 'brand:F22' }));

    const importResponse = await app.inject({
      method: 'POST', url: '/api/import/excel/confirm',
      payload: { auditId: audit.auditId, selections: ['brand:F22'] },
    });
    expect(importResponse.statusCode).toBe(200);
    expect(importResponse.json()).toEqual({ imported: 1, skipped: 3 });
    expect(backups).toBe(1);
    expect(db.prepare("select name from dictionary_items where type = 'brand'").get()).toEqual({ name: 'SAMKYO' });

    await app.close();
  });

  it('blocks an import when the mandatory pre-import backup fails', async () => {
    const app = Fastify();
    await registerImportRoutes(app, db, () => { throw new Error('disk unavailable'); });
    const auditResponse = await app.inject({ method: 'POST', url: '/api/import/excel/audit', ...multipartFile(await workbook(), '规划.xlsx') });
    const audit = auditResponse.json();

    const response = await app.inject({
      method: 'POST', url: '/api/import/excel/confirm',
      payload: { auditId: audit.auditId, selections: ['brand:F22'] },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: { code: 'BACKUP_FAILED', message: '导入前备份失败，未执行导入' } });
    expect(db.prepare("select count(*) as count from dictionary_items where type = 'brand'").get()).toEqual({ count: 0 });
    await app.close();
  });

  it('returns a stable error when a legacy xls file is uploaded', async () => {
    const app = Fastify();
    await registerImportRoutes(app, db, () => undefined);
    const legacy = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

    const response = await app.inject({ method: 'POST', url: '/api/import/excel/audit', ...multipartFile(legacy, '规划.xls') });
    expect(response.statusCode).toBe(415);
    expect(response.json()).toEqual({
      error: { code: 'UNSUPPORTED_LEGACY_XLS', message: '旧版 .xls 文件需先另存为 .xlsx 后再导入' },
    });

    await app.close();
  });
});
