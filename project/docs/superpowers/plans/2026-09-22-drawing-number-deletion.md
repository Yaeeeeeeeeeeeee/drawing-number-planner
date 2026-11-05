# Drawing Number Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe deletion, retained occupancy, explicit release, scan suppression and restoration for both planned and historical drawing numbers.

**Architecture:** Schema v13 adds logical-deletion metadata and an append-only audit table without rebuilding existing business tables. Deleted records remain available to historical foreign keys; released rows use an internal archive key while the original code remains in `deleted_full_code`. A single drawing deletion service owns reference checks, PDF detachment, occupancy semantics, scan decisions and restoration.

**Tech Stack:** TypeScript 7, SQLite/better-sqlite3, Fastify, React 19, Vitest, Testing Library, Playwright, Electron.

**Spec:** `docs/superpowers/specs/2026-09-22-drawing-number-deletion-design.md`

## Global Constraints

- Do not change the formal drawing-number structure, appearance-code rules or parser.
- Do not move, rename, modify or delete any real file under the workspace root.
- Existing Schema v12 drawing, PDF, BOM, material-batch, QR and outbound history data must survive migration unchanged.
- Current BOM, latest effective material batches/current material set, and live drawing lineage block deletion.
- Historical BOM, historical batches and outbound snapshots remain readable but do not permanently block deletion.
- Normal, voided and deleted-retained drawings occupy numbers; deleted-released drawings do not.
- A released code is reusable without filling unrelated historical gaps.
- Do not merge master.

## Review Focus

- A released code that has already been reassigned must make restoration fail with an explicit conflict, not create duplicate business codes.
- A scan containing both a deletion tombstone and a newly reassigned normal drawing must match the normal drawing.
- A deletion preview can become stale; the delete transaction must repeat all blocking-reference checks.
- Batch planning with two rows sharing a prefix must not recommend the same released sequence twice.
- A v12 database with historical BOM/outbound references must upgrade and preserve display codes after deletion and reuse.

---

### Task 1: Schema v13 deletion state and migration safety

**Files:**
- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Test: `tests/db/schema.test.ts`
- Test: `tests/db/migrations.test.ts`

**Interfaces:**
- Consumes: Schema v12 tables and migration backup/transaction machinery.
- Produces: `schemaVersionThirteen`; deletion columns on both drawing tables; `drawing_deletion_events`.

- [ ] **Step 1: Write failing schema and migration tests**

Add tests that migrate a populated v12 database and assert:

In the test file, define `maxVersion` with `select max(version)`, `columnNames` with `pragma table_info`,
`tableExists` with `sqlite_master`, and `snapshotV12BusinessRows` by selecting every preserved business table ordered by primary key.

```ts
expect(maxVersion(database)).toBe(13);
expect(columnNames(database, 'drawing_numbers')).toEqual(expect.arrayContaining([
  'deleted_at', 'deletion_mode', 'deleted_full_code', 'deleted_previous_status',
  'deleted_reason', 'scan_resolution',
]));
expect(columnNames(database, 'historical_drawing_numbers')).toEqual(expect.arrayContaining([
  'deleted_at', 'deletion_mode', 'deleted_full_code', 'deleted_previous_status',
  'deleted_reason', 'scan_resolution',
]));
expect(tableExists(database, 'drawing_deletion_events')).toBe(true);
expect(database.pragma('foreign_key_check')).toEqual([]);
expect(snapshotV12BusinessRows(database)).toEqual(before);
```

Add a corruption trigger after version 13 insertion and assert the migration throws, version stays 12, and all v12 snapshots remain equal.

- [ ] **Step 2: Run migration tests and verify RED**

Run: `pnpm vitest run tests/db/schema.test.ts tests/db/migrations.test.ts`

Expected: FAIL because schema version 13 and deletion columns do not exist.

- [ ] **Step 3: Implement Schema v13**

Add nullable columns to both tables and create:

```sql
CREATE TABLE drawing_deletion_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  origin TEXT NOT NULL CHECK (origin IN ('planned', 'historical')),
  record_id INTEGER NOT NULL,
  full_code TEXT NOT NULL,
  deletion_mode TEXT NOT NULL CHECK (deletion_mode IN ('retain_occupied', 'release')),
  previous_status TEXT NOT NULL,
  reason TEXT,
  reference_summary_json TEXT NOT NULL CHECK (json_valid(reference_summary_json)),
  deleted_at TEXT NOT NULL,
  restored_at TEXT
);
CREATE INDEX drawing_deletion_events_record_idx
  ON drawing_deletion_events(origin, record_id, deleted_at DESC);
CREATE INDEX drawing_deletion_events_code_idx
  ON drawing_deletion_events(full_code, deleted_at DESC);
```

Export `schemaVersionThirteen`, import it in `migrations.ts`, snapshot all business tables before migration, execute it inside the existing migration transaction, validate row equality plus new nullable defaults and `foreign_key_check`, then insert migration version 13.

- [ ] **Step 4: Run migration tests and verify GREEN**

Run: `pnpm vitest run tests/db/schema.test.ts tests/db/migrations.test.ts`

Expected: PASS with v12→v13 preservation and rollback coverage.

- [ ] **Step 5: Commit**

```powershell
git add src/db/schema.sql.ts src/db/migrations.ts tests/db/schema.test.ts tests/db/migrations.test.ts
git commit -m "feat: add drawing deletion schema"
```

### Task 2: Occupancy and released-number recommendation

**Files:**
- Modify: `src/core/planning/occupied-number-repository.ts`
- Modify: `src/core/planning/planning-repository.ts`
- Modify: `src/core/planning/planning-service.ts`
- Test: `tests/core/occupied-number-repository.test.ts`
- Test: `tests/core/planning-service.test.ts`
- Test: `tests/core/planning-reservation.test.ts`

**Interfaces:**
- Consumes: v13 deletion columns.
- Produces: `listReleasedSequences(prefix: string): number[]`; occupancy queries that honor deletion mode; batch-safe preview allocation.

- [ ] **Step 1: Write failing occupancy tests**

Cover the four rules and released-candidate priority:

```ts
expect(repository.hasFullCode(normalCode)).toBe(true);
expect(repository.hasFullCode(voidedCode)).toBe(true);
expect(repository.hasFullCode(deletedRetainedCode)).toBe(true);
expect(repository.hasFullCode(deletedReleasedCode)).toBe(false);
expect(repository.listReleasedSequences(prefix)).toEqual([2, 7]);
```

Add a planning test with released sequence 2, occupied sequences 1 and 7, and two requested rows sharing a prefix. Expect sequences `[2, 8]`, never `[2, 2]`, and verify reserve remains transactional when another writer takes sequence 2.

- [ ] **Step 2: Run planning tests and verify RED**

Run: `pnpm vitest run tests/core/occupied-number-repository.test.ts tests/core/planning-service.test.ts tests/core/planning-reservation.test.ts`

Expected: FAIL because released rows are still unconditionally occupied and no released-candidate API exists.

- [ ] **Step 3: Implement occupancy semantics**

Use this business-code expression in each table:

```sql
CASE WHEN deleted_at IS NULL THEN full_code ELSE deleted_full_code END
```

Count a row as occupied when `deleted_at IS NULL OR deletion_mode = 'retain_occupied'`. Return released candidates only when `deleted_at IS NOT NULL AND deletion_mode = 'release'` and no non-released row in either drawing table currently occupies the same business code.

Update preview allocation to consume released candidates once per prefix before continuing from the occupied maximum. Keep the final `hasFullCode` check inside the reserve transaction.

- [ ] **Step 4: Run planning tests and verify GREEN**

Run: `pnpm vitest run tests/core/occupied-number-repository.test.ts tests/core/planning-service.test.ts tests/core/planning-reservation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/planning tests/core/occupied-number-repository.test.ts tests/core/planning-service.test.ts tests/core/planning-reservation.test.ts
git commit -m "feat: reuse explicitly released drawing numbers"
```

### Task 3: Unified deletion, reference preview and restoration service

**Files:**
- Create: `src/core/drawings/drawing-deletion-service.ts`
- Create: `src/core/drawings/drawing-deletion-types.ts`
- Modify: `src/core/drawings/drawing-repository.ts`
- Modify: `src/core/drawings/drawing-query-service.ts`
- Modify: `src/core/drawings/drawing-types.ts`
- Modify: `src/core/bom/bom-repository.ts`
- Modify: `src/core/files/material-batch-service.ts`
- Test: `tests/core/drawing-deletion-service.test.ts`
- Test: `tests/core/drawing-query.test.ts`
- Test: `tests/core/current-material-set.test.ts`
- Test: `tests/core/outbound-package-service.test.ts`

**Interfaces:**
- Consumes: v13 fields and Task 2 occupancy rules.
- Produces:
  - `preview(signedId: number): DrawingDeletionPreview`
  - `delete(input: { signedId: number; mode: 'retain_occupied' | 'release'; reason?: string; confirmedCode: string }): DrawingDeletionResult`
  - `restore(signedId: number): DrawingDetailRecord`
  - deleted-record filtering and business-code display.

- [ ] **Step 1: Write failing domain tests**

Create fixtures for planned/historical, reserved/active/voided, current and historical BOM, current and historical batch, PDF instances, lineage, outbound snapshots. Verify:

```ts
expect(service.delete({ signedId, mode: 'retain_occupied', confirmedCode: code })).toEqual({
  outcome: 'deleted_retained', fullCode: code, occupied: true,
});
expect(service.delete({ signedId, mode: 'release', confirmedCode: code })).toEqual({
  outcome: 'deleted_released', fullCode: code, occupied: false,
});
expect(readFileSync(pdfPath)).toEqual(beforePdfBytes);
```

Assert current BOM/current batch/live lineage yield `DRAWING_DELETE_BLOCKED` with named references. Assert historical BOM, historical batch and outbound package remain readable. Assert stale-preview deletion is blocked by a reference inserted after preview. Assert restoration succeeds when free and returns `DRAWING_RESTORE_CONFLICT` after reassignment.

- [ ] **Step 2: Run deletion tests and verify RED**

Run: `pnpm vitest run tests/core/drawing-deletion-service.test.ts tests/core/drawing-query.test.ts tests/core/current-material-set.test.ts tests/core/outbound-package-service.test.ts`

Expected: FAIL because the unified service and deletion states do not exist.

- [ ] **Step 3: Implement the transactional deletion service**

Use one `IMMEDIATE` transaction for preview recheck, event insert, PDF detachment and row update. Release updates `full_code` to `__deleted__:<origin>:<recordId>:<eventId>` after storing `deleted_full_code`. Retained deletion leaves the business code in place. Both modes store previous status and reason.

Detach allowed PDF references without deleting rows:

```sql
UPDATE pdf_files
SET drawing_id = NULL,
    historical_drawing_id = NULL,
    match_status = 'pending',
    classification_warning = ?
WHERE drawing_id = ? OR historical_drawing_id = ?;
```

Ensure `detected_codes_json` contains the original code before detachment. Block current effective references, but keep historical rows linked to the deleted record ID. Update BOM historical display queries to use `coalesce(deleted_full_code, full_code)`.

Restoration verifies no other normal or retained record occupies the code, restores original `full_code` and status, clears current deletion fields, stamps the latest event, and relinks pending PDFs that reliably contain the code.

- [ ] **Step 4: Run deletion tests and verify GREEN**

Run: `pnpm vitest run tests/core/drawing-deletion-service.test.ts tests/core/drawing-query.test.ts tests/core/current-material-set.test.ts tests/core/outbound-package-service.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/drawings src/core/bom/bom-repository.ts src/core/files/material-batch-service.ts tests/core
git commit -m "feat: add safe drawing deletion lifecycle"
```

### Task 4: Scanner suppression and explicit reimport/ignore

**Files:**
- Modify: `src/core/files/file-repository.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `src/core/files/file-types.ts`
- Modify: `src/core/files/historical-file-classifier.ts`
- Test: `tests/core/file-repository.test.ts`
- Test: `tests/core/file-service.test.ts`
- Test: `tests/core/historical-file-classifier.test.ts`
- Test: `tests/core/pdf-scanner.test.ts`

**Interfaces:**
- Consumes: deleted-code lookup and restore APIs from Task 3.
- Produces: scan suppression with `drawing-manually-deleted-pending` / `drawing-manually-deleted-ignored`; `resolveDeletedDrawingScan` action.

- [ ] **Step 1: Write failing scan tests**

Test both origins and modes:

```ts
const summary = repository.replaceScan(records, historicalCodes, scannedAt);
expect(repository.search({ presence: 'present' }).items[0]).toEqual(expect.objectContaining({
  matchStatus: 'pending',
  classificationWarning: 'drawing-manually-released-pending',
  drawingId: null,
  historicalDrawingId: null,
}));
expect(activeHistoricalRowsFor(code)).toHaveLength(0);
```

Then set scan resolution to ignore and expect `unmatched` plus ignored warning. Add a normal reassigned drawing with the same code and expect the next scan to match that normal drawing, not the tombstone. Reimport must restore and relink all current file instances with the same detected code.

- [ ] **Step 2: Run scanner tests and verify RED**

Run: `pnpm vitest run tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/core/historical-file-classifier.test.ts tests/core/pdf-scanner.test.ts`

Expected: FAIL because historical upsert silently recreates deleted codes.

- [ ] **Step 3: Implement suppression before historical upsert**

Load deleted markers by original code before preparing historical upserts. Normal nondeleted drawing matches take precedence. For a remaining marker, skip historical upsert and override the file record to pending or ignored with no drawing foreign key. Add a service action:

```ts
resolveDeletedDrawingScan(input: {
  signedDrawingId: number;
  action: 'reimport' | 'ignore';
}): { action: 'reimported' | 'ignored'; affectedFiles: number };
```

Reimport delegates to Task 3 restoration and relinks; ignore stores `scan_resolution='ignore'` and updates current matching pending indexes without touching files.

- [ ] **Step 4: Run scanner tests and verify GREEN**

Run: `pnpm vitest run tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/core/historical-file-classifier.test.ts tests/core/pdf-scanner.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add src/core/files tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/core/historical-file-classifier.test.ts tests/core/pdf-scanner.test.ts
git commit -m "feat: suppress deleted drawings during scans"
```

### Task 5: API contracts and drawing-library dangerous actions

**Files:**
- Modify: `src/server/routes/drawings.ts`
- Modify: `src/server/start-server.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/server/drawings-api.test.ts`
- Test: `tests/renderer/api-client.test.ts`
- Test: `tests/renderer/drawing-library-page.test.tsx`
- Test: `tests/e2e/phase-real-usage-outbound.spec.ts`

**Interfaces:**
- Consumes: deletion service, preview, restore and scan resolution from Tasks 3–4.
- Produces: strict HTTP endpoints and the complete user flow.

- [ ] **Step 1: Write failing API and UI tests**

API payloads are strict:

```ts
const deleteSchema = z.object({
  mode: z.enum(['retain_occupied', 'release']),
  confirmedCode: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
}).strict();
```

Test preview for positive and negative signed IDs, correct success messages, 409 blocking references, restore conflicts, and scan resolution. UI tests assert a separate “危险操作” section for both origins, reference summary rendering, mode choice, exact-code confirmation for release, distinct completion text, advanced deleted filters, deletion metadata and restore.

- [ ] **Step 2: Run API/UI tests and verify RED**

Run: `pnpm vitest run tests/server/drawings-api.test.ts tests/renderer/api-client.test.ts tests/renderer/drawing-library-page.test.tsx`

Expected: FAIL because the endpoints and UI controls do not exist.

- [ ] **Step 3: Implement API and client contracts**

Register a single `DrawingDeletionService` and expose:

```text
GET  /api/drawings/:id/deletion-preview
POST /api/drawings/:id/delete
POST /api/drawings/:id/restore
POST /api/drawings/:id/scan-resolution
```

Keep legacy `DELETE /api/drawings/:id` only as a compatibility response that tells callers to use the explicit deletion modes; remove the historical permanent-read-only response. Return structured `referenceSummary` and `blockingReferences` on conflict.

- [ ] **Step 4: Implement the dangerous-operation UI**

Add a local staged confirmation panel below all detail sections. Do not place the button beside PDF association. Default to no selected mode. Require a second confirmation and exact full-code entry for release. After success, close normal detail and refresh the current page; after failure, keep the preview visible with exact blockers.

Add `deletionState` to advanced filters with normal, retained, released and all. Deleted result cards show deletion time/mode/previous status/occupied state and a restore button. Pending scan results show reimport/ignore actions.

- [ ] **Step 5: Run API/UI tests and E2E**

Run: `pnpm vitest run tests/server/drawings-api.test.ts tests/renderer/api-client.test.ts tests/renderer/drawing-library-page.test.tsx`

Expected: PASS.

Run: `pnpm playwright test tests/e2e/phase-real-usage-outbound.spec.ts`

Expected: PASS, including delete-retain, release, deleted filtering, restore and blocked-reference flows.

- [ ] **Step 6: Commit**

```powershell
git add src/server src/renderer tests/server/drawings-api.test.ts tests/renderer tests/e2e/phase-real-usage-outbound.spec.ts
git commit -m "feat: add drawing deletion controls"
```

### Task 6: Full verification, real v12 upgrade rehearsal and previews

**Files:**
- Modify only if a verification failure proves a defect in Tasks 1–5.
- Test: all project tests and builds.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified feature branch, browser preview and Windows desktop preview; no master merge.

- [ ] **Step 1: Rehearse real database migration on a disposable copy**

Copy `C:\Users\Administrator\AppData\Roaming\drawing-number-planner\planner.db` and its WAL/SHM companions to a temporary directory while the service is stopped or after a SQLite online backup. Upgrade only the copy. Assert Schema 13, 1 planned drawing, 744 historical drawings, 2,330 PDF indexes, 135 batches, 1 BOM item, unchanged business codes/statuses and zero foreign-key errors.

Expected: all counts and snapshots match the pre-upgrade copy.

- [ ] **Step 2: Run focused deletion and scan suites**

Run: `pnpm vitest run tests/db/migrations.test.ts tests/core/drawing-deletion-service.test.ts tests/core/occupied-number-repository.test.ts tests/core/planning-service.test.ts tests/core/planning-reservation.test.ts tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/server/drawings-api.test.ts tests/renderer/drawing-library-page.test.tsx`

Expected: all selected tests PASS.

- [ ] **Step 3: Run full automated verification**

Run: `pnpm test`

Expected: all Vitest files and tests PASS.

Run: `pnpm test:e2e`

Expected: all Playwright projects PASS.

Run: `pnpm typecheck`

Expected: exit 0 with no TypeScript errors.

Run: `pnpm build`

Expected: Vite and main-process TypeScript builds exit 0.

- [ ] **Step 4: Perform final code review**

Review the whole branch against the spec, especially archive-key isolation, stale preview rechecks, current-vs-history reference classification, scan suppression and restored display codes. Fix every Critical/Important finding with a failing regression test before the fix and rerun the full suite.

- [ ] **Step 5: Start previews without merging**

Start browser preview and Electron desktop using the verified branch. Confirm the browser API is reachable, the desktop window title is “图号规划器”, Schema reports v13, and both processes remain running for user acceptance. Do not merge master.

- [ ] **Step 6: Commit final verified changes if needed**

```powershell
git add src tests docs
git commit -m "fix: complete drawing deletion acceptance"
```
