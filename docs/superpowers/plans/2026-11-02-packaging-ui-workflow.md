# Packaging and drawing workflow UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; independent file domains may use dispatching-parallel-agents. User already authorized full implementation without stage approvals.

**Goal:** Separate task execution from catalog configuration, simplify number-only AIT generation and planning, flatten new temporary files and safely delete task records.
**Architecture:** Keep existing React/Fastify/SQLite/Illustrator adapter and task/archive/scanning pipeline. Schema25 adds retained task deletion metadata and adjusts only the unfinished-task index. New tasks use sibling00 directly; pre-existing task directories remain authoritative and untouched until ordinary reviewed archive, and directories themselves are retained. No production database access.
**Tech Stack:** existing TypeScript, React, better-sqlite3, Fastify, PowerShell COM/JSX; no new runtime dependencies.
**Spec:** docs/packaging-ui-requirements-20261102.md.

## Global Constraints
- No change to code/occupation/BOM/outbound semantics or current local workspace; never delete real AIT/PDF/images or automatically move legacy folders.
- Generation changes only mappings for DRAWING_NO, preserving all other text/design; keep legacy mapping/config/profile/rule records for compatibility, not daily technical inputs.
- New tasks create/use product/00.临时文件 directly. Cleanup checks explicit owned file/hash list and keeps00, other files and all legacy directories.
- Task deletion is confirmed retained deletion: hide from daily queries, retain traceability and physical files, release unfinished-product lock only after transaction; archiving/awaiting-index or active generation must first settle.
- Real licensed Illustrator/AIT not available here; user reports current generator working. Verify adapter/JSX contract and preserve export mechanism; actual font/layout/editability stays local.

## Review Focus
- New root00 file already exists or belongs to retired/other task: never overwrite or automatically adopt it into another task; manual reuse requires explicit link and safe copy.
- Old task has nested directory/files and has been reviewed: continue with original paths, do not reset hashes or move files on startup.
- Deletion races generation/archive or stale confirmation: reject with reason, retain files/occupation/snapshots, no stranded product lock.
- Old custom parameter axes/rules and non-number mappings: preserve stored data, simple UI retains key bindings; generation still replaces only drawing number.
- List filters/batches/date ranges must never narrow formal scan scope; unavailable/incomplete scans cannot mark files missing.

## Tasks and interfaces

### 1 Catalog and number-only Illustrator
Files: PackagingTemplatesPage, PackagingEditors, packaging CSS; illustrator adapter/JSX and inspection route.
- [x] RED/GREEN catalog has three focused tabs, no task/complex dimension profile forms; simple 0D/2D/3D config preserves legacy keys/rules.
- [x] Chinese 完整图号 mapping, automatic named text object/font inspection of saved or selected upload with manual fallback; preserve immutable asset and existing export flow.
- [x] Contract/VM tests prove BRAND/MODEL/COLOR/geometry untouched, DRAWING_NO only; declarations/fonts/resources/error paths remain.

### 2 Independent tasks and planning
Files: AppShell, PlanningPage, DrawingLibraryPage target; new DrawingTasksPage and task components.
- [x] RED/GREEN menu order and real navigation: reserved IDs enter independent task page already selected; no dimensions/catalog request in planning.
- [x] Compact per-row previews and batch success with copy and exact drawing-library focus; retain reservation success through unrelated refresh.
- [x] Auto task name, auto unique directory, compact unfinished notice; task details show summary + compact rows, expand settings only when needed, local dates/no UUID.

### 3 Flat task files and retained deletion
Files: schema-v25, migrations, packaging store/service/workspace/file operations/archive and API/client.
- [x] RED/GREEN schema24 upgrade/rollback/backups; partial unique index excludes retained-deleted task records, all old rows/columns unchanged.
- [x] New task name optional, root00, exclusive paths, preserve old nested tasks; manual same-path association, prior task ownership and cleanup tested with real files.
- [x] GET deletion-preview => taskId/product/model/state/createdAt/token/canDelete/reason/fileCount/releasesLock. POST delete {confirmed:true,token,acknowledgeUnfinished?} => {id,deleted:true}; keep all physical files/business rows; list/get exclude deleted; no auto-adoption of their files.

### 4 PDF scope and list filters
Files: shared file types/repository/routes/FilesPage.
- [x] RED/GREEN source/outlined/missing shortcuts and type/batch/status/date filters stay list-only. Selected product scan traverses both exact02/03 and all batches independent of displayed filters.
- [x] Accurate observed/added/updated/confirmed-missing/failed/unmatched summaries; partial/unavailable scan protects indices.

### 5 Integration and delivery
Files: relevant tests, actual browser/native verifier, version/installation/release/docs/progress.
- [x] Final218/1855, actual oldSchema24 test DB upgrade, real browser13/13 and screenshots at3840/2560/1920/1440/720 passed.
- [x] Independent final review found no blocker; nativeWindows41397786717 build/install/restart/task deletion passed, legacy directories verified against actual oldSchema24. Exact source/artifacts pinned.
- [x] Publishv1.5.0 (41398418752), actual public installer/report downloads match SHA256, native screenshots inspected and recorded.
- [x] Report source files/data/path changes and real Adobe limitation; do not label unverified behavior passed.
