import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
let db: PlannerDatabase; let service: OutboundReferenceService;
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, { databaseExists: false, createBackup: () => undefined }); service = new OutboundReferenceService(db); });
afterEach(() => db.close());
const input = { key: '厂家A-首批', name: '首批', materialType: 'initial' as const, subjectTemplate: '{{brand}} {{model}}', bodyTemplate: '{{category}} {{date}} {{batch}} {{package_name}} {{count}}' };
it('saves the five visible fields without product or signature, and preserves optional classification', () => {
 const template = service.createTemplate({ ...input, manufacturer: '厂家A', scenario: '首批资料' });
 expect(service.getTemplate(template.id)).toMatchObject({ ...input, key: input.key.toLocaleLowerCase('en-US'), manufacturer: '厂家A', scenario: '首批资料' });
});
it('identifies the invalid field and rejects malformed or unknown variables separately', () => {
 expect(() => service.createTemplate({ ...input, name: '' })).toThrow(/模板名称/);
 expect(() => service.createTemplate({ ...input, bodyTemplate: '{{model}' })).toThrow(/格式/);
 expect(() => service.createTemplate({ ...input, bodyTemplate: '{{mystery}}' })).toThrow(/未知变量/);
});
it('replaces runtime values, rejects empty critical values, and appends signature once', () => {
 const template = service.createTemplate(input);
 const values = { brand: 'B', model: 'F60', category: '锅', date: '2026-10-26', batch: '首批', package_name: '资料', count: '2', signature: '项目组' };
 expect(service.renderTemplate(template.id, values).body).toBe('锅 2026-10-26 首批 资料 2\n\n项目组');
 expect(() => service.renderTemplate(template.id, { ...values, model: '' })).toThrow(/model/);
 const legacy = service.createTemplate({ ...input, key: 'legacy', bodyTemplate: '正文\n{{signature}}' });
 expect(service.renderTemplate(legacy.id, values).body).toBe('正文\n项目组');
});
it('resolves selected optional paragraphs and reports missing context before returning preview', () => {
 const template = service.createTemplate({ ...input, key: 'blocks', subjectTemplate: '主题', bodyTemplate: '正文\n{{optional_blocks}}' });
 expect(() => service.renderTemplate(template.id, { optional_blocks: '{{model}}' })).toThrow(/model/);
 expect(service.renderTemplate(template.id, { optional_blocks: '{{model}}', model: 'F60', signature: '落款' })).toEqual({ subject:'主题', body:'正文\nF60\n\n落款' });
});
