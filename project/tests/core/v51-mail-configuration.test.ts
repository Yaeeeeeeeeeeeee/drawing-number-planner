// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';

let db: PlannerDatabase;
let service: OutboundReferenceService;
const input = { name: '首批完整资料', materialType: 'initial' as const, manufacturer: '厂家A', scenario: '完整交付', subjectTemplate: '{{brand}} {{model}}', bodyTemplate: '请查收 {{file_list}}' };
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); service = new OutboundReferenceService(db); });
afterEach(() => db.close());

describe('V5.1 daily mail configuration', () => {
  it('saves without internal key, signature or runtime values and preserves the key while editing', () => {
    const first = service.createTemplate(input);
    const second = service.createTemplate({ ...input, key: '  ' });
    expect(first.key).toBeTruthy();
    expect(second.key).not.toBe(first.key);
    expect(service.updateTemplate(first.id, { ...input, name: '已编辑' })).toMatchObject({ key: first.key, name: '已编辑' });
    expect(service.updateTemplate(first.id, { ...input, key: '' }).key).toBe(first.key);
  });
  it('identifies invalid template fields without throwing a TypeError for missing input', () => {
    expect(() => service.createTemplate({ ...input, name: undefined } as unknown as typeof input))
      .toThrowError(expect.objectContaining({ code: 'INVALID_INPUT', fieldErrors: { name: '模板名称不能为空' } }));
    expect(() => service.createTemplate({ ...input, subjectTemplate: '{{brand' }))
      .toThrowError(expect.objectContaining({ fieldErrors: { subjectTemplate: expect.stringContaining('变量格式') } }));
  });
  it('rejects blank actual file variables and unresolved values, while supporting aliases', () => {
    const template = service.createTemplate({ ...input, key: 'runtime' });
    expect(() => service.renderTemplate(template.id, { brand: '品牌', model: '型号', file_list: '  ' }))
      .toThrowError(expect.objectContaining({ code: 'MISSING_TEMPLATE_VARIABLE', variableNames: ['file_list'] }));
    expect(() => service.renderTemplate(template.id, { brand: '{{brand}}', model: '型号', file_list: '铭牌.pdf' }))
      .toThrowError(expect.objectContaining({ code: 'INVALID_INPUT' }));
    const aliases = service.createTemplate({ ...input, key: 'aliases', subjectTemplate: '{{brand_name}} {{product_category}}', bodyTemplate: '{{change_files}}' });
    expect(service.renderTemplate(aliases.id, { brand: '品牌', category: '洗碗机', change_files: '铭牌.pdf' }))
      .toEqual({ subject: '品牌 洗碗机', body: '铭牌.pdf' });
  });
  it('appends the selected signature once and still renders old signature placeholders', () => {
    const template = service.createTemplate({ ...input, key: 'signature', subjectTemplate: '主题', bodyTemplate: '正文' });
    expect(service.renderTemplate(template.id, { signature: '项目组' }).body).toBe('正文\n\n项目组');
    const legacy = service.createTemplate({ ...input, key: 'legacy_signature', subjectTemplate: '主题', bodyTemplate: '正文\n\n{{signature}}' });
    expect(service.renderTemplate(legacy.id, { signature: '项目组' }).body).toBe('正文\n\n项目组');
  });
  it('allows intentionally empty change text while rejecting omitted context and retaining the legacy file fallback', () => {
    const template = service.createTemplate({ ...input, subjectTemplate: '主题', bodyTemplate: '固定正文\n{{change_files}}' });
    expect(service.renderTemplate(template.id, { change_files: '' })).toEqual({ subject: '主题', body: '固定正文\n' });
    expect(() => service.renderTemplate(template.id, {}))
      .toThrowError(expect.objectContaining({ code: 'MISSING_TEMPLATE_VARIABLE', variableNames: ['change_files'] }));
    expect(service.renderTemplate(template.id, { file_list: '铭牌.pdf' }).body).toBe('固定正文\n铭牌.pdf');
    expect(service.renderTemplate(template.id, { change_description: '人工修改说明' }).body).toBe('固定正文\n人工修改说明');
    expect(service.renderTemplate(template.id, { change_description: '' }).body).toBe('固定正文\n');
    const legacy = service.createTemplate({ ...input, subjectTemplate: '主题', bodyTemplate: '固定正文\n{{change_description}}\n{{optional_blocks}}\n{{signature}}\n{{package_files}}' });
    expect(service.renderTemplate(legacy.id, { change_description: '', optional_blocks: '', signature: '', package_files: '' }).body).toBe('固定正文\n\n\n\n');
    expect(() => service.renderTemplate(legacy.id, {}))
      .toThrowError(expect.objectContaining({ code: 'MISSING_TEMPLATE_VARIABLE', variableNames: ['change_description', 'optional_blocks', 'package_files', 'signature'] }));
  });
});
