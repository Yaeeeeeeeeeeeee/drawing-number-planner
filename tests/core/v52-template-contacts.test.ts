// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest';
import { openDatabase, type PlannerDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
let db: PlannerDatabase; let service: OutboundReferenceService;
const templateInput = { name: '资料', materialType: 'initial' as const, manufacturer: '厂家甲', scenario: '完整交付', subjectTemplate: '主题', bodyTemplate: '正文' };
beforeEach(() => { db = openDatabase(':memory:'); migrateDatabase(db, {databaseExists:false, createBackup(){}}); service = new OutboundReferenceService(db); });
afterEach(() => db.close());
it('stores ordered cross-company roles including explicit dual roles without rewriting contacts or template fields', () => {
 const a=service.createContact({company:'别家公司',contactName:'共享联系人',email:'shared@example.test',defaultRecipientType:'to'});
 const b=service.createContact({company:'厂家甲',contactName:'本厂联系人',email:'local@example.test',defaultRecipientType:'cc'});
 const template=service.createTemplate(templateInput);
 expect(template).toMatchObject({contactLinksConfigured:false,contactLinks:[]});
 const links=[{contactId:a.id,recipientType:'cc' as const,displayOrder:1},{contactId:b.id,recipientType:'to' as const,displayOrder:0},{contactId:a.id,recipientType:'to' as const,displayOrder:2}];
 const result=service.replaceTemplateContactLinks(template.id,links);
 expect(result).toMatchObject({...templateInput,contactLinksConfigured:true,contactLinks:[links[1],links[2],links[0]]});
 expect(service.getContact(a.id)).toEqual(a); expect(service.getContact(b.id)).toEqual(b);
 expect(service.listTemplates().find(item=>item.id===template.id)).toEqual(result);
 expect(service.replaceTemplateContactLinks(template.id,[])).toMatchObject({contactLinksConfigured:true,contactLinks:[]});
});
it('validates exact active contact IDs, roles, nonnegative integer order and same-role duplicates atomically', () => {
 const contact=service.createContact({company:'厂',contactName:'联系人',email:'a@example.test',defaultRecipientType:'cc'});
 const template=service.createTemplate(templateInput);const valid={contactId:contact.id,recipientType:'to' as const,displayOrder:0};
 service.replaceTemplateContactLinks(template.id,[valid]);const before=service.getTemplate(template.id);
 for(const links of [[{...valid,contactId:contact.id+.5}],[{...valid,contactId:99999}],[{...valid,contactId:String(contact.id)}],[{...valid,recipientType:'bcc'}],[{...valid,displayOrder:-1}],[{...valid,displayOrder:.5}],[valid,valid]]) {
  expect(()=>service.replaceTemplateContactLinks(template.id,links as never)).toThrow(); expect(service.getTemplate(template.id)).toEqual(before);
 }
 service.deactivateContact(contact.id);expect(()=>service.replaceTemplateContactLinks(template.id,[valid])).toThrow(/停用|启用/);
 expect(()=>service.replaceTemplateContactLinks(template.id+.5,[])).toThrow();
 expect(()=>service.replaceTemplateContactLinks(99999,[])).toThrow();
});
it('supports caller transaction rollback and exposes linked template count before deleting a contact', () => {
 const contact=service.createContact({company:'厂',contactName:'联系人',email:'a@example.test',defaultRecipientType:'cc'});
 const template=service.createTemplate(templateInput); const links=[{contactId:contact.id,recipientType:'to' as const,displayOrder:0},{contactId:contact.id,recipientType:'cc' as const,displayOrder:0}];
 expect(()=>db.transaction(()=>{service.replaceTemplateContactLinks(template.id,links);throw Error('outer failure');})()).toThrow('outer failure');
 expect(service.getTemplate(template.id)).toMatchObject({contactLinksConfigured:false,contactLinks:[]});
 service.replaceTemplateContactLinks(template.id,links);
 expect(()=>service.deleteContact(contact.id)).toThrowError(expect.objectContaining({code:'REFERENCE_DATA_REFERENCED',referenceSummary:{templates:1}}));
 expect(service.deleteTemplate(template.id)).toEqual({deleted:true});expect(db.prepare('select * from outbound_template_contact_links').all()).toEqual([]);expect(service.getContact(contact.id)).toEqual(contact);
 expect(service.deleteContact(contact.id)).toEqual({deleted:true});
});
