# 图号规划器真实使用修正、外发资料与安全恢复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐产品、图号、二维码和历史 BOM 的真实维护能力，建设只读源文件的外发打包与邮件撰写，并为桌面端增加可取消长任务和安全恢复。

**Architecture:** 保持现有 React → Fastify → SQLite 分层及图号算法不变。Schema v10 仅扩展历史 BOM、BOM 软删除和二维码文件标识，Schema v11 新增独立外发资料表。经用户明确批准重大架构项后，Electron Main 管理独立本地服务子进程，并通过任务 API 提供进度和取消。

**Tech Stack:** TypeScript 7、React 19、Fastify 5、SQLite/better-sqlite3、Electron 43、Vitest、Testing Library、Playwright、ZIP 流式写入库。

**Spec:** `docs/superpowers/specs/2026-09-10-drawing-number-planner-outbound-and-recovery-design.md`

## Global Constraints

- 开始实现前确认用户已批准 Design Document、Schema v10/v11 和本地服务子进程这一重大架构调整。
- 不改变正式图号结构、外观码、Excel 映射、历史图号解析、查重或流水号推荐。
- 不移动、不删除、不重命名、不修改资料根目录中的原始 PDF 或二维码文件。
- 历史已用图号、正式使用图号和作废图号永久占号。
- 文件实例唯一性继续使用规范化相对路径，不按图号、文件名或内容去重。
- 浏览器预览不伪装成本地文件管理器；桌面专属能力显示明确提示。
- 所有数据库迁移前备份，失败必须回滚。
- 每个任务遵循测试先行；每个边界完成后单独提交。
- 不开发邮件发送、服务器同步、二维码图像解码、自动 BOM、全库自动重命名或多人权限。

---

## 实施分段

本规格包含四个可独立验收的子项目，按顺序执行：

1. 维护与可用性修正；
2. Schema v10、二维码和历史 BOM；
3. 外发资料与 Schema v11；
4. 经单独批准后的服务进程、长任务和安全恢复。

每段完成后运行该段测试和桌面真实操作验证；第四段前再次确认重大架构门禁。

### Task 1: 固化基线与回归保护

**Files:**
- Modify: `tests/core/drawing-code.test.ts`
- Modify: `tests/core/occupied-number-repository.test.ts`
- Modify: `tests/core/material-batch-service.test.ts`
- Create: `tests/fixtures/outbound-template-rules.ts`

**Interfaces:**
- Consumes: 当前完整图号解析、历史永久占号和资料批次选择。
- Produces: 后续任务必须保持通过的核心回归用例，以及从 Excel 人工核对后的首批/更新名称规则夹具。

- [ ] **Step 1: 添加完整图号和历史占号回归测试。** 使用真实完整编码段断言外观码参与解析，停用/文件缺失不会释放历史号码。
- [ ] **Step 2: 添加资料批次回归测试。** 覆盖 `00.首批大货`、日期批次排序、同序号歧义不自动选择。
- [ ] **Step 3: 添加外发名称规则夹具。** 固定首批 `包材资料`、更新 `更新包材资料` 和中文创建日期格式，不存联系人邮箱。
- [ ] **Step 4: 运行定向测试。**

Run: `pnpm vitest run tests/core/drawing-code.test.ts tests/core/occupied-number-repository.test.ts tests/core/material-batch-service.test.ts`

Expected: PASS；没有改动生产代码。

- [ ] **Step 5: Commit。**

```powershell
git add tests/core/drawing-code.test.ts tests/core/occupied-number-repository.test.ts tests/core/material-batch-service.test.ts tests/fixtures/outbound-template-rules.ts
git commit -m "test: lock outbound correction invariants"
```

### Task 2: 产品启用与受保护删除

**Files:**
- Modify: `src/core/products/product-types.ts`
- Modify: `src/core/products/product-repository.ts`
- Modify: `src/core/products/product-service.ts`
- Modify: `src/server/routes/products.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/ProductsPage.tsx`
- Modify: `tests/core/product-service.test.ts`
- Modify: `tests/server/products-api.test.ts`
- Modify: `tests/renderer/products-page.test.tsx`

**Interfaces:**
- Produces: `ProductReferenceSummary`、`activateProduct(id)`、`deleteProduct(id)`；删除冲突返回 `PRODUCT_REFERENCED` 和分模块引用数量。

- [ ] **Step 1: 写失败测试。** 覆盖停用后启用、无引用删除、空白默认二维码随产品删除，以及参考产品、正式图号、历史图号、资料批次、BOM、已配置二维码任一引用阻止删除。
- [ ] **Step 2: 运行测试确认失败。**

Run: `pnpm vitest run tests/core/product-service.test.ts tests/server/products-api.test.ts tests/renderer/products-page.test.tsx`

Expected: FAIL，缺少启用/删除接口。

- [ ] **Step 3: 实现仓储引用摘要和事务内删除复核。** 不使用级联删除，不捕获外键错误代替业务提示。
- [ ] **Step 4: 实现 `POST /api/products/:id/activate` 与 `DELETE /api/products/:id`。**
- [ ] **Step 5: 页面按状态显示 `编辑｜停用/启用｜删除`。** 删除二次确认；引用冲突列出具体模块。
- [ ] **Step 6: 运行定向测试并手工验证桌面写操作。**
- [ ] **Step 7: Commit。**

```powershell
git add src/core/products src/server/routes/products.ts src/renderer/data/client.ts src/renderer/pages/ProductsPage.tsx tests/core/product-service.test.ts tests/server/products-api.test.ts tests/renderer/products-page.test.tsx
git commit -m "feat: complete product lifecycle controls"
```

### Task 3: 图号库分页、筛选和长路径

**Files:**
- Modify: `src/core/drawings/drawing-types.ts`
- Modify: `src/core/drawings/drawing-repository.ts`
- Modify: `src/server/routes/drawings.ts`
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/core/drawing-query.test.ts`
- Modify: `tests/server/drawings-api.test.ts`
- Modify: `tests/renderer/drawing-library-page.test.tsx`

**Interfaces:**
- Produces: `appearanceId`、`materialBatch` 查询；页面显式传递 `page/pageSize`。

- [ ] **Step 1: 写分页失败测试。** 构造 128 条记录，验证页 1/2/7、20/50/100 每页和筛选后页码重置。
- [ ] **Step 2: 写筛选失败测试。** 产品类别必须来自下拉，主类别过滤项目明细，外观和资料批次进入 API 条件。
- [ ] **Step 3: 运行定向测试确认失败。**
- [ ] **Step 4: 增加 `appearanceId` 查询并维护页码状态。** 总页数变化时将页码限制到有效范围；切换图号/批次视角时重置。
- [ ] **Step 5: 重排基础和更多筛选。** 基础只保留型号/SKU、图号和资料批次入口。
- [ ] **Step 6: 增加分页控件。** 页码过多时显示首尾页和当前页附近，保留上一页/下一页。
- [ ] **Step 7: 添加文件记录专用可换行样式。** 路径使用 `overflow-wrap:anywhere`，操作列不收缩，禁止记录内部横向滚动。
- [ ] **Step 8: 运行定向测试并在 1080/1440 像素窗口检查长路径。**
- [ ] **Step 9: Commit。**

```powershell
git add src/core/drawings src/server/routes/drawings.ts src/renderer/pages/DrawingLibraryPage.tsx src/renderer/styles.css tests/core/drawing-query.test.ts tests/server/drawings-api.test.ts tests/renderer/drawing-library-page.test.tsx
git commit -m "fix: complete drawing library navigation"
```

### Task 4: 正式预留图号受保护删除

**Files:**
- Modify: `src/core/drawings/drawing-types.ts`
- Modify: `src/core/drawings/drawing-repository.ts`
- Modify: `src/core/drawings/drawing-query-service.ts`
- Modify: `src/server/routes/drawings.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/DrawingLibraryPage.tsx`
- Modify: `tests/core/drawing-query.test.ts`
- Modify: `tests/server/drawings-api.test.ts`
- Modify: `tests/renderer/drawing-library-page.test.tsx`

**Interfaces:**
- Produces: `DrawingDeletionPreview` 和 `deleteReservedDrawing(id, confirmed)`。

- [ ] **Step 1: 写删除矩阵测试。** 仅无 PDF、无 BOM、无上一版/来源边、状态为 `reserved` 的正式图号可删；active、voided、historical 均不可删。
- [ ] **Step 2: 运行测试确认失败。**
- [ ] **Step 3: 实现引用摘要和事务内删除。** 历史图号路由明确返回“永久占号，不支持普通删除”。
- [ ] **Step 4: 页面在详情显示删除并列出失败原因。**
- [ ] **Step 5: 验证删除误占号后下一流水号可重新推荐，同时历史/作废号码仍占用。**
- [ ] **Step 6: Commit。**

```powershell
git add src/core/drawings src/server/routes/drawings.ts src/renderer/data/client.ts src/renderer/pages/DrawingLibraryPage.tsx tests/core/drawing-query.test.ts tests/server/drawings-api.test.ts tests/renderer/drawing-library-page.test.tsx
git commit -m "feat: guard deletion of unused reservations"
```

### Task 5: Schema v10 migration

**Files:**
- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migrations.test.ts`
- Modify: `tests/db/backup.test.ts`

**Interfaces:**
- Produces: Schema v10，`bom_items.historical_drawing_id` XOR 约束、BOM 软删除列、`qr_code_files.detected_identifier`。

- [ ] **Step 1: 写 v9 → v10 成功迁移测试。** 验证全部旧 BOM 行仍引用正式图号，所有 v9 表行数和路径不变。
- [ ] **Step 2: 写失败回滚测试。** 注入非法双引用和外键冲突，断言迁移事务回滚并保留 v9。
- [ ] **Step 3: 写备份调用测试。** 现有数据库升级前恰好创建一次 migration backup。
- [ ] **Step 4: 运行数据库测试确认失败。**
- [ ] **Step 5: 实现 `schemaVersionTen` 和迁移后校验。** SQLite 重建 `bom_items` 时复制全部 v9 字段和 ID。
- [ ] **Step 6: 运行数据库测试。**

Run: `pnpm vitest run tests/db/schema.test.ts tests/db/migrations.test.ts tests/db/backup.test.ts`

Expected: PASS，外键检查为空。

- [ ] **Step 7: 对用户数据库副本执行升级和回滚演练。** 不直接修改正式数据库；核对正式图号、739 个历史图号、2,670 个 PDF 索引、19 个产品、42 个二维码和现有 BOM 数量不减少。
- [ ] **Step 8: Commit。**

```powershell
git add src/db/schema.sql.ts src/db/migrations.ts tests/db/schema.test.ts tests/db/migrations.test.ts tests/db/backup.test.ts
git commit -m "feat: add schema v10 maintenance model"
```

### Task 6: 二维码可靠识别与 CRUD

**Files:**
- Modify: `src/core/qr/qr-types.ts`
- Modify: `src/core/qr/qr-file-classifier.ts`
- Modify: `src/core/qr/qr-repository.ts`
- Modify: `src/core/qr/qr-service.ts`
- Modify: `src/core/files/file-repository.ts`
- Modify: `src/server/routes/qr-codes.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/QrCodesPage.tsx`
- Modify: `tests/core/qr-file-classifier.test.ts`
- Modify: `tests/core/qr-service.test.ts`
- Modify: `tests/server/qr-codes-api.test.ts`
- Modify: `tests/renderer/qr-codes-page.test.tsx`

**Interfaces:**
- Produces: `CreateProductQrCodeInput`、`deleteQrCode`、用途列表/新增接口和 `detectedIdentifier`。

- [ ] **Step 1: 写文件名识别测试。** 覆盖 User Manual、Warranty/warranty、Recipe、自定义用途、全角括号标识、错误目录、空标识、歧义产品和歧义用途。
- [ ] **Step 2: 写 CRUD 失败测试。** 同产品同用途重复、文件引用、BOM 引用、停用后启用。
- [ ] **Step 3: 运行定向测试确认失败。**
- [ ] **Step 4: 实现严格解析。** 仅解析文件名和型号根目录，不读取二维码图片内容；不把标识写入 `target_url`。
- [ ] **Step 5: 实现新增、删除和用途管理接口。** 删除冲突返回文件/BOM 引用摘要。
- [ ] **Step 6: 更新页面。** 增加新增、编辑、启停、删除；分开显示业务、文件、匹配状态；空气炸锅展示 Recipe。
- [ ] **Step 7: 运行定向测试并对 `E:\包材资料` 做只读扫描回归。**
- [ ] **Step 8: Commit。**

```powershell
git add src/core/qr src/core/files/file-repository.ts src/server/routes/qr-codes.ts src/renderer/data/client.ts src/renderer/pages/QrCodesPage.tsx tests/core/qr-file-classifier.test.ts tests/core/qr-service.test.ts tests/server/qr-codes-api.test.ts tests/renderer/qr-codes-page.test.tsx
git commit -m "feat: complete extensible QR management"
```

### Task 7: 历史 BOM、两级项目和二维码业务引用

**Files:**
- Modify: `src/core/bom/bom-types.ts`
- Modify: `src/core/bom/bom-repository.ts`
- Modify: `src/core/bom/bom-service.ts`
- Modify: `src/server/routes/boms.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/BomPage.tsx`
- Modify: `src/renderer/pages/bom/BomEditor.tsx`
- Modify: `src/renderer/pages/bom/BomQuery.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/core/bom-service.test.ts`
- Modify: `tests/server/boms-api.test.ts`
- Modify: `tests/renderer/bom-page.test.tsx`

**Interfaces:**
- Produces: `BomDrawingReference = { origin:'planned'; drawingId:number } | { origin:'historical'; historicalDrawingId:number }`。

- [ ] **Step 1: 写候选失败测试。** 当前模式和历史模式均可引用 reserved/active 正式图号；历史模式额外允许同产品的 active/inactive 历史图号并标记状态；未确认产品归属和 voided 正式图号不可选。
- [ ] **Step 2: 写主类别 → 项目明细测试。** 两个入口都使用字典父子关系，不新建 BOM 字典。
- [ ] **Step 3: 写二维码文案和可选折叠测试。** BOM 只引用现有二维码，不创建、编辑或匹配二维码文件。
- [ ] **Step 4: 运行测试确认失败。**
- [ ] **Step 5: 让 BOM 仓储以联合图号引用读写。** 查询、差异和历史详情统一返回完整图号及来源。
- [ ] **Step 6: 更新添加和查询页面。** 增加录入类型，两级项目，长路径换行和打开位置。
- [ ] **Step 7: 运行定向测试和真实历史 BOM 录入流程。**
- [ ] **Step 8: Commit。**

```powershell
git add src/core/bom src/server/routes/boms.ts src/renderer/data/client.ts src/renderer/pages/BomPage.tsx src/renderer/pages/bom src/renderer/styles.css tests/core/bom-service.test.ts tests/server/boms-api.test.ts tests/renderer/bom-page.test.tsx
git commit -m "feat: support historical BOM references"
```

### Task 8: BOM 变更记录受保护删除

**Files:**
- Modify: `src/core/bom/bom-types.ts`
- Modify: `src/core/bom/bom-repository.ts`
- Modify: `src/core/bom/bom-service.ts`
- Modify: `src/server/routes/boms.ts`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/pages/bom/BomQuery.tsx`
- Modify: `tests/core/bom-service.test.ts`
- Modify: `tests/server/boms-api.test.ts`
- Modify: `tests/renderer/bom-page.test.tsx`

**Interfaces:**
- Produces: `deleteBomVersion(id, confirmed)`、`deleteProductBom(productId, modelConfirmation)` 和当前版本回退结果。

- [ ] **Step 1: 写软删除测试。** 覆盖历史记录、当前记录有前驱、当前记录无前驱、已删除记录不可重复删除、整个型号二次确认不匹配。
- [ ] **Step 2: 运行测试确认失败。**
- [ ] **Step 3: 实现事务软删除和 `bom_current` 回退。** 查询默认排除 `deleted_at` 非空记录。
- [ ] **Step 4: 查询页增加记录级删除。** 确认框明确是否改变当前 BOM。
- [ ] **Step 5: 增加独立“删除整个型号 BOM”危险入口。**
- [ ] **Step 6: 运行定向测试。**
- [ ] **Step 7: Commit。**

```powershell
git add src/core/bom src/server/routes/boms.ts src/renderer/data/client.ts src/renderer/pages/bom/BomQuery.tsx tests/core/bom-service.test.ts tests/server/boms-api.test.ts tests/renderer/bom-page.test.tsx
git commit -m "feat: safely remove BOM snapshots"
```

### Task 9: 当前完整包材解析器

**Files:**
- Create: `src/core/outbound/current-material-set.ts`
- Create: `src/core/outbound/outbound-types.ts`
- Modify: `src/core/files/material-batch-service.ts`
- Create: `tests/core/current-material-set.test.ts`

**Interfaces:**
- Consumes: 资料批次、可靠完整图号、当前存在的转曲后文件实例。
- Produces: `buildCurrentMaterialSet(productId, throughBatchId): OutboundMaterialSelection[]`，每项包含槽位、图号、来源批次、文件实例、沿用/冲突/缺失状态。

- [ ] **Step 1: 写累积失败测试。** 覆盖首批、部分更新沿用、同槽位替换、同图号跨批次复制不算本次变更、同号内容变化待确认、不同颜色并存、同批次冲突、缺失转曲后文件、同序号歧义。
- [ ] **Step 2: 运行测试确认模块不存在。**
- [ ] **Step 3: 实现纯函数累积算法。** 槽位使用除流水号外完整编码段；禁止使用文件修改时间。
- [ ] **Step 4: 添加资料批次查询适配。** 不改变现有 `getLogicalMaterials` 行为。
- [ ] **Step 5: 运行测试。**
- [ ] **Step 6: Commit。**

```powershell
git add src/core/outbound src/core/files/material-batch-service.ts tests/core/current-material-set.test.ts
git commit -m "feat: resolve current effective materials"
```

### Task 10: Schema v11 外发资料

**Files:**
- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/schema.test.ts`
- Modify: `tests/db/migrations.test.ts`
- Modify: `tests/db/backup.test.ts`

**Interfaces:**
- Produces: Schema v11 外发联系人、模板、附加段落、签名、包、包项目和邮件草稿表。

- [ ] **Step 1: 写 v10 → v11 成功和回滚测试。** 验证所有 v10 表与行数不变，新表为空，默认签名和模板结构有效。
- [ ] **Step 2: 写路径约束测试。** ZIP 只保存外发输出根目录相对路径，拒绝盘符、根路径和 `..`。
- [ ] **Step 3: 运行数据库测试确认失败。**
- [ ] **Step 4: 实现 `schemaVersionEleven`、备份和迁移后校验。** 联系人不在迁移中写死。
- [ ] **Step 5: 运行数据库测试和用户数据库副本升级演练。**
- [ ] **Step 6: Commit。**

```powershell
git add src/db/schema.sql.ts src/db/migrations.ts tests/db/schema.test.ts tests/db/migrations.test.ts tests/db/backup.test.ts
git commit -m "feat: add schema v11 outbound records"
```

### Task 11: 外发联系人、模板和签名服务

**Files:**
- Create: `src/core/outbound/outbound-reference-repository.ts`
- Create: `src/core/outbound/outbound-reference-service.ts`
- Create: `src/server/routes/outbound-reference.ts`
- Modify: `src/server/start-server.ts`
- Modify: `src/renderer/data/client.ts`
- Create: `tests/core/outbound-reference-service.test.ts`
- Create: `tests/server/outbound-reference-api.test.ts`

**Interfaces:**
- Produces: 联系人、模板、附加段落和签名 CRUD；已被草稿快照使用不阻止修改，但历史草稿文本不回写。

- [ ] **Step 1: 写 CRUD、启停、重复邮箱和删除保护测试。**
- [ ] **Step 2: 写邮件模板变量验证测试。** 仅允许定义的变量，缺失变量返回明确错误。
- [ ] **Step 3: 运行测试确认失败。**
- [ ] **Step 4: 实现仓储、服务和路由。** 默认模板使用结构化占位符，不包含供应商联系人。
- [ ] **Step 5: 运行测试。**
- [ ] **Step 6: Commit。**

```powershell
git add src/core/outbound src/server/routes/outbound-reference.ts src/server/start-server.ts src/renderer/data/client.ts tests/core/outbound-reference-service.test.ts tests/server/outbound-reference-api.test.ts
git commit -m "feat: manage outbound reference data"
```

### Task 12: ZIP 预览与安全生成

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/core/outbound/package-naming.ts`
- Create: `src/core/outbound/outbound-package-repository.ts`
- Create: `src/core/outbound/outbound-package-service.ts`
- Create: `src/server/routes/outbound-packages.ts`
- Modify: `src/server/start-server.ts`
- Modify: `src/core/config/app-paths.ts`
- Modify: `src/core/files/workspace-settings.ts`
- Create: `tests/core/package-naming.test.ts`
- Create: `tests/core/outbound-package-service.test.ts`
- Create: `tests/server/outbound-packages-api.test.ts`

**Interfaces:**
- Produces: `previewPackage(input)` 和 `createPackage(input)`；模式为 `change_only/current_complete`，资料类型为 `initial/update`。

- [ ] **Step 1: 选择维护活跃、支持流式写入和取消的 ZIP 依赖并记录许可证。**
- [ ] **Step 2: 写命名测试。** 固定本地日期 2026-09-10，断言首批和更新完整名称。
- [ ] **Step 3: 写文件安全测试。** 拒绝源文件、缺失文件、工作区逃逸、重复实际路径、过期预览和冲突槽位。
- [ ] **Step 4: 写原子发布和取消测试。** 失败/取消只留下零个最终 ZIP 和零个临时文件。
- [ ] **Step 5: 运行测试确认失败。**
- [ ] **Step 6: 实现预览和生成。** 真正生成前重新解析每个相对路径并验证文件存在、类型和当前索引状态。
- [ ] **Step 7: 保存外发包和文件清单快照。**
- [ ] **Step 8: 运行测试并对资料库副本/只读源目录执行打包验证。**
- [ ] **Step 9: Commit。**

```powershell
git add package.json pnpm-lock.yaml src/core/outbound src/server/routes/outbound-packages.ts src/server/start-server.ts src/core/config/app-paths.ts src/core/files/workspace-settings.ts tests/core/package-naming.test.ts tests/core/outbound-package-service.test.ts tests/server/outbound-packages-api.test.ts
git commit -m "feat: generate verified outbound archives"
```

### Task 13: 外发资料桌面 UI

**Files:**
- Create: `src/renderer/pages/OutboundPage.tsx`
- Create: `src/renderer/pages/outbound/PackageBuilder.tsx`
- Create: `src/renderer/pages/outbound/EmailComposer.tsx`
- Create: `src/renderer/pages/outbound/ContactsManager.tsx`
- Create: `src/renderer/pages/outbound/TemplateSettings.tsx`
- Modify: `src/renderer/layout/AppShell.tsx`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/styles.css`
- Modify: `src/main/preload.cts`
- Modify: `src/main/index.ts`
- Create: `tests/renderer/outbound-page.test.tsx`
- Create: `tests/main/outbound-file-actions.test.ts`
- Modify: `tests/smoke/app-shell.test.tsx`

**Interfaces:**
- Consumes: 外发参考资料与 ZIP 服务。
- Produces: `资料打包｜邮件撰写｜联系人` 页面，以及桌面选择输出目录和打开 ZIP 位置 IPC。

- [ ] **Step 1: 写导航和两种打包模式测试。**
- [ ] **Step 2: 写文件预览、全选/取消全选、缺失警告和冲突阻止测试。**
- [ ] **Step 3: 写联系人 CRUD、模板附加段落、签名和复制操作测试。**
- [ ] **Step 4: 运行测试确认失败。**
- [ ] **Step 5: 实现三段页面和桌面 IPC。** 浏览器预览禁用 ZIP/打开位置并给出明确提示。
- [ ] **Step 6: 实现邮件生成。** 主题默认 ZIP 名称，正文自动生成后保持可编辑；“全部复制”使用可读标签拼接。
- [ ] **Step 7: 运行组件测试和 Playwright 浏览器流程。**
- [ ] **Step 8: Windows 桌面真实验证首批和更新各一次，不发送邮件。**
- [ ] **Step 9: Commit。**

```powershell
git add src/renderer/pages/OutboundPage.tsx src/renderer/pages/outbound src/renderer/layout/AppShell.tsx src/renderer/data/client.ts src/renderer/styles.css src/main tests/renderer/outbound-page.test.tsx tests/main/outbound-file-actions.test.ts tests/smoke/app-shell.test.tsx
git commit -m "feat: add outbound package and email workspace"
```

### Task 14: 重大架构门禁——拆分本地服务进程

**Files:**
- Create: `src/service/entry.ts`
- Create: `src/main/local-service-controller.ts`
- Modify: `src/main/index.ts`
- Modify: `src/server/start-server.ts`
- Modify: `tsconfig.main.json`
- Modify: `package.json`
- Create: `tests/main/local-service-controller.test.ts`
- Modify: `tests/server/application-api.test.ts`

**Interfaces:**
- Produces: `LocalServiceController.start()/stop()/restart()/health()` 和服务启动就绪消息。

- [ ] **Step 1: 在实现前记录用户对重大架构项的明确批准。** 未批准则停止本任务及 Task 15–17，不用网页按钮伪装完整恢复。
- [ ] **Step 2: 写进程生命周期失败测试。** 覆盖启动成功、端口占用、异常退出、重启、新 token 和优雅关闭。
- [ ] **Step 3: 运行测试确认控制器不存在。**
- [ ] **Step 4: 新增服务入口并让 Main 以受控子进程启动。** 数据目录和允许来源通过结构化 IPC/参数传递，不输出 token 到普通日志。
- [ ] **Step 5: Main 等待服务就绪后再显示窗口。**
- [ ] **Step 6: 验证开发和生产桌面构建均能启动，浏览器预览继续使用独立开发服务。**
- [ ] **Step 7: Commit。**

```powershell
git add src/service/entry.ts src/main/local-service-controller.ts src/main/index.ts src/server/start-server.ts tsconfig.main.json package.json tests/main/local-service-controller.test.ts tests/server/application-api.test.ts
git commit -m "refactor: isolate the local planner service"
```

### Task 15: 长任务、进度和取消

**Files:**
- Create: `src/core/tasks/task-registry.ts`
- Create: `src/core/tasks/task-types.ts`
- Create: `src/server/routes/tasks.ts`
- Modify: `src/server/routes/files.ts`
- Modify: `src/server/routes/import.ts`
- Modify: `src/server/routes/outbound-packages.ts`
- Modify: `src/core/files/file-service.ts`
- Modify: `src/core/files/pdf-scanner.ts`
- Modify: `src/core/outbound/outbound-package-service.ts`
- Modify: `src/server/start-server.ts`
- Create: `tests/core/task-registry.test.ts`
- Modify: `tests/core/file-service.test.ts`
- Modify: `tests/core/outbound-package-service.test.ts`
- Create: `tests/server/tasks-api.test.ts`

**Interfaces:**
- Produces: 创建/查询/取消任务 API 和 `TaskContext.report()/throwIfCancelled()`。

- [ ] **Step 1: 写状态机和取消失败测试。** 禁止 completed/failed/finalizing 状态被取消。
- [ ] **Step 2: 写扫描、清库、导入和 ZIP 的取消一致性测试。** 取消前后数据库及最终文件均保持原状态。
- [ ] **Step 3: 运行测试确认失败。**
- [ ] **Step 4: 实现内存任务注册表和短期完成结果保留。**
- [ ] **Step 5: 把扫描和打包拆成准备、finalizing、提交阶段。** finalizing 使用短事务或 ZIP 原子改名。
- [ ] **Step 6: 接入进度计数。**
- [ ] **Step 7: 运行定向测试。**
- [ ] **Step 8: Commit。**

```powershell
git add src/core/tasks src/server/routes/tasks.ts src/server/routes/files.ts src/server/routes/import.ts src/server/routes/outbound-packages.ts src/core/files src/core/outbound/outbound-package-service.ts src/server/start-server.ts tests/core/task-registry.test.ts tests/core/file-service.test.ts tests/core/outbound-package-service.test.ts tests/server/tasks-api.test.ts
git commit -m "feat: add cancellable local tasks"
```

### Task 16: 安全恢复桌面控制

**Files:**
- Create: `src/main/recovery-controller.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/preload.cts`
- Modify: `src/renderer/vite-env.d.ts`
- Modify: `src/renderer/layout/AppShell.tsx`
- Modify: `src/renderer/data/client.ts`
- Modify: `src/renderer/styles.css`
- Create: `tests/main/recovery-controller.test.ts`
- Modify: `tests/smoke/app-shell.test.tsx`
- Create: `tests/renderer/safe-recovery.test.tsx`

**Interfaces:**
- Produces: 原生菜单与 Renderer 共用的 `terminateTask/reloadRenderer/restartService/relaunchApp`。

- [ ] **Step 1: 写恢复动作测试。** 断言重新加载不清库，服务重启刷新 token，完整恢复先请求取消再 relaunch。
- [ ] **Step 2: 写 Renderer 冻结替代路径测试。** 直接调用原生菜单处理器，不依赖 DOM 回调。
- [ ] **Step 3: 运行测试确认失败。**
- [ ] **Step 4: 实现原生菜单 `应用 → 安全恢复` 和恢复控制器。**
- [ ] **Step 5: 实现左下角低干扰状态与恢复面板。**
- [ ] **Step 6: 加入响应慢提示。** 只建议等待/取消/恢复，不自动强杀。
- [ ] **Step 7: Windows 桌面手工制造 Renderer reload、API 子进程退出和可取消扫描，逐项验证。**
- [ ] **Step 8: Commit。**

```powershell
git add src/main src/renderer/vite-env.d.ts src/renderer/layout/AppShell.tsx src/renderer/data/client.ts src/renderer/styles.css tests/main/recovery-controller.test.ts tests/smoke/app-shell.test.tsx tests/renderer/safe-recovery.test.tsx
git commit -m "feat: add desktop safe recovery controls"
```

### Task 17: 端到端验收与最终 code review

**Files:**
- Modify: `tests/e2e/phase-real-usage-outbound.spec.ts`
- Modify: `README.md`
- Review: all changed files

**Interfaces:**
- Consumes: Tasks 1–16。
- Produces: 可供用户预览验收的浏览器和 Windows 桌面构建。

- [ ] **Step 1: 添加端到端流程。** 覆盖产品启停删除、图号分页删除保护、二维码 CRUD/识别、历史 BOM、BOM 删除、两种打包模式、邮件复制和恢复状态。
- [ ] **Step 2: 对 `E:\包材资料` 执行只读扫描。** 记录 PDF/二维码文件实例总数、批次数、当前完整组合、跨批次复用和冲突；验证源文件时间与哈希未变化。
- [ ] **Step 3: 生成测试 ZIP 到独立外发输出目录。** 核对条目数、文件名、来源批次和仅含转曲后文件。
- [ ] **Step 4: 运行完整测试。**

Run: `pnpm test`

Expected: 全部 PASS。

- [ ] **Step 5: 运行类型检查和生产构建。**

Run: `pnpm typecheck`

Expected: exit 0。

Run: `pnpm build`

Expected: exit 0，浏览器与 Electron 输出成功。

- [ ] **Step 6: 运行浏览器流程。**

Run: `pnpm test:e2e`

Expected: 全部 PASS；桌面专属动作显示明确限制。

- [ ] **Step 7: Windows 桌面真实操作验证。** 验证写操作、文件打开、ZIP、复制、服务重启和完整恢复。
- [ ] **Step 8: 执行 code review。** 重点检查占号不变量、路径逃逸、ZIP 条目、删除边界、事务、子进程 token、取消竞态和原始文件只读。
- [ ] **Step 9: 更新 README，记录 Schema v11、外发输出目录、桌面恢复入口和范围外功能。**
- [ ] **Step 10: 提交最终验收记录。**

```powershell
git add tests/e2e/phase-real-usage-outbound.spec.ts README.md
git commit -m "test: verify outbound and recovery workflows"
```

- [ ] **Step 11: 停止。** 汇报最终提交号、分支、Schema、测试、真实资料扫描、ZIP 结果、code review、浏览器与桌面预览方式。不得自动合并 master，不得开始下一 Phase。
