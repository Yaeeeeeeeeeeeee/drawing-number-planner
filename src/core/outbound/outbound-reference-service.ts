import type { PlannerDatabase } from '../../db/database.js';
import { OutboundReferenceRepository, type OutboundContact, type OutboundContactInput,
  type OutboundEmailTemplate, type OutboundEmailTemplateInput, type OutboundMaterialType,
  type OutboundReferenceStatus, type OutboundSignature, type OutboundSignatureInput,
  type OutboundTemplateBlock, type OutboundTemplateBlockInput, type RecipientType,
  type UpdateOutboundTemplateBlockInput } from './outbound-reference-repository.js';

export type OutboundReferenceErrorCode = 'NOT_FOUND' | 'INVALID_INPUT' | 'DUPLICATE_EMAIL' | 'DUPLICATE_KEY'
  | 'DUPLICATE_BLOCK_KEY' | 'UNKNOWN_TEMPLATE_VARIABLE' | 'MISSING_TEMPLATE_VARIABLE' | 'REFERENCE_DATA_REFERENCED';

export class OutboundReferenceError extends Error {
  constructor(public readonly code: OutboundReferenceErrorCode, message: string,
    public readonly referenceSummary?: Record<string, number>, public readonly variableNames?: string[]) {
    super(message);
  }
}

export const outboundTemplateVariables = [
  'change_description', 'company_name', 'contact_salutation', 'file_list', 'model', 'optional_blocks',
  'package_name', 'product_category', 'signature',
] as const;
type TemplateVariable = typeof outboundTemplateVariables[number];

const allowedVariables = new Set<string>(outboundTemplateVariables);
const variablePattern = /\{\{\s*([a-z][a-z0-9_]*)\s*\}\}/gu;
const placeholderPattern = /\{\{([^{}]*)\}\}/gu;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const keyPattern = /^[a-z0-9_]+$/u;

function variablesIn(...templates: string[]): string[] {
  const found = new Set<string>();
  for (const template of templates) {
    placeholderPattern.lastIndex = 0;
    for (const match of template.matchAll(placeholderPattern)) found.add(match[1].trim());
  }
  return [...found].sort();
}

export class OutboundReferenceService {
  private readonly repository: OutboundReferenceRepository;
  constructor(private readonly database: PlannerDatabase) { this.repository = new OutboundReferenceRepository(database); }

  listContacts(status: OutboundReferenceStatus | 'all' = 'all'): OutboundContact[] {
    return this.repository.listContacts(status);
  }
  getContact(id: number): OutboundContact {
    return this.require(this.repository.getContact(id), '外发联系人不存在');
  }
  createContact(input: OutboundContactInput): OutboundContact {
    try { return this.repository.createContact(this.normalizeContact(input)); }
    catch (error) { return this.mapDatabaseError(error); }
  }
  updateContact(id: number, input: OutboundContactInput): OutboundContact {
    this.getContact(id);
    try { return this.require(this.repository.updateContact(id, this.normalizeContact(input)), '外发联系人不存在'); }
    catch (error) { return this.mapDatabaseError(error); }
  }
  activateContact(id: number): OutboundContact { return this.setContactStatus(id, 'active'); }
  deactivateContact(id: number): OutboundContact { return this.setContactStatus(id, 'inactive'); }
  deleteContact(id: number): { deleted: true } {
    return this.database.transaction(() => {
      this.getContact(id);
      if (!this.repository.deleteContact(id)) throw this.notFound('外发联系人不存在');
      return { deleted: true } as const;
    }).immediate();
  }

  listTemplates(status: OutboundReferenceStatus | 'all' = 'all'): OutboundEmailTemplate[] {
    return this.repository.listTemplates(status);
  }
  getTemplate(id: number): OutboundEmailTemplate {
    return this.require(this.repository.getTemplate(id), '邮件模板不存在');
  }
  createTemplate(input: OutboundEmailTemplateInput): OutboundEmailTemplate {
    const normalized = this.normalizeTemplate(input);
    try { return this.repository.createTemplate(normalized); }
    catch (error) { return this.mapDatabaseError(error); }
  }
  updateTemplate(id: number, input: OutboundEmailTemplateInput): OutboundEmailTemplate {
    this.getTemplate(id);
    const normalized = this.normalizeTemplate(input);
    try { return this.require(this.repository.updateTemplate(id, normalized), '邮件模板不存在'); }
    catch (error) { return this.mapDatabaseError(error); }
  }
  activateTemplate(id: number): OutboundEmailTemplate { return this.setTemplateStatus(id, 'active'); }
  deactivateTemplate(id: number): OutboundEmailTemplate { return this.setTemplateStatus(id, 'inactive'); }
  deleteTemplate(id: number): { deleted: true } {
    return this.database.transaction(() => {
      this.getTemplate(id);
      const references = this.repository.templateReferences(id);
      if (Object.values(references).some((count) => count > 0)) {
        throw new OutboundReferenceError('REFERENCE_DATA_REFERENCED', '邮件模板仍被业务记录引用，不能删除', references);
      }
      if (!this.repository.deleteTemplate(id)) throw this.notFound('邮件模板不存在');
      return { deleted: true } as const;
    }).immediate();
  }
  renderTemplate(id: number, values: Partial<Record<TemplateVariable, string>>): { subject: string; body: string } {
    const template = this.getTemplate(id);
    const suppliedUnknown = Object.keys(values).filter((name) => !allowedVariables.has(name)).sort();
    if (suppliedUnknown.length) this.unknownVariables(suppliedUnknown);
    const required = variablesIn(template.subjectTemplate, template.bodyTemplate);
    const missing = required.filter((name) => !Object.prototype.hasOwnProperty.call(values, name) || values[name as TemplateVariable] == null);
    if (missing.length) {
      throw new OutboundReferenceError('MISSING_TEMPLATE_VARIABLE', `邮件模板缺少变量：${missing.join(', ')}`, undefined, missing);
    }
    const render = (value: string) => value.replace(variablePattern, (_match, name: TemplateVariable) => String(values[name] ?? ''));
    return { subject: render(template.subjectTemplate), body: render(template.bodyTemplate) };
  }

  listTemplateBlocks(templateId: number): OutboundTemplateBlock[] {
    this.getTemplate(templateId);
    return this.repository.listBlocks(templateId);
  }
  getTemplateBlock(id: number): OutboundTemplateBlock {
    return this.require(this.repository.getBlock(id), '邮件附加段落不存在');
  }
  createTemplateBlock(input: OutboundTemplateBlockInput): OutboundTemplateBlock {
    this.getTemplate(input.templateId);
    const normalized = this.normalizeBlock(input);
    try { return this.repository.createBlock(normalized); }
    catch (error) { return this.mapDatabaseError(error); }
  }
  updateTemplateBlock(id: number, input: UpdateOutboundTemplateBlockInput): OutboundTemplateBlock {
    this.getTemplateBlock(id);
    const normalized = this.normalizeBlockUpdate(input);
    return this.require(this.repository.updateBlock(id, normalized), '邮件附加段落不存在');
  }
  activateTemplateBlock(id: number): OutboundTemplateBlock { return this.setBlockStatus(id, 'active'); }
  deactivateTemplateBlock(id: number): OutboundTemplateBlock { return this.setBlockStatus(id, 'inactive'); }
  deleteTemplateBlock(id: number): { deleted: true } {
    return this.database.transaction(() => {
      this.getTemplateBlock(id);
      if (!this.repository.deleteBlock(id)) throw this.notFound('邮件附加段落不存在');
      return { deleted: true } as const;
    }).immediate();
  }

  listSignatures(status: OutboundReferenceStatus | 'all' = 'all'): OutboundSignature[] {
    return this.repository.listSignatures(status);
  }
  getSignature(id: number): OutboundSignature {
    return this.require(this.repository.getSignature(id), '邮件签名不存在');
  }
  createSignature(input: OutboundSignatureInput): OutboundSignature {
    return this.repository.createSignature(this.normalizeSignature(input));
  }
  updateSignature(id: number, input: OutboundSignatureInput): OutboundSignature {
    this.getSignature(id);
    return this.require(this.repository.updateSignature(id, this.normalizeSignature(input)), '邮件签名不存在');
  }
  activateSignature(id: number): OutboundSignature { return this.setSignatureStatus(id, 'active'); }
  deactivateSignature(id: number): OutboundSignature { return this.setSignatureStatus(id, 'inactive'); }
  deleteSignature(id: number): { deleted: true } {
    return this.database.transaction(() => {
      this.getSignature(id);
      const references = this.repository.signatureReferences(id);
      if (references.drafts > 0) {
        throw new OutboundReferenceError('REFERENCE_DATA_REFERENCED', '邮件签名仍被业务记录引用，不能删除', references);
      }
      if (!this.repository.deleteSignature(id)) throw this.notFound('邮件签名不存在');
      return { deleted: true } as const;
    }).immediate();
  }

  private normalizeContact(input: OutboundContactInput): OutboundContactInput {
    const company = input.company.trim(); const contactName = input.contactName.trim();
    const email = input.email.trim().toLocaleLowerCase('en-US'); const notes = input.notes?.trim() || null;
    if (!company || !contactName || !emailPattern.test(email) || !(['to', 'cc'] as RecipientType[]).includes(input.defaultRecipientType)) {
      throw new OutboundReferenceError('INVALID_INPUT', '外发联系人数据不完整');
    }
    return { company, contactName, email, defaultRecipientType: input.defaultRecipientType, notes };
  }

  private normalizeTemplate(input: OutboundEmailTemplateInput): OutboundEmailTemplateInput {
    const key = input.key.trim().toLocaleLowerCase('en-US'); const name = input.name.trim();
    const subjectTemplate = input.subjectTemplate.trim(); const bodyTemplate = input.bodyTemplate.trim();
    if (!keyPattern.test(key) || !name || !subjectTemplate || !bodyTemplate
      || !(['initial', 'update'] as OutboundMaterialType[]).includes(input.materialType)) {
      throw new OutboundReferenceError('INVALID_INPUT', '邮件模板数据不完整');
    }
    this.assertKnownVariables(subjectTemplate, bodyTemplate);
    return { key, name, materialType: input.materialType, subjectTemplate, bodyTemplate };
  }

  private normalizeBlock(input: OutboundTemplateBlockInput): OutboundTemplateBlockInput {
    const key = input.key.trim().toLocaleLowerCase('en-US');
    const update = this.normalizeBlockUpdate(input);
    if (!keyPattern.test(key)) throw new OutboundReferenceError('INVALID_INPUT', '邮件附加段落数据不完整');
    return { templateId: input.templateId, key, ...update };
  }

  private normalizeBlockUpdate(input: UpdateOutboundTemplateBlockInput): UpdateOutboundTemplateBlockInput {
    const name = input.name.trim(); const bodyTemplate = input.bodyTemplate.trim();
    if (!name || !bodyTemplate || !Number.isInteger(input.displayOrder) || input.displayOrder < 0) {
      throw new OutboundReferenceError('INVALID_INPUT', '邮件附加段落数据不完整');
    }
    this.assertKnownVariables(bodyTemplate);
    return { name, bodyTemplate, displayOrder: input.displayOrder };
  }

  private normalizeSignature(input: OutboundSignatureInput): OutboundSignatureInput {
    const name = input.name.trim(); const content = input.content.trim();
    if (!name || !content) throw new OutboundReferenceError('INVALID_INPUT', '邮件签名数据不完整');
    return { name, content, isDefault: input.isDefault };
  }

  private setContactStatus(id: number, status: OutboundReferenceStatus): OutboundContact {
    this.getContact(id); return this.require(this.repository.setContactStatus(id, status), '外发联系人不存在');
  }
  private setTemplateStatus(id: number, status: OutboundReferenceStatus): OutboundEmailTemplate {
    this.getTemplate(id); return this.require(this.repository.setTemplateStatus(id, status), '邮件模板不存在');
  }
  private setBlockStatus(id: number, status: OutboundReferenceStatus): OutboundTemplateBlock {
    this.getTemplateBlock(id); return this.require(this.repository.setBlockStatus(id, status), '邮件附加段落不存在');
  }
  private setSignatureStatus(id: number, status: OutboundReferenceStatus): OutboundSignature {
    this.getSignature(id); return this.require(this.repository.setSignatureStatus(id, status), '邮件签名不存在');
  }

  private assertKnownVariables(...templates: string[]): void {
    const unknown = variablesIn(...templates).filter((name) => !allowedVariables.has(name));
    if (unknown.length) this.unknownVariables(unknown);
  }
  private unknownVariables(names: string[]): never {
    throw new OutboundReferenceError('UNKNOWN_TEMPLATE_VARIABLE', `邮件模板包含未知变量：${names.join(', ')}`, undefined, names);
  }
  private require<T>(value: T | null, message: string): T {
    if (value == null) throw this.notFound(message);
    return value;
  }
  private notFound(message: string): OutboundReferenceError {
    return new OutboundReferenceError('NOT_FOUND', message);
  }
  private mapDatabaseError(error: unknown): never {
    if (error instanceof OutboundReferenceError) throw error;
    const message = error instanceof Error ? error.message : '';
    if (message.includes('UNIQUE constraint failed: outbound_contacts.email')) {
      throw new OutboundReferenceError('DUPLICATE_EMAIL', '联系人邮箱已经存在');
    }
    if (message.includes('UNIQUE constraint failed: outbound_email_templates.key')) {
      throw new OutboundReferenceError('DUPLICATE_KEY', '邮件模板编码已经存在');
    }
    if (message.includes('UNIQUE constraint failed: outbound_template_blocks.template_id, outbound_template_blocks.key')) {
      throw new OutboundReferenceError('DUPLICATE_BLOCK_KEY', '该模板的附加段落编码已经存在');
    }
    throw error;
  }
}

export type { OutboundContact, OutboundContactInput, OutboundEmailTemplate, OutboundEmailTemplateInput,
  OutboundMaterialType, OutboundReferenceStatus, OutboundSignature, OutboundSignatureInput,
  OutboundTemplateBlock, OutboundTemplateBlockInput, RecipientType, UpdateOutboundTemplateBlockInput };
