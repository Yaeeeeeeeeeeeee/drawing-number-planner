// @vitest-environment node
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDatabase } from '../../src/db/database';
import { migrateDatabase } from '../../src/db/migrations';
import { OutboundReferenceService } from '../../src/core/outbound/outbound-reference-service';
import { confirmEmailTemplates, parseEmailTemplateWorkbook, previewEmailTemplates } from '../../src/core/import/email-template-import';
import type { EmailTemplateImportCandidate } from '../../src/core/import/email-template-import-types';
import { matrixWorkbook } from '../fixtures/email-template-matrix';

const reviewed = (row: EmailTemplateImportCandidate, action: 'create' | 'update' | 'skip' = 'create') => ({ ...row, action, confirmed: true, contactsConfirmed: true, historyReviewed: true });
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'mail-provenance-'));
  const path = join(dir, 'planner.db'); let db = openDatabase(path);
  migrateDatabase(db, { databaseExists: false, createBackup() {} });
  const source = await parseEmailTemplateWorkbook(await matrixWorkbook());
  return { source, get db() { return db; }, reopen() { db.close(); db = openDatabase(path); }, close() { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

it('retains the original historical case and precise source after confirm/reopen, ignoring edited client source fields', async () => {
  const f = await fixture();
  try {
    const report = previewEmailTemplates(f.source, f.db); const original = report.candidates[20];
    const selection = { ...reviewed(original), rawReference: 'forged client case', sheet: 'forged sheet', source: 'forged source', sourceCoordinates: { supplier: 'Z1', body: 'Z9', to: [], cc: [], subject: [] } };
    expect(confirmEmailTemplates(report, [selection], f.db)).toMatchObject({ created: 1 });
    f.reopen();
    const template = new OutboundReferenceService(f.db).listTemplates().find(row => row.manufacturer === original.manufacturer && row.materialType === 'update')!;
    expect(template.bodyTemplate).not.toContain('历史原因1');
    expect(template).toMatchObject({ importSources: [{ candidateId: original.id, sheet: original.sheet, source: original.source, manufacturer: original.manufacturer, scenario: original.scenario, materialType: 'update', sourceCoordinates: original.sourceCoordinates, rawReference: original.rawReference, contentHash: expect.stringMatching(/^[a-f0-9]{64}$/), importedAt: expect.stringMatching(/^\d{4}-/) }] });
  } finally { f.close(); }
});

it('preserves source history through ordinary edits and repeat import, and requires explicit update for a changed historical case', async () => {
  const f = await fixture();
  try {
    let report = previewEmailTemplates(f.source, f.db); const candidate = report.candidates[20];
    confirmEmailTemplates(report, [reviewed(candidate)], f.db);
    const service = new OutboundReferenceService(f.db); const id = service.listTemplates().find(row => row.manufacturer === candidate.manufacturer && row.materialType === 'update')!.id;
    const original = service.getTemplate(id);
    service.updateTemplate(id, { ...original, name: '人工名称', bodyTemplate: '人工正文', importSources: [] } as never);
    expect(service.getTemplate(id).importSources).toEqual(original.importSources);
    report = previewEmailTemplates(f.source, f.db);
    confirmEmailTemplates(report, [reviewed(report.candidates[20], 'skip')], f.db);
    expect(service.getTemplate(id)).toMatchObject({ name: '人工名称', bodyTemplate: '人工正文', importSources: original.importSources });
    confirmEmailTemplates(report, [reviewed(report.candidates[20], 'update')], f.db);
    const before = service.getTemplate(id).importSources;
    report = previewEmailTemplates(f.source, f.db);
    expect(report.candidates[20].match).toBe('identical');
    expect(confirmEmailTemplates(report, [reviewed(report.candidates[20])], f.db)).toMatchObject({ updated: 0, created: 0 });
    expect(service.getTemplate(id).importSources).toEqual(before);

    const changed = structuredClone(f.source); changed.candidates[20].rawReference += '\n新历史原因与旧文件：second-case.pdf';
    report = previewEmailTemplates(changed, f.db);
    expect(report.candidates[20].match).toBe('update');
    expect(report.candidates[20].warnings.join(' ')).toMatch(/来源|案例/);
    expect(() => confirmEmailTemplates(report, [reviewed(report.candidates[20])], f.db)).toThrow(/明确.*更新/);
    expect(service.getTemplate(id).importSources).toEqual(before);
    confirmEmailTemplates(report, [reviewed(report.candidates[20], 'skip')], f.db);
    expect(service.getTemplate(id).importSources).toEqual(before);
    expect(confirmEmailTemplates(report, [reviewed(report.candidates[20], 'update')], f.db)).toMatchObject({ updated: 1 });
    expect(service.getTemplate(id).importSources).toEqual([...(before ?? []), expect.objectContaining({ rawReference: changed.candidates[20].rawReference })]);
    const after = service.getTemplate(id).importSources!;
    expect(after[1].contentHash).not.toBe(after[0].contentHash);
    f.reopen(); expect(new OutboundReferenceService(f.db).getTemplate(id).importSources).toEqual(after);
  } finally { f.close(); }
});

it('flags changed original case content even when reusable body and recipient links are identical', async () => {
  const f = await fixture();
  try {
    let report = previewEmailTemplates(f.source, f.db);
    confirmEmailTemplates(report, [reviewed(report.candidates[20])], f.db);
    f.source.candidates[20].rawReference += '\nDifferent original order and case';
    report = previewEmailTemplates(f.source, f.db);
    expect(report.candidates[20].match).toBe('update');
    expect(() => confirmEmailTemplates(report, [reviewed(report.candidates[20])], f.db)).toThrow(/明确.*更新/);
  } finally { f.close(); }
});

it('keeps equal-body supplier/scenario cases separate and refuses silently retargeting a source to another existing supplier or case', async () => {
  const f = await fixture();
  try {
    let report = previewEmailTemplates(f.source, f.db);
    const candidates = [report.candidates[0], report.candidates[1], report.candidates[5]];
    expect(candidates[0].bodyTemplate).toBe(candidates[2].bodyTemplate);
    confirmEmailTemplates(report, candidates.map(row => reviewed(row)), f.db);
    const service = new OutboundReferenceService(f.db);
    const imported = service.listTemplates().filter(row => row.manufacturer?.startsWith('供应商'));
    expect(imported).toHaveLength(3);
    expect(imported.map(row => row.importSources?.[0].candidateId).sort()).toEqual(candidates.map(row => row.id).sort());
    report = previewEmailTemplates(f.source, f.db);
    for (const target of [report.candidates[1], report.candidates[5]]) {
      const wrong = { ...reviewed(report.candidates[0], 'update'), manufacturer: target.manufacturer, scenario: target.scenario, name: target.name };
      expect(() => confirmEmailTemplates(report, [wrong], f.db)).toThrow(/已改变|冲突/);
    }
    expect(service.listTemplates().filter(row => row.manufacturer?.startsWith('供应商'))).toEqual(imported);
  } finally { f.close(); }
});
