export interface EmailImportContact {
  company: string; contactName: string; email: string; defaultRecipientType: 'to' | 'cc';
  resolution?: 'import' | 'reuse' | 'skip'; conflict?: string; existingId?: number; expectedFingerprint?: string; rawSource?: string;
}
export interface EmailTemplateImportCandidate {
  id: string; sheet: string; source: string; manufacturer: string; materialType: 'initial' | 'update';
  scenario: string; name: string; subjectTemplate: string; bodyTemplate: string;
  sourceCoordinates?: { supplier: string; subject: string[]; to: string[]; cc: string[]; body: string };
  signatureId?: string; contacts: EmailImportContact[]; rawReference: string; requiresReview: boolean; warnings: string[];
  match?: 'new' | 'identical' | 'update' | 'conflict'; existingId?: number; expectedFingerprint?: string;
  existing?: { name: string; subjectTemplate: string; bodyTemplate: string };
}
export interface EmailTemplateImportReport {
  signatures?: EmailImportSignature[];
  sheets: { name: string; supported: boolean; candidates: number }[];
  candidates: EmailTemplateImportCandidate[];
}
export interface EmailTemplateImportSelection extends EmailTemplateImportCandidate {
  action: 'create' | 'update' | 'skip'; confirmed: boolean; contactsConfirmed: boolean; historyReviewed: boolean;
}
export interface EmailTemplateImportResult {
  created: number; updated: number; skipped: number; contactsCreated: number; signaturesCreated?: number; signaturesReused?: number; backupPath?: string;
}
export interface EmailImportSignature {
  id: string; content: string; contentHash: string; sources: string[];
  matches?: { id: number; name: string; expectedFingerprint: string }[];
}
export interface EmailImportSignatureChoice {
  id: string; action: 'reuse' | 'create' | 'skip'; confirmed: boolean;
  existingId?: number; expectedFingerprint?: string; name?: string; content?: string;
}
