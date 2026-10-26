import type { PlannerDatabase } from '../../db/database.js';

export type OutboundReferenceStatus = 'active' | 'inactive';
export type RecipientType = 'to' | 'cc';
export type OutboundMaterialType = 'initial' | 'update';

export interface OutboundContact {
  id: number; company: string; contactName: string; email: string; defaultRecipientType: RecipientType;
  status: OutboundReferenceStatus; notes: string | null; createdAt: string; updatedAt: string;
}

export interface OutboundContactInput {
  company: string; contactName: string; email: string; defaultRecipientType: RecipientType; notes?: string | null;
}

export interface OutboundTemplateBlock {
  id: number; templateId: number; key: string; name: string; bodyTemplate: string; displayOrder: number;
  status: OutboundReferenceStatus; createdAt: string; updatedAt: string;
}

export interface OutboundEmailTemplate {
  id: number; key: string; name: string; materialType: OutboundMaterialType; subjectTemplate: string; bodyTemplate: string; manufacturer?: string | null; scenario?: string | null;
  status: OutboundReferenceStatus; createdAt: string; updatedAt: string; blocks: OutboundTemplateBlock[];
}

export interface OutboundEmailTemplateInput {
  key: string; name: string; materialType: OutboundMaterialType; subjectTemplate: string; bodyTemplate: string; manufacturer?: string | null; scenario?: string | null;
}

export interface OutboundTemplateBlockInput {
  templateId: number; key: string; name: string; bodyTemplate: string; displayOrder: number;
}

export interface UpdateOutboundTemplateBlockInput {
  name: string; bodyTemplate: string; displayOrder: number;
}

export interface OutboundSignature {
  id: number; name: string; content: string; isDefault: boolean; status: OutboundReferenceStatus;
  createdAt: string; updatedAt: string;
}

export interface OutboundSignatureInput { name: string; content: string; isDefault: boolean }

interface ContactRow {
  id: number; company: string; contact_name: string; email: string; default_recipient_type: RecipientType;
  status: OutboundReferenceStatus; notes: string | null; created_at: string; updated_at: string;
}
interface TemplateRow {
  id: number; key: string; name: string; material_type: OutboundMaterialType; subject_template: string; body_template: string; manufacturer: string | null; scenario: string | null;
  status: OutboundReferenceStatus; created_at: string; updated_at: string;
}
interface BlockRow {
  id: number; template_id: number; key: string; name: string; body_template: string; display_order: number;
  status: OutboundReferenceStatus; created_at: string; updated_at: string;
}
interface SignatureRow {
  id: number; name: string; content: string; is_default: number; status: OutboundReferenceStatus;
  created_at: string; updated_at: string;
}

const toContact = (row: ContactRow): OutboundContact => ({ id: row.id, company: row.company, contactName: row.contact_name,
  email: row.email, defaultRecipientType: row.default_recipient_type, status: row.status, notes: row.notes,
  createdAt: row.created_at, updatedAt: row.updated_at });
const toBlock = (row: BlockRow): OutboundTemplateBlock => ({ id: row.id, templateId: row.template_id, key: row.key,
  name: row.name, bodyTemplate: row.body_template, displayOrder: row.display_order, status: row.status,
  createdAt: row.created_at, updatedAt: row.updated_at });
const toSignature = (row: SignatureRow): OutboundSignature => ({ id: row.id, name: row.name, content: row.content,
  isDefault: row.is_default === 1, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at });

export class OutboundReferenceRepository {
  constructor(private readonly db: PlannerDatabase) {}

  listContacts(status: OutboundReferenceStatus | 'all' = 'all'): OutboundContact[] {
    const where = status === 'all' ? '' : ' where status = ?';
    const rows = status === 'all'
      ? this.db.prepare(`select * from outbound_contacts${where} order by company collate nocase, contact_name collate nocase, id`).all()
      : this.db.prepare(`select * from outbound_contacts${where} order by company collate nocase, contact_name collate nocase, id`).all(status);
    return (rows as ContactRow[]).map(toContact);
  }

  getContact(id: number): OutboundContact | null {
    const row = this.db.prepare('select * from outbound_contacts where id = ?').get(id) as ContactRow | undefined;
    return row ? toContact(row) : null;
  }

  createContact(input: OutboundContactInput): OutboundContact {
    const now = new Date().toISOString();
    const id = Number(this.db.prepare(`insert into outbound_contacts
      (company, contact_name, email, default_recipient_type, status, notes, created_at, updated_at)
      values (?, ?, ?, ?, 'active', ?, ?, ?)`).run(input.company, input.contactName, input.email,
      input.defaultRecipientType, input.notes ?? null, now, now).lastInsertRowid);
    return this.getContact(id)!;
  }

  updateContact(id: number, input: OutboundContactInput): OutboundContact | null {
    const changed = this.db.prepare(`update outbound_contacts set company = ?, contact_name = ?, email = ?,
      default_recipient_type = ?, notes = ?, updated_at = ? where id = ?`).run(input.company, input.contactName,
      input.email, input.defaultRecipientType, input.notes ?? null, new Date().toISOString(), id).changes;
    return changed ? this.getContact(id) : null;
  }

  setContactStatus(id: number, status: OutboundReferenceStatus): OutboundContact | null {
    const changed = this.db.prepare('update outbound_contacts set status = ?, updated_at = ? where id = ?')
      .run(status, new Date().toISOString(), id).changes;
    return changed ? this.getContact(id) : null;
  }

  deleteContact(id: number): boolean {
    return this.db.prepare('delete from outbound_contacts where id = ?').run(id).changes === 1;
  }

  listTemplates(status: OutboundReferenceStatus | 'all' = 'all'): OutboundEmailTemplate[] {
    const rows = status === 'all'
      ? this.db.prepare('select * from outbound_email_templates order by material_type, name collate nocase, id').all()
      : this.db.prepare(`select * from outbound_email_templates where status = ?
          order by material_type, name collate nocase, id`).all(status);
    return (rows as TemplateRow[]).map((row) => this.toTemplate(row));
  }

  getTemplate(id: number): OutboundEmailTemplate | null {
    const row = this.db.prepare('select * from outbound_email_templates where id = ?').get(id) as TemplateRow | undefined;
    return row ? this.toTemplate(row) : null;
  }

  createTemplate(input: OutboundEmailTemplateInput): OutboundEmailTemplate {
    const now = new Date().toISOString();
    const id = Number(this.db.prepare(`insert into outbound_email_templates
      (key, name, material_type, subject_template, body_template, manufacturer, scenario, status, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`).run(input.key, input.name, input.materialType,
      input.subjectTemplate, input.bodyTemplate, input.manufacturer ?? null, input.scenario ?? null, now, now).lastInsertRowid);
    return this.getTemplate(id)!;
  }

  updateTemplate(id: number, input: OutboundEmailTemplateInput): OutboundEmailTemplate | null {
    const changed = this.db.prepare(`update outbound_email_templates set key = ?, name = ?, material_type = ?,
      subject_template = ?, body_template = ?, manufacturer = ?, scenario = ?, updated_at = ? where id = ?`).run(input.key, input.name,
      input.materialType, input.subjectTemplate, input.bodyTemplate, input.manufacturer ?? null, input.scenario ?? null, new Date().toISOString(), id).changes;
    return changed ? this.getTemplate(id) : null;
  }

  setTemplateStatus(id: number, status: OutboundReferenceStatus): OutboundEmailTemplate | null {
    const changed = this.db.prepare('update outbound_email_templates set status = ?, updated_at = ? where id = ?')
      .run(status, new Date().toISOString(), id).changes;
    return changed ? this.getTemplate(id) : null;
  }

  templateReferences(id: number): { drafts: number; blocks: number } {
    const drafts = this.count('select count(*) as count from outbound_email_drafts where template_id = ?', id);
    const blocks = this.count('select count(*) as count from outbound_template_blocks where template_id = ?', id);
    return { drafts, blocks };
  }

  deleteTemplate(id: number): boolean {
    return this.db.prepare('delete from outbound_email_templates where id = ?').run(id).changes === 1;
  }

  listBlocks(templateId: number): OutboundTemplateBlock[] {
    return (this.db.prepare(`select * from outbound_template_blocks where template_id = ?
      order by display_order, name collate nocase, id`).all(templateId) as BlockRow[]).map(toBlock);
  }

  getBlock(id: number): OutboundTemplateBlock | null {
    const row = this.db.prepare('select * from outbound_template_blocks where id = ?').get(id) as BlockRow | undefined;
    return row ? toBlock(row) : null;
  }

  createBlock(input: OutboundTemplateBlockInput): OutboundTemplateBlock {
    const now = new Date().toISOString();
    const id = Number(this.db.prepare(`insert into outbound_template_blocks
      (template_id, key, name, body_template, display_order, status, created_at, updated_at)
      values (?, ?, ?, ?, ?, 'active', ?, ?)`).run(input.templateId, input.key, input.name, input.bodyTemplate,
      input.displayOrder, now, now).lastInsertRowid);
    return this.getBlock(id)!;
  }

  updateBlock(id: number, input: UpdateOutboundTemplateBlockInput): OutboundTemplateBlock | null {
    const changed = this.db.prepare(`update outbound_template_blocks set name = ?, body_template = ?, display_order = ?,
      updated_at = ? where id = ?`).run(input.name, input.bodyTemplate, input.displayOrder, new Date().toISOString(), id).changes;
    return changed ? this.getBlock(id) : null;
  }

  setBlockStatus(id: number, status: OutboundReferenceStatus): OutboundTemplateBlock | null {
    const changed = this.db.prepare('update outbound_template_blocks set status = ?, updated_at = ? where id = ?')
      .run(status, new Date().toISOString(), id).changes;
    return changed ? this.getBlock(id) : null;
  }

  deleteBlock(id: number): boolean {
    return this.db.prepare('delete from outbound_template_blocks where id = ?').run(id).changes === 1;
  }

  listSignatures(status: OutboundReferenceStatus | 'all' = 'all'): OutboundSignature[] {
    const rows = status === 'all'
      ? this.db.prepare('select * from outbound_signatures order by is_default desc, name collate nocase, id').all()
      : this.db.prepare(`select * from outbound_signatures where status = ?
          order by is_default desc, name collate nocase, id`).all(status);
    return (rows as SignatureRow[]).map(toSignature);
  }

  getSignature(id: number): OutboundSignature | null {
    const row = this.db.prepare('select * from outbound_signatures where id = ?').get(id) as SignatureRow | undefined;
    return row ? toSignature(row) : null;
  }

  createSignature(input: OutboundSignatureInput): OutboundSignature {
    return this.db.transaction(() => {
      if (input.isDefault) this.db.prepare('update outbound_signatures set is_default = 0 where is_default = 1').run();
      const now = new Date().toISOString();
      const id = Number(this.db.prepare(`insert into outbound_signatures
        (name, content, is_default, status, created_at, updated_at) values (?, ?, ?, 'active', ?, ?)`)
        .run(input.name, input.content, input.isDefault ? 1 : 0, now, now).lastInsertRowid);
      return this.getSignature(id)!;
    }).immediate();
  }

  updateSignature(id: number, input: OutboundSignatureInput): OutboundSignature | null {
    return this.db.transaction(() => {
      if (!this.getSignature(id)) return null;
      if (input.isDefault) this.db.prepare('update outbound_signatures set is_default = 0 where is_default = 1').run();
      this.db.prepare(`update outbound_signatures set name = ?, content = ?, is_default = ?,
        status = case when ? = 1 then 'active' else status end, updated_at = ? where id = ?`)
        .run(input.name, input.content, input.isDefault ? 1 : 0, input.isDefault ? 1 : 0, new Date().toISOString(), id);
      return this.getSignature(id);
    }).immediate();
  }

  setSignatureStatus(id: number, status: OutboundReferenceStatus): OutboundSignature | null {
    const changed = this.db.prepare(`update outbound_signatures set status = ?,
      is_default = case when ? = 'inactive' then 0 else is_default end, updated_at = ? where id = ?`)
      .run(status, status, new Date().toISOString(), id).changes;
    return changed ? this.getSignature(id) : null;
  }

  signatureReferences(id: number): { drafts: number } {
    return { drafts: this.count('select count(*) as count from outbound_email_drafts where signature_id = ?', id) };
  }

  deleteSignature(id: number): boolean {
    return this.db.prepare('delete from outbound_signatures where id = ?').run(id).changes === 1;
  }

  private toTemplate(row: TemplateRow): OutboundEmailTemplate {
    return { id: row.id, key: row.key, name: row.name, materialType: row.material_type,
      manufacturer: row.manufacturer, scenario: row.scenario, subjectTemplate: row.subject_template, bodyTemplate: row.body_template, status: row.status,
      createdAt: row.created_at, updatedAt: row.updated_at, blocks: this.listBlocks(row.id) };
  }

  private count(sql: string, id: number): number {
    return (this.db.prepare(sql).get(id) as { count: number }).count;
  }
}
