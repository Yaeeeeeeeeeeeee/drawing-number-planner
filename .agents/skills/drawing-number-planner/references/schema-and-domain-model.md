# Schema and domain model

This is a routing reference, not a replacement for the live schema. Always inspect `src/db/schema.sql.ts`, `src/db/migrations.ts`, repository queries, services, routes, and tests before changing behavior.

## Main domains

- `dictionary_items`: coding dictionaries and project-item relationships. Active, inactive, and deleted/retained records are different states.
- `products`: SKU/model/product identity and product lifecycle.
- `drawing_numbers`: formal planned drawings and lifecycle/occupancy metadata.
- `historical_drawing_numbers`: reliable historical formal numbers discovered from existing material.
- `pdf_files`: indexed file instances, match state, conversion role, relative path, and optional material-batch association.
- `material_batches`: business batch identity and path context. Batch labels may be presentation-normalized while raw names and paths remain stored.
- `bom_versions`, `bom_current`, and `bom_items`: current BOM relationships, historical BOM records, and their internal predecessor/current-pointer mechanics.
- `bom_assets` and `bom_item_assets`: managed assets, roles, inheritance, and historical references.
- `qr_purposes`, `product_qr_codes`, and `qr_code_files`: independent QR business records and file indexes.
- outbound package, part, reference, email, and snapshot records: outbound artifacts and frozen historical context.

## Verification rules

- Treat schema and migrations as the source of structural truth for the current checkout.
- Check soft-delete predicates and current-vs-historical joins before changing counts, candidates, references, or cleanup behavior.
- Preserve foreign-key and same-product guards around BOM, QR, assets, drawings, and products.
- Do not introduce a new schema version, rebuild a table, or broaden a cascade without an approved design and migration tests.
- Keep compatibility columns and historical rows when the current implementation uses them to preserve old references.

Schema versions and migration names are observations of the current implementation, not permanent business rules. Update conclusions by rereading the files at task time.

## Current migration observation

This checkout includes Schema20, replacing only the planned-drawing usage update trigger's prohibition on normal stop transitions. Complete code, ownership and deletion guards remain. Schema19 identity/PDF-assignment migration and all earlier compatibility migrations remain. See docs/v41-backend-verification-20261024.md and current tests for backup/rollback/preservation evidence; future schema registry entries supersede this observation.

## Current V5 observation — 2026-10-26

Current registry reaches Schema22. Schema21 adds append-only force-release identity/impact audit and PDF quarantine paths; original drawing rows remain archived FK identities. Schema22 adds nullable manufacturer/scenario to email_templates. Each upgrade backs up first, preserves original columns/rows, checks foreign keys, and rolls back on failure. Do not run real product merges or releases during startup. Earlier Schema20 notes are historical compatibility context.
