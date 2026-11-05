# Task 2 implementation report — 2026-11-05

Status: implemented and scoped regression verified. Implementation commit: `4938f71` (`feat: add checked batch planning and durable working drafts`). This report is committed separately so its implementation reference is exact. No production database or Adobe verification was performed.

## Delivered interfaces

Types are exported by `src/core/planning/planning-types.ts`.

- `BatchPlanningRow extends PlanningRowInput`: optional `shareWhite:boolean`, `whiteBase:{origin:'planned'|'historical',id:number}`.
- `BatchPlanningInput`: `{groups:Array<{productId:number,appearanceId?:number,appearanceVersionId?:number,rows:BatchPlanningRow[]}>}`.
- `BatchPlanningCheck`: `{clientId,productId,colorId,mainCategoryId,projectItemId,available,fullCode?,prefix?,sequence?,parts?:DrawingCodeParts,fingerprint?,shared?:{origin,id},error?:{code,message}}`.
- `BatchPlanningPreview`: `{groups:Array<{productId,model,rows:BatchPlanningCheck[]}>}`.
- `BatchReservePlanningInput`: `{confirmed:true,groups:[{productId,appearanceId?,appearanceVersionId?,rows:[...BatchPlanningRow & {expectedFullCode:string,fingerprint:string}]}]}`.
- `BatchPlanningResult`: `{results:Array<{productId,clientId,outcome:'reserved'|'shared'|'failed',drawing?:{id,origin,fullCode,displayName},error?:{code,message}}>} `.
- `PlanningWhiteBasesInput`: `{productId,projectItemId,mainCategoryId?,appearanceId?,appearanceVersionId?}`; `WhiteDrawingBase`: `{origin,id,fullCode,displayName}`.
- `PlanningService.previewBatch(input)`, `.reserveBatch(input)`, `.listWhiteBases(input)`. Existing `.preview` / `.reserve` and endpoint contracts are unchanged.
- Request limits: 1–100 products, 1–100 rows per group, at most 1000 rows total. Incomplete or invalid rows become independent errors. Structural malformed envelopes remain HTTP400.

Routes are registered by `registerPlanningRoutes(app,service,draftStore?)`:

| Route | Request | Success response |
|---|---|---|
| POST `/api/planning/batch-preview` | `BatchPlanningInput` | HTTP200 `BatchPlanningPreview` |
| POST `/api/planning/batch-reserve` | `BatchReservePlanningInput` | HTTP200 `BatchPlanningResult`, including partial failures |
| GET `/api/planning/white-bases` | query `PlanningWhiteBasesInput` | `{items:WhiteDrawingBase[]}` |
| GET `/api/planning/drafts/:mode` | `mode='new'|'batch'` | `{draft:PlanningDraftRecord|null}` |
| PUT `/api/planning/drafts/:mode` | `{input:PlanningDraftInput,expectedRevision?:number}` | `{draft:PlanningDraftRecord}` |
| DELETE `/api/planning/drafts/:mode` | optional body `{expectedRevision?:number}` | `{deleted:true}` |

Draft routes are installed only when the optional third store argument is provided. `PlanningDraftStore` is exported from `src/core/planning/planning-draft-store.ts`, constructed with a path. `read(mode)`, `save(mode,input,expectedRevision?)`, `delete(mode,expectedRevision?)` are synchronous and revision read/check/atomic replacement cannot interleave within the application service process. Existing drafts require the current revision for save/delete; stale requests receive `DRAFT_STALE` / HTTP409. Invalid/unreadable files produce `DRAFT_UNREADABLE` / HTTP500 and remain untouched.

`PlanningDraftRecord = {revision:number,updatedAt:string,input:PlanningDraftInput,requiresCheck:true}`. The store re-exports this type and `PlanningDraftMode` / `PlanningDraftInput`. Input is the brief's incomplete-ID shape plus optional group `appearanceVersionId` for legacy compatibility. Unknown approval/check fields are stripped, including inside rows; only inputs, selected product/project/color/white identity and step are persisted. `requiresCheck:true` is derived on read, never a persisted approval.

File structure: `{version:1,revisions:{new?:number,batch?:number},modes:{new?:{revision,updatedAt,input},batch?:{revision,updatedAt,input}}}`. Writes use a unique exclusive temporary file, fsync and rename. Deleted modes retain revision tombstones to reject stale pre-delete saves. **After GET returns `draft:null` or after deletion, omit `expectedRevision` on the next save.** Explicit `0` is accepted only before any draft revision for that mode; sending `0` after deletion correctly rejects a stale create. This integration detail was sent to root while its UI was being implemented.

`ensureDailyBackup(database,databasePath,backupsDir,now?,createBackup?,draftsPath?)`: optional sixth drafts path defaults to `join(dirname(databasePath),'planning-drafts.json')`. Root should pass `join(paths.baseDir,'planning-drafts.json')` explicitly if the database may be elsewhere. A newly created daily DB has immutable companion `<daily.db>.planning-drafts.json` when drafts exist, containing `{kind:'planning-drafts-backup',databaseFile:<DB basename>,drafts:<validated current file>}`. Backup validates before creating DB, writes companion exclusively, verifies it, and removes only its newly owned output on companion failure. Existing same-day backups remain unchanged. Retention keeps 30 valid daily DB copies and prunes associated companions only when their ownership marker, database filename and draft payload validate. Unrelated/corrupt files are retained.

## Behavior and safety

- Each product uses the existing single-product planner independently. Same complete-code proposals across different products/projects are marked `DRAWING_CODE_CONFLICT`; no cross-model allocator or renumbering was added. Duplicate product groups/canonical aliases and duplicate trimmed row IDs are rejected safely. Row IDs may repeat across distinct products.
- Invalid/deleted/inactive product/dictionary/project facts yield per-row failures without hiding unrelated valid rows. Preview performs no writes.
- White means an active undeleted color dictionary named `白色`, `白` or case-insensitive `White`, with its actual code; code0 has no special treatment. Shared rows need a real usable occupied drawing of the same canonical product, appearance and project/main category. Raw historical scan product candidates are excluded; trustworthy effective association evidence is reused. Dictionary entries and requested colors never synthesize a drawing. Missing/ambiguous baselines fail explicitly; optional identity disambiguates eligible records. White rows reserve normally unless an explicit baseline is supplied. Several colors may intentionally share the same real white identity in one product/project.
- Stateless SHA256 fingerprints cover actual input, product, dictionary rows (including names/status/code/parent/deletion), appearance version facts, canonical identity and relevant baseline facts. Reservation recomputes checks and expected codes under an immediate transaction, then saves each successful row in its own savepoint. Number and appearance binding are atomic. No failed/unconfirmed/stale row is saved. Retries of already reserved stale codes fail without creating duplicates. Returned identities are real and must be retained client-side.
- Shared results do not change original drawings/BOMs or create new formal records. Draft deletion cannot release numbers because the store has no database access. No new occupation batch table/ID was introduced. Schema25, existing migrations and triggers remain unchanged.

## Files

Implementation:

- `src/core/planning/planning-types.ts`
- `src/core/planning/planning-errors.ts`
- `src/core/planning/planning-service.ts`
- `src/core/planning/batch-planning-service.ts`
- `src/core/planning/planning-draft-store.ts`
- `src/core/backup/daily-backup.ts`
- `src/server/routes/planning.ts`

Tests:

- `tests/core/planning-batch.test.ts` (new, 16 cases)
- `tests/core/planning-draft-store.test.ts` (new, 4 cases)
- `tests/core/daily-backup.test.ts` (2 new cases)
- `tests/server/planning-api.test.ts` (2 new cases)
- `tests/server/planning-drafts-api.test.ts` (new, 1 case)

No renderer, start-server, package version, schema, shared progress document or approved P0 file was modified by this task.

## RED / GREEN evidence

1. RED: `npm test -- tests/core/planning-batch.test.ts --maxWorkers=2`: 12 failed because the batch methods did not exist. Implemented real fixture tests for per-row isolation, legacy allocation, duplicate complete-code conflicts, aliases, real white records, confirmed historical evidence, stale facts, partial success, retries and atomic binding.
2. RED: `npm test -- tests/core/planning-draft-store.test.ts --maxWorkers=2`: missing draft store module. Added real filesystem tests for independent modes/incomplete inputs, stripped approvals, revision guards, delete/recreate tombstones, and invalid-file preservation. GREEN: batch+draft 16/16 after initial implementation.
3. RED: `npm test -- tests/core/daily-backup.test.ts tests/server/planning-api.test.ts tests/server/planning-drafts-api.test.ts --maxWorkers=2`: 5 failed, 10 passed. Companion missing/invalid drafts wrongly reported created; new API routes returned404. GREEN after implementation: 5 files31 tests.
4. RED: expanded batch suite16 cases exposed deleted active dictionary accepted; other15 passed. Fixed new batch resolution only. A parent-change test fixture initially hit a schema CHECK by using null; corrected to a real other main category rather than weakening the schema.
5. GREEN expanded regression command:

```sh
npm test -- tests/core/planning-batch.test.ts tests/core/planning-draft-store.test.ts tests/core/planning-repository.test.ts tests/core/planning-service.test.ts tests/core/planning-reservation.test.ts tests/core/occupied-number-repository.test.ts tests/core/daily-backup.test.ts tests/server/planning-api.test.ts tests/server/planning-drafts-api.test.ts tests/db/backup.test.ts tests/db/migrations.test.ts tests/db/migrations-v25.test.ts --maxWorkers=2
```

Result: **12 files, 133/133 tests passed** (13.80s). A prior attempt did not start because the exec-server transport disconnected; it made no changes and returned no test evidence. The successful run above is the cited result.

6. Final focused GREEN after using the existing display-name helper and simplifying synchronous draft writes:

```sh
npm test -- tests/core/planning-batch.test.ts tests/core/planning-draft-store.test.ts tests/core/daily-backup.test.ts tests/server/planning-api.test.ts tests/server/planning-drafts-api.test.ts --maxWorkers=2
```

Result: **5 files, 35/35 tests passed** (5.20s).

7. Final `npm run typecheck`: exit0. Earlier checks temporarily reported only concurrent renderer test `ByRoleOptions.exact` errors; root resolved those during UI work. Final `git diff --check` and staged whitespace check: exit0. npm prints the repository's existing `confirmModulesPurge` configuration warning and update notices; no test warnings/failures remain in the successful results.

## Integration and unresolved work

No known in-scope blocker. Root owns service construction in start-server, client/UI integration, independent review, full-suite regression, browser and Windows delivery. This task used only isolated SQLite fixtures and temporary filesystem directories. It did not run the full suite because the brief explicitly assigns that run to root, did not access or repair production data, did not modify original drawing/BOM/PDF/AI/AIT assets, and did not claim Adobe or Windows verification.
