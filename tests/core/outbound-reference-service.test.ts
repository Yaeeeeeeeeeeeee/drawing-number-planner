import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { OutboundReferenceError, OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
import { DictionaryService } from '../../src/core/dictionaries/dictionary-service';
import { ProductService } from '../../src/core/products/product-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let service: OutboundReferenceService;

function insertPackage(): number {
  const dictionaries = new DictionaryService(db);
  const brand = dictionaries.create({ type: 'brand', code: '02', name: 'SAMKYO' });
  const size = dictionaries.create({ type: 'product_size', code: '0404', name: 'F60' });
  const appearance = dictionaries.create({ type: 'appearance', code: '01', name: '默认外观' });
  const product = new ProductService(db).create({
    sku: 'SKU-F60', model: 'F60', productCategory: '空气炸锅', brandId: brand.id,
    productSizeId: size.id, defaultAppearanceId: appearance.id, referenceProductId: null,
  });
  return Number(db.prepare(`insert into outbound_packages
    (product_id, material_type, package_mode, selected_material_batch_id, package_name, zip_relative_path, status, created_at)
    values (?, 'initial', 'current_complete', null, 'F60 package', 'F60/package.zip', 'completed', ?)`)
    .run(product.id, '2026-09-11T08:00:00.000Z').lastInsertRowid);
}

function insertDraft(packageId: number, templateId: number | null, signatureId: number | null): number {
  return Number(db.prepare(`insert into outbound_email_drafts
    (package_id, template_id, signature_id, recipients_json, cc_json, subject, body, created_at, updated_at)
    values (?, ?, ?, ?, '[]', 'Original subject', 'Original body', ?, ?)`)
    .run(packageId, templateId, signatureId, JSON.stringify(['old@example.com']),
      '2026-09-11T08:00:00.000Z', '2026-09-11T08:00:00.000Z').lastInsertRowid);
}

beforeEach(() => {
  db = openDatabase(':memory:');
  migrateDatabase(db, { databaseExists: false, createBackup: () => undefined });
  service = new OutboundReferenceService(db);
});

afterEach(() => db.close());

describe('OutboundReferenceService contacts', () => {
  it('normalizes an email, supports lifecycle changes, and rejects the same email regardless of case', () => {
    const created = service.createContact({ company: ' 供应商 A ', contactName: ' 王先生 ',
      email: ' SALES@Example.COM ', defaultRecipientType: 'to', notes: ' 重点联系人 ' });

    expect(created).toEqual(expect.objectContaining({ company: '供应商 A', contactName: '王先生',
      email: 'sales@example.com', defaultRecipientType: 'to', notes: '重点联系人', status: 'active' }));
    expect(service.deactivateContact(created.id).status).toBe('inactive');
    expect(service.activateContact(created.id).status).toBe('active');
    expect(service.updateContact(created.id, { company: '供应商 A', contactName: '李女士',
      email: 'NEW@EXAMPLE.COM', defaultRecipientType: 'cc', notes: '' })).toEqual(expect.objectContaining({
        contactName: '李女士', email: 'new@example.com', defaultRecipientType: 'cc', notes: null,
      }));
    expect(() => service.createContact({ company: '供应商 B', contactName: '重复', email: ' NEW@example.com ',
      defaultRecipientType: 'to', notes: null })).toThrowError(expect.objectContaining({ code: 'DUPLICATE_EMAIL' }));
  });

  it('does not rewrite a historical draft recipient snapshot when a contact changes or is deleted', () => {
    const contact = service.createContact({ company: '供应商 A', contactName: '王先生', email: 'old@example.com',
      defaultRecipientType: 'to', notes: null });
    const packageId = insertPackage();
    const draftId = insertDraft(packageId, null, null);

    service.updateContact(contact.id, { company: '供应商 A', contactName: '王先生', email: 'new@example.com',
      defaultRecipientType: 'to', notes: null });
    expect(service.deleteContact(contact.id)).toEqual({ deleted: true });

    expect(db.prepare('select recipients_json from outbound_email_drafts where id = ?').get(draftId))
      .toEqual({ recipients_json: '["old@example.com"]' });
  });
});

describe('OutboundReferenceService templates and blocks', () => {
  it('renders the untouched built-in update template with paired change files while preserving stored drafts and custom templates', () => {
    const template = service.listTemplates().find((item) => item.key === 'update_default')!;
    const draftId = insertDraft(insertPackage(), template.id, null);
    const values = { package_name: '更新资料', company_name: '供应商甲', contact_salutation: '王经理',
      brand_name: 'SAMKYO', model: 'T40', product_category: '洗碗机', change_description: '旧兼容字段',
      change_files: '1.说明书：更新排版\n　　新文件：说明书（转曲）', file_list: '说明书（转曲）',
      package_files: '', optional_blocks: '', signature: '顺祝商祺' };
    const rendered = service.renderTemplate(template.id, values);
    expect(rendered.body).toContain('附件为 SAMKYO T40洗碗机需要更新的包材资料，请注意查收。');
    expect(rendered.body).toContain('本次修改的内容为：\n1.说明书：更新排版\n　　新文件：说明书（转曲）');
    expect(rendered.body).not.toContain('旧兼容字段');
    expect(db.prepare('select body from outbound_email_drafts where id = ?').get(draftId)).toEqual({ body: 'Original body' });
    service.updateTemplate(template.id, { key: template.key, name: template.name, materialType: 'update',
      subjectTemplate: '{{package_name}}', bodyTemplate: '自定义正文 {{change_description}}' });
    expect(service.renderTemplate(template.id, values).body).toBe('自定义正文 旧兼容字段');
  });

  it('manages templates and optional blocks without embedding supplier contacts', () => {
    const template = service.createTemplate({ key: 'supplier_initial', name: '供应商首批模板', materialType: 'initial',
      subjectTemplate: '{{package_name}}', bodyTemplate: '{{company_name}}：\n{{contact_salutation}}，您好！\n{{signature}}' });
    const block = service.createTemplateBlock({ templateId: template.id, key: 'meti_notice', name: 'METI 后续更新',
      bodyTemplate: '{{model}} 铭牌为初稿，METI 后续更新。', displayOrder: 20 });

    expect(service.listTemplates()).toEqual(expect.arrayContaining([expect.objectContaining({
      id: template.id, key: 'supplier_initial', blocks: [expect.objectContaining({ id: block.id, status: 'active' })],
    })]));
    expect(service.deactivateTemplateBlock(block.id).status).toBe('inactive');
    expect(service.activateTemplateBlock(block.id).status).toBe('active');
    expect(service.updateTemplateBlock(block.id, { name: 'METI 提醒', bodyTemplate: '{{model}} 后续更新。',
      displayOrder: 10 })).toEqual(expect.objectContaining({ name: 'METI 提醒', displayOrder: 10 }));
    expect(service.deleteTemplateBlock(block.id)).toEqual({ deleted: true });
    expect(service.deactivateTemplate(template.id).status).toBe('inactive');
    expect(service.activateTemplate(template.id).status).toBe('active');
  });

  it('rejects unknown template variables and reports every missing variable when rendering', () => {
    expect(() => service.createTemplate({ key: 'bad', name: '错误模板', materialType: 'initial',
      subjectTemplate: '{{package_name}}', bodyTemplate: '{{supplier_secret}}' }))
      .toThrowError(expect.objectContaining({ code: 'UNKNOWN_TEMPLATE_VARIABLE', variableNames: ['supplier_secret'] }));
    expect(() => service.createTemplate({ key: 'bad_syntax', name: '错误占位符', materialType: 'initial',
      subjectTemplate: '{{package_name}}', bodyTemplate: '{{supplier-secret}}' }))
      .toThrowError(expect.objectContaining({ code: 'UNKNOWN_TEMPLATE_VARIABLE', variableNames: ['supplier-secret'] }));

    const template = service.createTemplate({ key: 'renderable', name: '可渲染模板', materialType: 'update',
      subjectTemplate: '{{package_name}}',
      bodyTemplate: '{{company_name}}/{{model}}/{{change_description}}/{{optional_blocks}}/{{signature}}' });

    expect(() => service.renderTemplate(template.id, { package_name: 'Package', company_name: '供应商 A' }))
      .toThrowError(expect.objectContaining({ code: 'MISSING_TEMPLATE_VARIABLE',
        variableNames: ['change_description', 'model', 'optional_blocks', 'signature'] }));
    expect(service.renderTemplate(template.id, { package_name: 'Package', company_name: '供应商 A', model: 'F60',
      change_description: '更新铭牌', optional_blocks: '', signature: '顺祝商祺' })).toEqual({
        subject: 'Package', body: '供应商 A/F60/更新铭牌//顺祝商祺',
      });
  });

  it('protects templates referenced by drafts and leaves rendered draft text unchanged after updates', () => {
    const template = service.createTemplate({ key: 'protected', name: '受保护模板', materialType: 'initial',
      subjectTemplate: '{{package_name}}', bodyTemplate: '{{signature}}' });
    const draftId = insertDraft(insertPackage(), template.id, null);

    service.updateTemplate(template.id, { key: 'protected', name: '已修改模板', materialType: 'initial',
      subjectTemplate: '新主题 {{package_name}}', bodyTemplate: '新正文 {{signature}}' });

    expect(db.prepare('select subject, body from outbound_email_drafts where id = ?').get(draftId))
      .toEqual({ subject: 'Original subject', body: 'Original body' });
    expect(() => service.deleteTemplate(template.id)).toThrowError(expect.objectContaining({
      code: 'REFERENCE_DATA_REFERENCED', referenceSummary: { drafts: 1, blocks: 0 },
    }));
  });
});

describe('OutboundReferenceService signatures', () => {
  it('manages active signatures and switches the single default atomically', () => {
    const original = service.listSignatures().find((signature) => signature.isDefault)!;
    const created = service.createSignature({ name: '销售签名', content: 'Sales Team', isDefault: true });

    expect(service.getSignature(original.id).isDefault).toBe(false);
    expect(created).toEqual(expect.objectContaining({ name: '销售签名', content: 'Sales Team', isDefault: true,
      status: 'active' }));
    expect(service.updateSignature(created.id, { name: '销售签名 2', content: 'Sales Team 2', isDefault: false }))
      .toEqual(expect.objectContaining({ name: '销售签名 2', content: 'Sales Team 2', isDefault: false }));
    expect(service.deactivateSignature(created.id).status).toBe('inactive');
    expect(service.activateSignature(created.id).status).toBe('active');
  });

  it('atomically activates an inactive signature when making it the only default', () => {
    const original = service.listSignatures().find((signature) => signature.isDefault)!;
    const candidate = service.createSignature({ name: '备用签名', content: 'Backup', isDefault: false });
    service.deactivateSignature(candidate.id);

    const updated = service.updateSignature(candidate.id, { name: '备用签名', content: 'Backup', isDefault: true });

    expect(updated).toEqual(expect.objectContaining({ status: 'active', isDefault: true }));
    expect(service.listSignatures('active').filter((signature) => signature.isDefault)).toEqual([
      expect.objectContaining({ id: candidate.id }),
    ]);
    expect(service.getSignature(original.id).isDefault).toBe(false);
  });

  it('protects a signature referenced by a draft while allowing edits without changing the draft body', () => {
    const signature = service.createSignature({ name: '受保护签名', content: 'Old signature', isDefault: false });
    const draftId = insertDraft(insertPackage(), null, signature.id);

    service.updateSignature(signature.id, { name: '新签名', content: 'New signature', isDefault: false });

    expect(db.prepare('select body from outbound_email_drafts where id = ?').get(draftId))
      .toEqual({ body: 'Original body' });
    expect(() => service.deleteSignature(signature.id)).toThrowError(expect.objectContaining({
      code: 'REFERENCE_DATA_REFERENCED', referenceSummary: { drafts: 1 },
    }));
  });
});
