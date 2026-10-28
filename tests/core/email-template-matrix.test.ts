import { expect, it } from 'vitest';
import { matrixWorkbook } from '../fixtures/email-template-matrix';
import { parseEmailTemplateWorkbook } from '../../src/core/import/email-template-import';

it('reads every supplier/case anchor independently and separates source fields, signature and historical data', async () => {
  const report = await parseEmailTemplateWorkbook(await matrixWorkbook());
  expect(report.candidates).toHaveLength(25);
  expect(report.sheets.map(sheet => sheet.candidates)).toEqual([20, 5, 0, 0]);
  expect(report.candidates.slice(0, 20).map(row => row.sourceCoordinates?.body).sort()).toEqual(['B','D','F','H','J'].flatMap(col => [11,12,13,14].map(row => `${col}${row}`)).sort());
  expect(new Set(report.candidates.map(row => row.manufacturer))).toEqual(new Set(['供应商1','供应商2','供应商3','供应商4','供应商5']));
  expect(report.candidates.slice(0, 20).map(row => row.scenario)).toContain('补铭牌');
  expect(report.candidates[0].bodyTemplate).toBe(report.candidates[5].bodyTemplate);
  expect(report.candidates.every(row => !row.bodyTemplate.includes('Example Author'))).toBe(true);
  expect(report.signatures).toHaveLength(1);
  expect(report.signatures?.[0].sources).toHaveLength(25);
  expect(new Set(report.candidates.flatMap(row => row.contacts.map(contact => contact.email))).size).toBe(14);
  expect(report.candidates.reduce((sum, row) => sum + row.contacts.length, 0)).toBe(135);
  expect(report.candidates.every(row => !row.subjectTemplate.includes('M123'))).toBe(true);
  expect(report.candidates.slice(20).every(row => row.bodyTemplate.includes('{{change_files}}') && !row.bodyTemplate.includes('历史原因'))).toBe(true);
  expect(report.candidates[0].rawReference).toContain('PO123');
});

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { confirmEmailTemplates, previewEmailTemplates } from '../../src/core/import/email-template-import';
import { OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
const reviewed = (report: Awaited<ReturnType<typeof parseEmailTemplateWorkbook>>) => report.candidates.map(row => ({ ...row, action: 'create' as const, confirmed: true, contactsConfirmed: true, historyReviewed: true }));
it('imports reviewed matrix as 14 shared contacts and 135 ordered role links with a separate nondefault signature', async () => {
  const dir=mkdtempSync(join(tmpdir(),'matrix-import-')); const db=openDatabase(join(dir,'planner.db')); migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
  try {
    const service=new OutboundReferenceService(db); const existing=service.createContact({company:'Original Company',contactName:'Original Name',email:'h@example.com',defaultRecipientType:'to'});
    const before=service.getContact(existing.id); const oldSignatures=service.listSignatures();
    const report=previewEmailTemplates(await parseEmailTemplateWorkbook(await matrixWorkbook()),db);
    expect(report.candidates[0].contacts.find(contact=>contact.email==='h@example.com')).toMatchObject({resolution:'reuse',existingId:existing.id});
    expect(service.listContacts()).toHaveLength(1);
    const result=confirmEmailTemplates(report,reviewed(report),db,[{id:report.signatures![0].id,action:'create',confirmed:true,name:'Reviewed source signature',content:report.signatures![0].content}]);
    expect(result).toMatchObject({created:25,contactsCreated:13,signaturesCreated:1});
    expect(service.listContacts()).toHaveLength(14); expect(service.getContact(existing.id)).toEqual(before);
    const imported=service.listTemplates().filter(template=>template.manufacturer?.startsWith('供应商'));
    expect(imported).toHaveLength(25); expect(imported.reduce((count,row)=>count+(row.contactLinks?.length??0),0)).toBe(135);
    const updateTemplate=imported.find(row=>row.materialType==='update')!;
    const rendered=service.renderTemplate(updateTemplate.id,{brand:'FutureBrand',model:'FutureModel',product_category:'FutureProduct',date:'2027-01-01',change_description:'New reason',file_list:'new.pdf',signature:report.signatures![0].content});
    expect(rendered.body.split('New reason')).toHaveLength(2); expect(rendered.body.split('new.pdf')).toHaveLength(2);
    expect(rendered.body.split(report.signatures![0].content)).toHaveLength(2);
    expect(service.listSignatures()).toHaveLength(oldSignatures.length+1);
    expect(service.listSignatures().find(row=>row.name==='Reviewed source signature')?.isDefault).toBe(false);
    const again=previewEmailTemplates(await parseEmailTemplateWorkbook(await matrixWorkbook()),db); const changed={...reviewed(again)[0], contacts:[]};
    expect(()=>confirmEmailTemplates(again,[changed],db)).toThrow(/明确.*更新/);
    expect(confirmEmailTemplates(again,[{...changed,action:'update'}],db)).toMatchObject({updated:1});
    expect(service.getTemplate(again.candidates[0].existingId!)).toMatchObject({contactLinksConfigured:true,contactLinks:[]});
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
it('rejects stale contact/signature/template-link snapshots and rolls back early writes', async () => {
  const dir=mkdtempSync(join(tmpdir(),'matrix-stale-')); const db=openDatabase(join(dir,'planner.db')); migrateDatabase(db,{databaseExists:false,createBackup:()=>undefined});
  try {
    const service=new OutboundReferenceService(db);
    const source=await parseEmailTemplateWorkbook(await matrixWorkbook());
    const sig=service.createSignature({name:'Matching',content:source.signatures![0].content,isDefault:false});
    const contact=service.createContact({company:'Original',contactName:'Original',email:'h@example.com',defaultRecipientType:'cc'});
    let report=previewEmailTemplates(source,db);
    service.updateContact(contact.id,{...contact,contactName:'Manual edit'});
    expect(()=>confirmEmailTemplates(report,reviewed(report),db)).toThrow(/联系人.*改变/);
    expect(service.listContacts()).toHaveLength(1);
    report=previewEmailTemplates(source,db); const match=report.signatures![0].matches![0];
    service.updateSignature(sig.id,{...sig,content:'Manual signature'});
    expect(()=>confirmEmailTemplates(report,reviewed(report),db,[{id:report.signatures![0].id,action:'reuse',confirmed:true,existingId:match.id,expectedFingerprint:match.expectedFingerprint}])).toThrow(/签名.*改变/);
    expect(service.listContacts()).toHaveLength(1);
    report=previewEmailTemplates(source,db); const rows=reviewed(report); rows[1].bodyTemplate='{{unknown_variable}}';
    expect(()=>confirmEmailTemplates(report,rows,db,[{id:report.signatures![0].id,action:'create',confirmed:true,name:'Rollback',content:report.signatures![0].content}])).toThrow(/未知变量/);
    expect(service.listSignatures().some(row=>row.name==='Rollback')).toBe(false); expect(service.listContacts()).toHaveLength(1);
    confirmEmailTemplates(report,[reviewed(report)[0]],db);
    report=previewEmailTemplates(source,db);
    service.replaceTemplateContactLinks(report.candidates[0].existingId!,[]);
    expect(()=>confirmEmailTemplates(report,[{...reviewed(report)[0],action:'update'}],db)).toThrow(/已改变/);
  } finally {db.close();rmSync(dir,{recursive:true,force:true});}
});
