# UI and acceptance

## UI principles

- Separate view, edit, and destructive actions. Keep dangerous operations visually and spatially distinct.
- Show current, historical, inactive, missing, pending, and exceptional states with both text and visual hierarchy; never rely on color alone.
- Preserve readable layouts at the supported desktop width. Long paths and filenames must wrap without horizontal overflow.
- Do not expose internal version labels or storage implementation details when they are not part of the user-facing business model.
- When a choice is ambiguous—product, batch, file instance, BOM record, or outbound source—ask the user rather than silently selecting one.
- Keep existing relationships when a feature is temporarily hidden or moved.

## Verification gates

For material changes, select checks proportionally to risk. Domain or persistence changes normally require relevant unit/integration tests, migration/rollback checks when applicable, API checks, and type checking. UI changes should include renderer tests and a realistic browser or desktop flow when available. Release-facing work should include production browser and desktop builds.

Read the latest project status and run the relevant commands rather than copying old counts from a progress document. A green isolated test run proves the tested behavior; it does not prove that real user data was changed safely.

Before claiming completion, report important discrepancies, unverified real-data steps, and any deferred acceptance item.


<!-- drawing-number-planner-ui-baseline-20261013 -->
## UI baseline and acceptance supplement (2026-10-13)

### Sources and status

Read project-root `docs/approved-ui-alignment-20261013.md` for confirmed visual choices, module scope and the real-page alignment candidate; read `docs/desktop-acceptance-20261013.md` for later desktop delivery evidence. From this reference their relative links are [UI alignment](../../../../docs/approved-ui-alignment-20261013.md) and [desktop acceptance](../../../../docs/desktop-acceptance-20261013.md). If absent, request the actual documents; do not reconstruct them from screenshots.

The later desktop record documents an authorized master fast-forward to `8bd386a164be642c152007ea55247d989a519f4a`; the earlier candidate record's “master not merged” describes that earlier stage. Neither grants permission for a future merge. Commit IDs, temporary paths, ports, counts and screenshots are dated provenance, not permanent product rules.

The alignment screenshot source is `C:/Users/Administrator/Documents/Codex/approved-ui-alignment-20261013`: final keys `drawings`, `drawings-detail`, `dictionary-main`, `dictionary-create`, `dictionary-edit`, `dictionary-hierarchy`, `planning`, `products`, `products-preflight`, `files`, `qr-list`, `qr-detail`, `outbound`, `migration`, `migration-detail`, `recovery` at 1080/1200/1280, plus `electron-qr.png` and `electron-recovery.png`. Earlier aliases are not this round's final comparison source. This supplement records the documents' evidence; it does not claim fresh screenshot inspection or pixel identity.

### Current confirmed module principles

| Module | Preserve confirmed UI and business behavior |
|---|---|
| Drawing library | User-approved third layout using shared real components; retain query, batches, recycle bin, official/historical occupancy and reference protection. |
| Coding dictionary | Five tabs, compact toolbar, parent/child browsing, locked-code editing with guide lines, equal-height Save/Cancel and operation colors. Keep name editing, enable/disable, history recovery and original deletion service. No fabricated independent reference preflight. |
| Drawing planning | Product/appearance inputs, derived information strip, preview beside planning rows, bottom confirmation and real saved results. Preserve dependencies/invalidation, complete appearance code, duplicate/serial checks and approved input/expectedFullCode validation. Optional brand/size code lookup is read-only; its failure must neither block base queries nor invent codes. |
| Product archive | Seven-column table, three attributes and three-column QR details, width-limited exit worksheet. Keep filtering, creation/editing, enable/disable and historical identity. Exact QR entry stays in expandable summary; deletion stays in details with full preflight and two confirmations. |
| BOM management | Keep the confirmed current version and existing entry points; preserve query, edit, deletion, snapshots and relationships. |
| PDF file center | Keep shared real styling and existing entry points; preserve scanning, indexing, file location and historical rules. |
| QR management | Reconfirmed second-version details: flat metadata and file worksheet, path entry beneath the full filename. Preserve independent business/file/match states, editing, linking, enable/disable, deletion protection and first-batch loading-failure handling. Sample QR images do not prove QR decoding capability; unconfirmed files remain unconfirmed. |
| Outbound materials | Continuous preparation/results/email areas, four selections, eight-column table and real package-result worksheet. Keep desktop directory authorization, preview token, explicit multi-BOM selection, blockers, ZIP writing, draft protection, contacts/templates/history. Do not fabricate per-ZIP counts from totals; unknown counts display “未提供”, uncertain physical availability “待核实”. |
| Migration checks | Issue-first filterable worksheet, real row reasons and candidate views. Preserve audit/selection/import rules. Select-all still covers all importable candidates, with explicit scope and selected-outside-filter count. |
| Safe recovery | Keep lower-left entry, overlay and feedback from actual return values. UI alignment alone does not authorize running recovery commands or changing Main Process. Full recovery application remains unverified in the cited record. |
| Shared UI | Acceptance bench is a development tool, outside production navigation. Avoid global style overrides that alter preserved modules. |

Real quantities, names, historical states, file availability and preflight decisions come from actual interfaces. Screenshot sample values are not data requirements. Existing safeguards and relationships survive presentation changes.

### Deprecated or excluded designs

Do not restore the rejected three-step product exit wizard/cards, APP-style product/BOM roundtrip Mock, simulated deletion/repair/recovery, Mock data in real flows, or fabricated historical/per-package results without a new explicit user decision. Keep their historical tests and records classified accurately; a failing excluded Mock test is not proof that a real business flow passed. Proposed alternatives remain Pending Confirmation, not Current.

### Acceptance levels and remaining gates

| Level | What the evidence establishes |
|---|---|
| Candidate UI | Alignment candidate and screenshots for comparison; not final human acceptance or pixel identity. |
| Automated verification | Only the tested scope/environment. The dated records report 900/907 passing with 7 Mock failures and 8/8 isolated E2E passing; these counts are not a future target or fresh run. |
| Desktop smoke verification | Real isolated exe startup, health response, sample planning read and same-version directory reuse. Desktop width checks in the delivery record cover the startup page only; earlier multi-page evidence must not be described as a new full-module desktop run. |
| Conditional acceptance | First batch remains conditionally passed, with real retry/desktop fault recovery, late-response and auxiliary-filter retry TODOs retained. |
| Manual desktop acceptance | Second batch and overall UI still require the user's real desktop visual/interaction review. Record reviewer, version, scope, result and exceptions when actually performed. No automated upgrade to this level. |
| Final release acceptance | Requires unresolved gates to be closed with evidence and actual applicable approval. Full recovery application effect, production file permissions and runtime stability are not established by the supplied records. |

The delivered directory package is offline-capable but unsigned and not an installer; it is not a final release acceptance certificate. Tests and acceptance operate on isolated sample/temporary data; desktop startup validates isolation markers, links and path boundaries. Never infer authorization to operate on a formal database, original files, occupied drawing numbers or recovery commands from this UI supplement.

Report acceptance as separate fields: confirmed UI choices; candidate scope; automated results (including failures); desktop evidence; human acceptance status; outstanding release blockers. Keep unresolved outbound contact/template simultaneous-open behavior and migration failed-audit/old-report policy outside this update's implementation scope.

### Future Skill impact check

Before delivering a future change, identify affected modules and compare against Current rules, confirmed UI principles, Deprecated designs and acceptance gates. Verify against the actual implementation and newest dated evidence; distinguish a new confirmed decision from a proposal or implementation accident. If a confirmed policy changed, update only affected Skill text and supporting source/classification. If none changed, report “Skill impact checked: no rule update needed.” Do not silently rewrite historical evidence, remove unresolved acceptance items, grant merge/real-data authorization, or change Schema/API/core algorithms as part of a UI/Skill maintenance task.
