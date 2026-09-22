# 第二轮实际使用验收修正 Implementation Plan

> 执行方式：superpowers:executing-plans，当前 worktree 内逐任务实施。用户已批准设计及直接开发，不再次请求计划审批。

**Goal:** 完成全部 30 项验收修正，将 BOM、产品清理与外发流程联通。
**Architecture:** 现有 React/Fastify/SQLite/Electron 内增量修改；Schema v14 保留历史身份、附件和外发快照。不改图号编码结构。
**Tech Stack:** TypeScript、React、better-sqlite3、Fastify、archiver、Vitest、Playwright。
**Spec:** `docs/superpowers/specs/2026-09-22-second-acceptance-corrections-design.md`，用户已确认两项数据边界与全部实施授权。

## Global Constraints

- 不合并 master，不修改原始 PDF，不释放未明确选择释放的图号。
- BOM 附件：`BOM附件/型号/业务日期/项目-业务日期[-位置示意图].ext`；冲突编号，不覆盖；旧文件复制校验后切换关联。
- 单 ZIP 硬上限 50,000,000 字节，目标 49,000,000 字节；文件不可拆分。
- 产品退出当前业务，历史身份/快照保留；已软删除数据不计当前阻塞。
- 二维码只处理本轮显示和产品退出兼容，不新增新建/沿用模型。

## Review Focus

- 同型号不同产品的附件名称冲突：独占创建并递增，不能覆盖。
- 多条 BOM 对同批次同项目存在冲突：明确选择，不能猜测供应商将收到哪版。
- 软删除保留占号与物理产品外键兼容：集中清理不能使其他产品共享 BOM 断裂。
- 编辑历史 BOM 后下游附件沿用：保留旧附件链接与文件，不原地覆盖。
- ZIP 写完但数据库未提交时进程退出：claim 与文件发布不能记录半完成成功。

## Task 1：图号恢复、引用计数和批次显示基础（需求 1、6、15）
Files: `src/core/drawings/drawing-query-service.ts`、`src/core/products/product-repository.ts`、`src/renderer/pages/DrawingLibraryPage.tsx`、新增 `src/core/files/material-batch-label.ts`；Tests: `tests/core/drawing-query.test.ts`、`product-service.test.ts`、`material-batch-label.test.ts`。
- [ ] RED：实际数据库生成图号→作废→恢复，号码不变；删除图号不能直接启用。用真实软删除记录验证当前引用计数归零。
- [ ] GREEN：增加 voided→active，拒绝 deletedAt 状态操作；计数过滤 deleted_at。
- [ ] 批次 helper `materialBatchLabel(name: string): string`，仅标准编号日期/首批名称剥前缀，其他保持原名。
- [ ] 运行 `pnpm test -- tests/core/drawing-query.test.ts tests/core/product-service.test.ts tests/core/material-batch-label.test.ts`。

## Task 2：Schema v14 与历史快照（需求 7、8、17、18、24）
Files: `src/db/schema.sql.ts`、`src/db/migrations.ts`、`tests/db/migrations.test.ts`。
- [ ] RED：v13 有业务记录的副本升级，旧字段值、行数、外键保持；故障时回滚且备份先于修改。
- [ ] 增加 BOM updated_at/edit_revision、明细 change_details/deleted_at；产品 deleted_at/deletion_reason；产品清理日志；受管附件迁移映射。
- [ ] 新增 outbound_package_parts 与条目 part_number/change_details_snapshot、包产品身份快照；旧包补第 1 份，字节数未知留空。
- [ ] 所有迁移复用既有备份与事务机制，版本比较由 13 升 14。
- [ ] 运行 `pnpm test -- tests/db`。

## Task 3：批量图号删除（需求 2）
Files: drawing-deletion-service/types、routes/drawings、renderer/data/client、DrawingLibraryPage。
- [ ] RED：一项 BOM 阻塞、一项可删，返回逐项结果，可删项成功且阻塞项不变；重复 ID 去重；执行前重检。
- [ ] 复用 `preview(id)`/`delete(input)`；新增批量预览和执行 API，逐项事务，保留两种模式与释放确认。
- [ ] 多选当前页、清筛选清选择、汇总引用原因、跳过阻塞；真实磁盘文件哈希不变。
- [ ] 运行 drawing-deletion-service 与 drawings-api 相关测试。

## Task 4：BOM 编辑与字段/查询布局（需求 3—10、13）
Files: bom-service/repository/types、routes/boms、client、BomPage、bom/BomEditor、bom/BomQuery。
- [ ] RED：编辑保留记录 ID/created_at，修改 updated_at；过期 edit_revision 冲突；历史外发正文不变；后续沿用附件仍可打开。
- [ ] 新增 `updateVersion(id, input, expectedRevision)`，事务保存明细，稳定保留已有明细 ID；移除项软删除，不影响历史沿用。
- [ ] 材质/尺寸/位置保持独立；changeDetails 独立；旧 notes 可见保留。隐藏二维码编辑且不擦除旧关联。
- [ ] 查询列表去 Vn；详情分层；编辑加载完整所选记录；型号全量删除折叠危险区。
- [ ] 运行 BOM core/API/renderer 测试与类型检查。

## Task 5：附件归档与旧附件复制迁移（需求 11、12）
Files: bom-asset-service、bom-service、routes/boms、BomPage、新增 bom-asset-archive-service 与测试。
- [ ] RED：项目/日期/角色命名、同名不覆盖、同型号冲突、缺失源、复制失败、哈希不一致均不切换引用。
- [ ] 上传暂存，保存按业务上下文归档；旧附件复制与校验后更新本条引用，旧文件/历史引用保留。
- [ ] 提供迁移预检/执行可取消任务与结果；UI 归档名和磁盘名一致、图片预览。
- [ ] 运行附件服务/迁移/打开位置测试。

## Task 6：产品集中清理（需求 16—18）
Files: 新增 product-cleanup-service/types/tests；products repository/service/routes/client/page；扫码产品匹配与二维码候选查询。
- [ ] RED：软删除不阻塞、历史外发不阻塞、其他产品 BOM 阻塞；失败事务回滚；删除后扫描不自动恢复。
- [ ] `previewCleanup(productId)` 返回分类引用、允许动作、外部阻塞；`cleanup(productId, confirmation)` 重检后集中软删除 BOM/图号/产品、解除本产品实时索引关系、保留审计。
- [ ] 产品、二维码、BOM、新规划候选统一排除退出产品；历史查询仍有身份。保留占号默认，释放仅通过已确认图号流程。
- [ ] 向导显示影响和二次型号确认，禁止与活动扫描/打包并发。
- [ ] 运行产品/扫描/BOM/二维码/外发集成测试。

## Task 7：BOM→外发联动与邮件（需求 19—23）
Files: outbound types/package/reference services、新增 outbound-bom-context、OutboundPage、PackageBuilder、EmailComposer。
- [ ] RED：同产品同生效批次明细自动生成修改内容；多 BOM 冲突明确标记；删除/缺失不自动选择；正文无路径/.pdf/来源。
- [ ] 使用 productId/batchId/projectItemId/drawing reference 精确匹配；预览冻结 BOM 修改明细与产品身份，打包重检上下文。
- [ ] 单页顺序步骤，打包后自动带入邮件，保留人工编辑；已发历史快照不随 BOM 改动。
- [ ] 运行 outbound 服务和页面测试。

## Task 8：多 ZIP 与中断安全（需求 24、25）
Files: outbound-package-service/repository/types、artifact-ownership、package UI、打开位置 API。
- [ ] RED：22MB+5MB+31MB 分成两包；63MB 文件阻塞；ZIP 实测超限重分组；取消/失败清理仅本任务文件；同名已存在不覆盖。
- [ ] 原文件为单位分组；写临时包→实际大小检查→全部发布→事务登记分包，claim 包含所有输出；单包兼容旧 API。
- [ ] 历史列表与打开位置支持每份；邮件列多包，不切 PDF。
- [ ] 运行打包/恢复/桌面路径测试。

## Task 9：统一视觉与当前文件（需求 14、15、26—28）
Files: DrawingLibraryPage、ProductsPage、BOM、Outbound、共享状态组件及样式。
- [ ] 图号详情默认显示当前有效实例，历史折叠；歧义提示、缺失不静默回退。
- [ ] 当前标签突出，历史弱化，停用警示、异常错误；二维码用途逐行；路径换行、按钮分离。
- [ ] 浏览器验证窄窗口/长中文路径/多项目布局。

## Task 10：整体验收（需求 29、30）
- [ ] `pnpm test`、`pnpm typecheck`、`pnpm build`、`pnpm test:e2e` 全部运行。
- [ ] 数据库副本升级/回滚与文件哈希比对；不拿真实产品做删除实验。
- [ ] 独立 code review，修复重要发现并重跑对应测试。
- [ ] 启动浏览器预览并验证 API，报告完整/未完成项；不合并 master。

## 执行记录

- 基线 `9aa377c`。现有 worktree 可继续使用；本轮设计文档未提交。
- 用户已明确批准 v14、软删除退出、复制校验迁移与继续开发。
- 接口依赖：Task 2→4/5/6/7/8；Task 4 changeDetails→Task 7 邮件；Task 7 context→Task 8 快照；Task 1 标签→Task 9。
- 2026-09-22：Task 1 后端恢复/软删除计数及标签 helper 已完成，3 文件 40 测试通过；标签尚待 Task 9 全局接入。产品物理删除接口仍须 Task 6 改软退出，不能认为集中清理已实现。
- Task 2：v14 增量结构已写入；新增 v13→14/回滚测试通过，数据库测试 4 文件 72 项通过。旧 fixture 人工降级时需移除 v14 表/列，已修正；真实数据库尚未主动升级。
- Task 3：批量服务、API、client、页面多选及确认面板已接入；core 10 项通过。待新增 API/页面回归、修复边界，随后继续 Task 4。
- 自动续跑：已创建 thread heartbeat automation（id=automation），每小时检查/继续；上次查询五小时额度使用 2%，重置时间 2026-09-23 01:22:50 上海时间。以之后实时查询为准。
- 尚未完成 Task 4—10；不要将本轮宣布为完成，不合并 master。
- 2026-09-23 01:35：额度恢复后继续 Task 4。已接通 BOM 查询→编辑原记录→revision 校验保存；修改明细独立录入/展示，查询材质尺寸位置分开、去列表 Vn、整型号删除折叠。BOM 编辑不擦除旧二维码关联，新建后续记录省略二维码字段时保留同项目旧关联；编辑时省略批次不擦除已清理索引的历史批次快照。移除明细不再匹配当前查询/阻塞图号删除/显示当前 BOM 使用。完整自动化 78 文件 705 项通过、类型检查通过、生产浏览器及桌面编译通过。尚未最终 E2E/code review，不作交付声明。
- 下一步：Task 3 批量页面过期预检/结果保留/取消与 API 回归；Task 4 附件沿用来源展示、失效旧引用编辑边界、查询缩略图与文字清理；Task 5—9 未开始。Task 1 的产品引用计数已过滤软删除，但旧物理删除入口仍需 Task 6 替换为集中软退出，否则有外键风险；当前 checkpoint 不是稳定验收基线。真实数据没有主动升级、没有清理真实资料。
- 2026-09-22 21:48 自动续跑核验：五小时额度已用 51%，仍可执行。Task 4 已有 updateVersion 后端及路由，保留明细 ID、乐观锁、下游沿用附件快照；前端编辑及后续联动未完成。BOM 服务、v14 升级回滚、图号库页面合计 3 文件 40 测试通过，类型检查通过。新增附件来源快照列导致旧迁移断言比较额外字段，已改为逐一比较全部旧字段（不弱化旧值检查）；数据库 4 文件 72 测试重新通过。未合并、未操作真实资料文件。下一步继续 Task 4 前端与软删除明细引用过滤，并补 API/页面回归；Task 3 的 API/页面边界测试仍需补齐。
