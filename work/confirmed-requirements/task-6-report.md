# Task 6 — database reselection and native recovery

Implemented on the existing confirmed-requirements worktree. No production database, real design files or attachments were accessed. No Schema version or migration behavior was changed.

## Switching order and recovery

The desktop Safe Recovery panel and native Application → Safe Recovery menu expose **重新选择数据库**. The native action calls Main directly and remains available when the renderer/local service is unavailable. Recovery IPC accepts only the current window's main frame. Existing recovery action serialization also covers reselection.

The selected planner.db (or a directory supplied to the shared profile helper) is checked before stopping business work. Cancel returns without a backup, profile change or service stop. A valid selection then follows this order:

1. Private service RPC `prepareDatabaseSwitch` rejects active HTTP requests, queued/running/finalizing local work, real packaging operations and unsettled Illustrator automation. Durable unfinished packaging records alone do not constitute a running operation. The request/IPC gate closes before yielding; the existing monitor is closed and drained.
2. Create an independent, integrity-verified current-database backup with the existing `createDatabaseBackup`/`VACUUM INTO` implementation. The current profile directory is used at startup; Main explicitly supplies its actual `userData` directory during live reselection. Fresh-database reinstalls also require this backup when a current profile exists.
3. Revalidate and upgrade the selected existing database using the protected migration transaction and a separately verified migration backup when migration is necessary. Existing daily backups, settings, drafts and original directories remain in their own data directories.
4. Stop the old child, start the candidate service, and wait for its ready response. Only then atomically rename the new profile file. Main adopts the candidate, changes userData and loads its URL.
5. On failure after quiescence, stop any candidate and restart the old child, which opens a new RPC/request gate. Main loads the restarted old service's new URL. The old profile remains saved on validation, migration, startup or profile-write failures; native actions remain installed for retry. A failed old-service restart is explicitly reported rather than treated as successful recovery.

Production entry now acquires the single-instance lock before profile selection, backups or migrations. Main's existing idempotent request and second-instance focus handler remain. First-start/profile rejection has a native retry/reselection dialog before any renderer exists. First-start fresh creation still uses no file picker; normal restarts reuse the completed profile without prompting.

## Compatibility and backups

`database-validation.ts` copies the selected database and any existing WAL to an isolated temporary directory, so validation cannot create/truncate sidecars beside an untrusted source. Integrity and FK checks run on that isolated snapshot; committed WAL pages participate in serialization. Migration rehearsal runs in memory. The source DB/WAL/SHM bytes remain unchanged during validation.

Validation requires a complete, ordered ledger from 1 through its latest version, nonempty migration timestamps, version ≤25, and the planner tables. After rehearsal it checks required columns/types/PK/nullability, unique keys with collations and partial-index predicates, foreign keys, and current protection triggers. Additional user tables are retained. Index collation names are normalized to uppercase because legitimate SQLite index metadata can retain `nocase` versus `NOCASE`; the uniqueness requirement itself is unchanged.

The manually assembled v15 fixture previously omitted ledger rows6–14, although retained migration SQL does not insert those rows itself. The coordinator verified the historical migration implementations: 51767a9(v6), d61e4db(v7), 10fdbd6(v8), 68423f0(v9), b85314d(v10/v11), 02d5857(v12), b4442fd(v13), a41441a(v14), and v1.1.0's6–15 migration pipeline explicitly insert the ledger. The fixture now records6–14 to match those released paths. Its v14 downgrade test now removes >14 instead of inserting14 a second time. Production validation was not relaxed to accept incomplete provenance.

Strict limitation: if the current database is already corrupt or missing, no verified backup can be produced and switching is refused. The old bytes/profile remain preserved and native retry remains available. There is no raw-copy fallback presented as a successful backup, no invented repair of an unavailable production database, and no complete restore-center UI.

## Verification evidence

- Initial resumed focused run:7 suites /72 tests passed (`/tmp/planner-task6-resume.log`).
- New safety regressions first failed for the genuine v15 collation mismatch, changed partial-index predicate, missing protection trigger, fresh-switch backup bypass and missing-current-DB bypass. The FK test fixture initially needed SQLite unsafe mode to construct the damaged schema; the corrected test then reproduced the actual missing-FK acceptance (`/tmp/planner-task6-fk-red.log`). After fixes,2 suites /20 tests passed (`/tmp/planner-task6-safety-green.log`). Source/WAL bytes and independently readable WAL-inclusive backup are explicitly asserted.
- Expanded focused suite includes native recovery without a renderer, untrusted/trusted sender handling, running/finalizing task refusal, quiescence, cancellation, startup/profile failures and retry. The first parallel run passed87/88 with a5s timeout in the existing damaged-data-page profile test during a concurrent migration run; no timeout was raised. Serial profile/migration/daily/startup recheck passed4 suites /38 tests (`/tmp/planner-task6-regression-recheck.log`). Final focused result is recorded below.
- Final focused command: `node node_modules/vitest/vitest.mjs run tests/main/production-profile.test.ts tests/main/database-selection.test.ts tests/main/database-validation.test.ts tests/main/database-reselection.test.ts tests/main/local-service-controller.test.ts tests/main/recovery-controller.test.ts tests/main/desktop-startup.test.ts tests/main/single-instance.test.ts tests/server/database-switch.test.ts tests/renderer/safe-recovery.test.tsx --maxWorkers=1` — **10 suites /89 tests passed**,61.06s (`/tmp/planner-task6-focused-final.log`).
- Initial migration regression:6 suites /84 tests passed, while2 v15 tests exposed the duplicate fixture ledger insertion described above (`/tmp/planner-task6-migration-green.log`). Both corrected v15 cases passed in the38-test recheck. No migration assertions were removed.
- `tsc --noEmit` and `tsc -p tsconfig.main.json` passed (`/tmp/planner-task6-typecheck-final.log`, `/tmp/planner-task6-buildmain.log`). `git diff --check` passed.
- Real compiled Node child-service smoke passed (`/tmp/planner-task6-service-smoke.log`): cancel keeps the original listener healthy; private quiesce RPC is wired; verified current backup exists; old child stops; candidate starts before profile commit; candidate HTTP health succeeds; restarted candidate reuses the profile without prompting. This is a real service/process check, not an Electron/Windows UI claim.

## Integration and Windows verification

The existing bundled `initialize-empty-acceptance.cjs` now exports validation/preparation/current-backup helpers and `ProductionStartupService`. Existing comprehensive repack builds this TypeScript entry with esbuild, so the helpers and service controller are included without a new package dependency. The desktop bridge adds only `reselectDatabase()`; private service protocol adds only `prepareDatabaseSwitch`.

Windows root verification should extend the existing native dialog helper with a selection-only mode matching the live picker title **重新选择数据库（保留当前数据库和全部原文件）**. Trigger through the actual Safe Recovery button or native menu and verify: cancellation preserves profile/current source bytes; invalid/future target returns an error and permits retry; valid target creates a readable restore backup and loads a different real local-service origin; saved target survives restart without a prompt. Repeat native menu invocation with renderer unavailable. Capture actual file-picker and changed-service/profile evidence, rather than relying only on a mocked dialog response. `BrowserWindow.loadURL` is programmatic navigation, so Electron's `will-navigate` policy continues to block renderer-initiated cross-origin navigation while Main can load the candidate URL.

Whole-suite/browser/Windows installer, real native UI, Adobe Illustrator and release verification remain with the root task. This report does not claim those checks passed.

## Review fix pass (2026-11-06)

Independent review identified two Important boundaries. Both were reproduced before changes: choosing case-different PLANNER.DB could select a different runtime path; deleting the target during async stop/start could create an empty replacement; even a zero-byte selected runtime DB could initialize. Production/candidate service configurations now require SQLite fileMustExist and validate the exact opened handle before journal/migration changes. The shared chooser verifies selected file resolves to the fixed runtime planner.db. Development's explicit fresh initialization default remains separate.

A real consumed POST whose client disconnected while async scanning was pending left a permanent busy request after completion. Request tracking now retains running handler count separately from response completion/close: disconnect cannot release a running mutation, and settling releases a closed response without restarting the service. Late handlers recheck the closed switching gate. New regressions cover busy-before-settle and success-after-settle.

Agent observed focused2 suites22 GREEN (/tmp/planner-task6-review-green.log); root added explicit Fastify route/handler types and repeated those alongside regressions: all relevant DB fixes and UI updates passed, with the separately long outbound mock scenario timing out under concurrent load, then passing4/4 alone (2.35s assertions). Whole final regression will rerun; root typecheck passed. No backup, provenance, uniqueness or quarantine guard was removed.

Scoped re-review also identified Windows case-sensitive directories: case-fold comparison could substitute a distinct existing lowercase library. Removed that exception; both paths now must have the same canonical realpath. Added a regression with both physical filenames and the Windows branch selected; it first failed and now passes. Normal case-insensitive volumes resolve both names to the same canonical stored path. Safety follow-up3 suites33 passed (/tmp/planner-safety-final.log), including handler-disconnect lifecycle and exact-selection protection.
