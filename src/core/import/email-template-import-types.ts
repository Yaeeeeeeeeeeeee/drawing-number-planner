export interface EmailImportContact {
  company: string; contactName: string; email: string; defaultRecipientType: 'to' | 'cc';
  resolution?: 'import' | 'skip'; conflict?: string;
}
export interface EmailTemplateImportCandidate {
  id: string; sheet: string; source: string; manufacturer: string; materialType: 'initial' | 'update';
  scenario: string; name: string; subjectTemplate: string; bodyTemplate: string;
  contacts: EmailImportContact[]; rawReference: string; requiresReview: boolean; warnings: string[];
  match?: 'new' | 'identical' | 'update' | 'conflict'; existingId?: number; expectedFingerprint?: string;
  existing?: { name: string; subjectTemplate: string; bodyTemplate: string };
}
export interface EmailTemplateImportReport {
  sheets: { name: string; supported: boolean; candidates: number }[];
  candidates: EmailTemplateImportCandidate[];
}
export interface EmailTemplateImportSelection extends EmailTemplateImportCandidate {
  action: 'create' | 'update' | 'skip'; confirmed: boolean; contactsConfirmed: boolean; historyReviewed: boolean;
}
export interface EmailTemplateImportResult {
  created: number; updated: number; skipped: number; contactsCreated: number; backupPath?: string;
}
