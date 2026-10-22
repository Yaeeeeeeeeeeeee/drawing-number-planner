# V3 global business correction Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for scoped implementation and independent review. User authorizes continuous implementation, isolated migrations/tests and GitHub/installer delivery without phase approvals. All agents share this checkout; root alone commits/pushes.

**Goal:** Repair trustworthy historical product attribution, remove independent appearance management from everyday workflows, and deliver V3 streamlined UI without losing history.
**Architecture:** Reuse canonical products, existing drawing binding/audit and file/batch business evidence. Keep legacy version tables/FKs read-compatible, permit product-only current associations where needed; use dictionary appearance codes for new planning. Preserve v2 outbound snapshots while simplifying new batch-based requests. Virtualize only products/QR/PDF tables, keeping drawing pagination.
**Tech Stack:** React19, TypeScript, SQLite, Fastify, Electron43, Vitest, InnoSetup.
**Spec:** docs/v3-business-ui-requirements-20261022.md (latest user instruction supersedes conflicting multi-appearance UI/paging rules).

## Global Constraints
- Do not delete original PDFs, historical drawing reservations, BOM/outbound snapshots or old version records. No automatic irreversible production repair at startup.
- Reliable explicit product evidence and full drawing identity may confirm unique products; directory-only or prefix-only inference is not confirmation. Preserve conflicts and surface reasons.
- Reuse existing association storage/audit, not a second product identity system. New products must not create meaningless initial appearance objects.
- New planning uses dictionary appearanceId, keeps full-code occupation/sequence checks and transactional product binding. Occupation is independent of association.
- PDF latest batch uses reliable sequence/businessDate within appearance-code scope, never file mtime. No reliable order means no invented current status.
- Products/QR/PDF have no traditional pagination and bounded rendered DOM. Existing selection/expanded/query/scroll semantics remain; drawing paging unchanged.
- QR remains manual; accept case-insensitive English purpose, full/half parentheses and reasonable whitespace. Still validate actual PDF, exact model and case-sensitive URL tail, preserve controlled exceptions.
- Outbound only selected batch outlined PDFs, no BOM prerequisite, no hidden cross-code comparisons, no rewriting frozen history.
- All agents own scoped files and meaningful tests, record red/green commands/results in docs/v3-work-log.md. Do not commit, push, spawn agents, edit shared progress or shared client types without root coordination.

## Review Focus
- Same prefix different SKUs and directory-only candidates must never silently collapse into one product.
- Legacy explicit version bindings and confirmed file/batch evidence can coexist; conflicts cannot be hidden by priority alone.
- New product without version must work through planning/BOM/manual QR/outbound, old version-linked historical records remain readable.
- Virtual expanded row heights and rapid filters must not lose selection or show previous query pages.
- Batch order ties/mixed code groups and file disappearance between preview/create cannot silently select wrong sources.

### Task 1: Product association, compatibility and reservation backend
Files: core/drawings association/repository/query; core/products service/identity; core/planning; db schema/migrations; corresponding API/core/db tests.
- [x] Reproduce confirmed PDF/manual historical-candidate/BOM evidence withheld by current mandatory-version/BOM-only eligibility; document actual root cause and no-real-758 access boundary.
- [x] Add failing SQLite tests for trustworthy unique evidence, directory-only/prefix ambiguity, scan preservation, safe repair preview/confirm before/after totals, product-only planning and no implicit initial object.
- [x] Implement minimal compatibility migration if needed (nullable legacy-version binding), existing-table audit, backup/rollback tests, no startup repair. Product-only binding shares library navigation/count predicates.
- [x] Test affected core/API/migrations; publish API/data interfaces and precise safety findings.

### Task 2: Batch semantics, PDF list and navigation
Files: core/files and routes/files/material-batches; FilesPage/files CSS; ProductCatalogNavigation/PdfProductBatchNavigation; related tests.
- [x] Reproduce current state/duplicate rename/empty version node and list loading issues.
- [x] Remove version-management nodes/labels, use product->batch, reliable code-scoped batch order, keep only left rename; safe index ignore/clear invariants.
- [x] Compact scan toolbar with details disclosure; replace page controls with cached incremental100 loads + DataTable virtualize/onEndReached, cancellation and stable selection.
- [x] Test latest groups, ties, real ignored files, switching and bounded rendering.

### Task 3: Drawing library drawer and product-only maintenance
Files: DrawingLibraryPage/drawing-library.css/drawing-appearance-client and renderer tests.
- [x] Remove independent version selection/reuse/current/historical actions; retain product maintenance and actual audit.
- [x] Drawer600-680px with single code header plus five light-gray groups; concise file cards and folded low-frequency references, no empty audit group.
- [x] Integrate Task1 product-only diagnosis/count report, original occupancy and dangerous-operation protections; keep drawing pagination.
- [x] Test real displayed fields, edits, source counts and no obsolete operations.

### Task 4: QR manual validation and UI
Files: core/qr manual filename validation; QrCodesPage/qr-manual.css and tests.
- [x] Red tests B500-warranty（hwh0kd9）.pdf, spaces/case/parentheses, wrong model/tail and controlled legacy exception.
- [x] Canonicalize purpose only; keep actual PDF/type and case-sensitive tail. Remove independent appearance picker without erasing existing QR scope.
- [x] Main7columns SKU/model/category/manual/warranty/recipe/actions; five-column subrows stay manual; no paging, DataTable virtualize, concise modal.
- [x] Test independent URL/state, empty purposes, history/replace/unlink and large list.

### Task 5: Outbound batch workflow simplification
Files: core/outbound and routes/outbound; OutboundPage/outbound components/CSS and tests.
- [x] Reproduce version/scope gating and material-type availability without BOM.
- [x] Keep brand/product/batch/type/range three-column form; remove search/version/baseline/cross-version controls. Derive previous batch only from reliable business order and dictionary-code scope.
- [x] Full selected outlined batch; change selection new/modified defaults, unchanged unselected, ambiguity explicit; manual adjustment and existing exception confirmation only.
- [x] Preserve v2 frozen read/regeneration and actual ZIP part counts/hash guards. Test no-BOM/no-version and mixed codes/ties/ZIP immutable history.

### Task 6: Shared virtualization, products/planning/BOM UI, sidebar and delivery (root)
Files: DataTable optional virtualize/onEndReached, ProductsPage, PlanningPage, BomPage, AppShell, shared styles/client, packaging and docs.
- [x] Add reusable measured-row windowing with fixed header/spacer rows, expanded rows and bounded DOM; only3requested modules opt in.
- [x] Remove product version management and product paging, version selectors in planning/BOM while retaining dictionary appearance and raw historical BOM context.
- [x] Sidebar3groups9distinct Lucide18 icons, global concise spacing and single-line fields; clean permanent implementation notes within authorized UI.
- [x] Windows actual native old-schema upgrade/WAL/rollback, manual QR and V3 screenshots; API/types, independent review, complete tests/type/build are verified.
- [x] GitHub feature branch update and verified Chinese custom-path installer; report exact fixture repair counts separately from unavailable real758 counts and explain local confirmation steps.
