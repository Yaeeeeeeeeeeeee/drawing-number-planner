# 图号规划器资料批次与交互修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变图号算法和历史永久占号规则的前提下，可靠保存资料批次与文件实例关系，修复共享写请求，并完成本轮已获准的图号库、PDF、字典、产品和 BOM 非 Schema 交互修正。

**Architecture:** 保留 `drawing_numbers`、`historical_drawing_numbers` 和 `pdf_files` 的既有职责，新增小型 `material_batches` 实体和 `pdf_files.material_batch_id`。批次识别、当前批次选择和路径唯一键集中在 `core/files`，renderer 只消费 API 结果。BOM 只做现有 Schema 可支持的 UI/查询调整。

**Tech Stack:** Electron、React 19、TypeScript、Fastify、SQLite/better-sqlite3、Vitest、Testing Library、Playwright。

**Spec:** `docs/superpowers/specs/2026-08-28-drawing-number-planner-material-batches-usability-design.md`

## Global Constraints

- 实施基线为 `master` 提交 `86bc2fa4cfc4f0583aaedb95b32f91b39321ede5`；在独立 worktree/branch 中执行。
- 先纳入已审查的共享 API 修复提交 `82a51ac` 和 `a616a37`，不得重新按页面实现 response 解析。
- Schema 变更前创建并校验数据库备份；迁移失败必须事务回滚。
- 扫描只读，不移动、删除、重命名任何历史目录或 PDF。
- 不改变完整图号结构、外观码、Excel 映射、历史占号、查重和流水号算法。
- 不开发二维码、服务器同步、完整外发、自动打包、自动 BOM、自动文件整理或多人权限。
- BOM `business_change_date`、顶层颜色键和物理字段删除继续受真实 BOM 字段映射门禁约束，不在本计划可执行任务内。
- 每个任务先写失败测试、确认 RED、最小实现、确认 GREEN、再提交。

---

### Task 1: 纳入共享 API 阻塞 Bug 修复

**Files:**
- Modify: `src/renderer/data/client.ts`
- Modify: `tests/renderer/api-client.test.ts`

**Interfaces:**
- Produces: `request<T>()` 对 JSON、空 body、204、非 JSON、非 2xx 和网络错误的统一语义。
- Produces: `ApiError('SERVICE_UNAVAILABLE' | 'INVALID_RESPONSE' | backendCode, message)`。

- [ ] **Step 1: 在实施分支应用已审查提交**

Run:

```bash
git cherry-pick 82a51ac a616a37
```

Expected: 仅共享 client 与 client tests 发生变化，无 Schema/UI/业务变更。

- [ ] **Step 2: 运行共享客户端专项测试**

Run:

```bash
pnpm exec vitest run tests/renderer/api-client.test.ts
```

Expected: 17 tests PASS，包括空 502 session 失败后再次写入成功。

- [ ] **Step 3: 在真实 Vite 代理环境重复后端中断验证**

启动桌面后端与 Vite，短暂停止 4317 后通过 4327 触发只读查询。Expected: UI 显示“本地服务暂时不可用”，不出现 `Failed to fetch` 或 `Unexpected end of JSON input`；恢复后请求正常。

- [ ] **Step 4: 记录前置提交状态**

Run:

```bash
git log -2 --oneline
git status --short
```

Expected: 两个修复提交存在，工作区干净。

### Task 2: Schema v6——路径唯一键和资料批次实体

**Files:**
- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migrations.test.ts`
- Modify: `src/core/files/workspace-paths.ts`
- Modify: `tests/core/workspace-paths.test.ts`

**Interfaces:**
- Produces: `toWorkspacePathKey(relativePath: string): string`。
- Produces: `material_batches` table、`pdf_files.path_key`、`pdf_files.material_batch_id`。
- Produces: Schema version 6。

- [ ] **Step 1: 写路径归一化失败测试**

Add cases asserting:

```ts
expect(toWorkspacePathKey('01.洗碗机/SKDWT040JP-T40/A.PDF'))
  .toBe('01.洗碗机\\skdwt040jp-t40\\a.pdf');
expect(toWorkspacePathKey('01.洗碗机\\SKDWT040JP-T40\\.\\A.PDF'))
  .toBe('01.洗碗机\\skdwt040jp-t40\\a.pdf');
```

Run the test and expect missing export failure.

- [ ] **Step 2: 实现唯一的 Windows 相对路径 key 生成器**

Implement with `node:path.win32.normalize`, existing relative-path validation, slash normalization and `toLocaleLowerCase('en-US')`. Do not resolve against a drive letter.

- [ ] **Step 3: 写 Schema v6 失败测试**

Assert these columns/constraints after migration:

```ts
expect(columns('pdf_files')).toEqual(expect.arrayContaining(['path_key', 'material_batch_id']));
expect(columns('material_batches')).toEqual(expect.arrayContaining([
  'relative_path', 'product_directory', 'sequence_number', 'recognition_status', 'is_present',
]));
```

Add migration fixtures with two paths differing only in ASCII case and expect migration to reject before version ledger advances.

- [ ] **Step 4: 实现并验证 Schema v6**

Add `schemaVersionSix` that:

```sql
ALTER TABLE pdf_files ADD COLUMN path_key TEXT;
ALTER TABLE pdf_files ADD COLUMN material_batch_id INTEGER REFERENCES material_batches(id);
```

Create `material_batches` first, backfill every `path_key` in TypeScript using `toWorkspacePathKey`, then create a unique index on `pdf_files(path_key)`. Add indexes for `material_batch_id`, `material_batches(product_directory, sequence_number)` and `product_id`.

Migration validation must check PDF row count unchanged, no null `path_key`, no duplicate key, `foreign_key_check` empty, and ledger version 6. Existing database backup creation remains mandatory before the transaction.

- [ ] **Step 5: 验证失败回滚和备份**

Run:

```bash
pnpm exec vitest run tests/db/schema.test.ts tests/db/migrations.test.ts tests/core/workspace-paths.test.ts
```

Expected: backup validation, duplicate-key rejection and rollback tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/db src/core/files/workspace-paths.ts tests/db tests/core/workspace-paths.test.ts
git commit -m "feat: add material batch schema"
```

### Task 3: 集中实现资料批次解析

**Files:**
- Create: `src/core/files/material-batch-parser.ts`
- Create: `src/core/files/material-batch-types.ts`
- Create: `tests/core/material-batch-parser.test.ts`
- Modify: `src/core/files/directory-policy.ts`

**Interfaces:**
- Produces:

```ts
export interface ParsedMaterialBatch {
  relativePath: string;
  productDirectory: string;
  directoryContext: DirectoryProductContext | null;
  name: string;
  sequenceNumber: number | null;
  businessDate: string | null;
  recognitionStatus: 'recognized' | 'pending';
  classificationWarning: string | null;
}

export function parseMaterialBatch(relativeFilePath: string): ParsedMaterialBatch | null;
```

- [ ] **Step 1: 写真实目录案例测试**

Cover:

```ts
parseMaterialBatch('01.洗碗机\\SKDWT040JP-T40\\03.量产后的变更文件（已量产的产品看最新日期）\\06.20260309\\x.pdf')
```

Expected recognized, sequence 6, date `2026-03-09`, SKU `SKDWT040JP`, model `T40`.

Also test `00.首批大货`, unnumbered `首批大货` as sequence 0, `预案` as pending, multiple dates with warning, direct PDF under `03...` as null, and malformed `{SKU}-{型号}` as null directory context without discarding the batch.

- [ ] **Step 2: Run RED**

```bash
pnpm exec vitest run tests/core/material-batch-parser.test.ts
```

- [ ] **Step 3: 实现最小纯函数解析器**

Use path segments only. Do not call filesystem APIs, inspect PDF content, or use modification time. Parse a business date only when exactly one valid `YYYYMMDD` exists.

- [ ] **Step 4: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/core/material-batch-parser.test.ts tests/core/directory-policy.test.ts
git add src/core/files/material-batch-* src/core/files/directory-policy.ts tests/core/material-batch-parser.test.ts
git commit -m "feat: parse historical material batches"
```

### Task 4: 扫描时幂等保存批次与文件实例关系

**Files:**
- Create: `src/core/files/material-batch-repository.ts`
- Modify: `src/core/files/file-types.ts`
- Modify: `src/core/files/file-repository.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `tests/core/file-repository.test.ts`
- Modify: `tests/core/file-service.test.ts`

**Interfaces:**
- Consumes: `parseMaterialBatch()` and `toWorkspacePathKey()`。
- Produces: `MaterialBatchRepository.replaceScanBatchLinks(...)` within the same immediate transaction as PDF scan replacement.
- Produces: `FileScanRecord.pathKey` and optional `materialBatch` classification.

- [ ] **Step 1: 写幂等与合法重复测试**

Create fixtures where:

```text
...\00.首批大货\0501001...pdf
...\01.20241210\0501001...pdf
```

Expected: two `pdf_files`, two batches, one logical historical drawing. Rescanning the same exact paths keeps two rows. A second representation of the same path with different ASCII case updates the existing row rather than inserting another.

- [ ] **Step 2: 写扫描回滚测试**

Force a batch persistence error after classification. Expected: prior `pdf_files`, batch rows, and historical occupancy remain unchanged.

- [ ] **Step 3: 实现批次 upsert 和文件关联**

At scan start mark `pdf_files` and `material_batches` absent. Upsert batches by normalized batch relative path, resolve a unique formal product by SKU/model when possible, then upsert PDF by `path_key` and set `material_batch_id`. Pending batch rows are persisted but never selected as current.

Never delete `historical_drawing_numbers` during scan or cleanup.

- [ ] **Step 4: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/core/pdf-scanner.test.ts
git add src/core/files tests/core/file-repository.test.ts tests/core/file-service.test.ts
git commit -m "feat: persist batch file relationships"
```

### Task 5: 当前批次和图号使用状态查询

**Files:**
- Create: `src/core/files/material-batch-service.ts`
- Create: `tests/core/material-batch-service.test.ts`
- Modify: `src/core/drawings/drawing-types.ts`
- Modify: `src/core/drawings/drawing-repository.ts`
- Modify: `tests/core/drawing-query.test.ts`

**Interfaces:**
- Produces:

```ts
type BatchUsageState = 'current' | 'historical' | 'unbatched' | 'indeterminate';

interface DrawingBatchOccurrence {
  batchId: number;
  productDirectory: string;
  batchName: string;
  sequenceNumber: number | null;
  isCurrentBatch: boolean;
  files: DrawingFileRecord[];
}
```

- [ ] **Step 1: 写当前批次选择测试**

Test `00, 01, 02, 06` selects 06; `首批大货` alone selects sequence 0; pending `预案` is ignored; duplicate highest sequence returns indeterminate; modified time never affects selection.

- [ ] **Step 2: 写图号跨产品状态测试**

The same full code current in T40 and historical in another directory must return both per-product states, not one flattened false answer. A voided business drawing present in current batch retains `voided` plus a conflict marker.

- [ ] **Step 3: 实现查询**

Aggregate file instances by canonical `full_code`, not only one FK id, so planned and historical files with the same full code remain together. Determine current use only from present, matched file instances in the unique current batch.

- [ ] **Step 4: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/core/material-batch-service.test.ts tests/core/drawing-query.test.ts
git add src/core/files/material-batch-service.ts src/core/drawings tests/core/material-batch-service.test.ts tests/core/drawing-query.test.ts
git commit -m "feat: derive current material usage"
```

### Task 6: 批次 API 与共享前端类型

**Files:**
- Create: `src/server/routes/material-batches.ts`
- Modify: `src/server/start-server.ts`
- Modify: `src/renderer/data/client.ts`
- Create: `tests/server/material-batches-api.test.ts`
- Modify: `tests/renderer/api-client.test.ts`

**Interfaces:**
- Produces:

```text
GET /api/material-batches?search=&productId=
GET /api/material-batches/:id/files
```

- Produces: `api.listMaterialBatches(filters)` and `api.getMaterialBatchFiles(id)`.
- Extends drawing list/detail responses with usage summaries and batch occurrences.

- [ ] **Step 1: 写 API 合约失败测试**

Assert T40 results order current first then descending sequence, pending batches explicitly labelled, and batch file response contains every relative path without deduplicating by full code.

- [ ] **Step 2: 实现严格 Zod 查询和 JSON response**

Use existing Fastify domain-error shape. Do not add write endpoints for moving, renaming or selecting current batches in this round.

- [ ] **Step 3: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/server/material-batches-api.test.ts tests/server/drawings-api.test.ts tests/renderer/api-client.test.ts
git add src/server src/renderer/data/client.ts tests/server tests/renderer/api-client.test.ts
git commit -m "feat: expose material batch queries"
```

### Task 7: 图号库“图号聚合 + 批次展开”

**Files:**
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: `tests/renderer/drawing-library-page.test.tsx`
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Consumes: drawing usage summary、batch occurrence and material batch APIs。
- Produces: tabs `按图号` / `按资料批次`。

- [ ] **Step 1: 写图号聚合 UI 失败测试**

Render one full code with seven occurrences. Assert only one logical drawing row/card, text `出现于 7 个资料批次`, current use label, and seven batch rows after expansion.

- [ ] **Step 2: 写批次视图和文件打开测试**

Search T40, assert `06.20260309` marked current and `预案` marked pending. Opening a batch shows every file instance and routes desktop file opening by `pdfIndexId`; missing files disable the action.

- [ ] **Step 3: 实现两个局部视图**

Keep existing combination filters in the drawing view. Batch view uses its own search state. Do not merge identical filenames or full codes inside a batch response.

- [ ] **Step 4: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/renderer/drawing-library-page.test.tsx tests/main/open-file-location.test.ts
git add src/renderer/pages/DrawingLibraryPage.tsx src/renderer/styles.css tests/renderer/drawing-library-page.test.tsx
git commit -m "feat: browse drawings by material batch"
```

### Task 8: PDF 文件中心的文件实例和重复语义

**Files:**
- Modify: `src/core/files/file-types.ts`
- Modify: `src/core/files/file-repository.ts`
- Modify: `src/server/routes/files.ts`
- Modify: `src/renderer/pages/FilesPage.tsx`
- Modify: `tests/core/file-repository.test.ts`
- Modify: `tests/server/files-api.test.ts`
- Modify: `tests/renderer/files-page.test.tsx`
- Modify: `src/renderer/layout/AppShell.tsx`
- Modify: `tests/smoke/app-shell.test.tsx`

**Interfaces:**
- Extends file filters with `materialBatchId` and batch presence/status display.
- Produces diagnostic count for duplicate `path_key`; expected invariant is zero.

- [ ] **Step 1: 写合法跨批次显示测试**

Two identical full codes in two batch paths must render two rows and no “扫描重复” warning.

- [ ] **Step 2: 写同路径幂等和缺失清理测试**

Repeated same path remains one index. Cleaning a missing PDF removes only `pdf_files`; historical drawing count and batch history remain unchanged.

- [ ] **Step 3: 实现批次列、筛选和说明**

Show relative path and batch name. Explain that cross-batch repetition is a snapshot. Only `path_key` collisions are duplicate errors; do not add hash-based cleanup.

- [ ] **Step 4: 移动导航并验证**

Expected navigation:

```text
日常工作：图号规划、BOM 管理、外发资料（未开放）
基础资料：图号库、产品档案、PDF 文件中心、编码字典、迁移检查
```

- [ ] **Step 5: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/core/file-repository.test.ts tests/server/files-api.test.ts tests/renderer/files-page.test.tsx tests/smoke/app-shell.test.tsx
git add src/core/files src/server/routes/files.ts src/renderer/pages/FilesPage.tsx src/renderer/layout/AppShell.tsx src/renderer/styles.css tests
git commit -m "feat: distinguish batch snapshots from duplicate files"
```

### Task 9: 通用就近展开与产品确认动线

**Files:**
- Modify: `src/renderer/components/DataTable.tsx`
- Create: `tests/renderer/data-table.test.tsx`
- Modify: `src/renderer/pages/DictionariesPage.tsx`
- Modify: `src/renderer/pages/ProductsPage.tsx`
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: corresponding renderer tests
- Modify: `src/renderer/styles.css`

**Interfaces:**
- Produces:

```ts
renderExpandedRow?: (item: T) => ReactNode | null;
```

- [ ] **Step 1: 写 DataTable 相邻行测试**

Click item 1201 and assert the editor row is the immediately following `<tr>` with `colSpan === columns.length`; another row has no editor.

- [ ] **Step 2: 实现无业务状态的展开槽位**

Render each item as a keyed fragment containing the normal row and optional expanded row. Preserve `onRowClick` behavior and keyboard-accessible controls.

- [ ] **Step 3: 迁移三个页面**

Move dictionary rename/status feedback, product edit, and drawing detail into the selected row. Render historical product confirmation inside the selected candidate card. Header “新建产品” form may remain a page-level create area.

- [ ] **Step 4: 检查其他页面**

Search for editors rendered after a list. Only migrate record-specific editors; leave filters, batch toolbars, and page-level create forms unchanged.

- [ ] **Step 5: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/renderer/data-table.test.tsx tests/renderer/dictionaries-page.test.tsx tests/renderer/products-page.test.tsx tests/renderer/drawing-library-page.test.tsx
git add src/renderer tests/renderer
git commit -m "fix: expand record editors beside their rows"
```

### Task 10: 字典受保护删除、停用反馈与层数布局

**Files:**
- Modify: `src/core/dictionaries/dictionary-repository.ts`
- Modify: `src/core/dictionaries/dictionary-service.ts`
- Modify: `src/core/dictionaries/dictionary-types.ts`
- Modify: `src/server/routes/dictionaries.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/DictionariesPage.tsx`
- Modify: dictionary core/server/renderer tests

**Interfaces:**
- Produces: `DictionaryService.deleteUnused(id): void`。
- Produces: `DELETE /api/dictionaries/items/:id` returning 204。
- Produces: `api.deleteDictionary(id): Promise<void>`。

- [ ] **Step 1: 写引用矩阵失败测试**

Cover unused delete success and rejection for products, formal drawings, historical segment snapshots, BOM color/project item, and main category children. Expected message: `该编码已经被历史数据使用，无法删除。可以选择停用。`

- [ ] **Step 2: 实现单一 repository 引用检查**

For historical `project_item`, match both parent main-category code and item code. Do not infer references from pending/unmatched filenames. Delete inside one immediate transaction after rechecking references.

- [ ] **Step 3: 写并实现 204 client 回归**

Use the shared request parser from Task 1; do not call `response.json()` in the page. Confirm the deleted row disappears only after the API resolves.

- [ ] **Step 4: 加入行内二次确认和忙碌反馈**

Actions are `修改　停用　删除`. Disable repeated clicks while pending. Show success/error under the same row.

- [ ] **Step 5: 调整层数局部信息架构**

Inside the main-category right detail region add local `项目明细 / 层数` switch. Keep `layer_count` API, Excel audit and drawing code untouched.

- [ ] **Step 6: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/core/dictionary-service.test.ts tests/server/dictionaries-api.test.ts tests/renderer/dictionaries-page.test.tsx tests/core/excel-audit.test.ts tests/core/drawing-code.test.ts
git add src/core/dictionaries src/server/routes/dictionaries.ts src/renderer/data/client.ts src/renderer/pages/DictionariesPage.tsx tests
git commit -m "feat: safely delete unused dictionary codes"
```

### Task 11: 产品类别筛选

**Files:**
- Modify: `src/core/products/product-types.ts`
- Modify: `src/core/products/product-repository.ts`
- Modify: `src/server/routes/products.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/ProductsPage.tsx`
- Modify: product tests

**Interfaces:**
- Extends `ProductFilters` with `productCategory?: string`。

- [ ] **Step 1: 写精确筛选失败测试**

Products “洗碗机” and “洗衣机” must not cross-match when selecting one category. Search text remains fuzzy and independent.

- [ ] **Step 2: 实现 repository/API/client 条件**

Use exact `product.product_category = ?`. Build UI options by de-duplicating `allProducts.map(productCategory)`; do not create a new dictionary source.

- [ ] **Step 3: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/core/product-service.test.ts tests/server/products-api.test.ts tests/renderer/products-page.test.tsx
git add src/core/products src/server/routes/products.ts src/renderer/data/client.ts src/renderer/pages/ProductsPage.tsx tests
git commit -m "feat: filter products by category"
```

### Task 12: BOM 添加/查询拆分（不越过 Schema 门禁）

**Files:**
- Create: `src/renderer/pages/bom/BomEditor.tsx`
- Create: `src/renderer/pages/bom/BomQuery.tsx`
- Modify: `src/renderer/pages/BomPage.tsx`
- Modify: `src/core/bom/bom-types.ts`
- Modify: `src/core/bom/bom-repository.ts`
- Modify: `src/core/bom/bom-service.ts`
- Modify: `src/server/routes/boms.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: BOM tests

**Interfaces:**
- Produces tabs `添加 BOM` / `查询 BOM`。
- Produces a read-only query API filtering existing versions by model, project item and drawing number.
- Existing save payload continues sending `quantity: 1` and existing color compatibility fields.

- [ ] **Step 1: 写 UI 分离失败测试**

Adding mode must not render history table. Query mode must not render editable rows/save button. Switching tabs preserves no unsaved cross-mode side effects.

- [ ] **Step 2: 写数量兼容测试**

No quantity textbox is visible. Saved item payload contains `quantity: 1`; existing persisted quantities remain readable in legacy detail but UI labels do not present quantity as a required business input.

- [ ] **Step 3: 写只读查询测试**

Filter existing versions by model, project and full code. Date shown is labelled `系统保存时间`. Do not add a “变更日期” input or filter in this task.

- [ ] **Step 4: 拆分组件并实现查询**

Keep existing service eligibility, white-material rules, concurrency and current pointer unchanged. Do not alter `bom_versions`, `bom_items` or `bom_current` Schema.

- [ ] **Step 5: Run GREEN and Commit**

```bash
pnpm exec vitest run tests/core/bom-service.test.ts tests/core/bom-concurrency.test.ts tests/server/boms-api.test.ts tests/renderer/bom-page.test.tsx
git add src/core/bom src/server/routes/boms.ts src/renderer/data/client.ts src/renderer/pages/BomPage.tsx src/renderer/pages/bom tests
git commit -m "refactor: separate bom editing and queries"
```

### Task 13: 全量验证、真实目录验收和代码审查

**Files:**
- Modify only if a test or review identifies an in-scope defect.

**Interfaces:**
- Produces: verified implementation branch; does not merge to master automatically.

- [ ] **Step 1: 用数据库副本执行 migration**

Copy the current planner DB through the existing backup API, migrate the copy, and assert:

```text
pdf_files row count remains 2666
historical_drawing_numbers row count remains 737
duplicate path_key count is 0
foreign_key_check is empty
schema version is 6
```

Never run an unverified migration first against the only production DB.

- [ ] **Step 2: 在 `E:\包材资料` 执行真实只读扫描验收**

Expected evidence:

```text
T40 batches: 00, 01, 02, 03, 04, 05, 06
current: 06.20260309
pre-plan folder: pending, not current
same-path duplicate index: 0
legal cross-batch drawing groups remain present
```

- [ ] **Step 3: 验证写操作**

Using disposable test records or a temporary database, verify dictionary/product deactivate, unused dictionary delete, drawing status update, BOM save/query, workspace settings save, scan and missing cleanup. None may surface raw fetch/JSON parser errors.

- [ ] **Step 4: 运行所有自动化检查**

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
git diff --check
```

Expected: all tests pass. Update stale E2E selectors only when the accepted UI intentionally changed in the task that owns that UI; do not weaken assertions.

- [ ] **Step 5: 独立 code review**

Review specifically for historical occupancy deletion, path uniqueness, batch current ambiguity, planned/historical full-code aggregation, Schema rollback, BOM gate violations and browser/Electron client parity. Remediate P0–P2 findings and rerun affected plus full tests.

- [ ] **Step 6: 保持预览并请求验收**

Run browser preview and Windows desktop app from the implementation branch. Report actual ports, final commit, migration backup evidence, test/build results and known pending batch records. Do not merge to master or start another Phase without user confirmation.

## Explicitly Deferred by the BOM Schema Gate

The following work has no executable step in this plan: adding `business_change_date`, changing BOM identity from product+color to product only, deleting `quantity` or `color_id` columns, importing the remaining real BOM Excel fields, and deriving or overwriting BOM from material batches. These require the real BOM field mapping and a separate user approval before a migration plan is written.

