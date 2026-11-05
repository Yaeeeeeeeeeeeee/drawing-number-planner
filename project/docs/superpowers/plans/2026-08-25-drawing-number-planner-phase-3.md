# 图号规划器 Phase 3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Windows 图号规划器中实现按型号与颜色维护的不可变版本 BOM，并支持同型号其他颜色引用白色图号。

**Architecture:** 继续使用现有 Electron + React + Fastify + SQLite 单体结构。新增独立 `bom` 领域模块；数据库以不可变版本表、版本项目表和单独的当前版本指针表保存历史，保存新版本时在一个 SQLite immediate transaction 内校验草稿、提升被采用的 `reserved` 图号为 `active`、插入完整快照并切换当前指针。

**Tech Stack:** TypeScript、React、Fastify、SQLite/better-sqlite3、Vitest、Testing Library、Playwright、Electron

**Spec:** `docs/superpowers/specs/2026-08-24-drawing-number-planner-design.md`

## Global Constraints

- 图号编码规则、流水号分配和永久占号规则保持不变。
- 跨型号不得共用图号；BOM 项图号必须属于 BOM 产品。
- 普通 BOM 项必须引用 BOM 颜色图号；白色共用项必须引用同型号、同项目、颜色编码为 `0` 的白色图号。
- `voided` 图号不得进入新 BOM；采用的 `reserved` 图号在保存 BOM 的同一事务内提升为 `active`。
- 每次保存都插入完整、不可变的新版本；旧版本和旧项目不更新、不删除。
- 同一型号与颜色只有一个当前 BOM 指针；提交时必须核对调用方看到的当前版本，过期草稿整批拒绝。
- Phase 3 不实现资料根目录、PDF、文件复制、批量重命名、外发、服务器同步或任何 Phase 4 以后功能。
- 不增加第三方依赖，不引入微服务、消息队列或额外基础设施。

---

### Task 1: Additive BOM schema migration

**Files:**
- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/migrations.test.ts`

**Interfaces:**
- Produces: schema version `3`; tables `bom_versions`, `bom_items`, `bom_current`; migration result target `3`.
- Consumes: existing `products`, `dictionary_items`, and `drawing_numbers` foreign keys without rebuilding them.

- [ ] **Step 1: Write failing migration tests** proving a fresh database reaches version 3, an existing v2 database is backed up before the additive migration, all three BOM tables and uniqueness constraints exist, and a failed backup leaves the database at version 2.

```ts
expect(migrateDatabase(db, safety)).toEqual({ from: 2, to: 3 });
expect(db.prepare("select name from sqlite_master where name in ('bom_versions','bom_items','bom_current') order by name").all())
  .toEqual([{ name: 'bom_current' }, { name: 'bom_items' }, { name: 'bom_versions' }]);
```

- [ ] **Step 2: Run `vitest run tests/db/migrations.test.ts` and verify the new assertions fail because version 3 does not exist.**

- [ ] **Step 3: Add `schemaVersionThree`** with these exact invariants:

```sql
CREATE TABLE bom_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  color_id INTEGER NOT NULL REFERENCES dictionary_items(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  previous_version_id INTEGER REFERENCES bom_versions(id),
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (product_id, color_id, version_number)
);
CREATE TABLE bom_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bom_version_id INTEGER NOT NULL REFERENCES bom_versions(id),
  project_item_id INTEGER NOT NULL REFERENCES dictionary_items(id),
  drawing_id INTEGER NOT NULL REFERENCES drawing_numbers(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes TEXT,
  uses_white_material INTEGER NOT NULL DEFAULT 0 CHECK (uses_white_material IN (0, 1)),
  UNIQUE (bom_version_id, project_item_id)
);
CREATE TABLE bom_current (
  product_id INTEGER NOT NULL REFERENCES products(id),
  color_id INTEGER NOT NULL REFERENCES dictionary_items(id),
  version_id INTEGER NOT NULL UNIQUE REFERENCES bom_versions(id),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product_id, color_id)
);
INSERT INTO schema_migrations (version, applied_at)
VALUES (3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
```

- [ ] **Step 4: Update `migrateDatabase`** to reject versions above 3, apply v3 after any required v1/v2 validation, and preserve the existing one-backup-per-upgrade behavior.

- [ ] **Step 5: Run the migration tests, then the full database test folder, and verify they pass.**

- [ ] **Step 6: Commit `feat: add immutable bom version schema`.**

### Task 2: BOM domain validation, versioning, and white-material sharing

**Files:**
- Create: `src/core/bom/bom-types.ts`
- Create: `src/core/bom/bom-errors.ts`
- Create: `src/core/bom/bom-repository.ts`
- Create: `src/core/bom/bom-service.ts`
- Create: `tests/core/bom-service.test.ts`
- Create: `tests/core/bom-concurrency.test.ts`

**Interfaces:**
- Produces: `BomService.getCurrent(productId, colorId)`, `getVersion(versionId)`, `listVersions(productId, colorId)`, `listCandidates(input)`, and `saveVersion(input)`.
- Produces: `SaveBomInput { productId; colorId; expectedCurrentVersionId; notes?; items[] }` and `BomVersionDetail` with `diff` entries classified as `added | replaced | removed | unchanged`.
- Consumes: version 3 schema and existing immutable drawing snapshots.

- [ ] **Step 1: Write failing service tests** for initial version creation, replacement and removal in a second version, preservation of version 1 rows, positive integer quantities, duplicate project rejection, wrong product rejection, wrong project rejection, voided drawing rejection, direct-color mismatch rejection, and white-sharing validation.

```ts
const saved = service.saveVersion({
  productId, colorId: grayId, expectedCurrentVersionId: null,
  items: [{ projectItemId: manualId, drawingId: whiteManualId, quantity: 1, usesWhiteMaterial: true }],
});
expect(saved.version.versionNumber).toBe(1);
expect(saved.version.items[0].usesWhiteMaterial).toBe(true);
```

- [ ] **Step 2: Run the service test and verify it fails because the BOM domain does not exist.**

- [ ] **Step 3: Implement repository reads and immutable snapshot mapping.** Queries must join product, selected BOM color, drawing color, project item, and drawing display fields so callers never infer business identity from codes or filenames.

- [ ] **Step 4: Implement `BomService` validation.** Use one centrally declared `WHITE_COLOR_CODE = '0'`; allow direct items only when drawing color equals BOM color; allow white sharing only for a non-white BOM whose drawing color code is `0`; always require matching product and project item and status in `reserved | active`.

- [ ] **Step 5: Implement transactional save.** Inside `db.transaction(...).immediate()`, re-read `bom_current`, compare it to `expectedCurrentVersionId`, allocate `version_number = previous + 1`, promote referenced reserved drawings to active, insert the full item snapshot, and upsert only the `bom_current` pointer. Throw `BOM_STALE` without partial writes when the pointer changed.

- [ ] **Step 6: Add concurrency tests** using two services against the same file-backed SQLite database: two drafts based on the same current version must result in one successful next version and one `BOM_STALE`, with no orphan version or partial activation.

- [ ] **Step 7: Run focused BOM tests and all core tests; verify they pass.**

- [ ] **Step 8: Commit `feat: version boms and share white drawings`.**

### Task 3: Validated BOM HTTP API

**Files:**
- Create: `src/server/routes/boms.ts`
- Modify: `src/server/start-server.ts`
- Create: `tests/server/boms-api.test.ts`

**Interfaces:**
- Produces: `GET /api/boms/current?productId=&colorId=`, `GET /api/boms/versions?productId=&colorId=`, `GET /api/boms/versions/:id`, `GET /api/boms/candidates?...`, and `POST /api/boms/versions`.
- Consumes: `BomService` methods and existing local token protection for the POST route.

- [ ] **Step 1: Write failing API tests** for empty current BOM, candidate filtering, successful initial save, version history/detail, stale save conflict status 409, invalid payload status 400, and domain validation status 422.

```ts
expect((await app.inject({ method: 'POST', url: '/api/boms/versions', headers: tokenHeader, payload })).statusCode).toBe(201);
expect((await app.inject({ method: 'POST', url: '/api/boms/versions', headers: tokenHeader, payload })).statusCode).toBe(409);
```

- [ ] **Step 2: Run the API test and verify 404 failures for the new routes.**

- [ ] **Step 3: Add strict Zod schemas** requiring positive IDs, positive integer quantities, unique `projectItemId` values, booleans for white sharing, and nullable `expectedCurrentVersionId`; do not accept unknown keys.

- [ ] **Step 4: Register the routes in `startServer`.** Map `BOM_STALE` to 409, missing records to 404, request shape errors to 400, and all business eligibility failures to 422 with stable error codes and Chinese messages.

- [ ] **Step 5: Run focused API tests and the full server suite; verify they pass.**

- [ ] **Step 6: Commit `feat: expose validated bom APIs`.**

### Task 4: BOM management UI and immutable client snapshot

**Files:**
- Modify: `src/renderer/data/client.ts`
- Create: `src/renderer/pages/BomPage.tsx`
- Modify: `src/renderer/layout/AppShell.tsx`
- Modify: `src/renderer/styles.css`
- Create: `tests/renderer/bom-page.test.tsx`
- Modify: `tests/renderer/api-client.test.ts`
- Modify: `tests/smoke/app-shell.test.tsx`

**Interfaces:**
- Produces: typed client methods matching Task 3 and the enabled `BOM 管理` navigation page.
- Consumes: products, color dictionaries, project items, BOM current/history/candidate endpoints.

- [ ] **Step 1: Write failing renderer tests** proving the page selects product and BOM color, displays an empty-state draft, adds an eligible direct-color drawing, switches a gray item to an eligible white drawing, removes an item, saves with the exact `expectedCurrentVersionId`, shows the returned diff, and preserves the draft after `BOM_STALE` while requesting a refresh.

- [ ] **Step 2: Run renderer tests and verify the BOM page and client methods are missing.**

- [ ] **Step 3: Add client view types and methods.** Keep the complete loaded BOM as an immutable `approvedBase`; build the save payload from the current draft and its base version ID so a delayed load response cannot replace a newer product/color selection.

- [ ] **Step 4: Build `BomPage`** in the approved dense internal-tool style: product and BOM-color selectors at top, editable current items in the center, candidate drawing selector per project, quantity/notes/white-share controls, save action, latest diff summary, and read-only version history. Disable edits while requests are in flight and discard stale responses by request version.

- [ ] **Step 5: Enable the BOM navigation item, render `BomPage`, update the footer to `Phase 3 · BOM 管理`, and keep Phase 4+ items visibly disabled.**

- [ ] **Step 6: Run focused renderer/client/smoke tests and typecheck; verify they pass.**

- [ ] **Step 7: Commit `feat: add bom management workspace`.**

### Task 5: Real workflow acceptance and Phase 3 closeout

**Files:**
- Create: `tests/e2e/phase-three.spec.ts`
- Modify: `tests/e2e/global-setup.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: the complete Phase 3 UI/API/database flow.
- Produces: reproducible acceptance evidence for BOM version history and white-material sharing.

- [ ] **Step 1: Extend E2E seed data** with ZC100 white and gray colors plus active/reserved white and gray drawing numbers for distinct projects.

- [ ] **Step 2: Write the required real workflow test:** create ZC100 gray BOM, reference the white instruction drawing with `usesWhiteMaterial = true`, save version 1, verify no gray instruction drawing is generated, replace another item and save version 2, then verify version 1 remains unchanged and the reserved adopted drawing became active.

- [ ] **Step 3: Update README** with Phase 3 use, immutable versions, white-sharing rule, reserved-to-active transition, Phase 3 exclusions, and the unchanged Phase 4 Workspace Root/relative-path boundary.

- [ ] **Step 4: Run `vitest run`, `tsc --noEmit`, production build, database migration tests, and all Playwright tests.**

- [ ] **Step 5: Request final code review; fix every Critical/Important finding with TDD and repeat the full verification.**

- [ ] **Step 6: Launch the production Electron window and keep the localhost preview available for user acceptance; stop without starting Phase 4 or merging to master.**

## Phase 3 Completion Gate

- Fresh and existing databases migrate safely to schema version 3 with backup-before-upgrade.
- Every BOM save creates a complete immutable version and atomically switches one current pointer.
- Stale concurrent drafts cannot overwrite a newer current BOM.
- Cross-model, wrong-project, wrong-color, and voided drawings are rejected.
- Gray BOM can reference the same model's white drawing without generating a gray replacement drawing.
- Adopted reserved drawings become active in the same successful transaction; failures leave statuses and versions unchanged.
- UI supports current editing, add/replace/remove, white sharing, diff display, and read-only history using real APIs.
- Phase 4 file/path functionality and all later phases remain unimplemented and clearly disabled.
- Full tests, typecheck, build, migration verification, desktop start, and browser workflow pass before preview.
