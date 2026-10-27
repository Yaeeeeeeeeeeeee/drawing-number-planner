# Data safety and storage

## Storage boundaries

- The material root is configurable. Store business file paths as relative paths; do not hard-code drive letters, usernames, or machine-specific absolute paths.
- The local material library is the V1 working source. Automatic server APIs, upload, and bidirectional synchronization are outside the current scope.
- Indexing is read-only. Do not move, rename, rewrite, or delete original PDFs as part of scanning, classification, cleanup, or acceptance.
- Preserve historical files and historical associations even when a product, drawing, batch, or index record leaves the current business list.

## Destructive operations

- Use preflight checks, explicit user confirmation, exact identity confirmation where applicable, and an itemized result.
- A drawing release requires exact full-code confirmation and reference checks. Deleting a record must not implicitly release its number.
- Product exit is a coordinated, transactional operation. Block on active references from other products rather than silently changing them.
- Protect historical BOM, outbound, asset, and identity snapshots from current-record cleanup.
- The later explicit 2026-10-19 product-exit choice allows clearing the specifically disclosed, owned BOM/QR/batch/outbound/draft business records only after the user selects permanent history clearing and confirms it. Keep other-product/shared references, file indexes, original disk files, drawing records and exit audit; recheck impact fingerprints and actual foreign keys in the same transaction. This narrow exception does not authorize clearing history in other workflows or executing deletions on real user data during development. See `docs/p4-product-corrections-20261019.md`.
- When migrating or archiving an attachment, prefer copy → verify hash → update association. Keep the source and preserve retry/recovery information.

## Database changes

- Before a migration, create and verify a readable backup.
- Use transactional migrations and verify rollback behavior, foreign keys, uniqueness, and preservation of business rows.
- Never assume a schema version from a document or old note. Inspect the actual schema and migration registry at task time.
- A schema migration does not authorize moving user files or changing current business data beyond the approved scope.

## Acceptance isolation

- Use isolated databases, temporary material roots, and disposable output for destructive tests.
- Do not report a real-user migration, deletion, or cleanup based only on an isolated preview.
- Do not treat temporary ports, process IDs, test counts, current PDF counts, current history counts, or preview paths as domain rules.

## Current V5 force-release exception — 2026-10-26

The newest request explicitly authorizes a separate force-release action, not relaxation of normal release. Capture impacts and fingerprint, confirm once, transactionally archive original identities, preserve BOM/outbound snapshots and release the current occupation. Quarantine old file relationships, including historical outbound paths with no remaining PDF index; previously force-released complete codes never auto-bind rescanned PDFs to a new reservation. No original file is moved/deleted. Backups remain necessary; audit alone is not a rollback.
