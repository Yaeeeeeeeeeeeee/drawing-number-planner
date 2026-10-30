# AIT Packaging Workflow Implementation Plan

> Execution: existing session, incremental stages with tests, no repeated user approval (already explicitly opted out). Use executing-plans. Parallel work only in disjoint files under dispatching-parallel-agents.

**Goal:** Add managed AIT templates, independent dimensions/matching and durable product drawing tasks through real local Illustrator generation, review, protected archive and scoped indexing.
**Architecture:** Existing React/Fastify/SQLite/Electron. Add Schema24 without rewriting old business tables. A local Node adapter drives Windows PowerShell STA/Illustrator COM/JSX, serialized globally; never browser or remote automation. Task state is durable SQLite; filesystem publication has a resumable per-item journal and copies/backups, then scoped FileService indexing before task-only cleanup.
**Tech Stack:** existing TypeScript/React/better-sqlite3/Fastify, Node fs/watch, Windows PowerShell COM and generated JSX; no added dependencies.
**Spec:** docs/ait-packaging-requirements-20261030.md. Shared types src/core/packaging/packaging-types.ts.

## Global constraints and choices
- Product identity is existing product ID; duplicate display model/SKU never merges identities. One unfinished task per actual product ID via partial unique DB index. Ambiguous physical product directories require an explicit choice.
- Keep configured local workspace and the exact current 02/03 directory policy; temporary00 is a sibling and never a formal scan scope. No reallocation/release/BOM mutation.
- Authorised formal modify task is the only new original-PDF replacement exception: original hash/concurrency check, verified backup, staging/atomic replacement, recoverable archive journal, immutable historical snapshots retained. New archive never overwrites.
- Original uploaded AIT assets retained; replacement changes current template reference only, task snapshots retain prior file/hash/config. No complex template-version UI.
- Fonts may substitute when opening AIT: declared required fonts checked before open, missing resources/fields blocked; absent real AIT and licensed AI means real editable-PDF fidelity remains explicitly unverified.
- Missing/partial/unreadable/unstable files are not deletion. Do not clear unobserved indices. Watchers are signals, not proof of presence/absence; startup check resumes unfinished task scopes.
- Temporary edits don't save dimension profiles; save-as/default are explicit catalog operations. Specific dimensions win shared; multiple suitable templates never auto-select one.

## Review focus
- Archive crash after one copy/replacement but before index: journal permits continuation, keeps temporary files and backups, no duplicate publication.
- Product scoped scans must constrain previous/diffs/missing/batches/ignored-move decisions, not merely filter returned rows.
- Manual files must be stable, full-code identity/candidate unique, cannot bind same source twice; unknown PDFs stay visible/unmoved until confirmed.
- Timeout COM can still be running: no automatic duplicate export/overwrite, do not kill user's Illustrator or touch already-open user docs.
- Cleanup deletes only owned unchanged task artifacts after index/hash verification; preserve newly edited/unknown files and root00.

## Stage1 Audit
- [x] Inspect schema23/planning/product/FileService/TaskRegistry/native service. No watcher or scoped scan exists; add both rather than claiming reuse.
- [x] Inspect real local COM adapter feasibility and honest font/testing limitations.

## Stage2 Catalog, schema and matching
Files: src/db/schema-v24-packaging.ts, migrations.ts; src/core/packaging/packaging-catalog.ts, packaging-matcher.ts, packaging-types.ts; src/server/routes/packaging-catalog.ts.
- [x] RED migration23→24 preserves all old rows/columns/FKs, backup failure/rollback; CRUD validates true product/dictionary IDs, immutable assets, unique defaults and dimensions/mapping.
- [x] Implement catalog get/save/upload/replace, definitions/modes; matching numeric ranges/equality, length-width only swap, scope/brand/project and ambiguity.
- [x] GREEN focused DB/core/API tests before task integration.

## Stage3 Durable tasks and scoped scan
Files: packaging-task-service.ts, packaging-workspace.ts, packaging-file-operations.ts, packaging-monitor.ts; core/files scanner/service/repositories/management.
- [x] RED one task/product concurrent connections, restore status/files/config, source directory mapping, partial file stability, pending/manual uniqueness.
- [x] Implement new/modify task create, item settings/default dimensions, durable per-item result/history, interrupted generation failure/resume, sibling00 creation and pending file discovery.
- [x] RED/GREEN FileService.scanProducts(productDirectories,context?) verifies full scopes and leaves other products' indices/batches/management states unchanged; scoped history metadata.

## Stage4 Illustrator generation
Files: illustrator-automation.ts, illustrator-jsx.ts; tests contract/VM fixtures only when AI unavailable.
- [x] RED/GREEN copy-only inspection/generation, named field traversal+editable+data/font/resource checks, preserveEditability, noAI/nooverwrite, serialized queue/timeout/honest unavailable result.
- [x] Integrate per-item generate/retry without reserve/BOM changes; successful/edited files are never silently regenerated.

## Stage5 Watch/manual
- [x] RED/GREEN stable-file detection, full-code first then unique model/project, reject duplicate/ambiguous references, manual link, retain unknowns.
- [x] Service lifecycle owns debounced product watchers plus startup and periodic catchup; close stops/drains safe work before DB shutdown.

## Stage6 Review/archive/modify
- [x] RED/GREEN preflight all required items reviewed exacthash, no pending files/failures/conflicts; source replacements originalhash and verifiedbackup.
- [x] Publish journal/copy/hash, product-only scan, verify actual ID/fullcode/index relationships, task history complete, cleanup owned unchanged task files only. Failure keeps originals/backups/temp and resumes journal.
- [x] Native file actions through trusted task/item IDs, no arbitrary path execution; manual editing opens PDFs in Illustrator.

## Stage UI integration
Files: PackagingTemplatesPage.tsx, packaging page components/CSS/client types, PlanningPage.tsx, AppShell.tsx.
- [x] Catalog three tabs plus project mode config; real CRUD/uploads/inspect; readable dimension/rule fields not raw JSON-only UI.
- [x] Planning generates only from persisted reserved IDs; button left of preview, task panel dims/matches/choices/generate/retry/manual/review/archive; modify selected formal PDFs, single-task continuation/history.
- [x] Test menu order, real API saves, state retention, fullwidth resizing and disabled reasons.

## Stage7 Verification/delivery
- [ ] Final full suite and 13 E2E running; stage gates, type/build, real browser task/archive/backup and actual old-schema23 migration passed. Windows installed acceptance next. No fake editablePDF success.
- [ ] Independent whole-change review fixed six reproduced issues; update docs/progress/publish after successful final runs. Actual Adobe test limitation stays explicit.
