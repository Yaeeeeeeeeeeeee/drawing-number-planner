# 图号规划器兼容性修正阶段 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不重新打开已验收 Phase、不过度重构的前提下，使真实 Excel 编码、SKU、历史资料扫描、永久占号和文件完整性形成一致且可验证的工作流。

**Architecture:** 保留 Electron + React + Fastify + SQLite 单体结构及现有正式图号、BOM 快照和相对路径设计。抽取唯一的图号编码解析模块，新增历史已用图号表和统一占号查询，扩展 Phase 4 扫描事务以登记可靠历史图号；BOM 只改用户表达，不重构数据表。

**Tech Stack:** Electron、React、TypeScript、Fastify、SQLite（better-sqlite3）、Zod、Vitest、Testing Library、Playwright

**Spec:** `docs/superpowers/specs/2026-08-26-drawing-number-planner-compatibility-correction-design.md`

## Global Constraints

- 正式图号严格使用 `品牌码.品类尺寸码.外观码+颜色码.主类别码+项目明细码+版本流水号`。
- 编码段长度固定为 `2 + 4 + 2 + 1 + 2 + 2 + 3`，流水号为 `001`–`999`。
- 外观码必须参与生成、解析、查重和流水号前缀。
- 只有单一、完整、可无歧义解析的正式图号才自动写入历史已用图号表。
- `pending`、`unmatched`、`conflict` 文件不自动永久占号。
- 历史图号一旦登记永久占号；文件存在状态变化不能释放号码。
- 数据库 v4→v5 升级前必须备份，失败必须回滚。
- 数据库和代码不得写死盘符、用户名或资料根目录绝对路径。
- `{产品类别}\{SKU}-{型号}` 只用于目录识别和未来目录生成；本阶段不得移动、重命名、复制或整理现有文件。
- `02.未转曲源文件` 优先判为源文件；`03.量产后的变更文件（已量产的产品看最新日期）` 优先判为转曲后；其他目录按完整 `（转曲）` 后缀判断。
- BOM 保留现有内部快照表，不做 Schema 重构，只简化 UI 表达。
- 二维码、批量重命名、外发和服务器同步不属于本阶段。
- 每个任务先写失败测试，再写最小实现；不得跳过 verification 或 code review。

## 文件职责

- `src/core/drawings/drawing-code.ts`：正式图号唯一生成、解析和文件名候选检查。
- `src/core/planning/occupied-number-repository.ts`：正式图号与历史图号的统一占号查询。
- `src/core/files/directory-policy.ts`：产品目录生成、目录上下文解析和转曲目录语义。
- `src/core/files/historical-file-classifier.ts`：组合图号检查、已知图号匹配、历史登记决策与待确认原因。
- `src/db/schema.sql.ts` / `src/db/migrations.ts`：仅包含版本 5 的最小升级。
- 现有产品、文件、图号库和 BOM 模块继续按原边界工作，不引入新服务进程或外部依赖。

---

### Task 1: 锁定 Excel 正式图号合同

**Files:**
- Create: `src/core/drawings/drawing-code.ts`
- Modify: `src/core/planning/code-generator.ts`
- Modify: `src/core/planning/planning-types.ts`
- Test: `tests/core/drawing-code.test.ts`
- Test: `tests/core/code-generator.test.ts`

**Interfaces:**
- Produces: `composeDrawingPrefix(parts: DrawingCodeParts): string`
- Produces: `composeDrawingCode(parts: DrawingCodeParts, sequence: number): string`
- Produces: `parseDrawingCode(fullCode: string): ParsedDrawingCode | null`
- Produces: `inspectDrawingCodesInFilename(fileName: string): FilenameCodeInspection`

```ts
interface ParsedDrawingCode extends DrawingCodeParts {
  fullCode: string;
  prefix: string;
  sequence: number;
}

type FilenameCodeInspection =
  | { status: 'reliable'; code: ParsedDrawingCode; candidates: string[] }
  | { status: 'pending'; reason: 'invalid-format' | 'ambiguous'; candidates: string[] }
  | { status: 'unmatched'; candidates: [] };
```

- [ ] **Step 1: 写入 Excel 真实生成案例的失败测试。**

```ts
expect(composeDrawingCode({ brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '0', mainCategoryCode: '04', projectItemCode: '01' }, 1))
  .toBe('02.0404.010.0401001');
expect(composeDrawingCode({ brandCode: '02', productSizeCode: '0404', appearanceCode: '01', colorCode: '2', mainCategoryCode: '01', projectItemCode: '03' }, 1))
  .toBe('02.0404.012.0103001');
expect(composeDrawingCode({ brandCode: '02', productSizeCode: '0404', appearanceCode: '02', colorCode: '0', mainCategoryCode: '04', projectItemCode: '01' }, 1))
  .toBe('02.0404.020.0401001');
```

- [ ] **Step 2: 运行 `node node_modules/vitest/vitest.mjs --run tests/core/drawing-code.test.ts tests/core/code-generator.test.ts`，确认因共享解析模块不存在而失败。**
- [ ] **Step 3: 在 `drawing-code.ts` 实现固定分段生成与严格解析。** 使用完整锚定表达式 `^(\d{2})\.(\d{4})\.(\d{2})(\d)\.(\d{2})(\d{2})(\d{3})$`，拒绝 `000` 流水号和任何额外字符。
- [ ] **Step 4: 写入文件名检查失败测试。** 覆盖一个合法图号、同一图号重复出现、两个不同合法图号、残缺图号、非法流水号和无候选文件名；只有第一种与同码重复返回 `reliable`。
- [ ] **Step 5: 实现 `inspectDrawingCodesInFilename`。** 使用字母数字边界提取候选；近似但未通过严格解析的数字点号串返回 `pending/invalid-format`，多个不同合法图号返回 `pending/ambiguous`。
- [ ] **Step 6: 将 `planning/code-generator.ts` 改为从共享模块重导出生成函数，更新类型导入，确保规划与扫描不各自实现一套编码规则。**
- [ ] **Step 7: 运行聚焦测试，预期全部通过；提交 `refactor: centralize verified drawing code rules`。**

### Task 2: 数据库版本 5 与安全迁移

**Files:**
- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Test: `tests/db/migrations.test.ts`
- Test: `tests/db/schema.test.ts`

**Interfaces:**
- Produces: `schemaVersionFive: string`
- Produces: 数据库版本 `5`
- Preserves: v4 全部 `products`、`drawing_numbers`、`bom_*` 和 `pdf_files` 数据

- [ ] **Step 1: 写 v4→v5 失败测试。** 创建含产品、正式图号、BOM 快照和 PDF 相对路径的 v4 数据库，迁移后断言原 ID、图号、BOM、相对路径、文件大小和时间戳不变。
- [ ] **Step 2: 写新建 v5 Schema 失败测试。** 断言 `products.sku` 存在；空 SKU 允许迁移保留；非空 SKU 使用 `COLLATE NOCASE` 唯一索引。
- [ ] **Step 3: 写 `historical_drawing_numbers` 约束测试。** 断言 `full_code` 唯一、七段快照非空、`sequence BETWEEN 1 AND 999`、可空 `product_id` 和首次/最后发现时间存在。
- [ ] **Step 4: 写 `pdf_files` v5 约束测试。** `matched` 必须且只能关联 `drawing_id` 或 `historical_drawing_id`；`pending/unmatched/conflict` 两个关联均为空；相对路径安全 CHECK 原样保留。
- [ ] **Step 5: 实现 `schemaVersionFive`。** 使用 `ALTER TABLE products ADD COLUMN sku TEXT`，创建 SKU 部分唯一索引和历史表；把 `pdf_files` 重建为 v5 表后逐列复制数据、删除旧表并恢复索引。
- [ ] **Step 6: 在迁移事务末尾验证 PDF 行数、相对路径唯一性、`foreign_key_check` 和版本号；将最高支持版本改为 5。**
- [ ] **Step 7: 写备份与失败回滚测试。** 已存在 v4 文件必须先调用 `createBackup`；故意破坏外键时迁移失败且版本仍为 4、原表可读。
- [ ] **Step 8: 运行 `node node_modules/vitest/vitest.mjs --run tests/db/migrations.test.ts tests/db/schema.test.ts`，预期通过；提交 `feat: add compatibility schema version five`。**

### Task 3: 统一正式与历史已占号查询

**Files:**
- Create: `src/core/planning/occupied-number-repository.ts`
- Modify: `src/core/planning/planning-repository.ts`
- Modify: `src/core/planning/planning-service.ts`
- Test: `tests/core/occupied-number-repository.test.ts`
- Test: `tests/core/planning-service.test.ts`
- Test: `tests/core/planning-reservation.test.ts`

**Interfaces:**
- Produces: `OccupiedNumberRepository.findMaxSequence(prefix: string): number`
- Produces: `OccupiedNumberRepository.hasFullCode(fullCode: string): boolean`
- Consumes: `drawing_numbers.full_code/sequence` 和 `historical_drawing_numbers.full_code/sequence`

- [ ] **Step 1: 写统一查重失败测试。** 插入正式 `...001` 和历史 `...002`，断言最大流水号为 2，两个完整图号均已占用。
- [ ] **Step 2: 写永久性失败测试。** 历史表保留但所有关联 PDF 标为不存在，断言历史号码仍占用且下一推荐为 `...003`。
- [ ] **Step 3: 写重复来源失败测试。** 同一个完整图号同时出现在正式表与历史表时，查重为真且最大流水号不被重复计算。
- [ ] **Step 4: 实现统一 SQL。** `findMaxSequence` 对两个表按完整前缀 `UNION ALL` 后取 `max(sequence)`；`hasFullCode` 使用 `EXISTS` 查询两表。
- [ ] **Step 5: 将 `PlanningRepository` 的同名查询委托给 `OccupiedNumberRepository`，不改变公开的预览和确认输入输出。**
- [ ] **Step 6: 写规划服务失败测试。** 历史 `02.0404.010.0401007` 存在时预览推荐 `...008`；外观改为 `02` 时使用不同前缀并从 `001` 开始。
- [ ] **Step 7: 写确认竞争失败测试。** 预览后插入历史占号，再确认时必须返回 `PLAN_STALE` 且不插入任何正式图号。
- [ ] **Step 8: 运行聚焦测试，预期通过；提交 `feat: include historical codes in number allocation`。**

### Task 4: SKU 产品档案与集中目录策略

**Files:**
- Modify: `src/core/products/product-types.ts`
- Modify: `src/core/products/product-repository.ts`
- Modify: `src/core/products/product-service.ts`
- Modify: `src/server/routes/products.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/ProductsPage.tsx`
- Modify: `src/core/files/directory-policy.ts`
- Test: `tests/core/product-service.test.ts`
- Test: `tests/server/products-api.test.ts`
- Test: `tests/renderer/products-page.test.tsx`
- Test: `tests/core/directory-policy.test.ts`

**Interfaces:**
- Extends: `Product` 与 `ProductInput` 增加 `sku: string | null`；新建 API 输入要求非空 SKU
- Extends: `ProductFilters.search` 同时搜索 SKU、型号和产品类别
- Produces: `buildProductDirectory({ productCategory, sku, model }): string`
- Produces: `parseProductDirectory(relativePath: string): DirectoryProductContext | null`

```ts
interface DirectoryProductContext {
  productCategory: string;
  sku: string;
  model: string;
}
```

- [ ] **Step 1: 写产品服务失败测试。** 新建缺少/空白 SKU 返回 `INVALID_SKU`；SKU 大小写重复返回 `DUPLICATE_SKU`；旧迁移记录允许 `sku = null` 被读取。
- [ ] **Step 2: 写补录失败测试。** 已有关联图号的产品只修改 SKU 可以成功；同时修改品牌、品类尺寸或型号仍返回 `PRODUCT_REFERENCED`。
- [ ] **Step 3: 实现 SKU 规范化为 `trim()` 后原样保存，使用独立字段比较允许安全补录；更新数据库错误映射。**
- [ ] **Step 4: 写 API 和页面失败测试。** 新建表单显示必填 SKU，列表显示 SKU，关键词 `SKDWT040JP` 能检索 `T40` 产品。
- [ ] **Step 5: 实现 API、客户端和产品页面的最小 SKU 字段与搜索，不改变页面整体布局。**
- [ ] **Step 6: 写目录策略失败测试。** `01.洗碗机 + SKDWT040JP + T40` 生成 `01.洗碗机\SKDWT040JP-T40`；从更深相对路径解析回三个字段；非法字符被现有清理规则处理。
- [ ] **Step 7: 将旧 `{品牌}\{产品类别}\{型号}` 策略替换为唯一的 `{产品类别}\{SKU}-{型号}` 实现。** 解析失败返回 `null`，不得猜测或改动文件。
- [ ] **Step 8: 运行产品、API、页面和目录策略测试，预期通过；提交 `feat: add sku product identity and directory policy`。**

### Task 5: 历史文件可靠分类与永久登记

**Files:**
- Create: `src/core/files/historical-file-classifier.ts`
- Modify: `src/core/files/file-types.ts`
- Modify: `src/core/files/file-repository.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `src/core/files/pdf-matcher.ts`
- Test: `tests/core/historical-file-classifier.test.ts`
- Test: `tests/core/file-service.test.ts`
- Test: `tests/core/file-repository.test.ts`

**Interfaces:**
- Produces: `classifyHistoricalPdf(input: HistoricalPdfInput): HistoricalPdfClassification`
- Produces: `FileRepository.replaceScan(records, historicalCodes, scannedAt)` 原子更新文件和历史图号
- Uses: Task 1 `inspectDrawingCodesInFilename`、Task 4 `parseProductDirectory`

```ts
type HistoricalPdfClassification = {
  matchStatus: 'matched' | 'pending' | 'unmatched' | 'conflict';
  drawingId: number | null;
  historicalCode: ParsedDrawingCode | null;
  detectedCodes: string[];
  conversionType: 'source' | 'outlined';
  classificationWarning: string | null;
  directoryContext: DirectoryProductContext | null;
};
```

- [ ] **Step 1: 写图号分类失败测试。** 已知正式图号关联 `drawingId`；单一合法未知图号产生 `historicalCode`；残缺、非法或两个不同合法图号为 `pending` 且 `historicalCode = null`；无候选为 `unmatched`。
- [ ] **Step 2: 写转曲目录失败测试。** `02.未转曲源文件` 为 source；其中文件名带 `（转曲）` 仍为 source 且有 warning；`03.量产后的变更文件…\01.20241210` 无后缀仍为 outlined；其他目录按后缀判断。
- [ ] **Step 3: 实现纯函数分类器。** 文件名图号是占号唯一依据；目录只补充 SKU/型号/产品类别和转曲语义，不根据目录猜图号。
- [ ] **Step 4: 写原子扫描失败测试。** 一次扫描包含正式匹配、可靠历史、待确认和未匹配文件；断言只有可靠历史写入历史表，四类 PDF 状态正确。
- [ ] **Step 5: 实现历史图号 upsert。** 首次写 `first_seen_at/last_seen_at`；重复扫描只更新 `last_seen_at` 与可靠目录上下文；若 SKU+型号唯一匹配产品则填写 `product_id`。
- [ ] **Step 6: 写永久占号失败测试。** 第二次扫描移除历史 PDF 后，`pdf_files.is_present = 0`，但历史表行仍存在且时间不被清空。
- [ ] **Step 7: 保持全批事务。** 任何文件或数据库错误均回滚本次 PDF 与历史图号更新，上一次成功索引不变。
- [ ] **Step 8: 运行文件分类、服务和仓库测试，预期通过；提交 `feat: register reliable historical drawing numbers`。**

### Task 6: 图号库统一记录、文件完整性与组合筛选

**Files:**
- Modify: `src/core/drawings/drawing-types.ts`
- Modify: `src/core/drawings/drawing-repository.ts`
- Modify: `src/core/drawings/drawing-query-service.ts`
- Modify: `src/server/routes/drawings.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: `src/renderer/styles.css`
- Test: `tests/core/drawing-query-service.test.ts`
- Test: `tests/server/drawings-api.test.ts`
- Test: `tests/renderer/drawing-library-page.test.tsx`

**Interfaces:**
- Extends result: `origin: 'planned' | 'historical'`
- Extends result: `sku`, `hasSourceFile`, `hasOutlinedFile`, `dictionaryMappingStatus`
- Extends filters: `sku`、`productCategory`、`sourcePresence`、`outlinedPresence`

- [ ] **Step 1: 写统一列表失败测试。** 正式图号与历史图号同时显示；同一 `full_code` 两表都有时只显示正式记录并标记 `planned`。
- [ ] **Step 2: 写完整性失败测试。** 覆盖“都有、仅源文件、仅转曲后、都缺失”四种组合；只统计 `is_present = 1` 文件。
- [ ] **Step 3: 写组合筛选失败测试。** SKU、型号、品牌、产品类别、颜色、资料类型、状态、源文件存在和转曲后存在可任意组合，分页总数准确。
- [ ] **Step 4: 实现单条 SQL CTE。** `UNION ALL` 正式和未被正式表覆盖的历史记录，左连接产品/字典和 PDF 聚合；未知字典返回编码并标记 `unmapped`。
- [ ] **Step 5: 更新 API Zod 查询。** 布尔文件筛选只接受 `present/missing/all`；无效参数返回 400，不拼接未经白名单控制的 SQL。
- [ ] **Step 6: 写页面失败测试。** 列表显示 SKU、来源、源文件和转曲后状态；“更多筛选”展开低频条件；历史未映射编码显示“字典待映射”。
- [ ] **Step 7: 实现页面最小增量，不改变现有导航、色彩和整体布局。**
- [ ] **Step 8: 运行图号服务、API 和页面测试，预期通过；提交 `feat: show historical codes and file completeness`。**

### Task 7: PDF 文件中心待确认状态与扫描反馈

**Files:**
- Modify: `src/server/routes/files.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/FilesPage.tsx`
- Test: `tests/server/files-api.test.ts`
- Test: `tests/renderer/files-page.test.tsx`

**Interfaces:**
- Extends scan summary: `historicalRegistered`、`pending`
- Extends file view: `historicalFullCode`、`classificationWarning`
- Preserves: 资料根目录设置、相对路径、只读扫描和现有并发保护

- [ ] **Step 1: 写 API 失败测试。** 扫描结果返回历史登记数和待确认数；文件筛选接受 `matchStatus=pending`。
- [ ] **Step 2: 写页面失败测试。** 扫描摘要显示“历史图号已登记”和“待确认”；待确认行显示候选及原因，不能显示为已占号。
- [ ] **Step 3: 写只读行为测试。** 扫描前后临时资料目录的路径、文件名、大小和修改时间保持一致。
- [ ] **Step 4: 实现 API DTO 和页面展示。** 不增加人工确认写入、移动、重命名、复制或删除按钮。
- [ ] **Step 5: 运行文件 API 和页面测试，预期通过；提交 `feat: expose historical scan review states`。**

### Task 8: 保持任意包材项目规划能力

**Files:**
- Modify: `tests/renderer/planning-page.test.tsx`
- Modify: `tests/e2e/phase-two.spec.ts`
- Modify only if a test exposes a defect: `src/renderer/pages/PlanningPage.tsx`

**Interfaces:**
- Verifies: 用户按主类别添加任意启用项目，不依赖固定的 LOGO、说明书、铭牌列表

- [ ] **Step 1: 增加页面回归测试。** 字典提供“面板、顶部贴纸、压缩机标签、大外箱”时，用户可增加四行并分别选择，预览请求包含对应 `projectItemId`。
- [ ] **Step 2: 增加 E2E 回归。** 使用至少一个非 LOGO/说明书/铭牌项目完成预览与占号。
- [ ] **Step 3: 运行两个测试。** 若现有动态行实现通过，不修改业务组件；若失败，只修复导致固定项目的具体条件，不重做 UI。
- [ ] **Step 4: 再次运行测试，预期通过；提交 `test: preserve arbitrary packaging item planning`，若有组件修复则改为 `fix: allow arbitrary packaging item planning`。**

### Task 9: BOM 用户表达简化

**Files:**
- Modify: `src/renderer/pages/BomPage.tsx`
- Modify: `src/renderer/data/client.ts`
- Modify: `tests/renderer/bom-page.test.tsx`
- Modify: `tests/server/boms-api.test.ts`

**Interfaces:**
- Preserves: `bom_versions`、`bom_items`、`bom_current`、白色图号引用和 `BOM_STALE`
- Changes only presentation: “当前 BOM”“最近变更”“变更日期/替换内容”

- [ ] **Step 1: 写 Schema 不变保护测试。** 数据库版本 5 仍存在原三个 BOM 表及字段，迁移不重建或丢失 BOM 快照。
- [ ] **Step 2: 写页面失败测试。** 页面不再以 V1/V2/V3 为主要标题；显示当前 BOM 和简单变更记录，例如“铭牌：...003 → ...004”。
- [ ] **Step 3: 写白色共用回归测试。** 灰色 BOM 仍可选择同型号白色图号，并明确显示“引用白色图号”。
- [ ] **Step 4: 用现有版本 API 数据映射出日期和差异展示，不改 repository/service 的快照写入与并发模型。**
- [ ] **Step 5: 运行 BOM 页面、API 和服务测试，预期通过；提交 `refactor: simplify bom history presentation`。**

### Task 10: 真实流程验收、文档、评审与阶段收口

**Files:**
- Modify: `tests/e2e/global-setup.ts`
- Create: `tests/e2e/compatibility-correction.spec.ts`
- Modify: `README.md`
- Modify: `docs/DEVELOPMENT_PAUSE_AND_CONFIRMED_REQUIREMENTS.md`
- Modify: `docs/superpowers/plans/2026-08-26-drawing-number-planner-compatibility-correction.md`

**Interfaces:**
- Proves: Excel 规则、SKU、历史扫描、永久占号、文件完整性和简化 BOM 在真实 React + Fastify + SQLite 流程中共同工作

- [ ] **Step 1: 建立 E2E 临时资料库。** 使用 `01.洗碗机\SKDWT040JP-T40\02.未转曲源文件` 与 `03.量产后的变更文件（已量产的产品看最新日期）\01.20241210`，放入合法历史、待确认、源文件和转曲后 PDF 占位文件。
- [ ] **Step 2: 编写端到端流程。** 创建/补录 SKU，扫描资料库，确认 `02.0404.010.0401007` 成为历史占号、异常文件待确认、源/转曲后状态正确，再进入规划页面确认下一号为 `...008`。
- [ ] **Step 3: 删除历史 PDF 后重新扫描。** 断言文件完整性变为缺失，但规划仍推荐 `...008`，证明号码未释放。
- [ ] **Step 4: 检查磁盘不变。** 除测试主动删除的文件外，扫描没有移动、重命名、复制或改写任何 PDF；数据库不含临时资料根目录绝对路径。
- [ ] **Step 5: 更新 README。** 记录兼容性修正能力、目录识别规则、只读扫描边界、历史占号永久性和仍未实现的二维码/重命名/外发/同步。
- [ ] **Step 6: 运行完整 verification。**

```powershell
node node_modules/vitest/vitest.mjs --run
& 'node_modules/.bin/tsc.cmd' --noEmit
& 'node_modules/.bin/vite.cmd' build
node node_modules/@playwright/test/cli.js test
```

预期：所有单元/API/渲染测试通过，类型检查无错误，生产构建成功，全部 E2E 通过。

- [ ] **Step 7: 按 `superpowers:requesting-code-review` 执行需求符合性和代码质量评审。** 修复所有阻断问题后重新运行完整 verification，不以评审代替测试。
- [ ] **Step 8: 在独立 Windows 桌面窗口启动应用，并同时保持浏览器预览可访问。** 手工检查 SKU、历史扫描、图号库完整性筛选、任意项目规划和 BOM 简化表达。
- [ ] **Step 9: 在本计划中记录实际测试数量、评审结论和预览入口；提交 `docs: close compatibility correction stage`。**
- [ ] **Step 10: 使用 `superpowers:finishing-a-development-branch` 提供本地合并选择。** 只有用户验收并选择合并后才合并回 `master`；不开始下一正式 Phase。
