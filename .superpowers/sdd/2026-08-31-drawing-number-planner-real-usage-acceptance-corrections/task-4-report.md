# Task 4 report — safely clear library scan indexes

## Scope

Implemented only Task 4: the explicit, database-index-only library clear operation. No QR, BOM, dictionary, or drawing-library behavior was added or changed.

## RED / GREEN evidence

- RED: `tests/core/file-repository.test.ts` failed because `FileRepository.clearIndex` did not exist.
- GREEN: the repository now deletes PDF indexes, material batches, scan changes, and scan runs in foreign-key-safe order in one immediate transaction, then runs `foreign_key_check` before commit.
- RED: `tests/core/file-service.test.ts` failed because `FileService.clearIndex` did not exist.
- GREEN: the service requires the exact phrase `清空资料库索引` and rejects requests while scanning.
- RED: `tests/server/files-api.test.ts` failed because the clear preview endpoint did not exist.
- GREEN: the API supplies configured-root/count preview and performs the authenticated clear only after phrase confirmation.
- RED: `tests/renderer/files-page.test.tsx` failed because the clear action/dialog did not exist.
- GREEN: the page presents root/count review first, then an exact-phrase confirmation dialog with a displayed-root file-preservation warning.

## Preservation evidence

- Repository fixtures retain dictionary items, products, formal drawing numbers, historical permanent occupancy, and a BOM/current-BOM row while all four scan-index tables are cleared.
- A deletion trigger forces a material-batch failure and proves the whole index clear rolls back.
- Temporary-library tests preserve source file content and modification time; a rescan rebuilds the index without creating duplicate historical occupancy or changing the next planned sequence.
- API tests preserve the configured workspace root and confirm the temporary PDF content remains unchanged.

## Verification

- Directed Vitest suite: 64 tests passed across the five approved files.
- TypeScript: `tsc --noEmit` passed.
- Diff check: `git diff --check` passed.

## Files

`src/core/files/file-repository.ts`, `src/core/files/file-service.ts`, `src/core/files/file-errors.ts`, `src/server/routes/files.ts`, `src/renderer/data/client.ts`, `src/renderer/pages/FilesPage.tsx`, and the four required test files.

## Commit / concerns

Implementation commit: `2878fff feat: clear file indexes safely`. The standard package wrapper could not run in this sandbox because it attempted dependency refresh/build approval without network access; verification used the checked-in Vitest/TypeScript executables with the bundled Node runtime. No production database or real workspace file was read, modified, moved, renamed, or deleted.

## Follow-up review corrections

- RED: three new renderer regressions failed with a selected deleted material-batch filter retained, a stale missing-index cleanup dialog left open, and a refresh failure presented through the generic clear failure path.
- GREEN: successful full-index clear now resets `materialBatchId`, clears pending missing-index cleanup IDs, and refreshes files/batches through a separate post-success path. Refresh failure preserves the success result and reports `索引已清空，但列表刷新失败：…`.
- Verification: the five directed Task 4 test files passed with 67 tests; TypeScript and `git diff --check` passed.
- Follow-up commit: `ab437a5 fix: refresh cleared file indexes`.

## Final re-review correction

- RED: the refresh-failure regression still displayed the old PDF row and deleted material-batch option after the database clear had succeeded.
- GREEN: confirmed successful clear immediately resets local files, total, batch options, and page before the post-clear refresh starts. A refresh failure therefore cannot display deleted records beside the success message.
- Verification: the five directed Task 4 test files passed with 67 tests; TypeScript and `git diff --check` passed.
- Final re-review commit: `5d32584 fix: clear stale file index state`.

## Stale-renderer verification follow-up

- RED: temporarily removing the immediate post-clear `files`, `total`, and `batches` reset made the refresh-failure renderer test fail because the deleted PDF row remained visible.
- GREEN: restoring the reset makes the success message explicit while the separate post-clear refresh reports the precise `索引已清空，但列表刷新失败：…` error. The same test also proves the deleted material-batch option disappears.
- Verification: `tests/renderer/files-page.test.tsx` passed with 19 tests after restoration. The full directed Task 4 suite and TypeScript type check are recorded in the follow-up commit verification.
