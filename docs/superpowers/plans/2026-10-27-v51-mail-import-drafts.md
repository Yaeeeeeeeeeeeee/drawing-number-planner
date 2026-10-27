# V5.1 Email import and outbound drafts implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for parent integration; independent import/configuration/composer domains run under dispatching-parallel-agents.

**Goal:** Reuse existing mail data for Excel preview/import, daily maintenance and safe editable drafts from successful outbound ZIP facts.
**Architecture:** Existing Schema 22 mail tables and completed outbound snapshots remain authoritative. Excel preview is read-only with editable, explicit transactional commit; drafts consume immutable successful package facts and never write BOM/PDF/occupation/history.
**Tech Stack:** TypeScript, React, Fastify, read-excel-file, better-sqlite3, Vitest, Playwright, Windows Electron/Inno Setup.
**Spec:** docs/v51-mail-import-drafts-requirements-20261027.md

## Global Constraints
- No automatic email sending, no original file changes, no production DB operations or startup merge.
- Preserve historical snapshots, template edits and protected IDs; backup before explicit import.
- No signature/context required to save template. Required missing runtime values must produce clear errors.
- Existing .xlsx reader retained; legacy .xls only if actually supported.
- Actual reference workbook absent; structural test workbook is evidence of capabilities, not that user's workbook passed.

## Review Focus
- Horizontal merged-cell manufacturer/scenario layout and examples lacking reliable labels stay reviewable instead of invented facts.
- Repeat import after manual edit or simultaneous change cannot overwrite existing template silently.
- Changed single nameplate among unchanged files must not create all-file changes; missing/conflicting/uncompared files require confirmation.
- Completed ZIP manifest and frozen product facts survive concurrent UI edits; draft edits never modify ZIP/history.
- Async draft rendering and per-item edits must preserve direct body edits, signature once and correct manufacturer contacts.

### Task 1: Excel import
Files: core/import/email-template-import*; server/routes/email-template-import.ts; renderer/pages/EmailTemplateImport*; ImportPage.tsx; client.ts import methods; new tests.
Interfaces: previewEmailTemplateImport(File) -> preview/report; confirmEmailTemplateImport(previewId,rows) -> counts and backupPath. registerEmailTemplateImportRoutes(app,db).
- [x] Write/run RED tests for merged horizontal/labelled XLSX, unsupported sheets, read-only preview, duplicate/update/manual edit conflicts, rollback/contact reuse.
- [x] Implement editable preview dialog and existing-table transactional import with backup and field errors.
- [x] Focused core/API/renderer GREEN; wire startup registration.

### Task 2: Daily configuration
Files: outbound-reference-service.ts; routes/outbound-reference.ts; TemplateSettings.tsx; focused tests.
Interfaces: existing create/update/render API; create may omit key, update preserves key; legacy keys/variables compatible.
- [x] RED for no key/signature/context save; field-level errors; unknown/malformed runtime placeholders.
- [x] Internally generate key; compact variable insertion; independent signature composition, runtime validation.
- [x] GREEN existing and new core/API/configuration tests.

### Task 3: Completed facts and truthful changes
Files: outbound-types.ts; outbound-package-service.ts; outbound-batch-workflow.ts; client.ts created type; PackageBuilder.tsx; tests.
Interfaces: CreatedOutboundPackage.mailFacts optional additive frozen metadata + selected snapshot items; OutboundMailContext optional packageId/createdAt/packageMode/manufacturer/scenario/fullCode/mainCategoryName/change.
- [x] RED integration: same-code changed nameplate needs explicit confirmation; unchanged copies excluded in change_only; missing baseline cannot auto-claim changes.
- [x] Fix comparison eligibility at source; keep UI all visible diagnostic items but default select changed only. Attach successful snapshot-only mailFacts and map production context from them (no fake success fallback).
- [x] GREEN real disk ZIP/SQLite and renderer selection tests; historical rows/file bytes unchanged.

### Task 4: Draft editor
Files: EmailComposer.tsx; OutboundPage.tsx; draft helpers/styles/tests.
Interfaces: consumes Task3 actual context and Task2 render API; no writes to business data.
- [x] RED for explicit result action, exact manufacturer/scenario, per-item reason/order/remove/merge/show filename, initial no forced changes, copy and signature.
- [x] Implement user-editable recipients/subject/body and change entries, sync untouched body; direct edits require explicit regeneration.
- [x] GREEN composer and existing guard/race regressions.

### Task 5: Integration and delivery
Files: start-server.ts; E2E/native verification scripts; version/docs/progress.
- [x] Run integrated suite, typecheck/build/E2E; fresh independent review covering Review Focus; fix confirmed significant findings with RED/GREEN.
- [ ] Windows build/installed actual checks; preserve old Schema migration evidence and data safety. Record unavailable actual workbook/localDB.
- [ ] Commit and authorized GitHub/package release with exact source and verified digest; update usage/install notes without overwriting prior tags.

## Execution ledger
Baseline 090d372, existing isolated development branch codex/v3-business-ui-20261022. User opted out of repeated plans/approvals. Reuse existing environment and verified baseline; no fresh sample DB bundled.
2026-10-27: Read complete request and actual mail/config/manifest/comparison paths. Three disjoint agents own import, configuration, composer; parent owns snapshots/comparison/integration/delivery. No migrations planned.

2026-10-27 integration: new full XLSX→SQLite→actual ZIP→draft browser flow passed; native helper shares the same HTTP/DOM assertions. Required integration fixes: modal Portal/focus (RED/GREEN), queued table resize callback after unmount (RED/GREEN), current-complete list keeps older removed candidates excluded (existing E2E RED then fixed). First full run caught obsolete cached modal module and progress status prefix; both focused regressions now green, final suite in progress. Reference workbook unavailable; no actual user-data operations.

2026-10-27 final tests: 187 files/1568 pass, E2E9 pass, type/build pass. Native40487728441 revealed verifier race: old disabled row becomes enabled and default checked before .check() click. Use explicit enabled-state assertion then setChecked(true); real E2E green. No application workaround or timeout increase. Rerun native before release.
