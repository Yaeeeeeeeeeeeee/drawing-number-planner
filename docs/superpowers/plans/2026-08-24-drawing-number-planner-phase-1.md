# 图号规划器 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付可同时以 Windows 桌面窗口和浏览器启动的真实应用，完成本地数据目录、SQLite 基础、编码字典、产品档案、Excel 迁移检查和可检索图号库。

**Architecture:** Electron 作为桌面壳，本机 Fastify 服务承载业务与文件访问，React/Vite 提供桌面和浏览器共用界面。SQLite 只由服务端访问；浏览器与 Electron 均通过带本地令牌的 HTTP API 使用同一真实数据库。

**Tech Stack:** Electron、React、TypeScript、Vite、Fastify、SQLite（better-sqlite3）、Vitest、Testing Library、Playwright、Zod、xlsx、pnpm

**Spec:** `docs/superpowers/specs/2026-08-24-drawing-number-planner-design.md`

## Global Constraints

- Windows 单人内部工具；开发期必须同时支持桌面窗口和浏览器真实预览。
- 图号结构严格保持 `品牌码.品类尺寸码.外观码+颜色码.主类别码+项目明细码+版本流水号`。
- 已引用字典值不能改写编码或删除，只能停用。
- 不使用 Mock 数据或无行为按钮冒充完成。
- 本机服务只绑定 `127.0.0.1`；写操作必须校验启动令牌和请求来源。
- 所有数据库结构通过有序迁移创建；数据库升级前必须备份。
- Phase 1 不实现占号、BOM、文件改名和外发，只提供清晰的“后续阶段”状态。

---

### Task 1: 可启动项目骨架

**Files:**
- Create: `package.json`
- Create: `pnpm-lock.yaml`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `vitest.config.ts`
- Create: `src/main/index.ts`
- Create: `src/server/start-server.ts`
- Create: `src/server/dev.ts`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/styles.css`
- Create: `src/renderer/index.html`
- Test: `tests/smoke/app-shell.test.tsx`

**Interfaces:**
- Produces: `startServer(options: ServerOptions): Promise<RunningServer>` and a React `App` shell used by all later tasks.

- [ ] **Step 1: Write the failing shell test**

```tsx
render(<App />);
expect(screen.getByText('图号规划器')).toBeVisible();
expect(screen.getByRole('navigation')).toBeVisible();
```

- [ ] **Step 2: Run `pnpm vitest tests/smoke/app-shell.test.tsx --run` and verify it fails because the app does not exist.**
- [ ] **Step 3: Create the minimal Electron, Fastify, Vite and React entry points plus scripts `dev:web`, `dev:desktop`, `test`, `typecheck` and `build`.**
- [ ] **Step 4: Run the shell test, typecheck, browser dev server and Electron window; verify both render the same navigation without fake records.**
- [ ] **Step 5: Commit `feat: bootstrap desktop and browser application`.**

### Task 2: 应用数据目录、配置和数据库迁移

**Files:**
- Create: `src/core/config/app-paths.ts`
- Create: `src/core/config/settings.ts`
- Create: `src/db/database.ts`
- Create: `src/db/migrations.ts`
- Create: `src/db/schema.sql.ts`
- Create: `src/db/backup.ts`
- Create: `tests/core/app-paths.test.ts`
- Create: `tests/db/migrations.test.ts`
- Create: `tests/db/backup.test.ts`

**Interfaces:**
- Produces: `resolveAppPaths(baseDir?: string): AppPaths`, `openDatabase(path: string): Database`, `migrateDatabase(db, backup): MigrationResult`.

- [ ] **Step 1: Write tests proving a supplied temporary base directory produces `planner.db`, `backups`, `logs` and `exports` paths.**
- [ ] **Step 2: Write migration tests proving a blank database reaches schema version 1 with foreign keys enabled and repeated migration is idempotent.**
- [ ] **Step 3: Write backup tests proving migration refuses to continue when backup creation fails for an existing database.**
- [ ] **Step 4: Implement paths, SQLite connection, schema migration ledger and timestamped backup using minimal synchronous file operations.**
- [ ] **Step 5: Run `pnpm vitest tests/core tests/db --run` and verify all tests pass.**
- [ ] **Step 6: Commit `feat: add local data storage and safe migrations`.**

### Task 3: 编码字典领域规则和 API

**Files:**
- Create: `src/core/dictionaries/dictionary-types.ts`
- Create: `src/core/dictionaries/dictionary-repository.ts`
- Create: `src/core/dictionaries/dictionary-service.ts`
- Create: `src/server/routes/dictionaries.ts`
- Create: `src/shared/api-contracts.ts`
- Create: `tests/core/dictionary-service.test.ts`
- Create: `tests/server/dictionaries-api.test.ts`

**Interfaces:**
- Produces: `DictionaryService.list/create/updateName/deactivate` and `/api/dictionaries/:type` routes.
- Consumes: `openDatabase` from Task 2.

- [ ] **Step 1: Write tests for unique code per dictionary type, project-item ownership by main category, and active/inactive filtering.**
- [ ] **Step 2: Write tests proving an unreferenced item can be renamed, while a referenced item rejects code/name mutation and allows deactivation.**
- [ ] **Step 3: Implement repository and service with explicit domain errors `DUPLICATE_CODE`, `DICTIONARY_ITEM_REFERENCED` and `INVALID_PARENT`.**
- [ ] **Step 4: Add Zod-validated list/create/edit/deactivate API routes and stable JSON error responses.**
- [ ] **Step 5: Run dictionary unit and API tests, then commit `feat: add protected coding dictionaries`.**

### Task 4: Excel 迁移检查与安全导入

**Files:**
- Create: `src/core/import/excel-audit.ts`
- Create: `src/core/import/excel-import.ts`
- Create: `src/server/routes/import.ts`
- Create: `tests/fixtures/drawing-number-plan.xlsx`
- Create: `tests/core/excel-audit.test.ts`
- Create: `tests/core/excel-import.test.ts`

**Interfaces:**
- Produces: `auditWorkbook(buffer): ImportAuditReport` and `importApprovedRows(report, selections, db): ImportResult`.

- [ ] **Step 1: Create a minimal workbook fixture containing valid dictionary pairs, duplicate code `0209`, a blank-name row and dependent project items.**
- [ ] **Step 2: Write tests proving audit reports duplicates and incomplete rows without changing the database.**
- [ ] **Step 3: Implement worksheet mapping for the existing “新版图号” layout and preserve codes as text, including leading zeros.**
- [ ] **Step 4: Write and implement import tests proving only explicitly approved, conflict-free rows enter one transaction.**
- [ ] **Step 5: Add upload/audit and confirmed-import endpoints; never overwrite the source workbook.**
- [ ] **Step 6: Run import tests and commit `feat: add audited Excel dictionary migration`.**

### Task 5: 产品档案领域规则和 API

**Files:**
- Create: `src/core/products/product-types.ts`
- Create: `src/core/products/product-repository.ts`
- Create: `src/core/products/product-service.ts`
- Create: `src/server/routes/products.ts`
- Create: `tests/core/product-service.test.ts`
- Create: `tests/server/products-api.test.ts`

**Interfaces:**
- Produces: `ProductService.list/get/create/update/deactivate` and `/api/products` routes.
- Consumes: active brand, product-size and appearance dictionary identifiers from Task 3.

- [ ] **Step 1: Write tests for unique model within brand, required active dictionary references, optional reference product and deactivation.**
- [ ] **Step 2: Implement repository and service; reject references to inactive/missing dictionaries with `INVALID_DICTIONARY_REFERENCE`.**
- [ ] **Step 3: Add validated CRUD API routes with search by model, brand and status.**
- [ ] **Step 4: Run product tests and commit `feat: add product archive`.**

### Task 6: 图号库只读查询基础

**Files:**
- Create: `src/core/drawings/drawing-types.ts`
- Create: `src/core/drawings/drawing-repository.ts`
- Create: `src/core/drawings/drawing-query-service.ts`
- Create: `src/server/routes/drawings.ts`
- Create: `tests/core/drawing-query.test.ts`
- Create: `tests/server/drawings-api.test.ts`

**Interfaces:**
- Produces: `DrawingQueryService.search(filters): PagedDrawingResult`, `/api/drawings` and `/api/drawings/:id`.
- Consumes: immutable drawing-number schema from Task 2; record creation remains disabled until Phase 2.

- [ ] **Step 1: Write query tests for exact/partial drawing number, model, brand, main category, project item, color, status and keyword combinations.**
- [ ] **Step 2: Implement parameterized paginated queries and detail lookup without any create/update route.**
- [ ] **Step 3: Add API tests for empty results, stable paging and invalid filters.**
- [ ] **Step 4: Run tests and commit `feat: add searchable drawing library API`.**

### Task 7: 真实管理界面

**Files:**
- Create: `src/renderer/api/client.ts`
- Create: `src/renderer/layout/AppShell.tsx`
- Create: `src/renderer/pages/DrawingLibraryPage.tsx`
- Create: `src/renderer/pages/DictionariesPage.tsx`
- Create: `src/renderer/pages/ProductsPage.tsx`
- Create: `src/renderer/pages/ImportPage.tsx`
- Create: `src/renderer/components/DataTable.tsx`
- Create: `src/renderer/components/EmptyState.tsx`
- Create: `tests/renderer/drawing-library-page.test.tsx`
- Create: `tests/renderer/dictionaries-page.test.tsx`
- Create: `tests/renderer/products-page.test.tsx`
- Create: `tests/renderer/import-page.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–6 HTTP APIs through `apiClient`.
- Produces: approved left navigation, drawing search/detail panel, dictionary maintenance, product archive and Excel migration check UI.

- [ ] **Step 1: Write failing UI tests for drawing filters, empty state, detail loading, dictionary deactivation, product creation and import conflict display.**
- [ ] **Step 2: Implement the restrained navy/white desktop layout matching the approved mockup, with dense tables and one blue action accent.**
- [ ] **Step 3: Connect every enabled control to real APIs; display unavailable Phase 2–7 navigation items as clearly disabled with their phase labels.**
- [ ] **Step 4: Add loading, validation, empty and error states; do not inject sample rows.**
- [ ] **Step 5: Run renderer tests, typecheck and build, then commit `feat: add phase one management interface`.**

### Task 8: 启动安全、备份调度和阶段验收

**Files:**
- Create: `src/server/security/local-access.ts`
- Create: `src/core/backup/daily-backup.ts`
- Create: `tests/server/local-access.test.ts`
- Create: `tests/core/daily-backup.test.ts`
- Create: `tests/e2e/phase-one.spec.ts`
- Create: `playwright.config.ts`
- Create: `README.md`

**Interfaces:**
- Produces: origin/token validation, daily first-launch backup, documented start commands and Phase 1 end-to-end evidence.

- [ ] **Step 1: Write tests proving non-loopback binding is rejected, missing/incorrect tokens reject writes, and unapproved origins reject requests.**
- [ ] **Step 2: Write tests proving only one successful daily backup is created and a failed backup is reported without deleting older backups.**
- [ ] **Step 3: Implement local-access middleware and backup scheduler, then integrate both into `startServer`.**
- [ ] **Step 4: Add Playwright coverage for browser startup, dictionary list, product archive, import audit and drawing search empty state.**
- [ ] **Step 5: Document data locations, browser and desktop startup, Excel audit workflow and Phase 1 boundaries.**
- [ ] **Step 6: Run `pnpm test`, `pnpm typecheck`, `pnpm build` and Playwright; start desktop and browser against a temporary real database.**
- [ ] **Step 7: Commit `test: verify phase one application`.**

## Phase 1 Completion Gate

- Both `pnpm dev:web` and `pnpm dev:desktop` open the same real application.
- No enabled UI control is a mock.
- Dictionary and product writes persist across restarts.
- Existing Excel can be audited without modification; conflicts are visible before import.
- Drawing library performs real database queries and accurately shows an empty library before Phase 2 occupation.
- All unit, API, UI and end-to-end tests pass.
- User receives a running browser preview and desktop-window preview before Phase 2 begins.
