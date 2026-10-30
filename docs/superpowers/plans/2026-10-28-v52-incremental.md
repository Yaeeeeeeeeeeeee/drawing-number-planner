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
- [x] RED all-batch scoped display, no dropdown, exact firstBOM jump/missing-state, per-batch conflict handling.
- [x] Implement source and all-outline groups with reliable current labels; read-only physical check for unindexed files, no autonomous numbering/index rebuild.
- [x] RED/implement BOM date edit exactrow+snapshot preservation, reset, query3dropdowns+projectcolumn, correct previous-asset vsreplacement, content comparison.
- [x] GREEN relevant core/API/renderer and force-release/repeated-drawing/history guards before Phase4.

### Phase 4 — Internal folders and shared UI
Files: MaterialBatchService/nav/contextmenu; shared table layout/CSS/workspace/virtual rows; pages columns/frozen operations/image labels.
- [x] RED internal empty-node cleanup safety, explicit align/rightmost-space receiving, stable observers/loading/list state; preserve productID values and supported interactions.
- [x] Implement only actual gaps from audit, same-line icon toolbar, specified centering/widths, frozen top/actions, title/category alignment, brand·model labels, existing image zoom/no extraneous actions.
- [x] GREEN cross-page layouts/data/cache + browser geometry at supported widths before Phase5.

### Phase 5 — Existing mail importer correction only
Files: core/import/email-template-import* and worksheet helper; EmailTemplateImport preview/routes/client types; focused tests.
Interfaces: per-cell source/case identity, raw reference, independent signature result, typed reusable-vs-historical review; existing confirm transaction/backup/fingerprint.
- [x] RED original exact-layout anonymized fixture against current parser and run actual uploaded workbook locally.
- [x] Implement supplier-row/block/scenario boundaries, true recipients/CC+signature split, safe dynamic/static/history separation and clear source preview without rebuilding mail system.
- [x] GREEN actual workbook25 separate candidates and all mail/import/contact/signature/draft compatibility regressions before Phase6.

### Phase 6 — Full regression and delivery
- [x] Run complete suite, type/build, actual workbook acceptance, browser end-to-end and independent significant-issue review.
- [ ] Run Windows installed/old Schema upgrade/backup/rollback/local-path protection/layout/native interaction and original data safety acceptance.
- [ ] Commit/push verified code, source tag/release/install notes and installer with actual download/hash; report done/tested/unverified/unresolved separately.

## Execution ledger
2026-10-28: Stage1 gates met, scan/BOM/UI faults reproduced; original workbook privately inspected, local-path/internal-only deletion user clarification recorded. No source changes yet. Begin Phase2 only; other implementers wait.

2026-10-28 Phase2 complete: /tmp/v52-phase2-final.log 30files/402pass; typecheck/diffclean. All-or-nothing scannercoverage promise, excludedrows preservedincludingmanagementstatus, filenameconversion andinternalempty checks. NoSchema/config/diskmutations. Phase3 drawing/BOM ownership dispatched onlyafterthisgate.

2026-10-28 Phase3 IPC: existing show-file-in-folder now accepts exact drawing identity+safe relative path for readonly unindexed discovery; service re-observes scope/existence/quarantine. No raw absolute path/synthetic index/new IPC. RED 3 new failures then GREEN bridge3files32tests including running application with no pdf_files writes. Remaining BOM and drawing domain/renderer gates still active.

2026-10-28 Phase3 complete: drawing24files276pass, BOM23files318pass, IPC/application3files32pass (overlap, not additive); tsc clean. Fixed readonly all-batch discovery/exact BOM navigation and date/reuse/copy-snapshot/reset/query/hash behavior. NoSchema migration, original files untouched, force-release quarantine regression preserved. BeginPhase4.

2026-10-28 Phase4 complete: shared9files82pass, PDF/batch6files88pass, HTTP28pass, browser1pass across720/1366/1920/2560/3840 with actual temporary indexed files/rows, rightmost transfer and outer-scroll pinned controls at1920x320; tsc/diffclean. Initial browser resize assertion read stale viewport geometry; wait for measured table-wrap width, not fixed sleeps. Existing batchcontextmenu/safety reused, physical empty directory preserved. BeginPhase5; Schema23 minimal links+explicit-empty marker proposal in spec before implementation.

2026-10-28 Phase5 complete: final mail+all-DB30files178pass, tsc/diffclean; earlier importer12/98 and links24/158 compatibility runs also green. Original uploaded workbook actually saved/reopened:25templates/25sourcecases,14sharedcontacts/135rolelinks/1nondefaultsignature; all25same-source repeat skipped, originalworkbook/PDFs/preexistingrows preserved. Actual old compiled Schema22 fixture upgraded23 with51originalbusiness tables compared byoldcolumns, actualreadableSchema22backup,2PDFhashes preserved andidempotentreopen. Source provenance gap closed in existing template JSONhistory+defaultcollapsedreference ratherthan transientpreview. BeginPhase6.

2026-10-30 Phase6 local gate: full197files1661pass, finalE2E11pass, types/buildclean. Initialfull2failures were deliveryassertions still22/allowedreleaseversion; synchronizedSchema23/1.3.0 andaddedinstaller-versioncontract. OldE2Eactive03fixturescanonicalized, filenameoutlinedmarker/query3filters/missinglabelsadaptedwithoutremovingbusinesschecks. FinalindependentreviewfoundoneImportantrecipientleakacrossmanufacturer; RED→GREENfixedresetbothroles+overridesonmanufacturerchange, preserves same-suppliermanualedits/body. Focused5files25pass, followedfullgreen. No otherImportantfindings. PreparingWindows actualinstalledgate.
