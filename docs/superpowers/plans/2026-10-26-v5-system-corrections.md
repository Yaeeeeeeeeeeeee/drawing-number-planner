# V5 全系统增量修正 Implementation Plan

> **For agentic workers:** Use superpowers:dispatching-parallel-agents for independent domains with exclusive file ownership; integrate and review sequentially. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 V5.0 的共享布局、PDF 范围、BOM、受控强制释放、外发和邮件修正，保持真实文件与历史身份安全。
**Architecture:** 沿用 React/Electron + SQLite 服务/API；共享表格和图像预览统一修改。普通释放不放宽，独立强制流程以事务、影响指纹、脱钩快照隔离旧引用；新 Schema 由父执行器统一登记，先备份后迁移。
**Tech Stack:** TypeScript, React19, Electron, Fastify, SQLite, Vitest, Playwright, Inno Setup.
**Spec:** docs/v5-system-requirements-20261026.md

## Global Constraints

- 不改完整图号编码，不自动归并重复 SKU/型号，不恢复独立外观管理。
- 不删除或改写原始 PDF/图片/目录，不覆盖 BOM/外发历史快照。
- 用户已授权连续开发；执行方法为当前会话增量实施，并行处理互不重叠的领域，阶段验证后推进。
- 正式强制释放仅在用户明确确认影响后执行；开发只使用隔离数据库。
- BOM 重复图号引用规则撤回修改，保持现状。

## Review Focus

- 号码重新占用后旧 PDF 扫描、旧 BOM/外发快照绝不能自动附到新记录；强制释放与回滚用例覆盖。
- 不可访问目录或失败扫描不能被判为空目录；索引清理覆盖受保护与无引用残留，原文件哈希保持。
- 重复型号以产品ID区分；类别/品牌联动清除不兼容选择，历史查询保持业务日期口径。
- 表格末列跟随当前顺序填充容器；缩窗、侧栏、拖动、冻结表头与横向滚动通过实际浏览器检查。
- 模板无产品上下文可保存；未知变量、格式错误、缺少运行时值分别提示，签名只附加一次。

### Task 1: 全局表格、应用标题及图片预览
**Files:** LayoutTable.tsx, DataTable.tsx, useTableLayout.ts, table-layout.css, App.tsx, PlanningPage.tsx, 共享图片预览组件。
- [ ] RED：无六点/提示、尾列填满、当前末列变化、复位/记忆、sticky header、主导航收起无左空白、类别联动、图片缩放/拖动/Esc/切换。
- [ ] 修改共享布局与图片组件，不用固定宽占位或负边距；保留操作与键盘行为。
- [ ] 表格/规划/组件测试及实际多窗口浏览器，分组提交。

### Task 2: PDF 扫描、源文件分类、空批次与存在事实
**Files:** src/core/files/*, FilesPage.tsx, ProductCatalogNavigation.tsx, files/material-batch API/client。
- [ ] RED：只扫描两个明确目录、源文件非批次、范围外索引安全排除、成功空扫描与权限失败区分、无保护失效索引清理、保护历史引用。
- [ ] 统一具体文件实例状态，不将关联未命中等同缺失；窄筛选区和可辨按钮，右键图标一致。
- [ ] 服务/API/页面回归、原始文件哈希和跨产品隔离检查后提交。

### Task 3: BOM 编辑、查询、历史与附件
**Files:** BomPage.tsx, pages/bom/*, core/bom/*, boms route/types。
- [ ] RED：类别/型号、日期范围组合查询；加载原值独立抽屉；图片/示意图逐项互斥来源；内容哈希对比；历史对比左右顺序及首次记录。
- [ ] 改紧凑表单/静态详情网格，移除日常归档入口和冗余摘要；历史缩略图复用共享预览。
- [ ] 新建/复制/编辑/历史关联回归，保留原记录身份与不可变快照后提交。

### Task 4: 独立强制取消占号
**Files:** drawing deletion service/types/routes/client/drawer, 新增脱钩快照Schema迁移模块。
- [ ] RED：真实引用统计含软删除及历史快照；普通释放仍阻止；强制确认/指纹/事务失败回滚；PDF/BOM/外发保存原标识但脱钩；完整号码可重新占用，旧引用/重扫不挂新号。
- [ ] 先实现原身份 tombstone/脱钩策略及迁移测试，再开放独立危险按钮，不删除磁盘文件。
- [ ] 历史/正式两来源、跨产品引用、重启与FK检查后提交。

### Task 5: 外发选择、清单、结果及大PDF
**Files:** OutboundPage.tsx, PackageBuilder.tsx, PackageResult.tsx, outbound package/file services。
- [ ] RED：品牌/类别/型号真实ID联动；去清单重复筛选/分页/历史区域而保留后台记录；分包数量等于ZIP内容；50/69/100/200MB 文件存在/读取及原文件哈希。
- [ ] 具体存在状态与PDF领域一致，修复实际文件大小/超时根因，不修改原PDF。
- [ ] 包预览/ZIP/历史不可变和页面回归后提交。

### Task 6: 邮件模板、变量、签名及联系人
**Files:** outbound-reference service/repository/routes, TemplateSettings.tsx, EmailComposer.tsx, MailConfiguration.tsx，必要最小扩展迁移模块。
- [ ] RED：逐字段校验、无业务上下文保存、厂商与场景、变量插入/语法/运行时预览、独立签名一次附加、联系人独立。
- [ ] 复用现有配置页及数据关系，保留旧模板正文和兼容变量；不凭空覆盖用户模板或捏造未提供Excel内容。
- [ ] 服务/API/UI及旧数据迁移回归后提交。

### Task 7: 整合、验收及交付
- [ ] Schema登记和旧20库→新库备份/升级/故障回滚/历史身份保持；同步Skill中被V5明确替代的规则。
- [ ] 类型、完整自动化、前端/Main构建、实际浏览器与Windows安装启动；不可把本地真实业务库未验证写成通过。
- [ ] 独立审查及修复，逐项状态/根因/代码/迁移/范围说明，保存回退版并发布版本与新安装包。
