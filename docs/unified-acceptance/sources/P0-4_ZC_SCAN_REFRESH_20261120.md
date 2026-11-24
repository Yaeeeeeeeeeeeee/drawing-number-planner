# P0-4 ZC PDF 匹配结果与归类候选刷新

2026-11-20 · 阶段 B 第一批 · 提交审核

隔离工作树 `codex/v16-corrections-20261111`，HEAD `07b9b16205b1adbcab4d19217c833d47fa13926f`。P0-3 已通过用户隔离验收。测试通过临时 dataDir、资料目录、内置备份目录和回环端口运行独立 Schema26 服务。

## 实施及改动位置

扫描索引已提交时，原 PDF 页面最多从本页任务状态更新摘要，图号库仍依赖原列表缓存和手动打开的诊断快照。后台监听和归档提交并未通知这两个读取链路。

| 文件和位置 | 修改 |
|---|---|
| [query-cache.ts](../../src/renderer/data/query-cache.ts#L30) | 每个 API 连接共用成功扫描观察器。页面打开立即读取最近成功记录，可见期间每 1.5 秒检查，离开后停轮询。只有比已观察 ID 更新的成功记录驱动 PDF 和图号读取缓存失效。连接内的各页面对同一 ID 分别去重。 |
| [client.ts](../../src/renderer/data/client.ts#L538) | 手动全库、类别、型号任务成功后将已有结果中的 scanId 交给观察器。归档通过同一持久化读取观察，避免与普通写操作通知重复刷新。失败、竞争拒绝、取消均不产生刷新依据。 |
| [FilesPage.tsx](../../src/renderer/pages/FilesPage.tsx#L250) | 以当前已应用的筛选、范围和已加载页数刷新文件列表、批次目录和计数。保留仍在结果中的勾选、当前记录和展开状态。已打开的扫描变化详情切换到最新成功记录，迟到结果丢弃。 |
| [DrawingLibraryPage.tsx](../../src/renderer/pages/DrawingLibraryPage.tsx#L59) | 同步刷新当前列表、导航、选中的详情和已打开的候选诊断。诊断保留打开时的图号集合，使用原有只读接口。新诊断进行中暂停确认，读取失败保留上次预览及错误，服务端原指纹校验继续生效。 |
| [query-cache.test.ts](../../tests/renderer/query-cache.test.ts#L27)、[client-cache-invalidation.test.ts](../../tests/renderer/client-cache-invalidation.test.ts#L43)、[drawing-library-page.test.tsx](../../tests/renderer/drawing-library-page.test.tsx#L1017) | 验证重复成功 ID、迟到 ID 和列表及诊断响应、失败与并发拒绝、筛选及勾选。 |
| [zc-scan-refresh.spec.ts](../../tests/e2e/zc-scan-refresh.spec.ts#L27) | 通过真实服务与 Chromium 两个标签验证监听、归档和手动扫描，核对八个外观版本、前后数据及显式归类。 |

成功依据仍为 `file_scan_runs.id`。由 `FileRepository.replaceScan` 在索引事务内写入，`GET /api/files/scans/latest` 按 ID 降序读最近一条成功记录。后台监听和归档继续调用已有扫描服务。图号诊断的自动刷新只调用 `association-preview`。手动「自动归类」和「确认修正关联」仍走原入口、原校验和审计。同步更新 NEXT_STEPS.md、docs/progress.json、PROGRESS.md 和 progress.html。[索引事务](../../src/core/files/file-repository.ts#L195) · [读取接口](../../src/server/routes/files.ts#L131) · [监听](../../src/core/packaging/packaging-monitor.ts#L180) · [归档](../../src/core/packaging/packaging-archive.ts#L102)

## 四个 ZC 产品与八个外观

以下均为隔离测试 ID 和图号。每个单元格先列外观版本 ID，再列对应图号。这些 ID 不代表现场产品。

| 型号 | 测试 SKU | 产品 ID | 1 号外观 | 2 号外观 |
|---|---|---:|---|---|
| ZC100 | FIXZC1 | 1 | 1 / 02.0401.010.0401001 | 2 / 02.0401.020.0401001 |
| ZC100（WB55） | FIXZC2 | 2 | 3 / 02.0402.010.0401001 | 4 / 02.0402.020.0401001 |
| ZC200 | FIXZC3 | 3 | 5 / 02.0403.010.0401001 | 6 / 02.0403.020.0401001 |
| ZC200（WB55） | FIXZC4 | 4 | 7 / 02.0404.010.0401001 | 8 / 02.0404.020.0401001 |

八个明确匹配文件通过各自的产品 ID 和外观版本 ID 查询得到，兄弟外观文件不出现在同一外观查询中，图号详情保留同一 ID 组合。历史图号只出现唯一产品证据时，候选外观仍是空值，沿用已有诊断规则。已有人工确认的历史图号继续保留其明确外观版本。

## 文件匹配与归类前后

| 阶段 | 最近成功 scanId | PDF 全局结果 | 图号库 |
|---|---:|---|---|
| 基线 | 1 | 7 条，5 已匹配、2 待确认 | 打开的诊断中，测试候选缺少产品依据 |
| 后台监听提交后 | 9 | 15 条，13 已匹配、2 待确认 | 出现新增历史图号，导航计数增加 1，诊断同步显示唯一候选及双产品歧义 |
| 制图归档后 | 13 | 16 条，14 已匹配、2 待确认 | 已打开的诊断重新读取，归档记录的 index_scan_id 同为 13 |
| 用户手动全库扫描后 | 14 | 16 条，原文件无变化 | 未产生正式归属写入 |

浏览器保留已提交关键词、原 PDF 勾选和打开的候选诊断。切出并返回 PDF 文件中心与图号库后，都能读取最新列表。文件名包含两个有效图号的 PDF 仍为待确认，未获得图号绑定。另一个历史图号在两个产品目录同时出现，两条不同产品 ID 的候选均保留。强制脱钩的旧 PDF 在同一完整图号由新记录重新占用后，仍为待确认，与新旧图号均保持脱钩。

## 数据与文件保护

- 自动刷新前后，11 条正式图号、12 条外观绑定、1 条图号归类审计、1 条 PDF 人工归纳和对应审计、1 条强制释放和对应脱钩均逐字段相同。比较了 4 条产品记录、8 条外观版本和 3 条基线历史图号的身份及业务状态。
- 人工归类独立验证。用户在页面选定唯一候选并点击「自动归类」后，新增 1 条对应审计，双产品歧义仍保留。
- Schema26 完整表结构和迁移记录一致。SQLite 完整性检查为 `ok`，外键检查为空。7 份基线 PDF 的 SHA256 逐一相同。索引增加的是隔离资料目录中新加入或经既有归档流程提交的文件。正式数据库、正式资料和发布环境均未接入。[数据库与 PDF 前后对照](evidence/p0-4/zc-scan-evidence.json)

## 实际页面截图

- [图号库候选诊断，扫描前](evidence/p0-4/zc-drawing-diagnosis-before.png)
- [图号库候选诊断，监听提交后自动更新](evidence/p0-4/zc-drawing-diagnosis-after.png)
- [PDF 文件中心，监听提交后自动更新](evidence/p0-4/zc-pdf-after-watcher.png)
- [PDF 文件中心，归档提交后自动更新](evidence/p0-4/zc-pdf-after-archive.png)
- [用户主动归类及审计结果](evidence/p0-4/zc-manual-classification.png)

## 测试命令与结果

```bash
npm run typecheck
npm run build
npm test -- --maxWorkers=1 tests/core/drawing-association.test.ts tests/core/v3-drawing-product-association.test.ts tests/core/product-scoped-scan.test.ts tests/core/packaging/packaging-monitor.test.ts tests/core/packaging-task-service.test.ts tests/core/v5-force-release.test.ts tests/server/files-filters-scope.test.ts tests/server/packaging/packaging-scan-scope.test.ts tests/renderer/drawing-library-page.test.tsx tests/renderer/files-page.test.tsx tests/renderer/query-cache.test.ts tests/renderer/client-cache-invalidation.test.ts tests/renderer/scan-progress.test.tsx
npm run test:e2e -- --config /tmp/planner-p01-playwright.config.cjs zc-scan-refresh.spec.ts drawing-status.spec.ts pdf-scan-ownership.spec.ts pdf-scan-recovery.spec.ts pdf-list-groups.spec.ts
git diff --check
git diff --exit-code -- src/db
```

- 类型检查和源码构建通过。[类型检查](evidence/p0-4/typecheck.log) · [源码构建](evidence/p0-4/build.log)
- Vitest 13 个文件、251 项通过。[Vitest 日志](evidence/p0-4/vitest.log)
- Chromium 5 项通过，包含 P0-4 和既有占号状态、扫描互斥、恢复及 PDF 分组回归。[Playwright 日志](evidence/p0-4/playwright.log)
- 早期执行修正了两个测试夹具问题。强制脱钩用例补上同码重新占用，以核对旧文件不会被新图号认领。迟到列表响应夹具补上关联产品 ID，使型号渲染符合真实记录。正式逻辑和数据保护规则沿用原实现。

Playwright 沿用 P0-1 临时配置，testDir 指向隔离工作树 `tests/e2e`，使用 `/usr/bin/chromium`、无头模式和单 worker。原生 Windows、全项目测试套件、E-01 至 E-06 的现场事项未执行或仍待核实。

## 回滚

仅撤销本报告所列 P0-4 差异，再重新构建。client.ts、FilesPage.tsx、DrawingLibraryPage.tsx 及两个 renderer 测试文件含前序 P0 已验收差异，按本轮修改逐段撤销，保留前序工作。无需回滚 Schema 或数据库数据。第一批提交审核后暂停，下一步等待用户安排整体重新验收。
