import { describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';

import { auditRows, auditWorkbook, includeDatabaseConflicts } from '../../src/core/import/excel-audit';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

type Cell = string | number | null;

function sourceRows(): Cell[][] {
  const rows = Array.from({ length: 25 }, () => Array<Cell>(14).fill(null));
  rows[20] = ['品类尺寸', null, '颜色字典', null, null, '品牌字典', '外观编号字典', '主类别',
    '电子元件类', '铭牌类', '提示贴纸类', '印刷件类', '包装类', '层数'];
  rows[21] = ['0209', 'ZC200冰柜', '0', '白色', '01', 'SAMKYO', '1号外观', '电子元件类',
    'PCB面板', '铭牌', null, 'LOGO', '大外箱', '单层'];
  rows[22] = ['0209', 'ZC220冰柜', '1', '黑色', '02', 'VIBMI', '2号外观', '铭牌类',
    '数码管', '电池铭牌', null, '说明书', '产品盒', '双层'];
  rows[23] = ['0210', null, null, null, '03', null, null, '提示贴纸类', null, null,
    '顶部贴纸', null, null, null];
  rows[24] = ['0211', 'ZC260冰柜', null, null, '04', null, null, '印刷件类', null, null,
    '内腔贴纸', '售后卡', null, null];
  return rows;
}

describe('Excel dictionary audit', () => {
  it('reports duplicate codes and incomplete pairs while retaining source locations', () => {
    const report = auditRows(sourceRows());

    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'DUPLICATE_CODE', dictionaryType: 'product_size', value: '0209' }),
      expect.objectContaining({ code: 'INCOMPLETE_ROW', dictionaryType: 'product_size', sourceCell: 'A24:B24' }),
    ]));
    expect(report.candidates).toContainEqual(expect.objectContaining({
      id: 'brand:F22', type: 'brand', code: '01', name: 'SAMKYO', sourceCell: 'E22:F22',
    }));
    expect(report.candidates).toContainEqual(expect.objectContaining({
      id: 'project_item:I22', type: 'project_item', code: '01', name: 'PCB面板',
      parentName: '电子元件类', sourceCell: 'E22:I22',
    }));
  });

  it('reads the named worksheet from xlsx data and preserves text codes with leading zeros', async () => {
    const buffer = await writeXlsxFile([{ sheet: '新版图号', data: sourceRows() }]).toBuffer();
    const report = await auditWorkbook(buffer);

    expect(report.candidates).toContainEqual(expect.objectContaining({
      type: 'product_size', code: '0209', name: 'ZC200冰柜',
    }));
  });

  it('rejects legacy xls content with a conversion instruction', async () => {
    const legacyHeader = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

    await expect(auditWorkbook(legacyHeader)).rejects.toMatchObject({
      code: 'UNSUPPORTED_LEGACY_XLS',
    });
  });

  it('marks candidates that already conflict with the current database before confirmation', () => {
    const database = openDatabase(':memory:');
    migrateDatabase(database, { databaseExists: false, createBackup: () => undefined });
    database.prepare(`insert into dictionary_items (type, code, name, created_at)
      values ('brand', '01', '已有品牌', '2026-08-24T00:00:00Z')`).run();

    const report = includeDatabaseConflicts(auditRows(sourceRows()), database);

    expect(report.issues).toContainEqual(expect.objectContaining({
      code: 'DATABASE_CONFLICT', dictionaryType: 'brand', value: '01', candidateIds: ['brand:F22'],
    }));
    database.close();
  });
});
