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
