import { createHash } from 'node:crypto';
import type { EmailImportContact, EmailTemplateImportCandidate, EmailTemplateImportReport } from './email-template-import-types.js';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const columnName = (column: number): string => column < 26 ? String.fromCharCode(65 + column) : columnName(Math.floor(column / 26) - 1) + String.fromCharCode(65 + column % 26);
const normalized = (text: string) => text.replace(/[：:\s]/gu, '').replace(/[（(].*$/u, '');

export function matrixContacts(text: string, company: string, role: 'to' | 'cc'): EmailImportContact[] {
  const contacts: EmailImportContact[] = []; const seen = new Set<string>();
  for (const match of text.matchAll(/(?:([^<>\n;,，；]*?)\s*<\s*([^\s<>@;,，；]+@[^\s<>@;,，；]+\.[^\s<>@;,，；]+)\s*>|([^\s<>@;,，；]+@[^\s<>@;,，；]+\.[^\s<>@;,，；]+))/gu)) {
    const email = (match[2] ?? match[3]).toLowerCase().replace(/[。.]$/u, '');
    if (seen.has(email)) continue; seen.add(email);
    contacts.push({ company, contactName: match[1]?.trim().replace(/^["']|["']$/gu, '') || email, email,
      defaultRecipientType: role, resolution: 'import', rawSource: match[0] });
  }
  return contacts;
}

/** A Template row owns supplier blocks; each physical body cell owns one case. */
export function parseTemplateMatrix(rows: string[][], ranges: string[], sheet: string, materialType: 'initial' | 'update', report: EmailTemplateImportReport): boolean {
  const header = rows.findIndex(row => row.some(value => /^Template$/iu.test(value)));
  if (header < 0) return false;
  const labelColumn = rows[header].findIndex(value => /^Template$/iu.test(value));
  const suppliers = rows[header].map((text, column) => ({ text, column })).filter(item => item.column > labelColumn && item.text);
  const read = (row: number, start: number, end: number) => (rows[row] ?? []).slice(start, end).map((text, offset) => ({ text, cell: `${columnName(start + offset)}${row + 1}` })).filter(item => item.text);
  const fieldRows = { to: [] as number[], cc: [] as number[], subject: [] as number[], body: [] as number[] };
  rows.forEach((row, index) => {
    if (index <= header) return;
    const label = normalized(row[labelColumn] ?? '');
    const field = /^(邮件)?收件(人|邮箱)$/u.test(label) ? 'to' : /^(邮件)?抄送(人)?$/u.test(label) ? 'cc' : /^(邮件)?主题$/u.test(label) ? 'subject' : /^(邮件)?(内容|正文)$/u.test(label) ? 'body' : undefined;
    if (!field) return;
    fieldRows[field].push(index);
    if (field === 'to') {
      const anchor = `${columnName(labelColumn)}${index + 1}`;
      const merged = ranges.find(range => range.startsWith(`${anchor}:`));
      const last = merged && /:(?:[A-Z]+)(\d+)$/u.exec(merged);
      if (last) for (let next = index + 1; next < Number(last[1]); next++) fieldRows.to.push(next);
    }
  });
  const candidates: EmailTemplateImportCandidate[] = [];
  suppliers.forEach(({ text: manufacturer, column }, supplierIndex) => {
    const end = suppliers[supplierIndex + 1]?.column ?? Math.max(...rows.map(row => row.length));
    const fields = Object.fromEntries(['to', 'cc', 'subject'].map(field => [field, fieldRows[field as 'to' | 'cc' | 'subject'].flatMap(row => read(row, column, end))])) as Record<'to' | 'cc' | 'subject', { text: string; cell: string }[]>;
    const contacts = (['to', 'cc'] as const).flatMap(role => matrixContacts(fields[role].map(item => item.text).join('\n'), manufacturer, role));
    const metadata = new Map<string, string>();
    for (let row = header + 1; row < Math.min(...fieldRows.to, rows.length); row++) {
      const key = normalized(rows[row]?.[column] ?? ''); const value = rows[row]?.[column + 1] ?? '';
      const variable = /品牌/u.test(key) ? 'brand' : /型号/u.test(key) ? 'model' : /产品/u.test(key) ? 'product_category' : undefined;
      if (variable && value) metadata.set(value, variable);
    }
    const parameterize = (text: string) => {
      for (const [value, variable] of [...metadata].sort((a, b) => b[0].length - a[0].length)) text = text.split(value).join(`{{${variable}}}`);
      return text.replace(/\b20\d{2}[-/.年]\d{1,2}[-/.月]\d{1,2}日?\b/gu, '{{date}}').replace(/\bPO[\s:_-]*[A-Z0-9-]+\b/giu, '【待核对历史订单】');
    };
    for (const row of fieldRows.body) for (const body of read(row, column, end)) {
      const warnings = ['待确认：正文仅为建议；请核对固定开头结尾、动态信息及原始历史案例后修正。'];
      const sourceCoordinates = { supplier: `${columnName(column)}${header + 1}`, subject: fields.subject.map(item => item.cell), to: fields.to.map(item => item.cell), cc: fields.cc.map(item => item.cell), body: body.cell };
      const label = rows[row]?.[labelColumn] ?? '';
      const scenario = materialType === 'initial' ? /[（(]([^）)]+)[）)]/u.exec(label)?.[1] ?? '' : `更新资料 · ${manufacturer}案例`;
      let cleaned = body.text; let signatureId: string | undefined;
      const lines = cleaned.split(/\r?\n/u); const marker = lines.findIndex(line => /^(?:best\s+regards[,.!！]?|regards[,.!！]?|顺祝商祺[！!。.]?)$/iu.test(line.trim()));
      if (marker >= 0 && lines.slice(marker).filter(line => line.trim()).length === 4) {
        const content = lines.slice(marker).join('\n').trim(); signatureId = hash(content); cleaned = lines.slice(0, marker).join('\n').trim();
        report.signatures ??= []; let signature = report.signatures.find(item => item.id === signatureId);
        if (!signature) { signature = { id: signatureId, content, contentHash: signatureId, sources: [] }; report.signatures.push(signature); }
        signature.sources.push(`${sheet}!${body.cell}`);
      } else warnings.push('签名未可靠拆分，请手动核对正文结尾');
      if (fields.subject.length > 1) warnings.push('同一供应商识别到多个主题单元格，建议主题已并列保留，请核对来源后修正');
      if (!fields.subject.length || !contacts.length || !scenario) warnings.push('主题、联系人或场景未完整识别，请修正');
      if (contacts.some(contact => contacts.some(other => other.email === contact.email && other.defaultRecipientType !== contact.defaultRecipientType))) warnings.push('同一邮箱同时出现在收件和抄送中，请明确核对两种角色');
      if (materialType === 'update') warnings.push('更新原因、旧型号日期订单和旧文件清单仅保存在原始参考；建议正文使用 change_description/change_files/file_list，请明确修正开头结尾');
      const rawReference = [`供应商 ${sourceCoordinates.supplier}: ${manufacturer}`, ...rows.slice(header + 1, Math.min(...fieldRows.to, rows.length)).flatMap((_, offset) => read(header + 1 + offset, column, end).map(item => `${item.cell}: ${item.text}`)), ...(['to','cc','subject'] as const).flatMap(field => fields[field].map(item => `${field} ${item.cell}: ${item.text}`)), `body ${body.cell}: ${body.text}`].join('\n');
      candidates.push({ id: `${sheet}!${body.cell}`, sheet, source: `${sourceCoordinates.supplier} / ${body.cell} / ${scenario || '场景待确认'}`, sourceCoordinates, manufacturer, materialType, scenario,
        name: `${manufacturer} · ${scenario}`, subjectTemplate: parameterize(fields.subject.map(item => item.text).join('\n')), bodyTemplate: materialType === 'update' ? '{{change_files}}' : parameterize(cleaned),
        contacts: contacts.map(contact => ({ ...contact })), rawReference, requiresReview: true, warnings, signatureId });
    }
  });
  candidates.sort((a,b) => Number(/\d+$/u.exec(a.sourceCoordinates!.body)![0]) - Number(/\d+$/u.exec(b.sourceCoordinates!.body)![0]) || a.sourceCoordinates!.body.localeCompare(b.sourceCoordinates!.body));
  report.candidates.push(...candidates); return true;
}
