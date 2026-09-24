# 恢复开发入口

先读 `PROGRESS.md`、`docs/progress.json`、本文，再读已批准的 `docs/superpowers/plans/2026-09-22-second-acceptance-corrections.md` 与对应 design。原始30项在 `docs/second-acceptance-requirements.txt`。不能仅按聊天摘要继续。

## 工作区与边界

- 当前 worktree：`.worktrees/real-usage-acceptance-corrections`；分支 `codex/real-usage-acceptance-corrections`。
- 最新业务/看板检查点 `2c9c42c`；之后归档2项边界测试及进度更新仍在工作区，先核对 `git status`、`git diff` 和实际测试，禁止覆盖或重复实现。
- 不合并 master；不修改原始 PDF；不扩展二维码业务模型。看板不连接数据库、不进入业务菜单。
- Git 自动审批已恢复，检查点提交成功；以后如再次受阻，不得绕过审批。

## 当前任务与下一步

1. 看板已完成并验证：本地预览 http://127.0.0.1:5186/，离线 progress.html，30项完整且搜索可用。不要重复创建。
2. Task 5 主要归档路径已实现：补进程中断、缺失图片、日期变更、移除/重用关系边界测试。归档名称与实际路径一致，不覆盖旧文件。
3. Task 6 后端基础已实现但未接入：ProductCleanupService 事务集中软退出、审计/占号保留、回滚，产品/二维码列表过滤，批次重扫抑制；6项专项通过。继续跨产品和历史快照测试、扫描新图号归属/恢复门禁、后台任务互斥接入、API及删除向导。旧 `ProductService.delete` 仍是物理删除，不能认为可用。
4. Task 7：BOM 修改明细→外发上下文/历史冻结→邮件；Task 8：50MB自动分包、中断恢复；Task 9：当前有效文件与统一视觉、批次显示 helper 全面接入。
5. Task 10：完整自动化、类型检查、生产构建、E2E、数据库副本升级回滚、原文件哈希、独立 code review；全部完成后启动浏览器验收。

## 已知问题与测试

- 业务代码最近全量：2026-09-23 14:03，82文件/725项通过，类型检查和浏览器/桌面生产编译通过；不是整轮最终验收结果。
- 曾出现 drawings-api 单次5秒超时；未提高阈值，单测及重跑全量通过，最终留意。
- Schema v14 增加附件 link.deleted_at 保留迁移映射节点；早期v14缺列时先备份、事务补列。未主动升级用户真实数据库。
- 附件复制失败/关联登记失败回滚测试通过；进程强制中断恢复仍需完整检查。归档页面取消只阻止剩余请求，已发送一项完整完成。
- 最新进度工具测试见 docs/progress.json，不能把旧725项结果当作新增工具验证。

## 每个有意义步骤后的维护

1. 更新 `docs/progress.json` 对应需求的状态、具体完成内容、剩余、测试和时间；追加 log，更新 current/recent/next/blockers。
2. 只有整项验收通过且 acceptance 有可核验证据时设“已完成”。不得用测试数量折算百分比。
3. 运行 `node node_modules/tsx/dist/cli.mjs scripts/update-progress.ts` 同步生成 PROGRESS.md、progress.html。
4. 更新本文恢复信息；运行相关回归；保存检查点。
5. 静态页面始终只显示上次记录，不声称执行器在线。不要添加无依据的“正在运行”指示。

## 查看方式

直接用浏览器打开项目根目录 `progress.html`，无需启动 API 或业务应用。打开后点“重新读取已保存页面”加载最新快照。可选本地预览：`node node_modules/tsx/dist/cli.mjs scripts/serve-progress.ts`，访问 http://127.0.0.1:5186/；该服务只读取一个静态文件，不是业务 API。现有 Vite 根目录不同，不使用其 /progress.html 路由。

- 2026-09-23 18:46：管理工具建立完成，浏览器已确认30项及检索正常；全量83文件/728项、类型检查通过。继续 Task 5 边界与 Task 6，不重复创建看板。
- 2026-09-23 18:54：新增归档日期/失败回滚边界后全量83文件/730项通过。Task 6开始核对引用边界，尚未完成；不把此全量结果当作整轮验收。
- 2026-09-24 10:12：附件根目录缺失保护+集中清理基础后全量84文件737项、类型检查和生产构建通过；后端尚未接到用户入口，不宣称产品清理功能完成。先核对未提交修改再继续。
