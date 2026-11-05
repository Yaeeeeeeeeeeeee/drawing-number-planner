# 图号规划器：业务流程与可用性修正阶段 Implementation Plan

> 状态：待用户确认。本文件只定义实施顺序；当前不执行代码、数据库或 UI 修改。

**目标：** 在不改变正式图号算法、不提前开发外发/二维码/同步的前提下，修复共享写请求、BOM 可用性、PDF 失效索引和图号生命周期维护，并按 P0/P1/P2 交付。

**起始提交：** `55b6af6e49ae4408da593bd07f08393653b23a9f`

**实施方法：** 用户批准后建立独立 `codex/business-flow-usability-correction` 工作树/分支。每项先写失败测试，再做最小实现并运行对应测试。任何 BOM Schema 任务必须等待真实 BOM 字段映射再次确认。

## 0. 实施前确认门槛

### Task 0.1：确认文档与 BOM 原始字段

1. 用户确认 Design Document 和本计划；
2. 用户重新提供可读取的真实 BOM 截图或非空表格；
3. 更新设计文档中的完整字段映射；
4. 用户单独确认 BOM 字段映射；
5. 只有第 4 步完成后，Task 5 及其后涉及 BOM Schema 的任务才可开始。

本任务不写业务代码。

### Task 0.2：建立隔离分支并验证基线

**验证：** `git status --short`、`git rev-parse HEAD`、完整单元/服务/渲染测试、生产构建。

**要求：** 工作树从指定提交开始；预览和桌面版使用独立验收数据目录，不直接拿真实公司资料库做破坏性测试。

## 1. P0：共享写请求令牌恢复

**修改文件：**

- `src/renderer/data/client.ts`
- `tests/renderer/api-client.test.ts`
- 如需统一错误契约：`src/server/security/local-access.ts`、`tests/server/local-access.test.ts`

### Task 1.1：先增加失败回归测试

覆盖：首次令牌成功；写请求返回 `INVALID_TOKEN`；客户端清除旧令牌、重新请求 `/api/session`、仅重放原写请求一次；重放仍失败时返回原始结构化错误；非 `INVALID_TOKEN` 不重试；并发失效请求共享一次刷新。

### Task 1.2：最小修复共享请求层

把令牌获取、失效和单次重放集中在 client，不在字典、产品、BOM、文件页面分别打补丁。

### Task 1.3：模块回归

运行 API client、字典页、产品页、文件设置/扫描、BOM 保存相关测试。增加一个跨模块用例证明后端令牌轮换后停用与其他写操作都恢复。

## 2. P0：PDF 失效索引清理

**修改文件：**

- `src/core/files/file-repository.ts`
- `src/core/files/file-service.ts`
- `src/core/files/file-types.ts`
- `src/server/routes/files.ts`
- `src/renderer/data/client.ts`
- `src/renderer/pages/FilesPage.tsx`
- `tests/core/file-repository.test.ts`
- `tests/core/file-service.test.ts`
- `tests/server/files-api.test.ts`
- 新增/更新 `tests/renderer/files-page.test.tsx`

### Task 2.1：仓储层安全测试

先证明：只能删除 `is_present = 0`；单项和批量均事务化；传入存在文件或不存在 ID 时整体拒绝；删除 PDF 索引后历史图号行不变；占号查询仍返回原号码。

### Task 2.2：服务与 API

新增预览/清理契约，批量 ID 设置上限并拒绝重复/非法 ID。响应返回清理数量。API 不接受文件路径，避免任意路径操作。

### Task 2.3：文件中心 UI

缺失筛选下提供单选、多选、全选当前页、批量清理和二次确认。确认文案明确“只清理索引，不删除磁盘文件，不释放历史图号”。成功后刷新列表、分页和扫描统计。

### Task 2.4：验证真实问题副本

对验收数据库副本验证 95 条缺失索引可清理，`historical_drawing_numbers` 数量和占号查询结果前后相同。不得直接修改用户真实数据库。

## 3. P0：图号详情、生命周期和文件登记

**修改文件：**

- `src/core/drawings/drawing-types.ts`
- `src/core/drawings/drawing-repository.ts`
- `src/core/drawings/drawing-query-service.ts`
- `src/server/routes/drawings.ts`
- `src/renderer/data/client.ts`
- `src/renderer/pages/DrawingLibraryPage.tsx`
- 对应 core/server/renderer 测试

### Task 3.1：详情读取测试

正式图号详情返回产品身份、状态、源文件列表、转曲后文件列表、相对路径、是否存在和当前 BOM 使用信息。历史图号详情保持只读占用语义。

### Task 3.2：状态变化测试与实现

允许 `reserved → active`、`reserved/active → voided`；拒绝普通 UI 恢复作废；状态更新不改变 `full_code`，不删除 PDF，不改变历史占用查询。API 使用明确动作和二次确认。

### Task 3.3：关联现有索引文件

先测试只有当前存在、位于资料根目录且为 PDF 的索引可关联；关联时在同一事务内设置 `drawing_id`、清除互斥的 `historical_drawing_id`、更新匹配状态和源/转曲后类型；不移动、不删除、不重命名磁盘文件。

### Task 3.4：详情 UI

在现有详情抽屉内增加业务状态、两个文件区、BOM 使用情况和明确操作。文件缺失与业务状态分开展示。

## 4. P1：Windows 打开文件位置

**修改/新增文件：**

- `src/main/index.ts`
- 新增 `src/main/preload.ts`
- 新增桌面 IPC/路径校验模块及其测试
- 渲染层桌面能力类型声明
- `src/renderer/pages/DrawingLibraryPage.tsx`
- `src/renderer/pages/FilesPage.tsx`
- `tsconfig.main.json`（仅在编译 preload 必需时）

### Task 4.1：安全边界测试

IPC 只接受文件索引 ID；服务端解析资料根目录 + 相对路径；拒绝目录穿越、绝对路径、缺失文件、`is_present = 0` 和资料根目录越界。

### Task 4.2：桌面 bridge

使用 context isolation preload 暴露单一 `showFileInFolder(pdfFileId)` 能力。主进程校验后调用 Windows 资源管理器选中文件。不得暴露通用 shell、任意路径或 Node API。

### Task 4.3：浏览器降级

渲染层检测桌面能力；浏览器预览显示“请在 Windows 桌面版打开文件位置”，不调用不存在的 bridge，不显示网络错误。

### Task 4.4：桌面与浏览器流程验证

用临时资料根目录验证：一份源文件、一份转曲后文件、缺失文件、同图号多文件选择和浏览器提示。

## 5. P0/P1：BOM 字段映射冻结与数据库迁移

> 阻塞条件：Task 0.1 的真实 BOM 字段映射未确认时必须停止，不得猜测继续。

**预计修改文件：**

- `src/db/schema.sql.ts`
- `src/db/migrations.ts`
- `tests/db/migrations.test.ts`
- `src/core/bom/*`
- `src/server/routes/boms.ts`
- `src/renderer/data/client.ts`
- `src/renderer/pages/BomPage.tsx`
- BOM core/server/renderer/e2e 测试

### Task 5.1：冻结目标 Schema

根据确认后的映射明确：产品级 BOM 快照、明细适用颜色/白色引用、业务变更日期、软删除、真实规格字段、旧 `quantity` 的兼容处理。把最终表结构补入 Design Document 后再编码。

### Task 5.2：先写迁移测试

准备 v5 真实形态夹具，覆盖：多个产品+颜色快照、空快照、备注、当前指针、停用/作废图号。验证升级后记录数量、外键、快照顺序、备注、业务日期默认值和当前 BOM 都可解释。

业务日期旧数据默认采用 `date(created_at)` 并标记为迁移推定值；UI 允许用户后续修正。不得把系统时间静默当作已确认业务日期。

### Task 5.3：备份与失败回滚验证

在数据库副本上验证：migration 前自动备份；中途约束失败时原数据库版本和全部数据保持不变；成功后外键检查通过；备份可打开并保留 v5 数据。只有验证通过才允许在实际应用启动迁移。

### Task 5.4：仓储与服务重构

按产品读取当前 BOM 和历史；候选允许 `reserved/active`，不检查文件存在；明确返回空候选原因统计；禁止 `voided`；保留同型号白色引用校验；不允许无意保存空快照。

### Task 5.5：删除历史记录

软删除需二次确认。删除当前快照后安全回退到最近未删除快照；没有时清除当前指针。已删除记录默认不展示，但审计数据仍保留。

## 6. P1：BOM 页面可用性

### Task 6.1：产品级入口和业务日期

移除顶层 BOM 颜色选择，以产品为入口。增加必填业务变更日期和日期筛选。`created_at` 仅在辅助信息中显示。

### Task 6.2：候选选择反馈

正式图号下拉显示业务状态和颜色。无候选时按服务返回原因提示：无该项目正式图号、只有其他颜色、只有历史占号、图号已作废等。明确说明文件缺失不影响引用。

### Task 6.3：白色共用、数量和备注

按确认后的明细适用颜色模型实现白色共用；不再保留无意义的数量输入，旧值仅兼容；备注在编辑、当前 BOM、历史详情中均显示。

### Task 6.4：历史视觉层级与删除

历史展开区使用清晰标题、业务日期、边界和背景；删除操作二次确认；当前与历史状态刷新一致。

### Task 6.5：BOM 端到端验收

覆盖：产品选择、同色图号、引用白色、已占号可引用、文件缺失仍可引用、作废不可引用、备注显示、业务日期筛选、删除非当前/当前快照、并发冲突。

## 7. P1：产品身份与导航

**修改文件：**

- `src/renderer/layout/AppShell.tsx`
- 相关 CSS 与渲染测试
- 需要展示产品上下文的现有页面

### Task 7.1：导航分组

按“日常工作 / 基础资料”分组并把图号规划设为默认入口；外发资料保持未开放。不新增产品工作台。

### Task 7.2：统一产品显示

各页面统一展示 `SKU · 型号`，内部仍传 `product_id`。不能以型号字符串重新关联业务数据。

## 8. P2：编码字典主从 UI

**修改文件：**

- `src/renderer/pages/DictionariesPage.tsx`
- `tests/renderer/dictionaries-page.test.tsx`
- 必要样式

### Task 8.1：一级入口测试

顶部只出现品牌、品类尺寸、外观、颜色、主类别，不出现独立项目明细和层数标签。

### Task 8.2：主类别 → 项目明细

选择主类别后只显示 `parentId` 匹配的项目明细；新增、改名、停用沿用现有 API 和父子校验。层数作为主类别业务区辅助入口，但数据类型继续是 `layer_count`。

### Task 8.3：Excel 关系回归

运行真实规则夹具，确认电子元件类/铭牌类/提示贴纸类/印刷件类/包装类的项目父子关系和层数独立导入未改变，图号编码算法测试结果完全一致。

## 9. P2：历史产品候选

**预计修改文件：** 历史查询服务、产品服务/API、产品页及对应测试。

### Task 9.1：候选聚合

按已可靠解析的目录上下文分组，只输出 SKU、型号、产品类别完整且未对应正式产品的候选；歧义、重复 SKU、目录格式异常进入提示，不自动创建。

### Task 9.2：人工确认

用户补齐品牌、品类尺寸、默认外观后创建正式产品；事务内关联可唯一匹配的历史图号。取消/忽略不会改变占号状态。

如果实现调查证明必须持久保存忽略状态，先补充最小 Schema 设计和迁移说明，再请求用户确认；不得直接加表。

## 10. P2：迁移检查批量操作

增加当前页全选、多选和批量确认。服务端逐项执行现有校验；任何冲突/歧义项不自动导入。批量写入前继续执行既有数据库备份，事务失败整体回滚。

## 11. 阶段验证与 code review

按顺序执行：

1. 全部自动化测试；
2. TypeScript 类型检查；
3. 生产构建；
4. 数据库迁移备份/成功/失败回滚验证；
5. 浏览器预览流程验证；
6. Windows 独立桌面流程验证，包括打开文件位置；
7. 使用 `E:\包材资料` 前先做只读扫描和清理预览，不在自动测试中移动、删除或重命名真实文件；
8. 对 P0/P1/P2 范围、图号算法不变、绝对路径未入库、历史占号不释放进行 code review；
9. 修复 review 发现的问题并重新执行受影响测试和最终全套验证；
10. 向用户汇报和提供预览，等待确认，不自动合并 master，不开始下一 Phase。

## 12. 提交建议

按明确边界形成小提交，例如：

1. `fix: recover expired local write sessions`
2. `feat: clean missing pdf index records safely`
3. `feat: maintain drawing lifecycle and file links`
4. `feat: open indexed files in windows explorer`
5. `feat: migrate bom to confirmed product model`
6. `fix: make bom editing and history usable`
7. `refactor: prioritize daily workflow navigation`
8. `refactor: organize dictionaries by encoding hierarchy`
9. `feat: confirm historical product candidates`
10. `feat: batch confirm migration candidates`

任何提交不得混入二维码、服务器同步、完整外发、批量重命名或新的产品工作台。
