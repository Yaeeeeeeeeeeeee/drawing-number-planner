import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import writeXlsxFile from 'write-excel-file/node';
import { afterEach, expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { parseEmailTemplateWorkbook, previewEmailTemplates, confirmEmailTemplates } from '../../src/core/import/email-template-import';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(dir => rmSync(dir, { recursive: true, force: true })));
export async function mailWorkbook(path?: string) {
  const sheets = [{ sheet: '首批包材资料', data: [
    ['厂家', '实际甲厂', '实际乙厂'], ['场景', '缺铭牌', '完整交付'],
    ['联系人', '陈工', '李工'], ['收件人', 'chen@example.com', 'li@example.com'],
    ['邮件主题', '{{brand}} {{model}}首批资料', '首批资料'],
    ['邮件正文', '陈工您好：\n资料请查收。\n谢谢！', '李工您好：\n请查收完整资料。'],
    ['场景', '补铭牌', null], ['邮件主题', '补铭牌', null], ['邮件正文', '请补充查收铭牌。', null],
  ] }, { sheet: '更新包材资料', data: [['厂家：实际甲厂'], ['场景：更新资料'], ['主题：旧型号 T40 2025-01-01 PO123'], ['正文：历史修改原因：尺寸调整\n旧附件：旧文件.pdf']] },
  { sheet: 'ITR', data: [['厂家', '实际甲厂'], ['邮件主题', 'ITR']] }];
  const data = sheets.map(sheet => ({ ...sheet, data: sheet.data.map(row => row.map(value => value == null ? null : { value, type: String })) }));
  if (path) await writeXlsxFile(data).toFile(path);
  return writeXlsxFile(data).toBuffer();
}
it('parses real XLSX from disk with horizontal manufacturers, multiline blocks and distinct scenarios; retains unsafe examples for review', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-import-')); dirs.push(dir);
  const path = join(dir, 'template.xlsx'); await mailWorkbook(path);
  const report = await parseEmailTemplateWorkbook(path);
  expect(report.sheets).toContainEqual(expect.objectContaining({ name: 'ITR', supported: false }));
  expect(report.candidates.map(row => [row.manufacturer, row.scenario])).toEqual([
    ['实际甲厂', '缺铭牌'], ['实际乙厂', '完整交付'], ['实际甲厂', '补铭牌'], ['实际甲厂', '更新资料'],
  ]);
  expect(report.candidates[0].bodyTemplate).toContain('\n资料请查收。\n');
  expect(report.candidates[3].requiresReview).toBe(true);
  expect(report.candidates[3].rawReference).toContain('PO123');
});
it('previews without writing, backs up confirmed imports, skips identical reimports and blocks stale update fingerprints', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-import-')); dirs.push(dir);
  const db = openDatabase(join(dir, 'planner.db')); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  try {
    const report = previewEmailTemplates(await parseEmailTemplateWorkbook(await mailWorkbook()), db);
    expect(db.prepare('select count(*) n from outbound_contacts').get()).toEqual({ n: 0 });
    const row = { ...report.candidates[0], action: 'create' as const, confirmed: true, contactsConfirmed: true, historyReviewed: true };
    const result = confirmEmailTemplates(report, [row], db);
    expect(result).toMatchObject({ created: 1, updated: 0, contactsCreated: 1 }); expect(existsSync(result.backupPath!)).toBe(true);
    const again = previewEmailTemplates(await parseEmailTemplateWorkbook(await mailWorkbook()), db);
    expect(again.candidates[0].match).toBe('identical');
    expect(confirmEmailTemplates(again, [{ ...row, action: 'skip' }], db).skipped).toBe(4);
    db.prepare("update outbound_email_templates set body_template = '人工修改' where manufacturer = '实际甲厂'").run();
    const changed = previewEmailTemplates(await parseEmailTemplateWorkbook(await mailWorkbook()), db);
    expect(changed.candidates[0].match).toBe('update');
    db.prepare("update outbound_email_templates set subject_template = '再次修改' where manufacturer = '实际甲厂'").run();
    expect(() => confirmEmailTemplates(changed, [{ ...changed.candidates[0], action: 'update', confirmed: true, contactsConfirmed: true, historyReviewed: true }], db)).toThrow(/已改变/);
    expect(db.prepare('select body_template from outbound_email_templates where manufacturer = ?').get('实际甲厂')).toEqual({ body_template: '人工修改' });
  } finally { db.close(); }
});
it('uses real horizontal merged manufacturer cells without cloning merged multiline bodies', async () => {
  const buffer = await writeXlsxFile([{ sheet: '首批包材资料', data: [
    [{ value: '厂家', type: String }, { value: '实际合并厂', type: String, columnSpan: 2 }, null],
    ['场景', '缺铭牌', '补铭牌'].map(value => ({ value, type: String })),
    ['主题', '第一场景', '第二场景'].map(value => ({ value, type: String })),
    [{ value: '正文', type: String }, { value: '第一段\n第二段', type: String, rowSpan: 2 }, { value: '请查收补充资料', type: String }],
    [null, null, null],
  ] }]).toBuffer();
  const report = await parseEmailTemplateWorkbook(buffer);
  expect(report.candidates).toHaveLength(2);
  expect(report.candidates.map(row => row.manufacturer)).toEqual(['实际合并厂', '实际合并厂']);
  expect(report.candidates[0].bodyTemplate).toBe('第一段\n第二段');
});
it('rolls back all templates and contacts on later invalid data and rejects contact conflicts until excluded', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-rollback-')); dirs.push(dir);
  const db = openDatabase(join(dir, 'planner.db')); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  try {
    const report = previewEmailTemplates(await parseEmailTemplateWorkbook(await mailWorkbook()), db);
    const rows = report.candidates.slice(0, 2).map(row => ({ ...row, action: 'create' as const, confirmed: true, contactsConfirmed: true, historyReviewed: true }));
    rows[1].bodyTemplate = '{{unverified_history}}';
    expect(() => confirmEmailTemplates(report, rows, db)).toThrow(/未知变量/);
    expect(db.prepare('select count(*) n from outbound_contacts').get()).toEqual({ n: 0 });
    expect(db.prepare('select count(*) n from outbound_email_templates where manufacturer is not null').get()).toEqual({ n: 0 });
    db.prepare("insert into outbound_contacts (company, contact_name, email, default_recipient_type, status, created_at, updated_at) values ('别家', '别名', 'chen@example.com', 'cc', 'active', 'old', 'old')").run();
    const conflicted = previewEmailTemplates(await parseEmailTemplateWorkbook(await mailWorkbook()), db);
    expect(conflicted.candidates[0].contacts[0].conflict).toContain('别家');
    expect(() => confirmEmailTemplates(conflicted, [rows[0]], db)).toThrow(/关联冲突/);
    const excluded = { ...rows[0], contacts: rows[0].contacts.map(contact => ({ ...contact, resolution: 'skip' as const })) };
    expect(confirmEmailTemplates(conflicted, [excluded], db)).toMatchObject({ created: 1, contactsCreated: 0 });
    expect(db.prepare('select company from outbound_contacts').get()).toEqual({ company: '别家' });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  } finally { db.close(); }
});
it('keeps all business rows untouched when SQLite backup cannot be created', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-backup-failure-')); dirs.push(dir);
  const db = openDatabase(join(dir, 'planner.db')); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  try {
    writeFileSync(join(dir, 'backups'), 'not a directory');
    const report = previewEmailTemplates(await parseEmailTemplateWorkbook(await mailWorkbook()), db);
    expect(() => confirmEmailTemplates(report, [{ ...report.candidates[0], action: 'create', confirmed: true, contactsConfirmed: true, historyReviewed: true }], db)).toThrow(/备份失败/);
    expect(db.prepare('select count(*) n from outbound_contacts').get()).toEqual({ n: 0 });
    expect(db.prepare('select count(*) n from outbound_email_templates where manufacturer is not null').get()).toEqual({ n: 0 });
  } finally { db.close(); }
});
it('explicitly updates a matched template without changing its identity and deduplicates contacts on reimport', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mail-update-')); dirs.push(dir);
  const db = openDatabase(join(dir, 'planner.db')); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  try {
    const report = previewEmailTemplates(await parseEmailTemplateWorkbook(await mailWorkbook()), db);
    confirmEmailTemplates(report, [{ ...report.candidates[0], action: 'create', confirmed: true, contactsConfirmed: true, historyReviewed: true }], db);
    const original = db.prepare('select id, key from outbound_email_templates where manufacturer = ?').get('实际甲厂');
    const revised = await parseEmailTemplateWorkbook(await mailWorkbook()); revised.candidates[0].bodyTemplate = '经人工核对的新固定话术。';
    const preview = previewEmailTemplates(revised, db);
    expect(preview.candidates[0].match).toBe('update');
    expect(confirmEmailTemplates(preview, [{ ...preview.candidates[0], action: 'update', confirmed: true, contactsConfirmed: true, historyReviewed: true }], db))
      .toMatchObject({ created: 0, updated: 1, contactsCreated: 0 });
    expect(db.prepare('select id, key from outbound_email_templates where manufacturer = ?').get('实际甲厂')).toEqual(original);
    expect(db.prepare('select count(*) n from outbound_contacts').get()).toEqual({ n: 1 });
    const again = previewEmailTemplates(revised, db);
    expect(confirmEmailTemplates(again, [{ ...again.candidates[0], action: 'create', confirmed: true, contactsConfirmed: true, historyReviewed: true }], db))
      .toMatchObject({ created: 0, updated: 0, skipped: 4, contactsCreated: 0 });
  } finally { db.close(); }
});
it('retains unlabelled text for correction without inventing a manufacturer, subject or variables', async () => {
  const buffer = await writeXlsxFile([{ sheet: '首批包材资料', data: [
    [{ value: '首批包材资料', type: String }], [{ value: '过去 T40 2024-01-01 发出的历史示例，请调整尺寸。', type: String }],
  ] }]).toBuffer();
  const report = await parseEmailTemplateWorkbook(buffer);
  expect(report.candidates).toHaveLength(1);
  expect(report.candidates[0]).toMatchObject({ manufacturer: '', subjectTemplate: '', scenario: '', requiresReview: true });
  expect(report.candidates[0].rawReference).toContain('T40 2024-01-01');
  expect(report.candidates[0].bodyTemplate).not.toContain('{{');
});
