# P0-1 扫描状态与互斥｜实施及验收记录

2026-11-19 · 阶段 B 第一批 · P0-1 提交审核

基准为 `codex/v16-corrections-20261111` 工作树 `/workspace/drawing-number-planner/.worktrees/confirmed-requirements`，起点 `07b9b16205b1adbcab4d19217c833d47fa13926f`，应用 v1.6.2，数据库 Schema26。[第一批 P0 计划](../superpowers/plans/2026-11-19-p0-scan-drawing-refresh.md)

## 改动文件

| 文件 | 实施内容 |
|---|---|
| [file-service.ts](../../src/core/files/file-service.ts#L64) | 全库、型号、类别、后台监听和归档共用一个持锁者。获得锁后登记执行 ID、手动任务 ID（如果有）、归档任务 ID（如果有）、来源、范围、起止时间和进度阶段。竞争请求返回 `SCAN_IN_PROGRESS` 和当前执行者信息，保留正在执行的状态。已有的取消请求写入诊断。 |
| [file-repository.ts](../../src/core/files/file-repository.ts#L149) | 在现有 IMMEDIATE 事务内写入并读回本次成功记录。事务返回之后服务才发布成功 ID，去掉了原先在提交后另查最近成功记录的步骤。 |
| [routes/files.ts](../../src/server/routes/files.ts#L64) · [data/client.ts](../../src/renderer/data/client.ts#L742) | 增加只读、禁缓存的实际扫描状态接口并接入客户端。沿用原最近成功记录接口。 |
| [routes/packaging-tasks.ts](../../src/server/routes/packaging-tasks.ts#L24) · [packaging-monitor.ts](../../src/core/packaging/packaging-monitor.ts#L181) · [packaging-archive.ts](../../src/core/packaging/packaging-archive.ts#L102) | 为类别、后台监听和归档调用标注来源。归档额外标注所属制图任务，原有扫描目录和归档核验继续使用。 |
| [start-server.ts](../../src/server/start-server.ts#L201) | 在当前 dataDir 写 `logs/pdf-scans.jsonl`，以执行 ID 和进程 PID 串联开始、取消请求、结果及放锁。记录捕获失败时的原始错误及进度阶段。 |
| [useScanProgress.ts](../../src/renderer/pages/useScanProgress.ts#L27) · [FilesPage.tsx](../../src/renderer/pages/FilesPage.tsx#L223) | PDF 文件中心区分实际执行中的扫描和本次请求失败。暂时读不到状态时清除旧持有者、显示未知并恢复查询。成功后更新最近成功记录统计。 |
| [PackagingTaskPanel.tsx](../../src/renderer/pages/packaging/PackagingTaskPanel.tsx#L113) | 分开显示 PDF 核验进度和资料库索引。其他扫描正在执行时只显示等待，本任务的归档扫描才显示其执行进度。 |
| [file-service.test.ts](../../tests/core/file-service.test.ts#L94) · [file-repository.test.ts](../../tests/core/file-repository.test.ts#L312) · [scan-progress.test.tsx](../../tests/renderer/scan-progress.test.tsx#L24) | 竞争拒绝、取消请求诊断、查询失败和恢复、旧响应丢弃、事务后段写入失败测试。 |
| [pdf-scan-ownership.spec.ts](../../tests/e2e/pdf-scan-ownership.spec.ts#L21) · [task-termination.spec.ts](../../tests/e2e/task-termination.spec.ts#L33) | 用真实 Chromium、Fastify 和隔离 SQLite 验证页面。测试通过可控屏障保留实际后台扫描，通过 TEMP 触发器注入事务错误。 |

成功 ID 存储于 `file_scan_runs.id`，由仓库的 [INSERT RETURNING](../../src/core/files/file-repository.ts#L195) 分配，和 PDF、批次、历史登记及扫描差异在同一 [IMMEDIATE 事务](../../src/core/files/file-repository.ts#L417) 提交。`GET /api/files/scans/latest` 读取当前库最近成功的 ID。执行 ID 只标识本进程内一次真正取得锁的扫描，手动任务 ID 来自现有任务注册表。被拒绝的请求可能已有手动任务 ID，仍无新的执行 ID 或成功 scanId。归档后续业务确认仍以原有归档流程的完整结果为准。[成功记录读取接口](../../src/server/routes/files.ts#L131)

## 隔离验收及数据对比

测试创建独立临时 dataDir、Schema26 SQLite、资料目录和备份目录。专项 Fastify 使用动态回环端口。两项邻近 UI 回归使用各自独立的 Vite 端口及临时数据。Chromium 每项使用独立浏览器上下文。未启动原生桌面，所以未使用任何桌面 profile。ZC100 与 T40 均为测试夹具，编号和关系不代表现场数据。

| 场景 | 最近成功 scanId | 实际索引及保护结果 |
|---|---:|---|
| 基准 | 1 | 1 条有效 PDF 索引，1 条扫描差异记录。 |
| 后台监听持锁，类别扫描被拒绝 | 1 → 1 | HTTP 409 返回实际执行 ID。独立连接核对全部快照，PDF、差异、批次、归属和文件指纹保持一致。 |
| 后台监听正常提交 | 1 → 2 | 1 条原索引保持 ID、图号关联及文件指纹，新增 1 条有效索引。总计 2 条，无确认缺失。差异记录从 1 条增加至 3 条。 |
| 型号扫描在写入差异时故障 | 2 → 2 | 真实 SQLite 事务回滚，与成功提交后的快照完全一致。无部分结果，无新成功 ID。日志保留原异常与 finalizing 阶段。 |

扫描前后 `sqlite_schema` 定义和迁移记录逐项一致，版本均为 26。`integrity_check` 返回 `ok`，`foreign_key_check` 返回空。测试中已有的正式图号、产品、外观、外观绑定及人工归类审计各 1 条，逐行一致。两份 PDF 的 SHA256 一致。PDF 人工指定、历史占号和 BOM 表在浏览器夹具中为空，未使用该夹具推断生产数据情况。另有仓库测试在待写入历史号及文件变化的条件下注入事务错误，验证相关快照回滚。记录包含测试数据和哈希。[数据库对比证据](evidence/p0-1/scan-ownership-evidence.json)

## 实际测试命令

```bash
npm run typecheck
npm run build
npm test -- --maxWorkers=1 tests/core/file-repository.test.ts tests/core/file-service.test.ts tests/core/task-registry.test.ts tests/server/tasks-api.test.ts tests/server/packaging/packaging-scan-scope.test.ts tests/core/packaging/packaging-monitor.test.ts tests/renderer/scan-progress.test.tsx tests/renderer/files-page.test.tsx tests/core/packaging-task-service.test.ts tests/renderer/packaging-workflow.test.tsx
npm run test:e2e -- --config /tmp/planner-p01-playwright.config.cjs pdf-scan-ownership.spec.ts pdf-list-groups.spec.ts task-termination.spec.ts
git diff --check
```

浏览器专项配置使用当前工作树的 `tests/e2e` 绝对路径、`workers: 1`、`reporter: 'line'`、`outputDir: '/tmp/planner-p01-browser-output'`、`use: { headless: true, launchOptions: { executablePath: '/usr/bin/chromium' } }`，由每个用例自己启动隔离服务。

- 通过：Vitest 10 个文件、187 项，Chromium 3 项，类型检查、源码构建和差异空白检查。最终运行无失败。 [Vitest](evidence/p0-1/vitest.log) · [Chromium](evidence/p0-1/playwright.log)
- 初次单元回归有一条仓库断言仍使用旧返回结构。更新断言后重跑。浏览器取证初次缺少进入任务详情及打开扫描详情的操作，补齐操作后重跑。
- 未运行整仓测试、Windows 原生桌面、正式库或现场资料。也未验证跨进程退出、阻塞 I/O 收尾、重启重试或默认超时。构建给出现有包体积提示。

## 实际页面截图

- [PDF 文件中心显示后台监听持锁及进度](evidence/p0-1/pdf-watcher-running.png)
- [扫描完成并显示成功记录及统计](evidence/p0-1/pdf-watcher-complete.png)
- [制图任务详情分开显示文件核验和资料库索引](evidence/p0-1/task-file-vs-index.png)

## 已知限制与回滚

当前验证的是同一服务进程的扫描互斥和 SQLite 提交原子性。现有多分支读取在首个异常返回后仍可能有底层读取尚未收尾。跨进程互斥、真正退出确认、阻塞 I/O 与超时阈值归 P0-2。120 秒未设为默认值。此次最近成功统计更新与 P0-4 的 PDF 匹配列表及 ZC 归类候选联动是两个独立范围。正式归属仍由既有人工入口操作。

E-01 迁移检查入口、E-02 PDF 上传、E-03 网格视图、E-04 实际运行版本、E-05 实际 ZC/外观 ID、E-06 现场扫描故障日志均保持待核实。

需要回退时，只撤销本批文件清单中的源码和测试差异，按基准构建。Schema 与数据库向后兼容，这一步无需恢复、删除、清理或切换数据库。保留此前审计资料与现场文件。未发布安装包。停在 P0-1，等待审核后才进入 P0-2。
