import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import readWorkbook from 'read-excel-file/node';
import { parseTemplateMatrix } from './email-template-matrix.js';
import { expandManufacturerHeaders, worksheetMergeRanges } from './email-workbook-merges.js';
import type { PlannerDatabase } from '../../db/database.js';
import { createDatabaseBackup } from '../../db/backup.js';
import { OutboundReferenceService, type OutboundEmailTemplate } from '../outbound/outbound-reference-service.js';
import { OutboundReferenceRepository } from '../outbound/outbound-reference-repository.js';
import type { EmailImportContact, EmailTemplateImportCandidate, EmailTemplateImportReport,
  EmailTemplateImportResult, EmailTemplateImportSelection, EmailImportSignatureChoice } from './email-template-import-types.js';

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
const sourceFacts = (row: EmailTemplateImportCandidate) => ({ candidateId: row.id, sheet: row.sheet, source: row.source,
  manufacturer: row.manufacturer, materialType: row.materialType, scenario: row.scenario,
  sourceCoordinates: row.sourceCoordinates, rawReference: row.rawReference });
const sourceRecorded = (row: EmailTemplateImportCandidate, template: OutboundEmailTemplate) =>
  template.importSources?.some(source => source.contentHash === digest(sourceFacts(row))) ?? false;
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
      if (parseTemplateMatrix(rows, merges[sheetIndex] ?? [], sheet.sheet, materialType, report)) {
        report.sheets.push({ name: sheet.sheet, supported: true, candidates: report.candidates.length - before }); continue;
      }
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
  return { ...report, signatures: report.signatures?.map(signature => ({ ...signature, matches: service.listSignatures('active').filter(row => row.content.trim() === signature.content.trim()).map(row => ({ id: row.id, name: row.name, expectedFingerprint: digest(row) })) })), candidates: report.candidates.map(candidate => {
    const matches = templates.filter(row => matchesIdentity(candidate, row));
    const duplicate = report.candidates.filter(row => identity(row) === identity(candidate)).length > 1;
    const existing = matches[0];
    const sameSource = !!existing && sourceRecorded(candidate, existing);
    return { ...candidate, match: duplicate || matches.length > 1 ? 'conflict' : !existing ? 'new' : sameContent(candidate, existing) && sameSource ? 'identical' : 'update',
      existingId: existing?.id, expectedFingerprint: existing && fingerprint(existing),
      existing: existing && { name: existing.name, subjectTemplate: existing.subjectTemplate, bodyTemplate: existing.bodyTemplate },
      warnings: [...candidate.warnings, ...(duplicate ? ['同一厂家、资料类型和场景出现多条候选，请修正场景后分别导入'] : []),
        ...(existing && !sameSource ? ['来源或历史案例尚未保存，请核对后明确更新；已有来源记录会保留。'] : [])],
      contacts: candidate.contacts.map(contact => { const found = contacts.find(item => item.email.toLowerCase() === contact.email.toLowerCase());
        return { ...contact, resolution: found ? 'reuse' : 'import', existingId: found?.id, expectedFingerprint: found && digest(found),
          conflict: found?.status === 'inactive' ? '已有联系人已停用，请修正或跳过，导入不会激活联系人' : undefined }; }) };
  }) };
}

export function confirmEmailTemplates(report: EmailTemplateImportReport, selections: EmailTemplateImportSelection[], database: PlannerDatabase, signatureChoices: EmailImportSignatureChoice[] = []): EmailTemplateImportResult {
  const selected = selections.filter(row => row.action !== 'skip');
  if (new Set(selections.map(row => row.id)).size !== selections.length) fail('选择中存在重复候选');
  for (const row of selections) if (!report.candidates.some(candidate => candidate.id === row.id)) fail('候选不存在，请重新预览');
  if (new Set(signatureChoices.map(row => row.id)).size !== signatureChoices.length) fail('签名选择重复');
  const signatures = signatureChoices.filter(row => row.action !== 'skip');
  const result: EmailTemplateImportResult = { created: 0, updated: 0, skipped: report.candidates.length - selected.length, contactsCreated: 0, signaturesCreated: 0, signaturesReused: 0 };
  if (!selected.length && !signatures.length) return result;
  if (new Set(selected.map(identity)).size !== selected.length) fail('厂家、资料类型和场景重复，请核对后导入');
  for (const row of selected) {
    if (!row.confirmed || !row.contactsConfirmed || !row.historyReviewed) fail('请确认所选模板、联系人关联及历史示例审查');
    if (!row.manufacturer.trim() || !row.scenario.trim()) fail('厂家和邮件场景不能为空');
  }
  if (database.name === ':memory:') fail('邮件模板导入需使用可备份的本地数据库');
  try { result.backupPath = createDatabaseBackup(database, database.name, join(dirname(database.name), 'backups'), 'import'); }
  catch { throw new EmailTemplateImportError('BACKUP_FAILED', '导入前备份失败，未执行导入'); }
  database.transaction(() => {
    const service = new OutboundReferenceService(database);
    const baselineContacts = service.listContacts();
    for (const choice of signatures) {
      const source = report.signatures?.find(item => item.id === choice.id);
      if (!source || !choice.confirmed) fail('请明确确认来源签名选择');
      if (choice.action === 'reuse') {
        const match = source!.matches?.find(item => item.id === choice.existingId);
        const signature = service.listSignatures().find(item => item.id === choice.existingId);
        if (!match || !signature || signature.status !== 'active' || digest(signature) !== match.expectedFingerprint || choice.expectedFingerprint !== match.expectedFingerprint || signature.content.trim() !== source!.content.trim()) fail('签名已改变或不匹配，请重新预览');
        result.signaturesReused! += 1;
      } else {
        if (!choice.name?.trim() || !choice.content?.trim()) fail('请核对新签名名称和内容');
        service.createSignature({ name: choice.name!, content: choice.content!, isDefault: false }); result.signaturesCreated! += 1;
      }
    }
    for (const row of selected) {
      const original = report.candidates.find(candidate => candidate.id === row.id)!;
      const matches = service.listTemplates().filter(template => matchesIdentity(row, template));
      if (matches.length > 1) fail('已有模板身份冲突，请先在邮件配置中核对');
      const existing = matches[0];
      if (original.existingId && (!existing || existing.id !== original.existingId || fingerprint(existing) !== original.expectedFingerprint || row.expectedFingerprint !== original.expectedFingerprint)) fail('已有模板已改变，请重新预览');
      if (existing && !original.existingId) fail('已有模板已改变，请重新预览');
      if (!existing && row.action !== 'create') fail('待更新模板已改变，请重新预览');
      const links: { contactId: number; recipientType: 'to' | 'cc'; displayOrder: number }[] = [];
      const desired = row.contacts.filter(contact => contact.resolution !== 'skip');
      for (const contact of desired) {
        const email = contact.email.trim().toLowerCase();
        const baseline = baselineContacts.find(item => item.email.toLowerCase() === email);
        const snapshot = original.contacts.find(item => item.email.trim().toLowerCase() === email && item.existingId === baseline?.id);
        if (baseline && (!snapshot || contact.resolution !== 'reuse' || contact.existingId !== baseline.id || snapshot.expectedFingerprint !== digest(baseline) || contact.expectedFingerprint !== snapshot.expectedFingerprint || baseline.status !== 'active')) fail('联系人已改变或关联冲突，请重新预览后明确复用或跳过');
        if (!baseline && (contact.resolution === 'reuse' || contact.existingId)) fail('联系人已改变，请重新预览');
      }
      // Compare before creating contacts: an identical template never silently changes its recipients.
      const desiredKeys = [...new Set(desired.map(contact => `${contact.defaultRecipientType}:${contact.email.trim().toLowerCase()}`))];
      const currentKeys = existing?.contactLinks?.map(link => `${link.recipientType}:${service.getContact(link.contactId).email.toLowerCase()}`) ?? [];
      const linksEqual = !!existing?.contactLinksConfigured && JSON.stringify(desiredKeys) === JSON.stringify(currentKeys);
      const identical = !!existing && sameContent(row, existing);
      const sameSource = !!existing && sourceRecorded(original, existing);
      if (existing && (!identical || !linksEqual || !sameSource) && row.action !== 'update') fail('已有模板、联系人关联或来源案例不同，请明确选择更新');
      if (identical && linksEqual && sameSource) { result.skipped += 1; continue; }
      const orders = { to: 0, cc: 0 }; const seen = new Set<string>();
      for (const contact of desired) {
        const email = contact.email.trim().toLowerCase(); const key = `${contact.defaultRecipientType}:${email}`;
        if (seen.has(key)) continue; seen.add(key);
        let found = service.listContacts().find(item => item.email.toLowerCase() === email);
        if (!found) {
          if (contact.company.trim() !== row.manufacturer.trim()) fail('联系人厂家与模板厂家不一致');
          found = service.createContact({ ...contact, email }); result.contactsCreated += 1;
        }
        links.push({ contactId: found.id, recipientType: contact.defaultRecipientType, displayOrder: orders[contact.defaultRecipientType]++ });
      }
      const input = { key: existing?.key ?? importKey(row), name: row.name, materialType: row.materialType, manufacturer: row.manufacturer, scenario: row.scenario, subjectTemplate: row.subjectTemplate, bodyTemplate: row.bodyTemplate };
      const template = existing ? service.updateTemplate(existing.id, input) : service.createTemplate(input);
      service.replaceTemplateContactLinks(template.id, links);
      const facts = sourceFacts(original);
      new OutboundReferenceRepository(database).appendTemplateImportSource(template.id,
        { ...facts, contentHash: digest(facts), importedAt: new Date().toISOString() });
      if (existing) result.updated += 1; else result.created += 1;
    }
  }).immediate();
  return result;
}
