# V5.2 incremental implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: executing-plans; independent audit/ownership uses dispatching-parallel-agents. Follow phase gates strictly, no phase approval pauses.

**Goal:** Incrementally repair coverage-safe PDF scans, all-batch drawing detail/BOM relationships, BOM editing/UI behavior and actual-workbook mail parsing while preserving V5.1 and history.
**Architecture:** Reuse existing SQLite22 schema/services/shared components. Narrow future scope without deleting old records; preserve immutable snapshots and explicit force-release workflow. No server deployment or local-path configuration changes.
**Tech Stack:** TypeScript/React/Fastify/better-sqlite3/read-excel-file/Vitest/Playwright/Electron/Inno.
**Spec:** docs/v52-requirements-and-audit-20261028.md and latest user full V5.2 text.

## Global constraints
- Never delete/rename actual directories, PDFs or images. Batch deletion remains internal only, explicitly confirmed by user.
- Use configured local path, no switch to a shared server path. No production DB operations, no automatic merges/releases.
- Private original workbook/contacts stay in ignored work; use anonymized exact-layout fixtures for committed regression and native test.
- New direct business-date editing is authorized but exact record ID/createdAt/lineage/other records and frozen snapshots are protected.
- No arbitrary file choice in conflicts; absence requires actual coverage/existence evidence, no large-file or transient-error missing shortcut.
- Missing red-frame screenshots are not permission to remove unrelated fields.

## Review focus
- Skipped links/access failures and partial traversal preserve every unobserved index and prevent massmissing; strict-scope transition retains historical rows.
- All batch files use exact full code/scope and reliable current semantics; missing index must not become false physical absence.
- BOM date/attachment changes preserve original IDs/snapshots; previous asset role/project must be actual preceding record, replacement not inheritance.
- Shared align/width/frozen regions and observer loops remain stable at720/1366/1920/2560/3840 and long lists.
- Actual Excel Template row+supplier blocks+scenario/case cells cannot mix vendors/body/signature; repeat import protects manual edits and history examples.

### Phase 1 — Audit and original workbook reproduction
- [x] Read current code/schema/business/UI docs, project/Stop That Shit, baseline; independent scan/BOM/UI/drawing audits.
- [x] Reproduce actual-workbook defects; confirm real matrix20initial+5update, unsupported sheets2, no DB writes.
- [x] Run scan98/BOM68/UI26 focused baseline plus isolated fault probes; document issues and authorized internal-only deletion/localpath.

### Phase 2 — Scan/index/presence
Files: core/files material-directory-policy/sql/scanner/repository/classifier/service/presence and relevant tests.
Interface: shared two-directory scope; explicit traversal coverage/failure must gate missing/index cleanup.
- [x] RED new scoped coverage/link/permission/read/large-PDF and unobserved old-index cases.
- [x] Implement minimal coverage-safe writes, exact scope and filename conversion; protect aliases/history/occupation/configuration.
- [x] GREEN relevant scan/repository/API/history tests before Phase3. Record actual results.

### Phase 3 — Drawing files and BOM
Files: drawing query/detail selection/BOM targets; BomPage/service/assets/comparison and tests.
Interfaces: additive drawing file groups/provenance/existence states, firstBom productId/id/date, exact AppShell→BomPage bomVersionId.
- [ ] RED all-batch scoped display, no dropdown, exact firstBOM jump/missing-state, per-batch conflict handling.
- [ ] Implement source and all-outline groups with reliable current labels; read-only physical check for unindexed files, no autonomous numbering/index rebuild.
- [ ] RED/implement BOM date edit exactrow+snapshot preservation, reset, query3dropdowns+projectcolumn, correct previous-asset vsreplacement, content comparison.
- [ ] GREEN relevant core/API/renderer and force-release/repeated-drawing/history guards before Phase4.

### Phase 4 — Internal folders and shared UI
Files: MaterialBatchService/nav/contextmenu; shared table layout/CSS/workspace/virtual rows; pages columns/frozen operations/image labels.
- [ ] RED internal empty-node cleanup safety, explicit align/rightmost-space receiving, stable observers/loading/list state; preserve productID values and supported interactions.
- [ ] Implement only actual gaps from audit, same-line icon toolbar, specified centering/widths, frozen top/actions, title/category alignment, brand·model labels, existing image zoom/no extraneous actions.
- [ ] GREEN cross-page layouts/data/cache + browser geometry at supported widths before Phase5.

### Phase 5 — Existing mail importer correction only
Files: core/import/email-template-import* and worksheet helper; EmailTemplateImport preview/routes/client types; focused tests.
Interfaces: per-cell source/case identity, raw reference, independent signature result, typed reusable-vs-historical review; existing confirm transaction/backup/fingerprint.
- [ ] RED original exact-layout anonymized fixture against current parser and run actual uploaded workbook locally.
- [ ] Implement supplier-row/block/scenario boundaries, true recipients/CC+signature split, safe dynamic/static/history separation and clear source preview without rebuilding mail system.
- [ ] GREEN actual workbook25 separate candidates and all mail/import/contact/signature/draft compatibility regressions before Phase6.

### Phase 6 — Full regression and delivery
- [ ] Run complete suite, type/build, actual workbook acceptance, browser end-to-end and independent significant-issue review.
- [ ] Run Windows installed/old Schema upgrade/backup/rollback/local-path protection/layout/native interaction and original data safety acceptance.
- [ ] Commit/push verified code, source tag/release/install notes and installer with actual download/hash; report done/tested/unverified/unresolved separately.

## Execution ledger
2026-10-28: Stage1 gates met, scan/BOM/UI faults reproduced; original workbook privately inspected, local-path/internal-only deletion user clarification recorded. No source changes yet. Begin Phase2 only; other implementers wait.

2026-10-28 Phase2 complete: /tmp/v52-phase2-final.log 30files/402pass; typecheck/diffclean. All-or-nothing scannercoverage promise, excludedrows preservedincludingmanagementstatus, filenameconversion andinternalempty checks. NoSchema/config/diskmutations. Phase3 drawing/BOM ownership dispatched onlyafterthisgate.
