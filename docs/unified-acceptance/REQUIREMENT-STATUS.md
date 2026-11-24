# V1.6 全范围需求追踪

交付目标为一份完整 Windows 验收包。P0、P1、P2 用于内部实施和测试。应用基线 `ca5d58a430983b9875fe7ac46152f65561e9bdad`，1.6.2 / Schema26。

依据为 [V1.6 原始需求及编号矩阵](sources/v16-corrections-20261111.md)、[历史已确认增补](sources/confirmed-implementation-requirements-20261105.md)、[阶段 A 最终决定](sources/STAGE_B_PRECONDITIONS_20261119.md)、[11 月 17 日决定](sources/DECISIONS_20261117.md)、《图号规划器 Codex 开发需求书》2026-11-19 §§1–15，以及 [实际 Windows 交付核对报告](sources/WINDOWS-DELIVERY-AUDIT-20261120.md)。

状态针对每一行实际范围。已实现表示存在来源、代码和已有验证证据；部分实现表示已有能力仍缺验收项；未实现表示已确认的功能仍缺实现；待验证表示已有实现或历史保留要求，但缺少证据。基线已有测试不等于最终安装包回归。

## 后续确认项、实现位置和验证范围

| 编号 / 来源 | 事项 | 状态 | 代码及证据 / 剩余 |
| --- | --- | --- | --- |
| P0-1 / §1 | 扫描状态、范围来源、真实互斥、历史诊断与制图索引进度 | 已实现 | `FileService`、`useScanProgress`、`pdf-scan-ownership.spec.ts`；[P0-1](sources/P0-1_SCAN_OWNERSHIP_20261119.md)。 |
| P0-2 / §1 | 获取锁后预检、取消、I/O 收尾、重试、跨进程安全恢复 | 已实现 | `LocalServiceController`、`packaging-workspace.ts`、`pdf-scan-recovery.spec.ts`；[P0-2](sources/P0-2_SCAN_PREFLIGHT_20261119.md)。 |
| P0-3 / §2 | 待启动映射、筛选统计、启停及历史占用保护 | 已实现 | `drawing-library-presentation.ts`、`drawing-status.spec.ts`；[P0-3](sources/P0-3_DRAWING_STATUS_20261119.md)。 |
| P0-4 / §2 | PDF/图号库成功 scanId 刷新、四种 ZC × 两个外观、人工归属及脱钩保护 | 已实现 | `query-cache.ts`、`zc-scan-refresh.spec.ts`；[P0-4](sources/P0-4_ZC_SCAN_REFRESH_20261120.md)。 |
| P0-DIAG / Windows 复验 | 强制脱钩后补扫维持专用诊断及索引 | 已实现 | `src/core/files/file-repository.ts`、`tests/core/v5-force-release.test.ts`；[复验报告](sources/DELIVERY-REPORT.md)。 |
| PDF-TREE / §3 | 树标题、拖宽、长型号、批次状态弱化 | 已实现 | ModuleWorkspace.tsx、FilesPage.tsx；树栏 310px 默认值和 220–420px 可调区间有组件测试。 |
| PDF-TABLE / §3 | 单型号隐藏重复产品、文件名主副两行、对齐、状态及统计范围 | 已实现 | FilesPage.tsx、files-page.test.tsx 验证单型号/跨型号列、两行名称与作用域数量。 |
| PDF-GROUP / §3 | 源文件与转曲版本组，标题缩进浅底、展开保留选择 | 已实现 | FilesPage.tsx、pdf-list-groups.spec.ts，实际扫描夹具覆盖展开、收起、选中保持。 |
| PDF-SEARCH / §3 | 当前范围文件名/图号搜索、清除与原类型筛选 | 已实现 | files-filters-scope.test.ts、files-page.test.tsx 验证关键字只针对当前范围文件名和图号。 |
| PDF-ACTIONS / §3 | PDF 预览/打开、复制路径、打开文件夹及操作命名 | 已实现 | FilesPage.tsx 与 desktop-files.ts，文件操作沿用现有路径授权；PDF 阅读器有浏览器覆盖。 |
| PDF-SCAN-UI / §3 | 型号/类别优先、全库次要，按作用域显示真实进度 | 已实现 | FilesPage.tsx，范围按钮和真实扫描所有者沿用 P0 接口，pdf-scan-ownership.spec.ts。 |
| PDF-BULK-FOOT / §3 | 勾选后出现批量栏，加载页脚独立不挡最后一行 | 已实现 | FilesPage.tsx、pdf-batch-workflow.spec.ts；501 条隔离数据实测分批与文件保护。 |
| QR-PARENT / §4 | 父行用途图标、可访问文本、未配置快捷关联 | 已实现 | QrCodesPage.tsx、qr-codes-page.test.tsx；按实际配置的用途和缺失用途显示快捷入口。 |
| QR-CHILD / §4 | 子行用途/文件或链接/状态、缩进，URL 可复制 | 已实现 | QrCodesPage.tsx、qr-codes-page.test.tsx 验证展开信息、URL 和复制动作。 |
| QR-FILTER / §4 | 单行筛选、检索行为一致、重置 | 已实现 | QrCodesPage.tsx 与二维码组件专项验证搜索和重置。 |
| QR-MANUAL / §4 | 手动关联标题和当前 SKU/型号，PDF 可拖放 | 已实现 | QrCodesPage.tsx、qr-codes-page.test.tsx / qr-manual-actions.test.ts 覆盖拖入文件令牌及无配置用途；真实桌面拖入体验待现场核验。 |
| QR-HISTORY / §4 | 保留现有 QR 数据结构，不增加配置历史 | 已实现 | 保持 Schema26、现有配置与关联审计；以前页没有配置历史。 |
| DRAW-LAYOUT / §5 | 目录标题、去重复计数、显式作用域、来源默认收起、单型号去冗余 | 已实现 | DrawingLibraryPage.tsx、drawing-library-page.test.tsx，范围标题和单型号列切换。 |
| DRAW-TABLE / §5 | 图号/类别左对齐、复制靠近、微型色点及状态弱化 | 已实现 | DrawingLibraryPage.tsx、drawing-library-presentation.ts 及 drawing-status.spec.ts。 |
| DRAW-TOOLS / §5 | 紧凑搜索/颜色、表头全选、条件批量动作及布局入口 | 已实现 | DrawingLibraryPage.tsx、DataTable.tsx，选择范围绑定表头多选和已有批量权限。 |
| SEL-01 / §§6、7、11、13 | 可复用分组胶囊，型号前置、搜索、结果全选、清空、计数和单/多选 | 已实现 | ProductLinePicker.tsx 以产品 ID 分组选择，planning-workspace.spec.ts 用两个不同产品类别验证跨搜索保留选择。 |
| PLAN-BATCH-STEPS / §6 | 批量三步及 T-03 四步旧草稿迁移 | 已实现 | PlanningPage.tsx / planning-workspace.spec.ts 在真实服务恢复旧第四步草稿，经过新三步流程和人工确认。 |
| PLAN-BATCH-APPEARANCE / §6 | 批量外观按型号独立，紧凑表与统一设置 | 已实现 | PlanningProductInputs.tsx 按型号维护外观与版本 ID，支持统一设置。规划组件与 Chromium 覆盖草稿恢复。 |
| PLAN-BATCH-CONFIG / §6 | 型号 Tab 计数/提醒、项目表格、真实模板导入 D-04、向指定型号复制 | 已实现 | BatchProjectActions.tsx / planning-workspace.test.tsx 验证真实模板只导入类别和项目、复制只修改选中目标。 |
| PLAN-BATCH-CHECK / §6 | 通过/未通过汇总、仅看失败、返回补充/移除、跳过失败且保留草稿 | 已实现 | PlanningPage.tsx / planning-workspace.test.tsx 覆盖单项修复、保留失败草稿及确认通过项。 |
| PLAN-BATCH-SHELL / §6 | 通栏底部操作、右栏随步骤、有效草稿才显示删除 | 已实现 | PlanningPage.tsx、规划工作台样式与 planning-workspace.spec.ts。 |
| TASK-LIST / §7 | 辅助操作收纳、检查并建临时目录、多选、单行新建、任务历史管理 | 已实现 | PackagingTaskPanel.tsx、DrawingTasksPage.tsx，任务列表/辅助选择专项 42 项通过。 |
| TASK-HISTORY / §7、G-02 | 状态标签、进行中/历史、检索、继续、返回刷新保现场 | 已实现 | PackagingTaskPanel.tsx、drawing-tasks-page.test.tsx 验证回访刷新和旧响应保护。 |
| TASK-END / §7 | 取消保留文件与删除任务记录分离、更多、二次确认 | 已实现 | PackagingTaskPanel.tsx、task-termination.spec.ts，通过保留原件、终止留痕、释放任务锁、删除预检。 |
| TASK-DETAIL / §8 | 面包屑、三段式模式、来源/核验双栏、目标预览/复制/Illustrator | 已实现 | PackagingTaskPanel.tsx 与任务详情组件；真实浏览器验证新建及正式修改、手动关联和核验，Illustrator 实弹另记。 |
| TASK-CONFIRM / §8 | 人工确认、默认首个待处理/下一项、箭头与状态、折叠诊断、短暂提示 | 已实现 | drawing-tasks-page.test.tsx 验证首项与下一项定位、主动确认、未保存输入保留；task-termination.spec.ts 验证任务终止。 |
| TASK-AI / §7/T-04 | Illustrator 环境状态真实呈现 | 待验证 | 平台标记不代表安装可用。实际读取成功才显示可用，无结果应显示未检测/无法确认。 |
| BOM-EDIT-UI / §9 | 分组、置顶标签、适时校验、近字段错误、底栏与连续录入 | 已实现 | BomEditor.tsx、BomDrawingField.tsx 和 bom-page.test.tsx，空表单、失焦校验、保存与附件重置均通过。 |
| BOM-FILE-UI / §9 | 搜索图号、白色引用标签及附件并排/拖放/正确沿用 | 已实现 | BomDrawingField.tsx、BomAttachmentControl.tsx、bom-page.test.tsx。选择项目清除搜索，保留历史候选身份与按用途独立沿用。 |
| BOM-IMPORT / §9 | 安全地从图号库批量导入与复制所选旧版 | 已实现 | BomDrawingImport.tsx / BomPage.tsx。历史版本复制回归及补充 UI 验证通过，验证同项目双选阻止、按图号 ID 导入和手动保存。 |
| BOM-QUERY-UI / §10 | 属性网格、日期区分、图片对比、列表选择、搜索和工具收纳 | 已实现 | BomQuery.tsx 及 bom-worksheet.test.tsx；按需比较与同链版本、普通详情、批次标签、图号复制和历史异常均有专项。 |
| BOM-EXPORT / §10、D-03 | 从所选保存历史版本生成 A4 PDF，完整业务字段与两类图片 | 已实现 | bom-export-document.ts、bom-pdf-export.ts、boms-api.test.ts；Windows 安装版验证 v52.bom.installedA4ExportVerified 通过，真实生成 PDF。测试指定保存目标，人工选择保存路径和物理打印待现场核验。 |
| AIT-UI-FILE / §11 | 文件置顶、选择/拖放、成功/失败真反馈、路径唯一 | 已实现 | PackagingEditors.tsx 和 packaging-catalog-ui.test.tsx 覆盖选择、拖入受信文件、同路径重复检查；原始文件始终按路径引用。 |
| AIT-UI-SCOPE / §11、D-02 | 品牌与指定型号保留并存，品牌过滤、分组胶囊 | 已实现 | PackagingEditors.tsx、ProductLinePicker.tsx，品牌范围及指定型号可并存，沿用 D-02。 |
| AIT-OBJECT-FONT / §11、T-04 | 对象下拉、重新读取保手动映射、真实字体检测结果 | 已实现 | PackagingEditors.tsx 与 Illustrator 探测脚本区分成功、缺失、未知；组件/驱动测试验证保留已有手动映射。真实字体库及设计文件待现场核验。 |
| AIT-UI-FORM / §11 | 表单分块、保存吸底、未保存保护、筛选/Tab、关联项目设置跳转 | 已实现 | PackagingEditors.tsx、PackagingTemplatesPage.tsx，提交/关闭保护、筛选和项目设置联动。 |
| GENERATION-SUMMARY / §12 | 项目设置下只读摘要，已保存配置和未保存状态 | 已实现 | 包材项目设置页内只读摘要区分已保存配置与表单变更；包材专项目录通过。 |
| UI-SHARED / §13 | 状态、抽屉操作、危险确认、瞬时反馈与窄屏尺寸 | 部分实现 | 已验证分组选择器、操作反馈、抽屉、危险操作确认和宽窄视口几何；全部页面在用户实际 Windows 缩放比例下的视觉一致性待现场核验。 |

## P2 与现场证据

| 编号 | 已确认事项 | 状态 | 核对依据 |
| --- | --- | --- | --- |
| G-01/Q-16 | 所有启用产品监听 02/03 | 已实现 | 包材监听与 P0 回归，保留目录保护。 |
| G-02/Q-04 | 返回制图任务刷新历史且保留现场，拒绝旧响应 | 已实现 | PackagingTaskPanel.tsx 保留活动详情，分开历史和编辑请求序号；任务组件专项通过。 |
| G-03/Q-15 | 预检令牌失效在同一弹窗重新获取 | 已实现 | 批量删除及既有任务安全回归。 |
| G-04/Q-05 | 完整图号唯一且不擅改流水 | 已实现 | 规划服务与事务测试。 |
| G-05 | 规划首载、任务历史、PDF/QR 辅助资料及模板规则反馈 | 已实现 | planning-page、drawing-tasks-page、packaging-page-freshness、files-page 和 qr-codes-page 测试覆盖失败保留、重试或空态。 |
| G-06/Q-02 | 型号/类别/全库扫描 | 已实现 | 类型和权限、实际扫描范围及互斥已验证。 |
| G-08/Q-09 | 超 500 分批、进度、失败重试、成功不重复 | 已实现 | `tests/e2e/pdf-batch-workflow.spec.ts` 501 条及服务端保护。 |
| G-09/Q-03 | 列表取最近扫描，详情实时检查 | 已实现 | 既有索引和实时观测接口，交付前重测两种时点。 |
| G-11/Q-06、Q-07 | 重新选择数据库、兼容检查和回退，保留自动备份 | 已实现 | `database-selection.ts`、`database-reselection.ts` 与 Windows 隔离夹具验证。用户报告无弹窗仍待现场进程及日志，无法由合成夹具确定。 |
| E-01 | 原文件管理器直接切换、路径切换和提示 | 待验证 | `ImportPage.tsx` 已有邮件导入、Excel 检查和结果提示；Git 可见历史未定位原直接切换入口。保留既有兼容逻辑，待现场核验。 |
| E-02/E-03 | PDF 上传与网格原按钮/行为 | 待验证 | 列表及原操作保留。旧上传接收链路、网格字段与交互暂无可定位证据。保留兼容逻辑，待现场核验。 |
| E-04/E-05/E-06 | 本机版本、真实 ZC ID、现场扫描异常与共享盘 | 待验证 | 不用隔离库推出正式归属或把成功模拟当成 SMB 实测。 |
| D-05/T-01 | 正式停滞阈值 | 待验证 | 取消、收尾机制已实现；120 秒从未作为正式默认值获批。 |
| 样本验证 | 真实 Illustrator/字体、原始 AIT、物理 DPI、业务打印及用户库 | 待验证 | 只有合成内容与已保存 Windows 自动化可用于回归；原始资料不进测试。 |

### 旧入口历史取证

2026-11-20 补充指示要求先自主追溯。未能从历史还原的事项保留现有兼容行为，列为现场核验，不暂停其他实施。

- 对完整本地对象库执行 `git rev-list --all --count`、`git tag --list`、`git log --all --follow -- <页面>`、`git log --all -G <入口或事件表达式>` 及标签定点 `git grep`。核对覆盖 423 个可达提交和 v1.1.0 至 v1.6.2 等标签。
- 迁移检查 `ImportPage.tsx` 从 `32641df` 的工作簿审计与确认流程，延续至 `bf6cec3` 增加邮件入口。核对 `src/server/routes/import.ts` 工作簿审计/确认与 `email-template-import.ts`。主进程 `shell.showItemInFolder` 对应已索引文件/受授权输出，另一组对话框是正式数据库重选。两者不能证明迁移检查曾支持文件管理器直接切换。当前导入入口、迁移结果通知与兼容路由保留。
- PDF 文件中心从初版 `f306817` 到后续 `f0870cd`、`dcaf48c` 等导航和归类修订均能定位索引列表、打开、批量与刷新。已定位的 PDF 输入属于制图任务、二维码或 BOM 独立场景，不能作为文件中心上传的证据。当前 PDF 文件接口为扫描、索引、内容读取、批量管理及归类，无证据表明有正式资料上传写入路由。未找到网格视图入口与测试链路。
- 实施与最终测试仍分别核对可证实的列表、打开路径、批量、刷新与兼容 API。现场归属、共享盘、真实 Illustrator 的状态继续单独列证据。

执行验证从明确缺口开始，先跑各模块专项。完整集成后复跑 Vitest、Chromium、类型检查、构建、Schema26 数据保护和 Windows 原生安装/升级。最终追踪清单、版本、Git 提交、Windows EXE 的 SHA256、变更和完整测试报告一起交付。

## 原 V1.6 矩阵逐项承接

下表保留先前基线的状态和证据。上文的具名增量项记录本轮新行为，例如批量由四步改为三步。运行证据对应 56fb2ef，见本包 TEST-REPORT.md。

下表保留 44 个原编号及可追溯证据。后续改变的验收标准以本清单上半部分为准。测试证据标明适用范围，最终候选必须统一复跑。

| 需求 | 内容 | 当前状态 | 源码依据 | 历史证据 |
| --- | --- | --- | --- | --- |
| BUG-T40-001 | 安全结束残留任务、修复型号锁和旧PDF脱钩冲突 | 已实现 | src/core/packaging/packaging-task-lifecycle.ts；src/renderer/pages/packaging/PackagingTaskPanel.tsx | 4文件55项＋实际浏览器1项；PHASE1_TASK_SAFETY.md；最终整套及Windows范围见FINAL_REPORT.md |
| UI-STATE-001 | 模块切换保留工作现场 | 部分实现 | src/renderer/layout/AppShell.tsx；src/renderer/components/ | 导航/滚动专项通过；PHASE2_WORKSPACE_UI.md；最终整套及Windows范围见FINAL_REPORT.md |
| UI-DRAWER-001 | 已确认页面真正实现右侧抽屉 | 已实现 | src/renderer/layout/AppShell.tsx；src/renderer/components/ | 组件及1920/600浏览器；PHASE2_WORKSPACE_UI.md；最终整套及Windows范围见FINAL_REPORT.md |
| UI-SAVE-001 | 消除无意义重复保存确认 | 已实现 | src/renderer/layout/AppShell.tsx；src/renderer/components/ | AIT保存成功/失败关闭专项；最终整套及Windows范围见FINAL_REPORT.md |
| UI-CHECK-001 | 修复确认框/复选框无法操作 | 已实现 | src/renderer/layout/AppShell.tsx；src/renderer/components/ | AIT抽屉1920/600实际浏览器、QR/字典/文件页组件；最终整套及Windows范围见FINAL_REPORT.md |
| UI-PROGRESS-001 | 长任务真实进度 | 部分实现 | src/renderer/layout/AppShell.tsx；src/renderer/components/ | 扫描任务/保护专项；PHASE4_PDF_BOM.md；最终整套及Windows范围见FINAL_REPORT.md |
| UI-VISUAL-001 | 信息层级和排版优化 | 部分实现 | src/renderer/layout/AppShell.tsx；src/renderer/components/ | 实际抽屉、PDF、BOM截图；PHASE2/4/5；最终整套及Windows范围见FINAL_REPORT.md |
| UI-TABLE-001 | 表格宽度、对齐、布局记忆 | 部分实现 | src/renderer/layout/AppShell.tsx；src/renderer/components/ | table-layout等整合5文件92项；最终整套及Windows范围见FINAL_REPORT.md |
| PLAN-MODE-001 | 仅新建/批量两种模式 | 已实现 | src/core/planning/；src/renderer/pages/PlanningPage.tsx | 规划服务和页面专项、实际浏览器2项；最终整套及Windows范围见FINAL_REPORT.md |
| PLAN-FLOW-001 | 单型号四步；批量三步；右侧中文编码拆解 | 部分实现 | src/core/planning/；src/renderer/pages/PlanningPage.tsx | 规划5文件59项，浏览器3项（含抽屉）；最终整套及Windows范围见FINAL_REPORT.md |
| PLAN-DRAFT-001 | 草稿独立、切换不丢失 | 部分实现 | src/core/planning/；src/renderer/pages/PlanningPage.tsx | 规划草稿/服务/页面专项；最终整套及Windows范围见FINAL_REPORT.md |
| PLAN-UNIQUE-001 | 完整图号唯一、占号前查重 | 已实现 | src/core/planning/；src/renderer/pages/PlanningPage.tsx | batch-planning-service、规划专项；最终整套及Windows范围见FINAL_REPORT.md |
| PLAN-WHITE-001 | 白色默认共用、非白色独立 | 已实现 | src/core/planning/；src/renderer/pages/PlanningPage.tsx | 白色默认3文件41项；最终整套及Windows范围见FINAL_REPORT.md |
| PLAN-CHECK-001 | 查重/占号/生成依赖保护 | 已实现 | src/core/planning/；src/renderer/pages/PlanningPage.tsx | 规划服务/API/页面专项；最终整套及Windows范围见FINAL_REPORT.md |
| AIT-STRUCT-001 | AIT管理/匹配/项目设置职责分离 | 已实现 | src/core/packaging/packaging-catalog.ts；packaging-matcher.ts；src/renderer/pages/PackagingTemplatesPage.tsx | AIT目录原子保存及组件专项；最终整套及Windows范围见FINAL_REPORT.md |
| AIT-FILE-001 | 直接引用AIT原路径 | 已实现 | src/core/packaging/packaging-catalog.ts；packaging-matcher.ts；src/renderer/pages/PackagingTemplatesPage.tsx | 原路径67项，队列回归39项（交叉）；独立复核；最终整套及Windows范围见FINAL_REPORT.md |
| AIT-PROJECT-001 | 每项目独立配置AIT/现成/人工 | 已实现 | src/core/packaging/packaging-catalog.ts；packaging-matcher.ts；src/renderer/pages/PackagingTemplatesPage.tsx | 任务与监听2文件71项、整合2101/26；DECISIONS_20261117.md；最终整套及Windows范围见FINAL_REPORT.md |
| AIT-MATCH-001 | 品牌/尺寸自动匹配及冲突处理 | 已实现 | src/core/packaging/packaging-catalog.ts；packaging-matcher.ts；src/renderer/pages/PackagingTemplatesPage.tsx | 匹配与任务2文件50项；范围原子保存专项；最终整套及Windows范围见FINAL_REPORT.md |
| AIT-REPLACE-001 | 只替换完整图号文本对象 | 待验证 | src/core/packaging/packaging-catalog.ts；packaging-matcher.ts；src/renderer/pages/PackagingTemplatesPage.tsx | VM及驱动集成专项；PHASE3_PLANNING_AIT.md；最终整套及Windows范围见FINAL_REPORT.md |
| AIT-OUTPUT-001 | 只生成可编辑PDF、不覆盖 | 待验证 | src/core/packaging/packaging-catalog.ts；packaging-matcher.ts；src/renderer/pages/PackagingTemplatesPage.tsx | 自动化/目标冲突专项；最终整套及Windows范围见FINAL_REPORT.md |
| AIT-UI-001 | 右侧抽屉、舒适型列表 | 部分实现 | src/core/packaging/packaging-catalog.ts；packaging-matcher.ts；src/renderer/pages/PackagingTemplatesPage.tsx | UI25项，原子保存专项；最终整套及Windows范围见FINAL_REPORT.md |
| TASK-STRUCT-001 | 独立模块并沿用任务数据 | 已实现 | src/core/packaging/packaging-task-lifecycle.ts；src/renderer/pages/packaging/PackagingTaskPanel.tsx | 任务服务及P0实际浏览器；PHASE1/3；最终整套及Windows范围见FINAL_REPORT.md |
| TASK-LIFE-001 | 唯一任务、恢复、重试 | 已实现 | src/core/packaging/packaging-task-lifecycle.ts；src/renderer/pages/packaging/PackagingTaskPanel.tsx | 安全修复2文件51项，独立复核通过；最终整套及Windows范围见FINAL_REPORT.md |
| TASK-CREATE-001 | 从已占号项目创建、人工文件关联 | 已实现 | src/core/packaging/packaging-task-lifecycle.ts；src/renderer/pages/packaging/PackagingTaskPanel.tsx | 任务服务/文件保护2文件51项；最终整套及Windows范围见FINAL_REPORT.md |
| TASK-EDIT-PDF-001 | 正式PDF副本编辑和安全替换 | 已实现 | src/core/packaging/packaging-task-lifecycle.ts；src/renderer/pages/packaging/PackagingTaskPanel.tsx | 任务服务/迁移2文件51项，复核关闭；最终整套及Windows范围见FINAL_REPORT.md |
| TASK-ARCHIVE-001 | 安全归档、部分失败重试 | 部分实现 | src/core/packaging/packaging-task-lifecycle.ts；src/renderer/pages/packaging/PackagingTaskPanel.tsx | 任务服务、P0、归档保护专项；最终整套及Windows范围见FINAL_REPORT.md |
| PDF-SCAN-001 | 02/03监听、当前类别扫描 | 已实现 | src/core/files/；src/renderer/pages/FilesPage.tsx | 扫描范围与任务注册专项；PHASE4_PDF_BOM.md；最终整套及Windows范围见FINAL_REPORT.md |
| PDF-PROGRESS-001 | >500分批、真实进度、状态区分 | 已实现 | src/core/files/；src/renderer/pages/FilesPage.tsx | 任务/保护/页面专项，pdf-progress-report.md；最终整套及Windows范围见FINAL_REPORT.md |
| PDF-LIST-001 | 筛选、分组、选择和现场保持 | 部分实现 | src/core/files/；src/renderer/pages/FilesPage.tsx | 目录分组3文件51项、4份真实PDF浏览器、501条流程及整合26项；最终整套及Windows范围见FINAL_REPORT.md |
| PDF-VIEW-001 | 内置只读PDF阅读器 | 已实现 | src/core/files/；src/renderer/pages/FilesPage.tsx | dev/build真实文本PDF浏览器2项，类型/构建及API专项；最终整套及Windows范围见FINAL_REPORT.md |
| PDF-META-001 | 业务日期、人工归属、索引安全 | 已实现 | src/core/files/；src/renderer/pages/FilesPage.tsx | 文件服务与管理专项、501条实际浏览器；最终整套及Windows范围见FINAL_REPORT.md |
| BOM-EDIT-001 | 保存后重开加载最新数据 | 已实现 | src/core/bom/；src/renderer/pages/BomPage.tsx | bom-page重开/存储身份/失败回归；PHASE4_PDF_BOM.md；最终整套及Windows范围见FINAL_REPORT.md |
| BOM-CREATE-001 | 新增入口明显、表单重置 | 已实现 | src/core/bom/；src/renderer/pages/BomPage.tsx | bom-page专项；PHASE4_PDF_BOM.md；最终整套及Windows范围见FINAL_REPORT.md |
| BOM-QUERY-001 | 查询筛选、历史和附件保护 | 部分实现 | src/renderer/pages/bom/BomQuery.tsx；BomHistoryComparison.tsx；src/renderer/data/image-pixels.ts | 5文件92项；真实PNG相同/alpha/RGB浏览器；最终整套及Windows范围见FINAL_REPORT.md |
| PRODUCT-001 | 品牌·型号显示和安全停用/删除 | 已实现 | src/renderer/pages/ProductsPage.tsx | 产品页面及QR专项；PHASE5_PRODUCTS_QR_DICTIONARY.md；最终整套及Windows范围见FINAL_REPORT.md |
| QR-001 | 手动上传、启用、产品上下文、像素比较 | 已实现 | src/core/qr/；src/renderer/pages/QrCodesPage.tsx | QR6文件64项、首面真实PDF浏览器、整合2101/26；DECISIONS_20261117.md；最终整套及Windows范围见FINAL_REPORT.md |
| QR-RECIPE-001 | 菜谱按产品类别控制 | 已实现 | src/core/qr/qr-applicability.ts；qr-service.ts；qr-manual-service.ts；QrCodesPage.tsx | API/人工预览/广泛旧配置绕过/页面专项65项；最终整套及Windows范围见FINAL_REPORT.md |
| DICT-001 | 项目明细搜索、父级停用后端校验 | 已实现 | src/core/dictionaries/dictionary-service.ts；src/renderer/pages/DictionariesPage.tsx | 7文件57项、密度2项、最终页面20项；最终整套及Windows范围见FINAL_REPORT.md |
| MIG-EMAIL-001 | 邮件模板导入入口和解析保护 | 已实现 | src/renderer/pages/ImportPage.tsx；src/core/import/ | 原XLSX25候选、2支持/2不支持工作表、无主体厂家、原件SHA不变；最终整套及Windows范围见FINAL_REPORT.md |
| OUT-001 | 按用户选择的批次和文件外发 | 已实现 | src/core/outbound/；src/renderer/pages/OutboundPage.tsx | 外发5文件117项、真实ZIP浏览器；PHASE6_DATABASE_OUTBOUND.md；最终整套及Windows范围见FINAL_REPORT.md |
| OUT-50MB-001 | >50MB独立传输、不进ZIP，ZIP<=50MB | 已实现 | src/core/outbound/；src/renderer/pages/OutboundPage.tsx | 外发117项，超限源文件SHA/ZIP内容/最终上限；最终整套及Windows范围见FINAL_REPORT.md |
| OUT-DRAFT-001 | 草稿跨软件重启恢复，不自动发送 | 已实现 | src/renderer/pages/outbound/；src/core/outbound/ | SQLite关闭重开、延迟保存、实际浏览器重载恢复；最终整套及Windows范围见FINAL_REPORT.md |
| DB-SWITCH-001 | 选择后直接检查切换，失败回退 | 已实现 | src/main/index.ts；database-selection.ts；database-reselection.ts；scripts/production-profile.cjs | 主进程54项、实际服务8项；PHASE6_DATABASE_OUTBOUND.md；最终整套及Windows范围见FINAL_REPORT.md |
| BASELINE-ADD-001 | 继承G/Q已批准增补 | 已实现 | docs/requirements/v16-corrections-20261111.md §15 | 任务书§15及PHASE1/3/4/6证据；最终整套及Windows范围见FINAL_REPORT.md |
