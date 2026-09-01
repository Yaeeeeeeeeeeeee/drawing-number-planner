# Task 10 report — QR management workflow

## Scope delivered

- Added daily-work navigation and a dedicated QR management page with filterable list, detail editing, activation/deactivation, associated-file state, and pending-file resolution.
- Added dynamic product-archive QR summaries. Existing applicable QR records are shown; the standard labels are 说明书、售后 and 菜谱, while any other existing purpose uses its data-provided display name.
- Completed the missing Task 9 UI contract dependency: QR list/detail responses now include product context plus associated and eligible pending file references; `POST /api/qr-codes/:id/associate-file` safely resolves one compatible pending index record without changing QR business status or writing to the source file system.
- Added a restricted desktop bridge. It accepts only a validated relative path for an existing associated QR index entry under the configured workspace root. Images can return a local preview, PDFs use the system opener, and folder reveal is separate. Browser preview returns a clear Windows-desktop-only message and makes no local request.

## RED / GREEN evidence

- RED: the Windows-style relative-path regression changed the pending-file fixture to the same backslash path shape emitted by the workspace scanner. The focused core test failed with `expected [] to match object [...]`, proving the forward-slash-only lookup omitted the pending file.
- GREEN: normalizing stored separators in the pending lookup made that focused core test pass.
- GREEN: `vitest run tests/core/qr-service.test.ts tests/server/qr-codes-api.test.ts tests/renderer/qr-codes-page.test.tsx tests/renderer/products-page.test.tsx tests/smoke/app-shell.test.tsx tests/main/open-qr-file.test.ts tests/renderer/api-client.test.ts` — 7 files, 41 tests passed.
- GREEN: `tsc --noEmit` passed.
- GREEN: `git diff --check` passed before commit.

## Files

- UI/client: `src/renderer/pages/QrCodesPage.tsx`, `src/renderer/pages/ProductsPage.tsx`, `src/renderer/layout/AppShell.tsx`, `src/renderer/data/client.ts`, `src/renderer/desktop-qr-files.ts`, `src/renderer/styles.css`.
- Desktop safety boundary: `src/main/index.ts`, `src/main/preload.cts`, `src/main/open-file-location.ts`, `src/server/start-server.ts`.
- Minimal dependent API contract: `src/core/qr/*`, `src/server/routes/qr-codes.ts`.
- Tests: core/service, route/API, QR renderer, product renderer, app shell, desktop file action, and shared API client coverage.

## Commit

- `1332571 feat: add qr management workflow`

## Concerns and boundaries

- No QR/PDF originals were moved, renamed, deleted, uploaded, copied, or decoded. The manual association changes only the existing QR index row.
- The Schema v8 index does not persist a pending file's product/purpose IDs. To keep the manual-association endpoint narrow, it accepts only a present `pending` file whose stored directory and filename match the selected product SKU/model and purpose. Unmatched or incompatible files remain untouched for later handling.
- No BOM, QR decoding, scanner, migration, drawing-number, or original-file behavior was changed.
