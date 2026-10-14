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

For future UI work, also read [the current workspace supplement](references/ui-and-acceptance.md#minimal-engineering-workspace-supplement-2026-10-14), `docs/minimal-engineering-workspace-design-20261014.md` and `docs/minimal-engineering-workspace-acceptance-20261014.md`. These confirmed decisions supersede conflicting earlier visual constraints only; preserve the 2026-10-13 historical evidence and all business protections. P0 is approved, but the current authorization is documentation only: wait for explicit P1 authorization before implementation.
