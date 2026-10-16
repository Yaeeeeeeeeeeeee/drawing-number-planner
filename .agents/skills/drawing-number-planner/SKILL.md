---
name: drawing-number-planner
description: Preserve and apply the confirmed business rules, data-safety boundaries, and acceptance principles of the Drawing Number Planner project. Use for changes, reviews, debugging, migrations, UI work, or domain questions in this project; do not treat historical documents or current implementation details as permanent rules without verification.
---

# Drawing Number Planner

Use this skill only for the Drawing Number Planner project. Its purpose is to preserve confirmed domain decisions and prevent accidental restoration of superseded behavior.

## Before making decisions

First inspect the actual working tree, current implementation, `src/db/schema.sql.ts`, `src/db/migrations.ts`, and the latest `PROGRESS.md` / `NEXT_STEPS.md` when present. Treat code and current migration behavior as implementation evidence, not automatically as business policy.

Classify every relevant statement as exactly one of:

- **Current** — stable, confirmed business rule suitable for implementation.
- **Confirmed Backlog** — confirmed direction, but not implemented or not part of the current scope.
- **Historical** — retained for traceability only.
- **Deprecated** — explicitly superseded; do not restore without a new request.
- **Pending Confirmation** — unresolved or requiring a new user decision.

Only **Current** rules may silently guide implementation. If code, schema, documents, and tests disagree, report the discrepancy and preserve data until the user resolves any material ambiguity.

Read the topic reference needed for the task:

- [business-rules.md](references/business-rules.md) for domain behavior and classification.
- [data-safety-and-storage.md](references/data-safety-and-storage.md) for paths, files, migrations, destructive actions, and isolation.
- [schema-and-domain-model.md](references/schema-and-domain-model.md) for domain entities and how to verify the live schema without hard-coding a version.
- [ui-and-acceptance.md](references/ui-and-acceptance.md) for interaction principles and verification gates.
- [historical-and-deprecated-rules.md](references/historical-and-deprecated-rules.md) when evaluating old designs or compatibility questions.

## Non-negotiable boundaries

- Do not infer a permanent rule from a branch name, current port, temporary database, test count, current data count, or a single acceptance snapshot.
- Do not modify, move, rename, or delete original user files during indexing or acceptance work unless explicitly authorized.
- Do not release an occupied drawing number without an explicit release action, exact full-code confirmation, reference-safety checks, and clear confirmation.
- Do not silently guess when product identity, batch meaning, file ownership, BOM history, or outbound mapping is ambiguous.
- Do not merge branches, start a new phase, or operate on real user data unless the request explicitly authorizes it.

When a task changes a rule, update the classification and supporting reference only after the user has confirmed the new behavior.


<!-- drawing-number-planner-ui-baseline-20261013 -->
## UI baseline and acceptance evidence

For UI, desktop delivery, acceptance claims, or changes affecting confirmed rules, read [the UI baseline and acceptance supplement](references/ui-and-acceptance.md#ui-baseline-and-acceptance-supplement-2026-10-13) and the project documents `docs/approved-ui-alignment-20261013.md` and `docs/desktop-acceptance-20261013.md`. These are dated evidence, not blanket authorization or proof of final acceptance.

Preserve confirmed module layouts and real business safeguards. Keep candidate UI, automated verification, conditional acceptance, manual desktop acceptance, and final release acceptance separate. Before concluding future work, check whether it changes a Current rule, a module UI principle, a deprecated design, or an acceptance boundary; update only affected Skill guidance when a confirmed rule actually changes. Report missing evidence and unresolved discrepancies rather than promoting a candidate or test result to human approval.


<!-- drawing-number-planner-workspace-20261014 -->
## Current UI direction (2026-10-14)

For future UI work, also read [the current workspace supplement](references/ui-and-acceptance.md#minimal-engineering-workspace-supplement-2026-10-14), `docs/minimal-engineering-workspace-design-20261014.md` and `docs/minimal-engineering-workspace-acceptance-20261014.md`. These confirmed decisions supersede conflicting earlier visual constraints only; preserve the 2026-10-13 historical evidence and all business protections. P0 design approval alone does not authorize implementation. Check the latest explicit phase authorization; the 2026-10-14 P1 authorization and evidence are routed by `docs/p1-minimal-workspace-20261014.md`. P1 does not authorize P2 or later phases.

### Later P2 authorization and P1 feedback

The user subsequently gave preliminary approval to P1 and explicitly authorized fixing narrow product/dictionary action wrapping and left-aligning PDF filenames, then continuing directly into P2 for combined acceptance. Read `docs/p2-workspaces-20261014.md` and `docs/superpowers/plans/2026-10-14-p2-workspaces.md` for that scope and fresh evidence. This does not authorize P3–P5, merge, production data, embedded PDF preview or draggable widths. Preliminary P1 approval is not full Windows/DPI or release acceptance.

### P3 authorization (2026-10-15)

The user explicitly authorized P3 and included PDF/dictionary/planning feedback. Read `docs/p3-module-alignment-20261015.md`: module headings use one Chinese title and one Chinese description, without English eyebrows; PDF table columns center except the filename, with single-line batch and batch state; opening file detail preserves list width with local scrolling; dictionary columns align with their toolbar; planning item numbers remain single-line. P3 preserves all confirmed information structures, business actions, semantic colors and historical evidence. No P4 resizing, merge or production-data authorization follows.

### P4 authorization and current refinements (2026-10-15)

User explicitly authorized P4 including latest feedback. Read `docs/p4-workspace-refinement-20261015.md` and the P4 plan. PDF now scrolls only its central file table; product/batch navigation stays fixed and file detail overlays that central workspace, with the narrow modal preserved. Product QR entry is a direct list of real purposes/states rather than a count disclosure. P4 permits constrained, keyboard-accessible panel resizing and reset without persistence; planning/outbound gain visual stage grouping while keeping existing business actions, validation and manual-draft protection. Historical P3 scroll and QR disclosure requirements are superseded only by these confirmed UI changes. No P5/merge/production-data authorization follows.

### Latest P4 existing-data adaptive layout (2026-10-15)

Read `docs/p4-adaptive-data-workspaces-20261015.md` for the user's later all-page width/height refinement. It supersedes the earlier P4 wide PDF overlay: dock detail beside the primary list when the measured width budget permits, use a drawer when narrow, and preserve independent scrolling, resizing, focus and selection. Data regions may use full available width/height while controls remain bounded; preserve complete pagination and all record/history semantics. For this refinement, use existing data read-only and do not create/clone records or run the old 40-record seed to simulate density. Earlier sample evidence remains historical, not real-data acceptance. Explicitly report missing populated data, physical 4K/Windows DPI and native-window evidence. No P5/merge/production write authorization follows.

### Latest P4 BOM query history refinement (2026-10-16)

For the later explicit query-only history comparison request, read `docs/p4-bom-history-comparison-20261016.md` and the matching supplement in `references/ui-and-acceptance.md`. This authorizes summaries, reliable matching, changed-field filtering, project folding and verified historical attachments only in query details. Earlier path hiding is superseded here only by on-demand disclosure; all data safety and manual Windows acceptance boundaries remain.
