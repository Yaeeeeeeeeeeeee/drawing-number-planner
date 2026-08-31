# 图号规划器真实使用验收修正 Implementation Plan

> **执行门禁：** 本计划必须在用户批准 Design Document 与本计划后执行。执行时使用 `superpowers:executing-plans`，每个任务先写失败测试，再做最小实现。当前文档提交不得包含业务代码、Schema 迁移或 UI 修改。

**Goal:** 分离当前文件状态、扫描历史和永久占号，提供扫描差异与安全索引清库，修正字典和图号库交互，增加产品型号级二维码管理，并在独立 Schema v9 中落地已确认的 BOM 正式字段、图片沿用和可选二维码引用能力。

**Architecture:** 保留 `drawing_numbers`、`historical_drawing_numbers`、`pdf_files` 和 `material_batches` 现有职责。Schema v7 增加通用扫描运行/差异及历史图号状态；Schema v8 增加独立二维码用途、产品二维码和二维码文件实例；Schema v9 只处理产品级 BOM、业务日期、规格字段、相对路径图片资产和可选二维码引用。所有文件系统操作继续通过资料根目录解析器和桌面 bridge，数据库不保存绝对路径。

**Tech Stack:** TypeScript, React, Fastify, Electron, SQLite (`better-sqlite3`), Vitest, Testing Library, Playwright.

---

## Task 0: 执行前基线与保护

**Files:**

- Read: `docs/superpowers/specs/2026-08-31-drawing-number-planner-real-usage-acceptance-corrections-design.md`
- Read: `docs/superpowers/plans/2026-08-31-drawing-number-planner-real-usage-acceptance-corrections.md`
- Read: `src/db/migrations.ts`
- Read: `src/core/files/workspace-paths.ts`

- [ ] **Step 1: 建立独立工作树/分支。**

从用户批准时的稳定提交创建 `codex/real-usage-acceptance-corrections`，不得直接在 master 开发。记录起始提交和当前 Schema 版本。

- [ ] **Step 2: 记录真实数据库只读基线。**

至少记录：`schema_migrations`、`pdf_files` 总数/当前存在/缺失、`path_key` 重复数、`material_batches`、`historical_drawing_numbers`、`drawing_numbers`、`bom_versions`、`bom_items`、`foreign_key_check`。本计划调查快照为 2,669 / 2,360 / 309、0 重复、134 批次、738 历史、1 正式、1/1 BOM；执行时重新读取，禁止把文档快照当成不变常量。

- [ ] **Step 3: 建立数据库和资料库验证副本。**

Schema 测试只使用临时数据库或生产数据库副本。涉及 `E:\包材资料` 的测试只读，并在扫描前后抽样/统计文件数与哈希，证明未移动、删除、重命名或修改原文件。

- [ ] **Step 4: 跑修改前定向基线。**

Run:

```powershell
pnpm exec vitest run tests/db/migrations.test.ts tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/core/dictionary-service.test.ts tests/core/drawing-query.test.ts tests/core/bom-service.test.ts
```

Expected: PASS。若失败，先按系统化调试流程查清既有故障，不把失败混入本轮实现。

---

## Task 1: Schema v7：扫描运行、差异与历史状态

**Files:**

- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migrations.test.ts`
- Modify: `tests/db/backup.test.ts`

- [ ] **Step 1: 先写 v6 → v7 迁移失败测试。**

覆盖：升级前必须备份；保留全部 `pdf_files/material_batches/historical_drawing_numbers`；新增表和列；重复/外键/计数异常回滚；备份失败不得开始迁移；高版本拒绝打开。

- [ ] **Step 2: 定义 v7 加法 Schema。**

新增 `file_scan_runs`、`file_scan_changes`；给 `pdf_files` 增加 `content_sha256`、`last_seen_scan_run_id`；给 `material_batches` 增加 `last_seen_scan_run_id`；给 `historical_drawing_numbers` 增加默认 `active` 的状态列和检查约束。`file_scan_changes.pdf_file_id` 使用 `ON DELETE SET NULL` 或无强依赖快照，保证单项索引清理不破坏扫描历史。

- [ ] **Step 3: 实现迁移和验证。**

更新支持版本到 7。迁移事务结束前验证行数、默认状态、唯一索引和 `foreign_key_check`。不得回填虚假扫描运行；现有 `is_present` 作为 v7 第一次扫描的比较基线。

- [ ] **Step 4: 验证升级与回滚。**

Run:

```powershell
pnpm exec vitest run tests/db/schema.test.ts tests/db/migrations.test.ts tests/db/backup.test.ts
```

Expected: PASS；强制注入失败后 Schema 仍为 v6、所有基线行数不变。

- [ ] **Step 5: 提交边界。**

```powershell
git add src/db/schema.sql.ts src/db/migrations.ts tests/db/schema.test.ts tests/db/migrations.test.ts tests/db/backup.test.ts
git commit -m "feat: add scan history schema"
```

---

## Task 2: 扫描差异算法与当前状态同步

**Files:**

- Create: `src/core/files/file-fingerprint.ts`
- Create: `src/core/files/file-scan-diff.ts`
- Modify: `src/core/files/pdf-scanner.ts`
- Modify: `src/core/files/file-types.ts`
- Modify: `src/core/files/file-repository.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `src/core/files/material-batch-repository.ts`
- Create: `tests/core/file-fingerprint.test.ts`
- Create: `tests/core/file-scan-diff.test.ts`
- Modify: `tests/core/pdf-scanner.test.ts`
- Modify: `tests/core/file-repository.test.ts`
- Modify: `tests/core/file-service.test.ts`

- [ ] **Step 1: 写差异分类测试。**

覆盖新增、缺失、唯一哈希移动、移动歧义拆成新增+缺失、同路径内容变化、大小写显示路径变化、无变化、跨批次同图号不去重、同路径幂等更新。差异快照使用 `index_kind + file_index_id`，为后续二维码索引复用，但 v7 不提前实现二维码业务。

- [ ] **Step 2: 实现增量 SHA-256。**

同 `path_key` 且大小/修改时间未变化时复用已有哈希；新文件和元数据变化时流式只读计算 SHA-256。不得把哈希作为唯一索引；它只用于差异判断和唯一移动配对。

- [ ] **Step 3: 让一次扫描在同一事务提交。**

在 `replaceScan` 内创建成功扫描运行、保存差异、更新 `last_seen_scan_run_id`、同步 `is_present` 和批次状态。任何一步失败时保留上一次当前索引和扫描历史。

- [ ] **Step 4: 处理 v7 第一次扫描基线。**

迁移后第一次扫描以原 `is_present = 1` 集合作为上次状态；已有 309 条缺失索引不计为“本次删除”。为当前文件建立哈希后再进入正常差异周期。

- [ ] **Step 5: 定向验证。**

Run:

```powershell
pnpm exec vitest run tests/core/file-fingerprint.test.ts tests/core/file-scan-diff.test.ts tests/core/pdf-scanner.test.ts tests/core/file-repository.test.ts tests/core/file-service.test.ts
```

Expected: PASS；失败扫描后查询结果、扫描运行数、历史占号数不变。

- [ ] **Step 6: 提交边界。**

```powershell
git add src/core/files tests/core
git commit -m "feat: track scan differences"
```

---

## Task 3: 扫描历史 API 与“本次变化”UI

**Files:**

- Create: `src/core/files/file-scan-history-repository.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `src/server/routes/files.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/FilesPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/server/files-api.test.ts`
- Modify: `tests/renderer/files-page.test.tsx`
- Modify: `tests/renderer/api-client.test.ts`

- [ ] **Step 1: 写 API 和 UI 失败测试。**

测试扫描结果同时包含当前状态和与上次差异；查看变化按新增、删除/缺失、变化分组；旧缺失索引不进入本次删除；分页或限制不会截断汇总数。

- [ ] **Step 2: 增加扫描历史查询。**

实现最新扫描、指定扫描差异查询。只返回相对路径。`currentTotal` 来源为本轮实际扫描文件数，不用累计 `pdf_files` 总行数。

- [ ] **Step 3: 调整 PDF 文件中心扫描摘要。**

分成“当前资料库状态”和“与上一次扫描相比”。“查看本次变化”使用页面内展开/Tab，不新建复杂模块。

- [ ] **Step 4: 统一请求层验证。**

扫描和历史查询继续使用共享 `request()`，覆盖 JSON、空 body、204、非 JSON、非 2xx 和令牌刷新，不在页面加解析补丁。

- [ ] **Step 5: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/server/files-api.test.ts tests/renderer/files-page.test.tsx tests/renderer/api-client.test.ts
git add src/core/files src/server/routes/files.ts src/renderer tests/server/files-api.test.ts tests/renderer
git commit -m "feat: show per-scan file changes"
```

---

## Task 4: 安全清空资料库索引

**Files:**

- Modify: `src/core/files/file-repository.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `src/core/files/file-errors.ts`
- Modify: `src/server/routes/files.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/FilesPage.tsx`
- Modify: `tests/core/file-repository.test.ts`
- Modify: `tests/core/file-service.test.ts`
- Modify: `tests/server/files-api.test.ts`
- Modify: `tests/renderer/files-page.test.tsx`

- [ ] **Step 1: 写破坏边界测试。**

错误确认值拒绝；扫描中拒绝；清库只清扫描运行、差异、PDF 索引和资料批次；正式图号、历史占号、字典、产品、BOM 和工作区设置计数不变；服务层不调用文件删除 API。

- [ ] **Step 2: 实现仓储事务。**

按外键顺序删除扫描相关数据，返回每类删除数量，事务末尾执行外键检查。不得删除 `historical_drawing_numbers`，不得更改占号算法。

- [ ] **Step 3: 实现两段式 UI 确认。**

第一步显示资料根目录和数据数量，第二步要求明确确认短语。提示必须包含“不会删除 E:\包材资料 中的任何实际文件”；实际显示路径从设置读取，不写死 E 盘。

- [ ] **Step 4: 清库后重扫回归。**

临时资料库清空后扫描应建立干净索引；相同可靠历史图号不新增第二条，占号和下一流水号保持不变。

- [ ] **Step 5: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/server/files-api.test.ts tests/renderer/files-page.test.tsx tests/core/occupied-number-repository.test.ts
git add src/core/files src/server/routes/files.ts src/renderer tests
git commit -m "feat: clear file indexes safely"
```

---

## Task 5: 历史图号状态与占号边界

**Files:**

- Modify: `src/core/drawings/drawing-types.ts`
- Modify: `src/core/drawings/drawing-repository.ts`
- Modify: `src/core/drawings/drawing-query-service.ts`
- Modify: `src/core/planning/occupied-number-repository.ts`
- Modify: `src/server/routes/drawings.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: `tests/core/drawing-query.test.ts`
- Modify: `tests/core/occupied-number-repository.test.ts`
- Modify: `tests/server/drawings-api.test.ts`
- Modify: `tests/renderer/drawing-library-page.test.tsx`

- [ ] **Step 1: 写历史状态测试。**

历史图号可在“使用中/已停用”间切换；正式图号状态机不变；历史停用后仍查重、仍占流水号；文件存在状态不随业务状态变化。

- [ ] **Step 2: 调整统一图号读取模型。**

用 origin + 历史状态明确展示，避免把所有历史记录硬编码成单一 `historical` 状态。历史详情继续不允许修改编码或关联逻辑，但允许状态切换。

- [ ] **Step 3: 明确不提供历史占号物理删除。**

删除/清理按钮只作用于 PDF 索引。历史图号详情说明“停用不释放号码”；不增加会绕过永久占号的 DELETE API。

- [ ] **Step 4: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/core/drawing-query.test.ts tests/core/occupied-number-repository.test.ts tests/server/drawings-api.test.ts tests/renderer/drawing-library-page.test.tsx
git add src/core/drawings src/core/planning/occupied-number-repository.ts src/server/routes/drawings.ts src/renderer tests
git commit -m "feat: manage historical drawing status"
```

---

## Task 6: 字典名称、重新启用与层数 UI

**Files:**

- Modify: `src/core/dictionaries/dictionary-repository.ts`
- Modify: `src/core/dictionaries/dictionary-service.ts`
- Modify: `src/server/routes/dictionaries.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/DictionariesPage.tsx`
- Modify: `tests/core/dictionary-service.test.ts`
- Modify: `tests/server/dictionaries-api.test.ts`
- Modify: `tests/renderer/dictionaries-page.test.tsx`
- Verify only: `src/core/import/excel-audit.ts`
- Verify only: `src/core/drawings/drawing-code.ts`

- [ ] **Step 1: 写名称可改/编码锁定测试。**

被产品、正式图号、历史图号或 BOM 引用的字典项名称可以修改；ID、code、完整正式图号和历史完整图号不变；创建/更新 API 不接受 code 修改。

- [ ] **Step 2: 写重新启用测试。**

inactive 项可以 activate，`deactivated_at` 清空；新建业务下拉恢复显示；历史查询在启停前后都能解释。

- [ ] **Step 3: 保持受保护删除。**

未使用项仍可二次确认删除；被引用项拒绝并返回更具体的引用提示。不要用“文件还存在”解释字典引用。

- [ ] **Step 4: 删除层数 UI Tab。**

移除 `DictionariesPage` 的 layer 状态、加载和编辑入口；保留 `layer_count` 类型、Excel 审计和底层 API 兼容，不改正式图号算法。

- [ ] **Step 5: 定向验证。**

```powershell
pnpm exec vitest run tests/core/dictionary-service.test.ts tests/server/dictionaries-api.test.ts tests/renderer/dictionaries-page.test.tsx tests/core/excel-audit.test.ts tests/core/drawing-code.test.ts tests/core/code-generator.test.ts
```

Expected: 图号真实规则测试逐字一致。

- [ ] **Step 6: 提交边界。**

```powershell
git add src/core/dictionaries src/server/routes/dictionaries.ts src/renderer tests
git commit -m "fix: align dictionary editing lifecycle"
```

---

## Task 7: 图号库批次文件聚合与紧凑筛选

**Files:**

- Modify: `src/core/files/material-batch-types.ts`
- Modify: `src/core/files/material-batch-service.ts`
- Modify: `src/server/routes/material-batches.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/core/material-batch-service.test.ts`
- Modify: `tests/server/material-batches-api.test.ts`
- Modify: `tests/renderer/drawing-library-page.test.tsx`
- Verify: `tests/main/open-file-location.test.ts`
- Verify: `tests/renderer/desktop-files.test.ts`

- [ ] **Step 1: 写逻辑包材聚合测试。**

同图号跨批次全部保留；同一批次默认只列转曲后逻辑行；展开后列出该批次全部转曲后实例和同产品目录的源文件实例；缺失显示“已缺失”；未识别文件不猜测配对。

- [ ] **Step 2: 实现服务层聚合 DTO。**

保留现有原始文件实例查询供 PDF 文件中心使用，新增批次逻辑包材查询。通过完整图号 + 产品目录配对源/转曲后，不按文件名或内容去重。

- [ ] **Step 3: 简化批次右侧展示。**

默认显示文件名和打开位置；点击文件名在当前行下方展开。完整相对路径只在展开区显示。浏览器版明确提示桌面能力不可用，不显示 `Failed to fetch`。

- [ ] **Step 4: 压缩图号筛选。**

常用项控制在一至两行，加入产品类别。源文件/转曲后存在条件放入紧凑高级区。后端现有 `productCategory` 查询继续复用。

- [ ] **Step 5: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/core/material-batch-service.test.ts tests/server/material-batches-api.test.ts tests/renderer/drawing-library-page.test.tsx tests/main/open-file-location.test.ts tests/renderer/desktop-files.test.ts
git add src/core/files src/server/routes/material-batches.ts src/renderer tests
git commit -m "feat: simplify batch material browsing"
```

---

## Task 8: Schema v8：二维码数据模型

> **边界：** 二维码独立于图号和 BOM。不得把二维码用途加入编码字典，不得复用 `drawing_numbers` 或 `historical_drawing_numbers`。

**Files:**

- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migrations.test.ts`
- Modify: `tests/db/backup.test.ts`

- [ ] **Step 1: 写 v7 → v8 迁移测试。**

覆盖 `qr_purposes`、`qr_purpose_product_categories`、`product_qr_codes`、`qr_code_files`；迁移前备份；已有产品默认用途回填；空气炸锅额外 Recipe；所有初始产品二维码均为未启用；任何冲突/外键/计数异常整批回滚。

- [ ] **Step 2: 定义可扩展用途。**

用途表不使用三值枚举。种子数据规范英文为 `User Manual/Warranty/Recipe`；前两项 `default_for_all`，Recipe 通过产品类别映射关联“空气炸锅”。以后新增用途只写数据。

- [ ] **Step 3: 定义产品二维码业务记录。**

`product_id + purpose_id` 唯一；状态为 active/inactive；网址可空；创建/修改时间齐全。已有产品按用途规则回填 inactive，禁止迁移时猜测网址或启用状态。

- [ ] **Step 4: 定义二维码文件实例。**

独立 `qr_code_files`，以规范化相对路径唯一；记录文件资料状态、匹配状态、SHA-256 和扫描运行。不得加入图号表或 PDF 图号匹配约束。

- [ ] **Step 5: 验证并提交。**

```powershell
pnpm exec vitest run tests/db/schema.test.ts tests/db/migrations.test.ts tests/db/backup.test.ts
git add src/db tests/db
git commit -m "feat: add qr management schema"
```

---

## Task 9: 二维码用途、扫描关联与业务服务

**Files:**

- Create: `src/core/qr/qr-types.ts`
- Create: `src/core/qr/qr-repository.ts`
- Create: `src/core/qr/qr-service.ts`
- Create: `src/core/qr/qr-file-scanner.ts`
- Create: `src/core/qr/qr-file-classifier.ts`
- Create: `src/core/qr/qr-errors.ts`
- Modify: `src/core/products/product-service.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `src/core/files/file-repository.ts`
- Modify: `src/server/application.ts`
- Create: `src/server/routes/qr-codes.ts`
- Create: `tests/core/qr-service.test.ts`
- Create: `tests/core/qr-file-scanner.test.ts`
- Create: `tests/core/qr-file-classifier.test.ts`
- Modify: `tests/core/file-service.test.ts`
- Create: `tests/server/qr-codes-api.test.ts`
- Modify: `tests/server/files-api.test.ts`

- [ ] **Step 1: 写用途与状态测试。**

普通产品适用 User Manual/Warranty；空气炸锅额外 Recipe；新增用途无需改 Schema；二维码可启用/停用；停用不删除网址或文件；用途定义停用不破坏已有记录。

- [ ] **Step 2: 写命名识别测试。**

识别 `{型号}-{用途英文}（二维码的网址编码）`，兼容历史 `（网址编码）`；Warranty 大小写不敏感；目录 SKU/型号、文件型号和用途必须唯一一致；未知用途、产品不唯一、型号冲突进入待确认；二维码文件不得进入历史图号解析。

- [ ] **Step 3: 实现网址和业务记录维护。**

网址为空允许保存；填写时只接受合法 HTTP/HTTPS。可靠扫描可建立缺失的 inactive 产品二维码，但不得自动启用。产品创建/历史候选确认时按用途规则补齐默认 inactive 记录。

- [ ] **Step 4: 把二维码文件纳入同一次扫描。**

扫描器先按产品目录根层级和二维码命名路由，再执行正式图号 PDF 分类。`qr_code_files` 使用与 PDF 相同的扫描运行和差异规则，但索引表分开。文件缺失只更新资料状态，不删除业务记录。

- [ ] **Step 5: 扩展索引清库。**

“清空资料库索引”同时删除 `qr_code_files`，但保留 `product_qr_codes`、用途、产品、图号和 BOM。返回二维码文件删除数量；仍不得调用文件删除 API。

- [ ] **Step 6: API 回归并提交。**

```powershell
pnpm exec vitest run tests/core/qr-service.test.ts tests/core/qr-file-scanner.test.ts tests/core/qr-file-classifier.test.ts tests/core/file-service.test.ts tests/server/qr-codes-api.test.ts tests/server/files-api.test.ts tests/core/historical-file-classifier.test.ts tests/core/occupied-number-repository.test.ts
git add src/core/qr src/core/products src/core/files src/server tests
git commit -m "feat: manage product qr records"
```

---

## Task 10: 二维码管理与产品档案 UI

**Files:**

- Modify: `src/renderer/data/client.ts`
- Create: `src/renderer/pages/QrCodesPage.tsx`
- Modify: `src/renderer/pages/ProductsPage.tsx`
- Modify: `src/renderer/layout/AppShell.tsx`
- Modify: `src/renderer/styles.css`
- Create: `src/renderer/desktop-qr-files.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/preload.ts`
- Create: `tests/renderer/qr-codes-page.test.tsx`
- Modify: `tests/renderer/products-page.test.tsx`
- Modify: `tests/smoke/app-shell.test.tsx`
- Create: `tests/main/open-qr-file.test.ts`
- Modify: `tests/renderer/api-client.test.ts`

- [ ] **Step 1: 写导航、列表和详情测试。**

日常工作独立显示“二维码管理”；可按 SKU/型号、产品类别、用途、业务状态和文件状态筛选；详情显示全部已确认字段和创建/修改时间。

- [ ] **Step 2: 写产品档案摘要测试。**

普通产品显示说明书/售后，空气炸锅额外菜谱；状态来自产品二维码记录；点击进入对应详情；不存在的扩展用途不硬编码展示。

- [ ] **Step 3: 实现修改和状态切换。**

详情支持名称、网址、文件关联修改和启用/停用。业务状态和文件状态分列；待确认文件提供人工关联，不自动删除未知记录。

- [ ] **Step 4: 实现查看与打开位置。**

桌面版通过受限 bridge 查看二维码文件和打开位置；图片可预览，PDF 交给系统打开。浏览器版显示桌面能力提示，不发起无效本地请求。

- [ ] **Step 5: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/renderer/qr-codes-page.test.tsx tests/renderer/products-page.test.tsx tests/smoke/app-shell.test.tsx tests/main/open-qr-file.test.ts tests/renderer/api-client.test.ts tests/server/qr-codes-api.test.ts
git add src/renderer src/main tests
git commit -m "feat: add qr management workflow"
```

---

## Task 11: Schema v9：产品级 BOM 与正式字段

> **风险门禁：** v7/v8 全部验证通过后再开始。实施前重新统计同一产品是否存在多个颜色当前 BOM；若存在，停止 v9 并向用户报告，不自动选择或合并。

**Files:**

- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migrations.test.ts`
- Modify: `tests/db/backup.test.ts`

- [ ] **Step 1: 写 v8 → v9 兼容测试。**

覆盖：旧 BOM ID、明细、备注、`created_at` 保留；业务日期为 NULL；旧颜色保存为 `legacy_color_id`；单产品唯一当前指针；多颜色当前冲突失败回滚；清索引外键置空但批次路径快照保留。

- [ ] **Step 2: 建立 v8 BOM 表。**

使用 SQLite 重建表方式实施产品级当前键和新字段。现有 `quantity` 保留兼容默认 1，UI 不使用。新增 `bom_assets`、`bom_item_assets` 和可选 `bom_item_qr_codes`，资产路径必须通过工作区相对路径校验；BOM 只能引用同产品二维码。

- [ ] **Step 3: 迁移旧数据。**

不把 `created_at` 复制到 `business_change_date`；不生成图片；不删除旧 BOM。迁移后验证版本/明细计数、ID、引用、当前指针和外键。

- [ ] **Step 4: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/db/schema.test.ts tests/db/migrations.test.ts tests/db/backup.test.ts
git add src/db tests/db
git commit -m "feat: add formal bom schema"
```

---

## Task 12: BOM 领域服务、图片沿用与 API

**Files:**

- Modify: `src/core/bom/bom-types.ts`
- Modify: `src/core/bom/bom-repository.ts`
- Modify: `src/core/bom/bom-service.ts`
- Modify: `src/core/bom/bom-errors.ts`
- Create: `src/core/bom/bom-asset-service.ts`
- Modify: `src/server/routes/boms.ts`
- Modify: `tests/core/bom-service.test.ts`
- Modify: `tests/core/bom-concurrency.test.ts`
- Create: `tests/core/bom-asset-service.test.ts`
- Modify: `tests/server/boms-api.test.ts`

- [ ] **Step 1: 写正式字段和日期测试。**

新 BOM 必须包含人工业务变更日期；`created_at` 自动生成；查询按日期/批次/项目/图号筛选和排序；旧 NULL 日期显示未补录；数量始终兼容为 1。

- [ ] **Step 2: 产品级当前 BOM。**

移除服务层顶层颜色上下文，按产品读取/并发保存当前版本。正式图号仍必须属于该产品和项目，作废图号不可新增；白色共用规则保持，不把历史图号加入候选。

- [ ] **Step 3: 生效批次快照。**

保存批次相对路径、名称和可选当前批次 ID。清索引后路径/名称仍可查询；重扫后可按规范化相对路径重新建立可选关联，不自动改变 BOM 内容。

- [ ] **Step 4: 图片/图示资产。**

上传时验证图片类型、大小、目标相对路径和目录逃逸；复制到集中受管目录前先准备临时文件，数据库提交失败则清理新副本。沿用上一版时复用资产 ID并保存来源关系，不重复复制。原始用户文件不移动。

- [ ] **Step 5: 可选二维码引用。**

BOM 项目只列同产品、启用中的二维码供新选择；保存引用不修改二维码；历史 BOM 对后来停用二维码仍可显示。二维码业务记录独立存在，不依赖 BOM。

- [ ] **Step 6: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/core/bom-service.test.ts tests/core/bom-concurrency.test.ts tests/core/bom-asset-service.test.ts tests/server/boms-api.test.ts
git add src/core/bom src/server/routes/boms.ts tests/core tests/server/boms-api.test.ts
git commit -m "feat: support formal bom records"
```

---

## Task 13: BOM 添加/查询 UI

**Files:**

- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/BomPage.tsx`
- Modify: `src/renderer/pages/bom/BomEditor.tsx`
- Modify: `src/renderer/pages/bom/BomQuery.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/bom-page.test.tsx`
- Modify: `tests/renderer/api-client.test.ts`
- Modify: `tests/e2e/phase-three.spec.ts`

- [ ] **Step 1: 写 UI 失败测试。**

添加页要求业务变更日期并显示项目、图号、生效批次、材质、尺寸、图片、位置、图示、备注和可选二维码引用；图片支持上传/沿用上一版并显示来源；查询页支持日期、批次、项目、图号；显示业务日期和提交时间两个字段。

- [ ] **Step 2: 更新添加 BOM。**

保持 `添加 BOM｜查询 BOM` 分离。顶层只选产品和业务日期，不选 BOM 颜色。数量不出现。每个项目就近维护全部字段和资产。

- [ ] **Step 3: 更新查询 BOM。**

历史列表按业务日期优先、提交时间次序展示；旧记录标记“业务日期未补录”；详情显示资产来源和生效批次快照。

- [ ] **Step 4: 定向验证并提交。**

```powershell
pnpm exec vitest run tests/renderer/bom-page.test.tsx tests/renderer/api-client.test.ts tests/server/boms-api.test.ts
git add src/renderer tests/renderer tests/e2e/phase-three.spec.ts
git commit -m "feat: complete bom maintenance workflow"
```

---

## Task 14: 真实数据库升级与资料库扫描回归

**Files:**

- No source changes unless a verified defect is found; any fix requires a failing regression test and separate commit.

- [ ] **Step 1: 在数据库副本执行 v6 → v7 → v8 → v9。**

验证升级前备份、版本账本、行数、ID、外键、路径唯一性、历史占号、二维码默认记录和 BOM 数据。再分别注入 v7、v8、v9 失败，确认回滚和原副本可继续启动。

- [ ] **Step 2: 扫描真实 `E:\包材资料`。**

只读执行。报告执行时实际 PDF/二维码文件数、匹配/待确认、批次数、跨批次复用数、同路径重复数和本次差异。不要预设仍为调查时的 2,360。

- [ ] **Step 3: 连续扫描差异验证。**

在临时资料副本模拟：新增、删除、同目录改内容、移动、歧义同内容副本。真实资料库不做人为修改。第二次无修改扫描必须全部归类为无变化。

- [ ] **Step 4: 清库安全验证。**

只在数据库/资料目录副本执行清库和重扫；比较原始文件数量和哈希、历史占号数、正式图号数、产品数、产品二维码数和 BOM 数，必须完全不变。

- [ ] **Step 5: 占号回归。**

对 active/inactive 历史图号分别运行查重和下一流水号，结果必须同样占用。

---

## Task 15: 浏览器、Windows 桌面与最终质量门禁

**Files:**

- Modify only if verified defects are found; each defect gets a regression test.

- [ ] **Step 1: 完整自动化测试。**

```powershell
pnpm test
pnpm typecheck
pnpm build
pnpm test:e2e
```

Expected: 全部 PASS。不得因额度或时间跳过。

- [ ] **Step 2: 浏览器流程。**

启动本地 API 和浏览器预览，验证字典改名/停用/启用/删除、扫描摘要、本次变化、索引清库确认（仅副本）、图号批次展开、二维码管理/产品摘要、BOM 添加/查询。浏览器中打开位置应给明确桌面提示。

- [ ] **Step 3: Windows 桌面真实操作。**

验证同样流程，并实际验证 PDF/二维码“查看”和“打开位置”；扫描 `E:\包材资料` 只读。确认所有写操作不出现 `Failed to fetch` 或 `Unexpected end of JSON input`。

- [ ] **Step 4: 生产构建。**

除 `pnpm build` 外，运行项目现有 Windows 桌面打包命令（若 package scripts 尚未暴露，则使用项目已批准的打包流程，不临时引入新打包技术）。确认安装/独立窗口可启动。

- [ ] **Step 5: 最终 code review。**

使用 `superpowers:requesting-code-review`，重点审查：永久占号是否可能释放、二维码是否误入图号解析、清库是否可能触碰文件系统、扫描差异是否误去重、迁移回滚、BOM 旧数据兼容、资产路径逃逸、共享 API 响应处理。

- [ ] **Step 6: 修复 review finding 并重跑相关门禁。**

每个有效 finding 先补失败测试，再修复。没有 finding 也要记录 review 结果。

- [ ] **Step 7: 最终提交与报告。**

```powershell
git status --short
git log -1 --oneline
```

Expected: 工作区干净。向用户报告最终提交号、分支、Schema 版本、测试、真实扫描结果、差异结果、历史占号验证、code review、浏览器地址和 Windows 窗口名称。不要自动合并 master，不要开始下一 Phase。

---

## Task 16: 强制停止条件

执行中遇到以下任一情况必须停止对应部分并向用户说明：

- v7 会改变或删除现有正式/历史图号、PDF 相对路径或产品关联；
- v8 会让二维码进入图号编码、历史占号、流水号或图号查重；
- v9 前发现同一产品有多个颜色当前 BOM，无法无歧义迁移；
- 资料批次清理会导致 BOM 生效批次快照丢失；
- 需要移动、删除、重命名或修改原始 PDF；
- 需要改变正式图号结构、Excel 映射、外观码或占号算法；
- 需要引入服务器同步、自动外发或其他范围外系统；
- 迁移备份、回滚或外键校验不能可靠通过。
