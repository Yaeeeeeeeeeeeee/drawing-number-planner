# Confirmed Requirements Implementation Plan

**Goal:** 完成用户正式授权的P0/P1/P2及Windows正式交付。
**Architecture:** 在现有React/Fastify/SQLite/Electron内增量修正；留痕结束复用Schema25，草稿独立数据文件，业务编码不变。
**Tech Stack:** TypeScript, React19, Fastify5, better-sqlite3, Vitest, Playwright, Electron, Inno Setup。
**Spec:** docs/confirmed-implementation-requirements-20261105.md。

## Global Constraints

- 不清空数据库、不批量删除历史、不测试用户真实文件；保隔离/唯一性/占号事务/快照。
- 白色共用必须来自真实产品记录，不创建虚构基准。
- 先观测失败回归再改代码；阶段相关测试完成后持续下一阶段，不等批准。
- 发布使用既有渠道，未完成/未验证不得表述完成。

## Review Focus

- 结束任务时仍在运行的文件操作不能在释放锁后继续发布。
- 强制释放的旧PDF不能被终止、发现或归档重试认领。
- 同编码前缀的不同产品/项目不能因批量UI获得相同正式图号。
- 草稿重启恢复必须重查且跟随实际数据目录备份。
- 切换数据库失败时当前profile、数据库、附件和重选能力仍保留。

## Tasks

### Task 1: P0 lifecycle and G-03
- [x] RED: packaging-task-service真实库覆盖等待索引/已删图号/强制脱钩/中断/停止失败/并发；renderer同弹窗过期重查。
- [x] GREEN: 独立终止预检和确认，事务留痕；操作安全边界、后台发现保护；不清理文件、不依赖重关联。
- [x] Verify: npm test -- tests/core/packaging-task-service.test.ts tests/core/packaging/packaging-monitor.test.ts tests/server/packaging/packaging-workflow.test.ts tests/renderer/drawing-tasks-page.test.tsx
- [x] Commit and ledger.

### Task 2: Planning domain and drafts
- [x] RED: 多产品/逐项错误/同码冲突/真实白色共用/过期资料/重复提交；独立草稿原子保存恢复及自动备份。
- [x] GREEN: 保原接口，增批量检查确认和草稿接口；沿用编号规则、真实归属事务，不建批次档案。
- [x] Verify: npm test -- tests/core/planning-service.test.ts tests/core/planning-reservation.test.ts tests/core/planning-batch.test.ts tests/core/planning-draft-store.test.ts tests/server/planning-api.test.ts tests/core/daily-backup.test.ts
- [x] Commit and ledger.

### Task 3: Planning workspace UI
- [x] RED: 双模式独立恢复、型号项目切换、四步确认、分组错误/单项重查、结果精确定位、宽度适配。
- [x] GREEN: 复用现有产品/字典/图号入口及分隔组件；增工作台状态和检查/结果组件。
- [x] Verify: npm test -- tests/renderer/planning-page.test.tsx tests/renderer/planning-workspace.test.tsx
- [x] Commit and ledger.

### Task 4: G-02/G-05 feedback
- [x] RED: 返回历史刷新、乱序响应、dirty编辑保留、五类资源加载/空/筛选空/部分失败/重试。
- [x] GREEN: active传递与请求序列、局部反馈，保旧数据，隐藏页停不必要轮询。
- [x] Verify: npm test -- tests/renderer/packaging-page-freshness.test.tsx tests/renderer/packaging-catalog-ui.test.tsx tests/renderer/drawing-tasks-page.test.tsx tests/renderer/files-page.test.tsx tests/renderer/qr-codes-page.test.tsx
- [x] Commit and ledger.

### Task 5: PDF monitoring/category/presence/batches
- [x] RED: 无00启用产品监听、精确类别、列表快照/详情实时、501+分批与失败重试。
- [x] GREEN: 扩监听范围、类别接口/操作、明确时点、客户端安全分批不重复成功项。
- [x] Verify affected PDF core/server/renderer and watcher suites.
- [x] Commit and ledger.

### Task 6: Database reselection
- [x] RED: 兼容旧库/高Schema/损坏/取消/失败/进行中任务、profile回退、备份验证。
- [x] GREEN: 复用安装profile验证和桌面原生选择，安全切换及恢复入口；不合并、不覆盖数据。
- [x] Verify profile, main recovery, migration and settings suites.
- [x] Commit and ledger.

### Task 7: Regression/review/Windows/release
- [x] Full npm test, npm run typecheck, npm run build, E2E with actual screenshots.
- [x] Fresh whole-branch review, fix significant findings with reproducing tests.
- [x] Windows42365635186完整通过；Tag v1.6.0固定aaef0c9，发布42569914853成功。
- [x] 已实际下载公开安装器/全部报告，SHA256全部一致；升级/回退、生产库未操作及Adobe/DPI边界已记录。

## Execution ledger

- 2026-11-05: 已创建独立worktree codex/confirmed-requirements-20261105，原五份审计文档留在原工作区。
- Pre-flight: Task1生命周期API由Task4刷新消费；Task2新批量/草稿接口由Task3消费；Task5不改变隔离；Task6按dataDir隔离Task2草稿。正式授权覆盖发布/迁移；不代表当前可访问生产库。
- Ruling: 用户最新唯一性规则优先，不能用跨产品新流水算法掩盖编码冲突；真实白色不能以本次随意选择代替。

- 2026-11-07: Task5/6复核关闭；完整231文件1966项、Chromium18项、类型与构建通过。Windows验收脚本适配明确授权的全启用产品监听，限定观察字段变化，其余业务保护保留；正式Windows完成及发布尚在进行。

- 2026-11-09正式交付：231/1968、Chromium18、类型/构建、Windows42365635186、发布42569914853通过；公开附件实际下载哈希一致，126张Windows截图保留。无生产数据库操作，未执行本机自动安装。
