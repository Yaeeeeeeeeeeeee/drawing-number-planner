import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import readWorkbook from 'read-excel-file/node';
import { expandManufacturerHeaders, worksheetMergeRanges } from './email-workbook-merges.js';
import type { PlannerDatabase } from '../../db/database.js';
import { createDatabaseBackup } from '../../db/backup.js';
import { OutboundReferenceService, type OutboundEmailTemplate } from '../outbound/outbound-reference-service.js';
import type { EmailImportContact, EmailTemplateImportCandidate, EmailTemplateImportReport,
  EmailTemplateImportResult, EmailTemplateImportSelection } from './email-template-import-types.js';

export class EmailTemplateImportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}
const fail = (message: string): never => { throw new EmailTemplateImportError('IMPORT_CONFLICT', message); };
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = (row: Pick<EmailTemplateImportCandidate, 'manufacturer' | 'materialType' | 'scenario'>) =>
  [row.manufacturer.trim(), row.materialType, row.scenario.trim()].join('\0');
const importKey = (row: Pick<EmailTemplateImportCandidate, 'manufacturer' | 'materialType' | 'scenario'>) => `excel_${digest(identity(row)).slice(0, 24)}`;
const matchesIdentity = (candidate: EmailTemplateImportCandidate, template: OutboundEmailTemplate) =>
  template.key === importKey(candidate) || identity({ manufacturer: template.manufacturer ?? '', materialType: template.materialType, scenario: template.scenario ?? '' }) === identity(candidate);
const fingerprint = (row: OutboundEmailTemplate) => digest(row);
type BlockField = 'manufacturer' | 'scenario' | 'contact' | 'to' | 'cc' | 'subject' | 'body';
const labels: Record<string, BlockField> = { 厂家: 'manufacturer', 厂商: 'manufacturer', 供应商: 'manufacturer',
  场景: 'scenario', 邮件场景: 'scenario', 联系人: 'contact', 联系人称呼: 'contact', 称呼: 'contact',
  收件人: 'to', 收件邮箱: 'to', 抄送: 'cc', 抄送人: 'cc', 主题: 'subject', 邮件主题: 'subject',
  正文: 'body', 邮件正文: 'body', 邮件内容: 'body' };
const label = (text: string) => labels[text.replace(/[：:\s]/gu, '')];
const scenarioText = /^(缺铭牌|补铭牌|正铭牌|完整交付|首批资料|更新资料)$/u;
type Block = { manufacturer: string; scenario: string; contact: string; to: string; cc: string;
  subject: string; body: string; raw: string[]; row: number };

/** Reads actual sheet content. Unknown sheets are listed but never mapped to outbound mail. */
export async function parseEmailTemplateWorkbook(input: Buffer | string): Promise<EmailTemplateImportReport> {
  input = typeof input === 'string' ? readFileSync(input) : input;
  if (Buffer.isBuffer(input) && input.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    throw new EmailTemplateImportError('UNSUPPORTED_LEGACY_XLS', '旧版 .xls 文件需先另存为 .xlsx 后再导入');
  }
  let workbook;
  let merges: string[][];
  try { workbook = await readWorkbook(input); merges = worksheetMergeRanges(input); }
  catch { throw new EmailTemplateImportError('INVALID_WORKBOOK', '无法读取 Excel 工作簿，请选择有效的 .xlsx 文件'); }
  const report: EmailTemplateImportReport = { sheets: [], candidates: [] };
  for (const [sheetIndex, sheet] of workbook.entries()) {
    const materialType = /首批包材资料/u.test(sheet.sheet) ? 'initial' : /更新包材资料/u.test(sheet.sheet) ? 'update' : undefined;
    const before = report.candidates.length;
    if (materialType) {
      const rows = sheet.data.map(row => row.map(value => value == null ? '' : String(value).trim()));
      expandManufacturerHeaders(rows, merges[sheetIndex] ?? []);
      const columns = new Map<number, Block>();
      const fresh = (old?: Block, row = 0): Block => ({ manufacturer: old?.manufacturer ?? '', scenario: old?.scenario ?? '',
        contact: old?.contact ?? '', to: old?.to ?? '', cc: old?.cc ?? '', subject: '', body: '', raw: [], row });
      const flush = (column: number) => {
        const block = columns.get(column); if (!block || (!block.subject && !block.body)) return;
        const scenario = block.scenario || (materialType === 'update' ? '更新资料' : '');
        const contacts: EmailImportContact[] = [];
        for (const role of ['to', 'cc'] as const) {
          const emails = block[role].match(/[^\s,;，；<>]+@[^\s,;，；<>]+\.[^\s,;，；<>]+/gu) ?? [];
          for (const email of emails) contacts.push({ company: block.manufacturer, contactName: block.contact,
            email: email.toLowerCase(), defaultRecipientType: role, resolution: 'import' });
        }
        const warnings = ['待确认：请核对固定话术、动态信息和历史示例；不会自动转换未知文字为变量。'];
        if (!block.manufacturer) warnings.push('厂家待确认');
        if (!scenario) warnings.push('邮件场景待确认');
        if (!block.subject || !block.body) warnings.push('主题或正文未完整识别');
        if ((block.to || block.cc) && !contacts.length) warnings.push('邮箱无法识别，请手动核对');
        if (contacts.some(contact => !contact.contactName)) warnings.push('联系人称呼待确认');
        report.candidates.push({ id: `${sheet.sheet}:${block.row + 1}:${column + 1}`, sheet: sheet.sheet,
          source: `第${block.row + 1}行 / 第${column + 1}列`, manufacturer: block.manufacturer,
          materialType, scenario, name: [block.manufacturer, scenario].filter(Boolean).join(' · '),
          subjectTemplate: block.subject, bodyTemplate: block.body, contacts, rawReference: block.raw.join('\n'),
          requiresReview: true, warnings });
      };
      const set = (column: number, field: BlockField, text: string, row: number) => {
        let block = columns.get(column) ?? fresh(undefined, row);
        if ((field === 'manufacturer' && block.manufacturer !== text) || (field === 'scenario' && block.scenario !== text)
          || (field === 'subject' && block.subject)) {
          columns.set(column, block); flush(column); block = fresh(block, row);
          if (field === 'manufacturer') { block.scenario = ''; block.contact = ''; block.to = ''; block.cc = ''; }
        }
        block.raw.push(`${field}: ${text}`);
        if (field === 'body' && block.body) block.body += `\n${text}`;
        else block[field] = text;
        columns.set(column, block);
      };
      rows.forEach((row, rowIndex) => {
        const first = row.findIndex(Boolean); if (first < 0) return;
        const field = label(row[first]);
        if (field && row.slice(first + 1).some(Boolean)) {
          row.forEach((text, column) => { if (column > first && text) set(column, field, text, rowIndex); }); return;
        }
        row.forEach((text, column) => {
          if (!text) return;
          // A single cell can contain an entire labelled mail. Keep multiline bodies intact.
          const parts = text.split(/\n(?=(?:厂家|厂商|供应商|场景|邮件场景|联系人|收件人|抄送人?|邮件主题|主题|邮件正文|正文)[：:])/u);
          for (const part of parts) {
            const match = /^([^：:\n]{1,8})[：:]\s*([\s\S]*)$/u.exec(part);
            if (match && label(match[1])) set(column, label(match[1]), match[2], rowIndex);
            else if (scenarioText.test(part)) set(column, 'scenario', part, rowIndex);
            else if (rowIndex === 0 && row.filter(Boolean).length > 1 && !label(part) && !/[\n@]/u.test(part)
              && !/包材资料|沟通模[板版]|备注/u.test(part)) set(column, 'manufacturer', part, rowIndex);
            else {
              let block = columns.get(column);
              if (!block && /包材资料|沟通模[板版]/u.test(part) && rowIndex === 0) return;
              if (!block) { block = fresh(undefined, rowIndex); columns.set(column, block); }
              set(column, 'body', part, rowIndex);
            }
          }
        });
      });
      for (const column of columns.keys()) flush(column);
      const candidates = report.candidates.splice(before);
      candidates.sort((a, b) => Number(a.id.split(':').at(-2)) - Number(b.id.split(':').at(-2)) || Number(a.id.split(':').at(-1)) - Number(b.id.split(':').at(-1)));
      report.candidates.push(...candidates);
    }
    report.sheets.push({ name: sheet.sheet, supported: !!materialType, candidates: report.candidates.length - before });
  }
  return report;
}

function sameContent(candidate: EmailTemplateImportCandidate, existing: OutboundEmailTemplate): boolean {
  return identity(candidate) === identity({ manufacturer: existing.manufacturer ?? '', materialType: existing.materialType, scenario: existing.scenario ?? '' })
    && candidate.name.trim() === existing.name && candidate.subjectTemplate.trim() === existing.subjectTemplate
    && candidate.bodyTemplate.trim() === existing.bodyTemplate;
}
export function previewEmailTemplates(report: EmailTemplateImportReport, database: PlannerDatabase): EmailTemplateImportReport {
  const service = new OutboundReferenceService(database); const templates = service.listTemplates(); const contacts = service.listContacts();
  return { ...report, candidates: report.candidates.map(candidate => {
    const matches = templates.filter(row => matchesIdentity(candidate, row));
    const duplicate = report.candidates.filter(row => identity(row) === identity(candidate)).length > 1;
    const existing = matches[0];
    return { ...candidate, match: duplicate || matches.length > 1 ? 'conflict' : !existing ? 'new' : sameContent(candidate, existing) ? 'identical' : 'update',
      existingId: existing?.id, expectedFingerprint: existing && fingerprint(existing),
      existing: existing && { name: existing.name, subjectTemplate: existing.subjectTemplate, bodyTemplate: existing.bodyTemplate },
      warnings: [...candidate.warnings, ...(duplicate ? ['同一厂家、资料类型和场景出现多条候选，请修正场景后分别导入'] : [])],
      contacts: candidate.contacts.map(contact => { const found = contacts.find(item => item.email.toLowerCase() === contact.email.toLowerCase());
        return { ...contact, conflict: found && (found.company !== contact.company || found.contactName !== contact.contactName || found.defaultRecipientType !== contact.defaultRecipientType || found.status !== 'active')
          ? `邮箱已关联：${found.company} / ${found.contactName} / ${found.defaultRecipientType} / ${found.status}，请修正或跳过此联系人` : undefined }; }) };
  }) };
}

export function confirmEmailTemplates(report: EmailTemplateImportReport, selections: EmailTemplateImportSelection[], database: PlannerDatabase): EmailTemplateImportResult {
  const selected = selections.filter(row => row.action !== 'skip');
  if (new Set(selections.map(row => row.id)).size !== selections.length) fail('选择中存在重复候选');
  for (const row of selections) if (!report.candidates.some(candidate => candidate.id === row.id)) fail('候选不存在，请重新预览');
  const result: EmailTemplateImportResult = { created: 0, updated: 0, skipped: report.candidates.length - selected.length, contactsCreated: 0 };
  if (!selected.length) return result;
  if (new Set(selected.map(identity)).size !== selected.length) fail('厂家、资料类型和场景重复，请核对后导入');
  for (const row of selected) {
    if (!row.confirmed || !row.contactsConfirmed || !row.historyReviewed) fail('请确认所选模板、联系人关联及历史示例审查');
    if (!row.manufacturer.trim() || !row.scenario.trim()) fail('厂家和邮件场景不能为空');
  }
  // The backup is mandatory and precedes the transaction. No business row is written during preview.
  if (database.name === ':memory:') fail('邮件模板导入需使用可备份的本地数据库');
  try { result.backupPath = createDatabaseBackup(database, database.name, join(dirname(database.name), 'backups'), 'import'); }
  catch { throw new EmailTemplateImportError('BACKUP_FAILED', '导入前备份失败，未执行导入'); }
  database.transaction(() => {
    const service = new OutboundReferenceService(database);
    for (const row of selected) {
      const original = report.candidates.find(candidate => candidate.id === row.id)!;
      const matches = service.listTemplates().filter(template => matchesIdentity(row, template));
      if (matches.length > 1) fail('已有模板身份冲突，请先在邮件配置中核对');
      const existing = matches[0];
      const identical = existing && sameContent(row, existing);
      if (existing && !identical && (row.action !== 'update' || existing.id !== original.existingId || fingerprint(existing) !== original.expectedFingerprint || row.expectedFingerprint !== original.expectedFingerprint)) fail('已有模板已改变或未明确选择更新，请重新预览');
      if (!existing && row.action !== 'create') fail('待更新模板已改变，请重新预览');
      for (const contact of row.contacts) {
        if (contact.resolution === 'skip') continue;
        if (contact.company.trim() !== row.manufacturer.trim()) fail('联系人厂家与模板厂家不一致');
        const found = service.listContacts().find(item => item.email.toLowerCase() === contact.email.trim().toLowerCase());
        if (found) {
          if (found.company !== contact.company.trim() || found.contactName !== contact.contactName.trim() || found.defaultRecipientType !== contact.defaultRecipientType || found.status !== 'active') fail('联系人邮箱已有关联冲突，请修正或跳过');
        } else { service.createContact(contact); result.contactsCreated += 1; }
      }
      if (identical) { result.skipped += 1; continue; }
      const input = { key: existing?.key ?? importKey(row), name: row.name,
        materialType: row.materialType, manufacturer: row.manufacturer, scenario: row.scenario,
        subjectTemplate: row.subjectTemplate, bodyTemplate: row.bodyTemplate };
      if (existing) { service.updateTemplate(existing.id, input); result.updated += 1; }
      else { service.createTemplate(input); result.created += 1; }
    }
  }).immediate();
  return result;
}
