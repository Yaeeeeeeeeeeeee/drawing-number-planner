import writeXlsxFile from 'write-excel-file/node';

/** Anonymous structure matching the supplied workbook; no source personal data. */
export async function matrixWorkbook() {
  const signature = 'Best regards,\nExample Author\nExample Team\nTel: 000';
  const sheets = ['首批包材资料', '更新包材资料'].map((sheet, sheetIndex) => {
    const rows: any[][] = Array.from({ length: sheetIndex ? 11 : 14 }, () => Array(11).fill(null));
    const cell = (row: number, column: number, value: string, span = 1) => { rows[row - 1][column - 1] = { value, type: String, ...(span > 1 ? { columnSpan: span } : {}) }; };
    cell(1, 1, '主体'); cell(1, 2, '时间'); cell(2, 1, 'Template');
    cell(7, 1, '邮件收件人'); rows[6][0].rowSpan = 2;
    cell(9, 1, '邮件抄送人'); cell(10, 1, '邮件主题');
    ['缺铭牌', '补铭牌', '正铭牌', '完整交付'].slice(0, sheetIndex ? 1 : 4).forEach((scenario, index) => cell(11 + index, 1, sheetIndex ? '邮件内容（历史案例）' : `邮件内容（${scenario}）`));
    for (let supplier = 0; supplier < 5; supplier++) {
      const col = 2 + supplier * 2;
      cell(2, col, `供应商${supplier + 1}`, 2);
      ['品牌', '型号', '产品'].forEach((label, index) => { cell(3 + index, col, label); cell(3 + index, col + 1, ['DemoBrand', 'M123', 'DemoProduct'][index]); });
      cell(6, col, 'M123-2025-01-01-PO123.zip', 2);
      cell(7, col, `${['a', 'c', 'd', 'e', 'f'][supplier]}@example.com`, 2);
      if (supplier === 0 || (sheetIndex && supplier === 2)) cell(8, col, `${supplier === 0 ? 'b' : 'g'}@example.com`, 2);
      cell(9, col, (sheetIndex && supplier === 3 ? ['k', 'j', 'i', 'h', 'e', 'l', 'm', 'n'] : ['h', 'i', 'j', 'k', 'h']).map(name => `Review ${name} <${name}@example.com>`).join('; '), 2);
      cell(10, col, 'DemoBrand M123 DemoProduct 2025-01-01 PO123资料', 2);
      for (let scenario = 0; scenario < (sheetIndex ? 1 : 4); scenario++) {
        cell(11 + scenario, col, `${sheetIndex ? `历史原因${supplier + 1}，旧文件${supplier + 1}.pdf` : scenario < 2 ? '请查收资料。' : `请查收场景${scenario}资料。`}\n\n${signature}`, 2);
      }
    }
    return { sheet, data: rows };
  });
  return writeXlsxFile([...sheets, ...['配件', 'ITR'].map(sheet => ({ sheet, data: [[{ value: '忽略', type: String }]] }))]).toBuffer();
}
