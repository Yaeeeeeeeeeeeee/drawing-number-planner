# V4 PDF manual classification backend

Implemented preview/apply repository and FileService, POST `/api/files/classification/preview` and `/apply`, optional typed PlannerApi methods through PdfManagementApi, and exported input/preview/entry/result types. Targets use actual product and material-batch IDs; duplicate display names remain distinct records. Confirmed per-file product attribution takes precedence over directory/drawing fallback in search and navigation counts. Applying updates only assignment/audit and the selected PDF's material_batch_id. It never changes the target batch's product_id. Scan UPSERT preserves confirmed batch; original paths and IDs remain stable.

Preview returns sorted IDs, old/target attribution, conflict warnings and a SHA256 snapshot fingerprint. Apply requires confirmed=true and a nonempty reason, validates before backup, creates a verified database backup for file databases, and rechecks the fingerprint inside an immediate transaction before writes. Assignment revision increments and audit preserves old attribution/assignment plus target/conflict/reason. In-memory fixtures have no disk backup.

Confirmed assignments enter drawing evidence as `confirmed-pdf`. Unique trustworthy evidence participates in existing effective-owner resolution; explicit drawing bindings remain authoritative. Conflicting planning/BOM/outbound/drawing evidence is returned visibly in preview/apply. Correcting the selected PDF does not alter drawing bindings, reservation rows or historical business rows. Another PDF with the same diagram can retain an independent product/batch assignment.

## Verification

- RED: new pdf-classification test failed because repository module did not exist.
- GREEN: `node node_modules/vitest/vitest.mjs run tests/core/pdf-classification.test.ts tests/core/file-repository.test.ts tests/server/files-api.test.ts` — 3 files, 44 tests passed.
- After adding same-drawing/different-batch and public type exports: targeted pdf-classification suite — 4 tests passed.
- Tests cover 12 PDF assignment/audit/verified backup, one-file correction, duplicate SKU/model ambiguity with no guessed owner, invalid/duplicate/missing IDs, nonexistent target, stale preview without writes, restart and rescan retention, search/navigation counts, target-batch ownership unchanged, stable paths, original byte preservation, populated BOM/outbound snapshot equality, drawing/binding/reservation equality, conflicting drawing ownership warning, two PDF instances of the same drawing in different batches, and real localhost HTTP JSON via typed client preview and apply route.
- Localhost listener requires sandbox escalation; test execution with approved escalation passed. No production/user database or original PDF was used.
- Typecheck initially passed after backend implementation. Latest global typecheck has no backend errors, but concurrent BomHistoryComparison LayoutColumn typing and pdf-product-navigation CatalogNavigationCounts.mainCategories errors remain for owning agents; parent informed.

No schema changes, commits, pushes, or progress document edits performed by this worker. Schema19 assignment/audit tables are supplied by schema worker. Real user ZC100 counts and installed Windows behavior remain outside these isolated backend tests.

## Independent review correction: same-file legacy batch evidence

Reviewer reproduction `/tmp/v4-review-repro.ts` exposed that assigning an unbatched historical PDF to product B and an existing product-A scoped batch introduced a second, inferred `confirmed-batch-pdf` A attribution after apply. Preview had no conflict, but effective drawing owner became NULL.

Added a RED historical regression that failed with the unexpected A batch evidence. The legacy `confirmed-batch-pdf` union now excludes a file with an explicit pdf_product_assignments row. This exclusion is specific to that physical file: other unassigned PDFs for the same diagram, BOM, outbound and explicit drawing bindings remain independent evidence. A separate same-diagram PDF in the scoped batch is still reported as a conflict; changing that other file's scope attribution invalidates the preview fingerprint and leaves audit unchanged.

The assigned file no longer derives drawing evidence from its target batch scope, so prospective target scope changes cannot create new inferred ownership for that file. Existing other-file scope dependencies are represented in the preview evidence snapshot and rechecked transactionally.

GREEN reproduction (`node --import tsx /tmp/v4-review-repro.ts`): previewConflicts=[], result.updated=1, result.conflicts=[], evidence=[{productId:2,appearanceVersionId:null,source:'confirmed-pdf'}], owner={productId:2}. New historical regression passed. Full focused rerun pending below.

Final review-correction verification: pdf-classification, file-repository and files-api suites — **3 files, 45 tests passed** (includes real localhost HTTP transport).
