# v1.6.0 已确认需求交付与验证记录

基线：v1.5.0 / Schema25。需求依据：[正式授权与需求决定](confirmed-implementation-requirements-20261105.md)，[实施计划](superpowers/plans/2026-11-05-confirmed-requirements.md)。本轮保持 Windows 本地运行、原资料根目录与 Schema25，不新增占号批次档案，不重新建设 AIT、BOM、二维码或邮件系统。

## 发布状态与证据

验证日期：2026-11-07；正式发布整理：2026-11-09（上海时间）。完整Windows验收运行[42365635186](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/42365635186)成功。正式源码固定为 `aaef0c9179b20d02ee129d8bb8612d0e03d4aabc`，Tag `v1.6.0`；发布器核对同次安装器和报告工件摘要后才允许发布，不重建或替换未经验证的安装器。

交付入口：[v1.6.0 Release](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.6.0)，附件提供安装包、SHA256SUMS、Windows实际运行报告/截图、测试报告及安装升级说明。旧版[v1.5.0](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.5.0)保留。

| 检查 | 实际结果与范围 |
|---|---|
| 全量自动化 | `npm test -- --maxWorkers=2 --testTimeout=15000`：231 文件、1968 项通过，366.64 秒。测试时限用于共享 2 CPU 环境，未删减断言。 |
| 交付验证后续专项 | 3 文件28项通过；观察范围外的历史时间、图号编码、产品归属、首次发现时间与文件内容变化仍被拒绝。 |
| 类型与构建 | `npm run typecheck`、`npm run build`通过；新增验收工具后再次类型检查通过。Vite仍提示主包大于500kB，非构建失败。 |
| Chromium 完整回归 | 18项全部通过（3.3分钟）；使用系统 Chromium 与真实隔离本地服务/SQLite/文件，未以模拟保存代替业务验收。 |
| Windows 原生验收 | 运行42365635186完整成功：中文安装、桌面根/中文子目录、旧Schema15启动升级及可读备份/WAL/失败回滚、两次重装选库、原生QR选文件、多型号规划/P0结束、数据库重选取消/切换/返回原库、真实进程重启与历史保护。 |
| 生产数据库操作 | **未执行**。未连接用户本地正式数据库；授权不等于已实际操作。 |
| 原始设计文件 | 用户真实PDF、AIT、AI、BOM附件未用于测试、未移动、覆盖或删除。 |

## 具体实现与代码位置

| 范围 | 实现 | 主要代码 |
|---|---|---|
| P0任务结束/G03 | 显式「保留文件并结束任务」；使用现有留痕字段记录结束，历史仍可见，结束与归档成功区分。生成、打开Illustrator、归档/索引未真正结束时保留锁。已删除图号、强制脱钩PDF不再是结束前置条件。删除预检过期可原弹窗重新检查。 | `src/core/packaging/packaging-task-lifecycle.ts`、`packaging-task-service.ts`、`packaging-task-store.ts`、`packaging-archive.ts`；`src/server/routes/packaging-tasks.ts`；`src/renderer/pages/packaging/PackagingTaskPanel.tsx` |
| 多型号规划服务 | 复用既有编码与占号事务，每型号项目独立；重复完整图号作为冲突阻止。每行保存点保证占号与真实归属共同成功；异常行不伪装成功。真实同产品白色图号才可共用，不重复占号或加入BOM。 | `src/core/planning/batch-planning-service.ts`、`planning-service.ts`、`planning-types.ts`；`src/server/routes/planning.ts` |
| 四步规划界面 | 产品资料→选择项目→图号检查→确认占号；单型号/批量两模式、型号搜索与独立输入、分组和单项重查、明确勾选确认、结果页按实际ID定位；右侧预览可拖动调宽。 | `src/renderer/pages/PlanningPage.tsx`、`pages/planning/`、`planning-workspace.css` |
| 草稿和备份 | 数据目录 `planning-drafts.json`，两模式独立、原子写入与fsync、版本冲突和删除令牌保护。恢复后清除旧检查资格。自动每日数据库备份同时保留有效草稿伴随副本；删除草稿不接触占号。 | `src/core/planning/planning-draft-store.ts`；`src/core/backup/daily-backup.ts`；`src/renderer/pages/planning/usePlanningDrafts.ts` |
| 历史刷新/加载反馈 | 页面重新激活读取任务历史与详情，保留筛选/展开/滚动/有效编辑；请求和修改结果分别排序，旧返回不覆盖新数据。模板/任务/规划/PDF/QR区分加载、无数据、搜索无结果、部分失败、完全失败和重试，保留最后有效数据。 | `DrawingTasksPage.tsx`、`PackagingTaskPanel.tsx`、`PackagingTemplatesPage.tsx`、`FilesPage.tsx`、`QrCodesPage.tsx` |
| PDF监听/类别/状态 | 所有启用且可可靠解析归属的产品02/03目录监听，不依赖00或任务。保留完整历史目录归属冲突检查，单目录失败不跳过同产品其他独立目录，异步前序扫描后重新核对当前启用状态及目录归属。型号/类别/全库扫描分离；列表使用扫描快照，展开文件路径时核实单文件实时存在状态。 | `src/core/packaging/packaging-monitor.ts`；`src/core/files/file-repository.ts`、`file-service.ts`；`src/server/routes/files.ts`、`packaging-tasks.ts`；`FilesPage.tsx` |
| PDF分批 | 超500条按服务端上限自动分批，逐批预览/指纹/确认，进度及失败重试，不重复已确认成功批。指纹只包含本批具体路径的管理决策，同时保留所选行、文件及历史引用保护。 | `src/renderer/data/pdf-batches.ts`；`PdfBulkManagementDialog.tsx`、`PdfClassificationDialog.tsx`；`src/core/files/pdf-management.ts` |
| 数据库重选 | 安全恢复和原生菜单入口。原库可读且验证备份后，检查目标版本/结构/外键/唯一约束/保护触发器及迁移演练；暂停实际操作、验证目标服务就绪，再原子保存profile。失败恢复旧服务/配置，不合并或初始化不兼容库。生产启动要求选定文件真实存在，验证实际打开的同一数据库句柄。 | `src/main/database-validation.ts`、`database-reselection.ts`、`index.ts`、`recovery-controller.ts`、`local-service-controller.ts`；`src/server/start-server.ts`；`scripts/production-profile.cjs`、`production-entry.cjs`；`SafeRecovery.tsx` |

完整改动可从正式Tag与基线比较查看。没有修改Schema迁移注册表、既有占号保护触发器或唯一性保护。

## 本轮定位并解决的问题

- 旧任务的归档/索引完成条件与结束生命周期耦合，删除图号或脱钩PDF后无法满足。新的明确结束分支不重新关联PDF，不写成归档完成；但仍等待真实文件操作/Illustrator不确定状态结束，不能提前释放锁。
- 原规划状态是单产品输入和旧检查结果；直接增加多个下拉框会共享输入/检查资格。改为型号、项目、模式独立状态，并在检查和占号时核对产品/字典/真实白色基准事实。草稿删除后旧写入可能重建草稿的问题由持久版本令牌解决。
- 返回页面只刷新辅助资料、旧异步历史/详情可覆盖修改结果。现在在激活及修改后读取必要数据，按请求顺序和任务版本合并，不覆盖未保存编辑。
- 旧监听以00/任务为准，缺少所有启用型号覆盖；保留归属冲突的同时，不能因一条目录失败停止该产品其他目录。现使用统一目录解析器逐目录处理。
- PDF存在判断曾随列表查询访问磁盘，混淆扫描快照与实时观察；现在将两者分开。分批预览原先包含全部路径的决策，首批成功使次批过期；改为绑定所选具体路径，相关数据变化仍使令牌失效。
- 数据目录选择的预检与实际启动之间存在文件被删除、大小写不同文件被误认同一库的风险；现在使用规范真实路径、existing-only打开并校验实际句柄。HTTP断开不代表后台处理已结束，重选等待实际处理完成再备份。
- 排队监听在异步前序扫描后仍使用旧产品资格，停用的后序型号可能继续被扫描。真实暂停/停用回归先失败；现在执行前重新核对启用、未删除、规范产品ID和实时目录归属。相关28项、真实文件检索浏览器、完整回归及独立审查通过；不取消已开始扫描的原有处理规则。
- 新自动监听改变了旧验收时序：文件可能在手动扫描前已入索引；后台观察会更新限定范围的last-seen时间；手动扫描可能遭遇明确扫描锁竞争。验收脚本现在核对具体文件实例，只有声明范围的观察字段可更新，且只重试明确的扫描繁忙响应。其他错误、业务字段变化、未知目录扫描均继续失败，不通过停用监听掩盖问题。

## 验收边界与剩余事项

- Windows完整验收已通过，实际原生重选、P0结束、多型号确认截图已查看。安装器SHA256由发布器按同次已验证工件生成并随Release提供；浏览器和Windows均只操作隔离夹具。
- 当前数据库已经缺失/损坏到无法取得独立完整性验证备份时，重选明确拒绝；需先从独立备份恢复可读库。没有新增完整备份恢复中心。
- 未连接用户正式库，T40本机残留任务需用户升级后在实际记录上执行「保留文件并结束任务」并核对结果。隔离回归覆盖已删除图号、强制脱钩、等待索引、确认PDF、中断、停止失败、锁保护等状态，不声称已替用户修复本地记录。
- 无用户真实AIT及授权Adobe环境，未验收真实字体、版式或可编辑PDF重开。Windows截图的实际渲染窗口尺寸不等同物理4K、多显示器或DPI验收。
- 保留旧版本Release及回退能力。安装/数据目录/资料目录相互独立；不在用户电脑自动安装。

## 本地升级与回退

按[安装、升级和恢复](install-and-upgrade.md)操作：先关闭旧程序，独立备份完整数据目录及原资料；安装后选择原 `planner.db`，保持原资料根目录，核对图号/BOM/QR/外发历史。v1.5.0→v1.6.0不增加Schema迁移，更早库仍执行原逐级备份迁移。

回退前再备份新版目录，保留草稿及升级后新增业务；使用保留的v1.5.0安装包与独立备份验证。不要覆盖唯一现用数据库，不通过清空索引或删除文件回退。实际归并、强制释放或旧任务处理均需用户在本机明确选择，不在首次启动自动执行。


## 页面证据

以下是本轮真实浏览器保存并检查的页面；Windows实际截图随完整运行报告提供，浏览器截图不替代Windows原生选择器验收。

- [多型号四步确认（1920）](screenshots/confirmed-20261105/p1-batch-confirmation-1920.png)。
- [真实白色共用](screenshots/confirmed-20261105/p1-real-white-sharing-1920.png)。
- [T40保留文件并结束确认](screenshots/confirmed-20261105/p0-termination-confirmation-1920.png)、[结束历史](screenshots/confirmed-20261105/p0-terminated-history-1920.png)。
- [501份文件分批完成](screenshots/confirmed-20261105/p2-pdf-501-completed-1920.png)。

浏览器还验证1280、2560、3840窗口宽度、预览分隔线调整和真实结果ID定位；图示为隔离验收记录，不是用户生产数据。


## 交付过程的诊断记录

旧验收对扫描观察时间、组合主键、已有字典的处理假设已修正，未放宽业务数据保护。曾有一轮Windows正式修改归档后仍为active，未取得当次HTTP错误，保留截图也不足以确认原因；因此不把它解释成已证实的软件根因。现记录实际归档响应，只对服务器明确拒绝且尚未开始发布的TASK_BUSY重新预检确认，其他错误立即失败。后续Windows完整运行已通过正式修改、原件备份和归档，且未复现该次异常；未声称修复一个原因未知的问题。

临时读取失败/成功截图的CI诊断工作流在整理交付时移除；原运行、源代码提交及工件证据保留。用户正式库未提供，实际生产操作记录为无；本机T40残留记录、真实AIT字体/版式及物理DPI仍按上述边界由用户验收。
