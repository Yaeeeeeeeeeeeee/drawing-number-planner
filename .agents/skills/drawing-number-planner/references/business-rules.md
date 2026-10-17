# Business rules

## Classification

The classifications in `SKILL.md` are authoritative for this reference. Current rules are deliberately limited to stable decisions; implementation details that may change belong in the code and current project status files.

## Current

- The application is a local-first tool for drawing-number planning, product records, BOM relationships, package-material PDF indexing, QR records, and outbound-material workflows.
- SKU and model are separate product fields. Product directories use the `{SKU}-{model}` convention under a configurable material root.
- A formal drawing number follows the verified Excel coding contract. Appearance code is part of the formal code and participates in generation, duplicate checks, sequence recommendation, and combination identity.
- The occupied-number set includes software reservations and reliably identified historical formal drawing numbers. A reliably identified historical number enters that set by default; it can leave only through an explicit release operation with exact full-code confirmation and reference-safety checks.
- Retained occupancy and released occupancy are distinct. Restoring a deleted drawing preserves its original number.
- Product identity, current business records, historical records, and historical snapshots must remain distinguishable.
- Historical PDF discovery is read-only and must not silently invent product identity, drawing identity, batch meaning, or conversion status.
- Source and converted PDF roles are distinct. Missing files describe material completeness, not drawing validity.
- Current and historical material usage must be distinguishable. A current-file decision must use explicit business-batch semantics; it must not silently use file modification time as a proxy.
- BOM current relationships and BOM historical relationships are separate concerns. Current BOM describes what the product currently uses; historical BOM/snapshots may preserve past drawing numbers and past business state.
- BOM fields for material, dimensions, position, image, diagram, notes, and change details must not be collapsed when the domain requires them separately. Existing QR relationships must survive a UI that currently does not expose QR editing.
- QR is an independent business area. It does not generate drawing numbers or participate in drawing-number occupancy, sequence recommendation, or formal drawing parsing.
- QR business status, file existence, and match/confirmation status are independent.
- Outbound history must preserve the product identity, drawing/file facts, and relevant change-detail snapshot used at the time. Later BOM edits must not rewrite historical outbound records.
- Outbound messages must not expose internal paths, batch sources, database IDs, or other internal storage details.

## Confirmed Backlog

- QR content decoding and automatic URL discovery.
- Batch renaming, richer old-model copying, server synchronization, and server-side difference comparison.
- Any future QR editing UI, including whether it should be restored to BOM editing.
- Further outbound automation beyond the currently implemented workflow.

## Pending Confirmation

- Whether and how an exited product may be automatically restored to current business use.
- Whether future BOM QR editing should return and what authorization rules it should have.
- Any change to batch selection semantics, outbound template defaults, or the current package-size limit.
- Any new cross-product sharing or historical-identity behavior not already covered by current code and tests.

The original Excel workbook is an authority when coding structure, dictionary mapping, historical-number recognition, or a rule conflict is involved. It need not be loaded for unrelated work.

## Current P4 BOM historical editing correction (2026-10-16)

The latest explicit user request makes an existing BOM record's ID, business date (including legacy NULL), original createdAt, predecessor and version identity immutable during ordinary editing. Only an explicit create action may create a new record. Preserve editRevision concurrency and updatedAt; refresh the exact selected snapshot and do not fall back from a missing edit target to POST. The earlier date-correction-and-rearchive behavior is Historical for ordinary edits and must not be restored silently. Preserve unchanged legacy NULL-date attachments without inventing a dated archive; explicit new/replaced managed attachments must still pass existing path/type/size/existence/hash checks. Do not clean up duplicate user rows as part of this fix. See `docs/p4-bom-edit-corrections-20261016.md`.
