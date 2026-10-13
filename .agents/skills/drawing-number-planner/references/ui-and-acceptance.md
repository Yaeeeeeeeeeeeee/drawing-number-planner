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
