# P0-3 正式占号图号显示待启动

2026-11-19 · 阶段 B 第一批 · 提交审核

在隔离工作树 codex/v16-corrections-20261111 上实施，基准 HEAD 07b9b16205b1adbcab4d19217c833d47fa13926f。已验收的 P0-2 继续保留。对照代码发现，正式占号一直写入 reserved，之前图号库将除 active 以外的状态统一显示成已停用，停用筛选的 SQL 也包含了 reserved。

## 完整状态映射

| 读取值或标记 | 来源及业务含义 | 图号库列表、详情和筛选 |
|---|---|---|
| reserved | Schema26 正式图号。已占号，等待用户启用。 | 黄色「待启动」。独立筛选并计数。详情中当前值可见，用户可用原有启用、停用流程。 |
| active | Schema26 正式图号或历史扫描图号。业务上启用。 | 绿色「使用中」。两种来源都进入使用中筛选和计数。 |
| voided | Schema26 正式图号的停用状态。 | 「已停用」并计入停用筛选。沿用原启用流程。 |
| inactive | Schema26 历史图号的停用状态，也是停用筛选的兼容查询值。 | 「已停用」。筛选值 inactive 匹配 voided 和 inactive，原始状态分别保留。既有精确 voided 查询继续可用。 |
| historical | 旧读取层曾以固定值标识历史扫描来源。Git 变更 7a5ac22 将该 SQL 投影换为历史表真实状态。Schema26 两张图号表均无此状态值，现有 API 类型保留兼容值。 | 中性「历史记录 · 状态待核实」。详情禁用启停。现有 historical 状态查询保持原始值匹配，历史来源仍通过 origin 区分。 |
| 未知状态或空值 | 兼容或异常响应的值。 | 中性「未知状态」。不计入三种状态筛选，详情禁用启停。 |
| deleted_at 非空，retain_occupied | 删除标记与业务状态独立，保留号码占用。 | 优先显示「删除·保留占号」。沿用回收站、恢复与原占号保护。详情禁用启停。 |
| deleted_at 非空，release | 已删除且已释放。 | 优先显示「删除·已释放」。保留回收站原口径。详情禁用启停。 |
| deleted_at 非空，删除方式缺失 | 兼容删除数据。 | 只显示「已删除」，详情禁用启停。 |

依据为 [Schema26 正式图号状态约束](../../src/db/schema.sql.ts#L44)、[历史表状态约束](../../src/db/schema.sql.ts#L329)、[当前联合类型](../../src/core/drawings/drawing-types.ts#L3) 和 [当前读取 SQL](../../src/core/drawings/drawing-repository.ts#L89)。历史语义用 `git show 7a5ac22^:src/core/drawings/drawing-repository.ts` 核对了旧版固定投影。未读取生产库，未知值用前端响应夹具验证。

## 修改文件与位置

| 文件 | 本次修改 |
|---|---|
| [drawing-repository.ts](../../src/core/drawings/drawing-repository.ts#L205) | 从停用筛选排除 reserved。列表查询、导航计数继续共用查询条件。 |
| [drawing-library-presentation.ts](../../src/renderer/pages/drawing-library-presentation.ts#L5)、[DrawingLibraryPage.tsx](../../src/renderer/pages/DrawingLibraryPage.tsx#L391) | 列表和详情共用状态徽标。增加待启动筛选。详情保留原主动启停，还原当前值，并禁止对只读状态发请求。 |
| [v41-drawings.css](../../src/renderer/pages/v41-drawings.css#L5) | 待启动使用黄色，使用中保持绿色。兼容、未知和删除使用中性色。 |
| [data/client.ts](../../src/renderer/data/client.ts#L49)、[drawing-library-mock.ts](../../src/renderer/pages/drawing-library-mock.ts#L70) | 图号响应类型与现有后端联合类型对齐。开发预览使用与后端一致的已停用筛选。 |
| [drawing-query.test.ts](../../tests/core/drawing-query.test.ts#L575)、[drawing-library-page.test.tsx](../../tests/renderer/drawing-library-page.test.tsx#L911)、[drawing-status.spec.ts](../../tests/e2e/drawing-status.spec.ts#L19) | 验证状态、筛选和数量、兼容和删除、实际占号、重开、主动启停、唯一性以及前后数据对照。 |

同步 NEXT_STEPS.md、docs/progress.json、PROGRESS.md 和 progress.html。业务写入沿用原规划和图号启停服务。

## 隔离验证与证据

浏览器流程实际确认占号，随即打开图号库详情显示黄色待启动。页面刷新后仍是待启动。随后关闭浏览器客户端及真实服务进程，启动新服务并用全新 Chromium 上下文打开同一隔离库，待启动状态继续存在。验收使用 Linux，原生 Windows/Electron 未运行。

- 使用同一完整图号提交重复占用，API 返回 409，图号和绑定没有新增行。
- 同一条新正式图号的状态由 reserved 经显式启用变为 active，经显式停用变为 voided。图号 ID、完整图号、流水号、产品、外观及绑定保持一致。
- 初始筛选中 2 条待启动、1 条使用中、1 条已停用。启用后待启动计数减少 1。停用后 2 条记录符合已停用，另有 1 条独立回收站夹具。核对列表和导航 API 结果。
- 对照完整 SQLite 表结构、迁移记录、产品和外观记录、正式图号身份和绑定、历史图号及归类审计。Schema26 保持一致，完整性检查为 ok，外键检查为空。[数据库前后对照](evidence/p0-3/drawing-status-evidence.json)

实际截图：[新占号待启动详情](evidence/p0-3/drawing-pending-detail.png) · [重开后待启动筛选](evidence/p0-3/drawing-pending-filter.png) · [启用详情](evidence/p0-3/drawing-active-detail.png) · [已停用筛选](evidence/p0-3/drawing-inactive-filter.png) · [回收站详情](evidence/p0-3/drawing-recycle-detail.png)

## 测试命令与结果

```bash
npm run typecheck
npm run build
npm test -- --maxWorkers=1 tests/core/planning-reservation.test.ts tests/core/drawing-query.test.ts tests/core/drawing-deletion-service.test.ts tests/core/drawing-association.test.ts tests/server/planning-api.test.ts tests/server/drawings-api.test.ts tests/renderer/drawing-library-page.test.tsx tests/renderer/drawing-v41-page.test.tsx tests/renderer/drawing-library-mock.test.ts tests/renderer/drawing-library-origin-column.test.tsx
npm run test:e2e -- --config /tmp/planner-p01-playwright.config.cjs drawing-status.spec.ts planning-workspace.spec.ts
git diff --check
```

Playwright 配置沿用 P0-1，指向当前工作树的 tests/e2e，单 worker，使用无头 Chromium，各测试使用临时数据目录。

- 类型检查与源码构建通过。[类型检查](evidence/p0-3/typecheck.log) · [构建](evidence/p0-3/build.log)
- Vitest 专项及关联回归 10 个文件、169 项通过。[测试日志](evidence/p0-3/vitest.log)
- Chromium 端到端 3 项通过。首轮有一项因测试脚本错误发送空状态参数失败，修正为与页面一致后重跑通过。[测试日志](evidence/p0-3/playwright.log)
- 全项目测试套件及 Windows 原生窗口未执行。E-01 至 E-06 仍待现场核实。

## 回滚

只撤销修改清单内的 P0-3 查询条件、状态映射及界面差异，再构建。data/client.ts 是 P0-2 共用文件，回滚本轮时只还原 DrawingView.status 的类型差异。已占号码、历史记录及 Schema26 无需恢复或清理。正式库未接入，P0-4 未开始。
