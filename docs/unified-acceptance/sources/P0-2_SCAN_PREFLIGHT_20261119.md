# P0-2 补充修复｜目录预检纳入扫描互斥

2026-11-19 · 隔离工作树 codex/v16-corrections-20261111 · 提交审核

型号和类别扫描进入统一的 FileService 所有者后，才开始检查根目录、目录结构和产品归属。界面显示「准备扫描」和「正在检查目录」。目录范围解析前，状态保留执行 ID、任务 ID 和用户请求的型号 ID 或类别。解析后，同一所有者继续遍历已校验的实际目录。

## 修改文件

| 文件 | 修改 |
|---|---|
| [file-service.ts](../../src/core/files/file-service.ts#L216) | 支持在持锁状态下异步解析目录，公开预检阶段和目标。竞争请求立即返回 409 及当前执行 ID。取消、失败和重启按原 P0-2 收尾机制处理。 |
| [packaging-workspace.ts](../../src/core/packaging/packaging-workspace.ts#L135) | 将供扫描使用的目录元数据读取改成异步。每项读取开始前和返回后检查取消信号，原样等待已发出的读取。保留历史路径、合并身份、共享目录、大小写和符号链接校验。 |
| [packaging-monitor.ts](../../src/core/packaging/packaging-monitor.ts#L172) | 监听目录观察使用异步检查，避免同时有手动扫描时同步阻塞进程。实际发起的监听扫描在自己的扫描锁内复核目标目录归属。 |
| [packaging-tasks.ts](../../src/server/routes/packaging-tasks.ts#L24)、[task-registry.ts](../../src/core/tasks/task-registry.ts#L70)、[files.ts](../../src/server/routes/files.ts#L69) | 型号和类别入口共用可取消的扫描任务。原直连接口仍等待并返回结果，状态可查到任务 ID。读取资料根目录设置时，目录可用性检查也改为异步。 |
| [FilesPage.tsx](../../src/renderer/pages/FilesPage.tsx#L516)、[useScanProgress.ts](../../src/renderer/pages/useScanProgress.ts#L72) | 显示准备扫描、正在检查目录、等待收尾和当前目标。预检期间提供既有取消操作。 |
| [packaging-scan-scope.test.ts](../../tests/server/packaging/packaging-scan-scope.test.ts#L55)、[files-filters-scope.test.ts](../../tests/server/files-filters-scope.test.ts#L60)、[packaging-workspace.test.ts](../../tests/core/packaging/packaging-workspace.test.ts#L14)、[file-service.test.ts](../../tests/core/file-service.test.ts#L288) | 验证型号、类别、直连入口的 SMB 读取模拟，以及预检期间的状态、竞争、取消、原范围重试和目录归属。 |
| [pdf-scan-recovery.spec.ts](../../tests/e2e/pdf-scan-recovery.spec.ts#L207)、[pdf-scan-ownership.spec.ts](../../tests/e2e/pdf-scan-ownership.spec.ts#L91) | 真实服务子进程和 Chromium 取证。模拟目录枚举持续挂起，复查重启次序、数据库完整性和 P0-1 后台所有权。 |

按项目要求同步 NEXT_STEPS.md、docs/progress.json、PROGRESS.md、progress.html。本文件补充 [原 P0-2 报告](P0-2_SCAN_RECOVERY_20261119.md)。

## 隔离验证

- 在实际异步目录枚举入口暂停请求。型号任务、类别任务和旧直连接口均出现可见的持锁者。取消前和取消等待期间的竞争扫描都返回 409 和同一执行 ID。
- 暂停请求期间，取消接口返回已受理，扫描保持「停止中」。目录读取返回后才进入取消终态，SQLite 索引及表结构与取消前一致。相同范围重新扫描成功，使用新任务 ID。
- 真实 Linux 子进程在型号预检时保持阻塞。控制器等待旧进程退出再派生新进程。重启后最近成功 scanId 仍为 3，原 13 条索引和 13 份 PDF 的哈希一致。重扫得到 scanId 4。SQLite 完整性和外键检查均通过。[进程顺序、索引与哈希证据](evidence/p0-2-preflight/scan-recovery-evidence.json)
- [目录预检界面截图](evidence/p0-2-preflight/directory-preflight.png) · [重扫完成截图](evidence/p0-2-preflight/recovered-scan.png)

## 执行命令

```bash
npm run typecheck
npm run build
npm test -- --maxWorkers=1 tests/server/packaging/packaging-scan-scope.test.ts tests/server/packaging/packaging-workflow.test.ts tests/server/files-filters-scope.test.ts tests/server/tasks-api.test.ts tests/core/file-service.test.ts tests/core/file-scan-coverage.test.ts tests/core/file-scan-stability.test.ts tests/core/product-scoped-scan.test.ts tests/core/task-registry.test.ts tests/core/packaging/packaging-workspace.test.ts tests/core/packaging/packaging-monitor.test.ts tests/core/packaging-task-service.test.ts tests/main/local-service-controller.test.ts tests/renderer/files-page.test.tsx tests/renderer/scan-progress.test.tsx tests/read-only-workspace.test.ts
npm run test:e2e -- --config /tmp/planner-p01-playwright.config.cjs pdf-scan-recovery.spec.ts pdf-scan-ownership.spec.ts pdf-list-groups.spec.ts task-termination.spec.ts
git diff --check
```

Playwright 使用当前工作树下的 tests/e2e、单 worker、无头 Chromium 和独立回环端口。测试数据库、资料路径和备份均使用临时目录。

- 最终 Vitest 16 文件、219 项通过，Chromium 4 项通过。类型检查、源码构建、差异检查通过。[Vitest](evidence/p0-2-preflight/vitest.log) · [Chromium](evidence/p0-2-preflight/playwright.log) · [类型检查](evidence/p0-2-preflight/typecheck.log) · [构建](evidence/p0-2-preflight/build.log)
- 复现测试在修复前未进入可挂起的异步预检。补测在直连入口接入可取消任务之前未获得任务 ID。这两组故障均在最终专项中通过。该次仅运行相关专项。

生产扫描超时阈值仍留空。未连接正式数据库或资料目录。模拟通过有意延迟实际目录枚举的返回完成，实际 Windows、SMB 或 NAS 故障未现场验证。P0-3、P0-4 尚未开始。
