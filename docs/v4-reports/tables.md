# V4 shared table implementation

Implemented in `DataTable.tsx`, `VirtualTableRows.tsx`, `LayoutTable.tsx`, `useTableLayout.ts`, and imported component-only `table-layout.css`. No page or global styles changed by this worker.

## Integration API

- `DataTable` accepts stable optional `tableId`. Supply it for every distinct logical table; fallback is `data:${column keys joined by |}` for existing callers.
- Columns retain `key`, `label`, and `render`; optional layout metadata: `width`, `minWidth`, `align: 'left'|'center'|'right'`, `locked: 'start'|'end'`.
- `LayoutTable` exports the same layout metadata for raw tables: `<LayoutTable tableId="qr-drawings" columns={[{key:'select',label:'选择',locked:'start',width:48,minWidth:48},{key:'name',label:'名称',width:240},{key:'actions',label:'操作',locked:'end',width:200}]}><thead>...existing row cells in original column order...</thead><tbody>...existing rows...</tbody></LayoutTable>`.
- Pass existing table className/other native table attributes normally. Keep the existing scroll wrapper. Do not include an old colgroup. Supply `align` for alignment previously based on positional nth-child selectors.
- Adapter recursively traverses React fragments/sections, reorders direct complete rows, preserves colspan/detail/spacer rows, and does not traverse nested `<table>` boundaries. Arbitrary custom row components should receive ordered columns via the render-function child API instead of relying on traversal through opaque components. `children={(orderedColumns)=> ...}` is available.
- Selection/action columns are automatically recognized in DataTable by conventional select/selection/checkbox and action/actions/operation/operations keys. Raw adapters explicitly set locked metadata.
- `resetTableLayouts()` resets all shared layouts; `resetTableLayouts('table-id')` resets one table. Existing page reset controls should invoke this export from `LayoutTable`. A `table-layout:reset` custom event with `{detail:{tableId}}` also works; omitting tableId resets all mounted shared layouts. Each header context menu resets its table without adding duplicate buttons.

## Behaviors

Pointer resize updates live, enforces readable configurable minima, and snaps within six pixels of the recommended column width. Double-click measures rendered header/data clones (all currently mounted cells, including virtual window) and fits actual content. Arrow keys on separator resize by ten pixels; Home restores recommended width. Alt+Left/Right on a header moves the column; drag/drop provides a before/after insertion marker. Locked boundary columns cannot be moved or crossed.

Storage uses independent `table-layout:v1:<stable tableId>` keys with explicit payload version 1. Invalid JSON/versions, unknown/duplicated order keys, added columns, nonfinite widths and below-minimum values recover safely. Storage failure does not block tables. Reset restores both widths and order.

Header/data cells receive `data-column-key`. React owns all reordered cells. Virtual row calculations and detail/spacer colspans remain intact. Fixed layout, constrained cell contents, scroll wrappers, and two-line ellipsis/title wrappers for name/file/batch keys prevent content crossing columns. Wrapping excludes path/type/count/status keys. Text clamping applies equally to virtual and raw rows.

## Verification

`npx vitest run tests/renderer/table-layout.test.tsx`: eight tests passed (final run, 2026-10-23). Coverage includes malformed/versioned storage, minimum widths, pointer live resize and six-pixel snap, double-click content fit, keyboard reorder, raw drag/drop insertion marker, reset/persistence/isolation, locked edge preservation, row labels, expanded rows, bounded virtual DOM and aligned virtual cells.

`npx vitest run tests/renderer/data-table.test.tsx tests/renderer/data-table-virtual.test.tsx tests/renderer/table-layout.test.tsx`: 3 files, 13 tests passed, including all existing DataTable and virtual-table regressions.

Initial regression run exposed header accessible names absorbing resize separator labels; explicit header aria-labels corrected this without hiding the resize controls. Scope=row regression ensures row labels remain noninteractive.

`npm run typecheck` passed on the initial shared implementation. Subsequent full-workspace checks have only reported concurrent page errors (QR duplicate metadata properties; FilesPage prop error subsequently resolved). No shared-component TypeScript diagnostics were reported. Final check reported only concurrent BOM comparison metadata typing and PDF navigation fixture typing errors. Parent must rerun full workspace checks after page integration.

Browser/Windows interaction validation remains part of parent delivery; jsdom tests do not establish real installed-app visual acceptance.
