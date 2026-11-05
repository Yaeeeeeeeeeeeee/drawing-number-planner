# V4 matching safety report — 2026-10-23

Scope: isolated in-memory SQLite fixtures only; no production database or original PDF was changed.

## Root cause and changes

`DrawingAssociationService.preview` previously took a historical scan's raw `product_id` before querying detected SKU/model. A non-null old scan ID therefore suppressed the other actual product records with the same SKU/model. Its PDF directory projection returned NULL on duplicate directories, so those duplicates could also disappear from diagnosis. One-click classification could consequently confirm the old first candidate.

Diagnosis now enumerates all distinct canonical product IDs from the scan identity's SKU/model peers, detected SKU/model, and complete PDF product-directory segment. Duplicate actual records remain separate candidates unless an existing explicit identity merge already canonicalized them. Conflicting suggestions stay ambiguous and classification writes zero bindings. Confirmed drawing/BOM/outbound/PDF product-ID evidence retains precedence over directory strings and raw scan IDs.

No default-appearance equality restriction exists in the inspected association service, filename matcher, historical classifier, scanner, or PDF directory product projection. The default-appearance edit restriction was in ProductService's referenced-meaning guard, addressed by the schema/product task; confirmed-PDF evidence was supplied by the PDF backend task. This patch does not add appearance management or reinterpret the combined appearance/color field. Existing split appearance and color dictionary checks remain required.

## Isolated counts and regression evidence

| Fixture | Before | After |
|---|---|---|
| Raw scan ID plus two same-SKU/model products, detected fields present | 1 ready target (unsafe) | 2 candidates, ambiguous; 0 classified |
| Same duplicate case, detected fields absent | 1 ready target (unsafe) | 2 candidates, ambiguous; 0 classified |
| Exact PDF directory with two duplicate records and no scan identity | duplicates hidden by NULL directory projection | 2 candidates, ambiguous; 0 classified |
| ZC100 appearance 01 (`02.0305.010.0201001`) | 0 confirmed bindings before explicit classification | 1 confirmed; 1 after default changed to appearance 02 |
| ZC100 appearance 02 (`02.0305.020.0201001`) | 0 confirmed bindings before explicit classification | 1 confirmed; 1 after default changed to appearance 02 |
| Confirmed PDF-ID evidence with duplicate directory products, appearance 01 | 0 confirmed drawing bindings before classification | 1 binding to explicitly confirmed product ID |
| Same confirmed PDF-ID case, appearance 02 | 0 confirmed drawing bindings before classification | 1 binding to same explicitly confirmed product ID |

The multi-appearance fixture's complete historical rows remain byte-for-byte equivalent as database values before/after classification and default editing: full numbers, raw product IDs, split codes and historical occupancy rows are retained. These counts are fixture counts, not claims about the user's ZC100 library.

Remaining unresolved fixtures: duplicate strings with no trustworthy ID evidence remain ambiguous (2 candidates); unknown appearance dictionary code remains conflict (0 classified). This is intentional pending explicit user classification or reliable ID evidence. Real-data counts require read-only access to the user's current library and remain unmeasured here.

RED evidence: initial new test run produced two failures, each expecting ambiguous but receiving ready for duplicate SKU/model with a raw old scan product ID. Focused post-change command: `node node_modules/vitest/vitest.mjs run tests/core/v4-multi-appearance.test.ts tests/core/drawing-association.test.ts tests/core/directory-policy.test.ts`.

Final focused result: **3 files / 20 tests passed**, including all 7 new V4 multi-appearance/safety cases. No commits or pushes performed by this task.

Repository-wide `tsc --noEmit` was attempted and stopped on existing concurrent UI edits in `src/renderer/pages/QrCodesPage.tsx:87` (TS1117 duplicate object properties); no matching-service TypeScript error was reported. `git diff --check` for the owned service passes.
