# Task 4 — G-02 / G-05 renderer feedback

Date: 2026-11-05. Worktree: `.worktrees/confirmed-requirements`.

## Delivered behavior

- `DrawingTasksPage` passes mounted-page activation through to task history/detail. Every activation reads actual history; an opened task also refreshes, including completed/ended tasks. No key/remount reset was introduced. Filters/product selection, table/editor DOM, scroll, expanded items and unsaved dimensions survive.
- History reads use a request sequence. Per-task detail revisions merge newer accepted detail/mutation results into an older history response while still accepting other fresh history rows. Detail reads share one ordered request sequence; mutations have a separate completion sequence, invalidate older GETs and suppress overlapping poll GETs. Hiding invalidates reads without discarding an in-flight successful save. A completed mutation updates an already selected same task without reopening a different/closed detail. Delete completion invalidates history reads started during deletion. Hidden pages clear existing detail polling and reject late results; existing visible polling intervals remain 1s during generation / 3s otherwise, with no completed-task polling.
- Task history distinguishes initial loading, successful empty history, product-filter no-results and a retryable read failure. A failed manual refresh retains prior history and cannot announce success. Detail refresh uses the existing explicit refresh control as retry and retains last good detail and dirty editors. A dirty editor remains visible but disabled if the refreshed task becomes completed/ended.
- Template/rule/task-page catalog lookups settle independently. Successful catalog/lookups are retained when another resource fails, including initial successes before a failed critical catalog read. Failed catalog reads never become an empty catalog. Named failures have a retry control; existing catalog/editor data and input survive refresh errors. Templates and rules have separate true-empty and filter-no-results messages.
- PDF auxiliary settings/products/material batches/drawing navigation use ordered partial loading, retain each last good value on failure and expose named retryable failures. Failed navigation counts retain the last good tree/counts instead of clearing them. Root-path drafts survive metadata retries. Scan-time drawing navigation failure also retains its last good value. Initial metadata failures suppress misleading normal empty/setup states. The PDF list distinguishes a true empty index from filtered no-results and has explicit read retry.
- QR product/purpose references use an ordered, retryable partial load instead of silent catches; successful and previous values survive failure. List failure no longer displays an ordinary empty result, and list retry preserves filters. Initial loading, true empty and filter-no-results have separate feedback. Unavailable initial purpose metadata disables adding a purpose from a product row.

## Interfaces and touched files

No client/server/core/schema interfaces changed. `PackagingTasks` adds optional `active` (default true). Internal detail callbacks centralize ordered refresh/mutation acceptance.

Implementation:
- `src/renderer/pages/DrawingTasksPage.tsx`
- `src/renderer/pages/packaging/PackagingTaskPanel.tsx`
- `src/renderer/pages/PackagingTemplatesPage.tsx`
- `src/renderer/pages/FilesPage.tsx`
- `src/renderer/pages/QrCodesPage.tsx`

Regressions added to existing tests:
- `tests/renderer/packaging-page-freshness.test.tsx`
- `tests/renderer/drawing-tasks-page.test.tsx`
- `tests/renderer/files-page.test.tsx`
- `tests/renderer/qr-codes-page.test.tsx`

FilesPage handoff for Task 5: changes are around metadata state/load helpers beside `navigationRequest`, count retention in `refreshNavigation`, activation loading/cleanup, the scan-time drawing-navigation catch, feedback near the error banner, and the list empty-state condition/title. No PDF scanning scope, category/business membership, bulk mutation, presence/detail, filter semantics, or toolbar action behavior was changed.

## TDD and verification evidence

1. `/tmp/task4-red.log`: first regressions before implementation — **9 failed, 70 passed**, four suites. Failures reproduce stale activation history, opened-detail refresh absence, poll overwriting a save, hidden polling, swallowed partial metadata failures, false empty feedback, missing retry and catalog filter no-results.
2. `/tmp/task4-red-2.log`: added initial successful task-lookup retention regression — **1 failed, 46 passed**. Failure: products disappear when catalog first fails and products fail on retry.
3. `/tmp/task4-red-3.log`: further history merging and PDF empty/retry regressions — **3 failed, 46 passed**. The new history test initially hid before awaiting detail opening; this harness timing was corrected. `/tmp/task4-history-merge-red.log` then verified the actual counterfactual failure with request invalidation replacing per-task merging: **1 failed, 12 skipped**, missing the other fresh history row.
4. `/tmp/task4-manual-refresh-red.log`: **1 failed, 13 skipped**, proving a failed manual history read incorrectly announced success.
5. `/tmp/task4-navigation-mutation-red.log`: **2 failed, 11 skipped**, reproducing an in-flight save discarded by hide/reactivation and late history restoring a task after deletion. Read-only review independently confirmed the save race; both regressions were fixed before final verification.
6. `/tmp/task4-green-final.log`: exact required command below — **5 suites passed, 100 tests passed**, no test errors.

   `npm test -- tests/renderer/packaging-page-freshness.test.tsx tests/renderer/packaging-catalog-ui.test.tsx tests/renderer/drawing-tasks-page.test.tsx tests/renderer/files-page.test.tsx tests/renderer/qr-codes-page.test.tsx --maxWorkers=2`

7. `/tmp/task4-typecheck-verified.log`: `npm run typecheck` **exit 0**. `git diff --check` **exit 0**.

The initial GREEN attempt exposed a settings-root state-updater timing regression; it was corrected before the passing verification. A later test fixture omitted required navigation count fields and threw; its fixture shape was corrected. Neither is an outstanding failure.

## Review

A read-only reviewer identified the pending-save visibility race, then rechecked its fix: independent mutation completion ordering and same-task selection updates resolve the finding. The reviewer found no remaining substantive scoped issues; no additional implementation agent edited files.

## Scope and limits

Verification is renderer tests and TypeScript only. Full-suite/build/browser/Windows/release verification remains owned by the root task, as directed by the task brief; this report does not claim it. Existing optional automation checks and QR history behavior are outside this feedback task. No production database, original files or Illustrator/Adobe interaction was used or verified. Other concurrent core/server/client changes were not staged into this task.
