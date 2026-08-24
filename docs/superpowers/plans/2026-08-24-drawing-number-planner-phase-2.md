# 图号规划器 Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有真实桌面/浏览器应用中交付图号规划、编码生成、统一查重、下一流水号推荐和原子批量占号。

**Architecture:** 继续使用现有 Electron + React + Fastify + SQLite 单体结构，不增加基础设施，也不修改编码规则。新增独立的 planning 领域服务：预览阶段只读取并生成建议；确认阶段在 SQLite immediate transaction 内重新解析字典、分配流水号、核对预览并一次性插入 `reserved` 图号。

**Tech Stack:** Electron、React、TypeScript、Fastify、SQLite（better-sqlite3）、Zod、Vitest、Testing Library、Playwright

**Spec:** `docs/superpowers/specs/2026-08-24-drawing-number-planner-design.md`

## Global Constraints

- 图号结构严格保持 `品牌码.品类尺寸码.外观码+颜色码.主类别码+项目明细码+版本流水号`。
- 流水号按除最后三位之外的完整编码前缀递增，范围为 `001` 至 `999`。
- `reserved`、`active`、`voided` 三种状态全部占用号码，任何号码不得重新分配。
- 预览不写数据库；确认占号必须重新校验并在一个事务内全部成功或全部失败。
- 预览后的推荐若已变化，返回 `PLAN_STALE` 并要求用户刷新，不静默改号。
- 只允许启用的产品和字典参与新占号；项目明细必须属于所选主类别。
- `drawing_numbers` 当前结构已满足 Phase 2，不新增迁移或重建表。
- 本阶段不实现 BOM、文件记录、资料根目录设置、PDF、复制、重命名、外发或服务器同步。
- 资料根目录要求从 Phase 4 文件功能开始执行：业务文件只存相对路径，绝不写死盘符、用户名或电脑绝对路径。

---

### Task 1: 编码组合与规划输入解析

**Files:**
- Create: `src/core/planning/planning-types.ts`
- Create: `src/core/planning/planning-errors.ts`
- Create: `src/core/planning/planning-repository.ts`
- Create: `src/core/planning/code-generator.ts`
- Test: `tests/core/code-generator.test.ts`

**Interfaces:**
- Produces: `composeDrawingPrefix(parts: DrawingCodeParts): string`、`composeDrawingCode(parts, sequence): string`、`formatDisplayName(context): string`。
- Produces: `PlanningRepository.resolveContext(productId, appearanceId, rows): PlanningContext` 和 `findMaxSequence(prefix): number`。

- [ ] **Step 1: Write the failing code-generation tests**

```ts
expect(composeDrawingCode({
  brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '0',
  mainCategoryCode: '04', projectItemCode: '01',
}, 1)).toBe('02.0404.010.0401001');
expect(() => composeDrawingCode(parts, 0)).toThrow('流水号必须在 001 至 999 之间');
expect(() => composeDrawingCode(parts, 1000)).toThrow('流水号必须在 001 至 999 之间');
```

- [ ] **Step 2: Run `node node_modules/vitest/vitest.mjs --run tests/core/code-generator.test.ts` and verify it fails because the module does not exist.**
- [ ] **Step 3: Implement exact segment composition and display suffix `${brandName}-${model}${colorName}-${projectItemName}` without normalizing or coercing dictionary codes.**
- [ ] **Step 4: Add repository tests proving inactive product/dictionary, missing appearance, wrong dictionary type and project-parent mismatch produce stable errors `PRODUCT_NOT_ACTIVE`, `APPEARANCE_REQUIRED`, `DICTIONARY_NOT_ACTIVE`, `INVALID_PROJECT_PARENT`.**
- [ ] **Step 5: Implement one joined context query that validates product → brand/size, selected/default appearance, and each row's color/main category/project item.**
- [ ] **Step 6: Run the focused tests and commit `feat: add drawing planning code resolver`.**

### Task 2: 预览、查重与连续流水号推荐

**Files:**
- Create: `src/core/planning/planning-service.ts`
- Modify: `src/core/planning/planning-repository.ts`
- Test: `tests/core/planning-service.test.ts`

**Interfaces:**
- Consumes: Task 1 code generator and validated planning context.
- Produces: `PlanningService.preview(input: PlanningInput): PlanningPreview`。

```ts
interface PlanningInput {
  productId: number;
  appearanceId?: number;
  rows: Array<{ clientId: string; colorId: number; mainCategoryId: number; projectItemId: number; notes?: string }>;
}
interface PlannedRow {
  clientId: string; fullCode: string; displayName: string; sequence: number;
  prefix: string; available: true;
}
```

- [ ] **Step 1: Write failing tests proving an empty prefix recommends `001`, existing `reserved`/`active`/`voided` rows all advance the recommendation, and sequence `999` produces `SEQUENCE_EXHAUSTED`.**
- [ ] **Step 2: Write a failing batch test with two identical prefixes and verify recommendations are consecutive (`002`, `003`) while different prefixes each start from their own maximum.**
- [ ] **Step 3: Write failing tests proving duplicate `clientId`, empty rows and more than 100 rows reject with `INVALID_PLAN`.**
- [ ] **Step 4: Implement `preview` as a read-only operation that groups rows by exact prefix, reads each prefix maximum once, allocates in request order and checks every generated `full_code` does not already exist.**
- [ ] **Step 5: Run focused planning tests and commit `feat: preview drawing numbers and next sequences`.**

### Task 3: 原子批量占号与本机 API

**Files:**
- Modify: `src/core/planning/planning-types.ts`
- Modify: `src/core/planning/planning-repository.ts`
- Modify: `src/core/planning/planning-service.ts`
- Create: `src/server/routes/planning.ts`
- Modify: `src/server/start-server.ts`
- Test: `tests/core/planning-reservation.test.ts`
- Test: `tests/server/planning-api.test.ts`

**Interfaces:**
- Produces: `PlanningService.reserve(input: ReservePlanningInput): ReservedDrawing[]`。
- Produces: `POST /api/planning/preview` and `POST /api/planning/reserve`。

```ts
interface ReservePlanningInput extends PlanningInput {
  rows: Array<PlanningInput['rows'][number] & { expectedFullCode: string }>;
}
```

- [ ] **Step 1: Write a failing service test proving two valid rows are inserted as `reserved`, snapshot all six codes, and return database IDs.**
- [ ] **Step 2: Write a failing rollback test where the second row becomes invalid and assert zero rows are inserted.**
- [ ] **Step 3: Write a stale-preview test: preview `...001`, insert that code separately, call reserve with expected `...001`, expect `PLAN_STALE`, and assert the service does not silently reserve `...002`.**
- [ ] **Step 4: Implement reservation with `database.transaction(() => { ... }).immediate()`; resolve context and recompute the complete batch inside the transaction, compare every expected code, then insert all rows.**
- [ ] **Step 5: Map uniqueness failures to `DRAWING_CODE_CONFLICT`, sequence overflow to `SEQUENCE_EXHAUSTED`, and all validation failures to stable 409/422 JSON responses without exposing SQL text.**
- [ ] **Step 6: Write API tests for Zod input limits, write-token/origin enforcement, preview success, reserve success, stale conflict, and atomic rollback.**
- [ ] **Step 7: Register the planning routes, run focused core/API tests and commit `feat: reserve drawing numbers atomically`.**

### Task 4: 图号规划页面

**Files:**
- Modify: `src/renderer/data/client.ts`
- Create: `src/renderer/pages/PlanningPage.tsx`
- Modify: `src/renderer/layout/AppShell.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/renderer/planning-page.test.tsx`
- Test: `tests/smoke/app-shell.test.tsx`

**Interfaces:**
- Consumes: `PlannerApi.previewPlan(input)` and `PlannerApi.reservePlan(input)` from the client.
- Produces: enabled `图号规划` navigation and a batch editor with preview/confirmation states.

- [ ] **Step 1: Write a failing navigation test proving `图号规划` is enabled, opens `PlanningPage`, and the sidebar footer reads `Phase 2 · 图号规划`.**
- [ ] **Step 2: Write a failing page test proving active products and active appearance/color/main/project dictionaries load, project items filter by selected main category, and a row cannot preview until all fields are selected.**
- [ ] **Step 3: Write a failing batch interaction test for adding/removing rows and showing returned expected code, display name, recommended sequence and `可占用` state.**
- [ ] **Step 4: Write a failing confirmation test proving the user sees the complete batch, must click `确认批量占号`, and successful reservation clears the draft while showing all reserved codes.**
- [ ] **Step 5: Write a failing stale-preview test proving `PLAN_STALE` keeps the draft, explains that numbers changed, and offers `重新查重` rather than submitting again blindly.**
- [ ] **Step 6: Implement the page using existing form, table, error-banner and button styles; add only the minimal batch-editor CSS needed for readable desktop widths.**
- [ ] **Step 7: Run renderer and smoke tests and commit `feat: add drawing planning workspace`.**

### Task 5: 真实流程验收、文档与阶段收口

**Files:**
- Modify: `tests/e2e/global-setup.ts`
- Create: `tests/e2e/phase-two.spec.ts`
- Modify: `README.md`
- Modify: `docs/superpowers/plans/2026-08-24-drawing-number-planner-phase-2.md`

**Interfaces:**
- Proves the real React page, Fastify API and SQLite database complete the same workflow without mock data.

- [ ] **Step 1: Add an E2E setup fixture with active brand `02`, size `0404`, appearance `01`, white `0`, main category `04`, project item `01`, and product `ZC200`.**
- [ ] **Step 2: Write the E2E flow: open 图号规划, choose ZC200, add two rows sharing one prefix, preview `...001`/`...002`, confirm, then search 图号库 and verify both permanent `reserved` records.**
- [ ] **Step 3: Update README Phase 2 scope and explicitly retain the Phase 4 workspace-root/relative-path rule and the V1 no-server-sync boundary.**
- [ ] **Step 4: Mark completed plan checkboxes only after their evidence exists; run `vitest --run`, `tsc --noEmit`, Vite + Electron build, and Playwright.**
- [ ] **Step 5: Start the production Electron window and the same local browser URL, visually verify 图号规划 at desktop width, and commit `test: verify phase two workflow`.**
- [ ] **Step 6: Request final code review; resolve Critical/Important findings with TDD, rerun all verification, and stop for user Phase 2 preview without starting Phase 3.**
