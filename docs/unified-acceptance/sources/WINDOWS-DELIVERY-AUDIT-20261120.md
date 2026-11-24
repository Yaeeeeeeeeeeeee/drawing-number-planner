# 第一批 P0 · Windows 实际交付版本核对报告

2026-11-20（中国标准时间）。本次只读核对了已下载的验收安装包、固定 Git 对象、构建日志、已安装版本记录、Windows 自动化附件及已确认需求。用户本机实际运行的可执行文件不在此次取证范围。

## 1. 安装包来源与 P0 完整性

| 核对项 | 结果 |
| --- | --- |
| 实际交付文件 | `DrawingNumberPlanner-1.6.2-P0-Windows-x64-Setup.exe`，147,190,675 字节，SHA256 `d8b107b3608e9f08080236583a7b8b75525af444073a0653da79fb3eca743c3c`。对已下载附件重新执行 `sha256sum -c SHA256SUMS.txt`，全部通过。 |
| 实际构建提交 | `ca5d58a430983b9875fe7ac46152f65561e9bdad`。Windows 构建使用同一 SHA，原生证据 `installed-version.json` 记录 `packageVersion=1.6.2`、`installedVersion=1.6.2`、`revision=ca5d58a…`。构建日志记录 Schema26。 |
| `9cc98af094f00dc83fb3d565ec7e3692fd8542dd` | 实际交付提交的直接父提交。它对应首轮 Windows 构建，重启时强制脱钩诊断字段被修改，原生验收失败，安装器上传被跳过。 |
| 全部 P0 修改 | 以 `07b9b16205b1adbcab4d19217c833d47fa13926f` 为审计起点，`9cc98af` 的 52 条修改路径与冻结清单一致，在最终交付提交中全部保留。逐一校验冻结清单的 668 个文件，666 个字节级一致，另外两个仅包含已批准的修复及回归测试。最终相对审计起点是 53 条修改路径，因为新增修复的两个文件中有一个已在原清单内。 |
| 两个追加文件 | `src/core/files/file-repository.ts:251` 保留强制脱钩诊断优先级。 `tests/core/v5-force-release.test.ts:63` 复现重开 SQLite 后补扫并核对绑定、索引、哈希及隔离记录。后者属于测试源码，测试文件没有随安装包分发。 |
| 规划工作台差异 | 比较审计起点、`9cc98af` 和最终提交，`src/renderer/pages/PlanningPage.tsx`、`src/renderer/pages/planning/`、`src/renderer/pages/planning-workspace.css` 和 `src/core/planning/` 无差异。P0-3 修改发生在图号库状态读取、展示、筛选和统计。 |

构建链核对了候选提交和干净工作树，随后编译当前 renderer、main 和 service。Windows 原生作业对 359 个已安装文件逐一比对打包目录哈希。发布作业再核对成功运行与安装器归档指纹，复制同一个 EXE 供下载。 [9cc98af 首轮运行](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44684112424) · [实际构建及验收](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44687980891) · [交付作业](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44688845674) · [验收版及附件](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.6.2-p0-acceptance)

## 2. P0-1 至 P0-4 证据分层

| 项目 | 已写入源码 | 交付提交自动化 | 安装包 | Windows 原生已观察范围 |
| --- | --- | --- | --- | --- |
| P0-1 扫描状态与互斥 | `src/core/files/file-service.ts:226` 共用扫描执行和所有者，`src/renderer/pages/useScanProgress.ts:27` 读取状态 | 通过。 `tests/e2e/pdf-scan-ownership.spec.ts:21` 覆盖后台所有者和并发拒绝，另有服务和页面单测 | 含应用实现 | 验证了安装版后台监听、资料索引及制图归档。没有找到覆盖 P0-1 全部扫描来源竞争及进度状态的原生专项证据。 |
| P0-2 取消、I/O 收尾、重启 | `src/core/files/file-service.ts:218`、`src/core/packaging/packaging-workspace.ts:135` 与 `src/main/local-service-controller.ts:92` | 通过。 `tests/e2e/pdf-scan-recovery.spec.ts:19`、`:207` 验证模拟阻塞、保持互斥、退出后再启动、重试 | 含应用实现。120 秒正式默认阈值仍未纳入 | 960 MiB 夹具同库启动和重启通过；安装版补扫保持强制脱钩诊断的断言通过。真实 SMB/NAS 或阻塞 I/O 的原生取消、继任顺序仍无对应专项证据。 |
| P0-3 占号状态 | `src/renderer/pages/drawing-library-presentation.ts:13`、`src/renderer/pages/DrawingLibraryPage.tsx:391`、`src/core/drawings/drawing-repository.ts:205` | 通过。 `tests/e2e/drawing-status.spec.ts:19` 逐项覆盖新占号、重开、过滤与启停；单测覆盖兼容状态及占号保护 | 含应用实现 | 安装版实际确认占号并打开图号库。黄色「待启动」及筛选、状态重开全套断言的直接证据来自 Chromium 专项。 |
| P0-4 成功 scanId 刷新 | `src/renderer/data/query-cache.ts:62`、`src/renderer/pages/FilesPage.tsx:250` 和 `src/renderer/pages/DrawingLibraryPage.tsx:59` | 通过。 `tests/e2e/zc-scan-refresh.spec.ts:27` 覆盖四种 ZC 合成产品、八个外观绑定，以及监听、归档、手动扫描与只读刷新 | 含应用实现 | 安装版验证了通用归类与后台监听/归档；未找到四种 ZC、八外观和两页自动刷新全链路的原生专项证据。合成夹具也不能证明用户现场的正式 ID。 |

交付提交的历史记录显示 Vitest **241 文件 / 2,130 项**、Chromium **30 项**、类型检查和构建均通过。此次核对读取已保存日志，没有重跑测试。原生 Windows 指 GitHub runner 实际运行安装后的应用，用户电脑及真实 SMB/NAS 仍属现场验收。 [Windows 原生证据 ZIP](Verification-Windows-1.6.2-Verified.zip) · [完整 Windows 构建日志](Windows-build-logs.zip) · [交付测试报告](TEST-REPORT.md)

## 3. 「新建图号」与「批量规划」分别核对

旧 V1.6 任务书 §6 要求共用四步。后续《图号规划器 Codex 开发需求书》§6 将**批量图号规划流程与选择器**列为 P1，要求三步。§13 另要求产品选择组件在各场景复用。阶段 B 前置决策 T-03 确认了旧四步**批量**草稿向三步迁移的规则，D-04 确认了批量模板导入范围，二者都排在第一批 P0 之后。《开发需求书》§6 明确指向批量页面，未找到把「新建图号」单型号流程独立改为三步并纳入这次 P0 的批准依据。

### 新建图号

- 实装仍显示「产品资料 → 选择项目 → 图号检查 → 确认占号」。两种模式使用同一 `steps` 数组及步骤渲染，切换模式不会改变步数。正式占号后的 P0-3 状态变更在图号库发生。 [步骤和模式源码](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/src/renderer/pages/PlanningPage.tsx#L20)
- 型号为单选下拉，可选择多个项目，已有中文编码拆解和可调宽右侧预览。Windows 已安装脚本实际从类别/型号下拉进入项目配置、检查、显式确认占号并定位图号库。原生证据截图前缀为 `UI16-图号规划四步检查`。 [单型号选择源码](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/src/renderer/pages/planning/PlanningProductInputs.tsx#L14) · [Windows 原生脚本](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/scripts/verify-ait-packaging-installed.cjs#L83)

### 批量规划

| 已确认界面或行为 | 实际源码和安装包 | 测试证据 |
| --- | --- | --- |
| 产品线分组胶囊、多选、型号前置 | **目标界面尚未实现。** 批量分支是展平的复选框网格，类别下拉只过滤，未按产品线渲染分组标题。每项以「品牌 · 型号」显示，SKU 以小字显示。已实现搜索、复选框选中态和逐个移除，缺少全选当前结果、清空及已选计数。批量已选外观用每型号独立卡片和下拉，尚无统一设置或紧凑外观表。 | Windows 脚本直接切到「批量规划」并按复选框选型号，Chromium 批量测试同样按复选框操作。二者验证的是当前控件。 |
| 三步流程 | **尚未实现。** 批量仍用共同的四步流程，已有单独的第 4 步确认占号。 | 浏览器与 Windows 脚本均明确断言批量草稿的步骤为 `4`。原生报告 `confirmedRequirements.fourStepBatch=true`，证据截图为 `Windows-确认需求-多型号四步确认.png`。 |
| 配置项目 | 已实现不同型号切换、独立项目与草稿保留。第 2 步是型号 Tab 和每项目卡片，未实现 Tab 配置数或未配置提醒、项目表格化、复制到所选型号、D-04 包材模板导入。 | 浏览器与原生均切换两型号、核对各自输入，并分别占到不同图号。 |
| 检查、确认、跳过 | 已实现分组检查、单项重查、明确人工勾选、只提交通过项。现有逻辑保留未成功项的输入。尚无三步版顶部通过/未通过汇总、「仅看未通过」及结果中针对未通过项的专用补充/移除入口。 | 浏览器和原生均验证未勾选时不能确认。单项重查与失败保留输入有组件测试。 |
| 草稿及分步布局 | 已实现两种模式各自保存、恢复原步骤及重新检查，右栏固定为图号预览并支持拖宽。旧四步恢复到新三步的迁移、按步骤切换右栏、吸底通栏和仅有有效草稿才显示删除尚未落地。第 1 步仍渲染禁用的「上一步」。 | 浏览器验证旧版草稿恢复、独立输入、重新检查和拖宽；原生验证批量第 4 步恢复、重新确认并占号。无三步迁移或新布局通过记录。 |

[批量选择器源码](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/src/renderer/pages/planning/PlanningProductInputs.tsx#L6) · [复选网格 CSS](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/src/renderer/pages/planning-workspace.css#L83) · [检查与占号源码](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/src/renderer/pages/PlanningPage.tsx#L68) · [草稿源码](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/src/renderer/pages/planning/usePlanningDrafts.ts#L7) · [批量 Chromium 测试](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/tests/e2e/planning-workspace.spec.ts#L73) · [批量 Windows 原生脚本](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/ca5d58a430983b9875fe7ac46152f65561e9bdad/scripts/verify-confirmed-installed.cjs#L28)

## 4. 第一批 P0 边界

第一批批准范围是扫描状态与互斥、取消/超时机制/重启、图号库「待启动」以及 ZC 成功扫描刷新。批量规划三步、产品线分组胶囊及其跨模块复用、草稿迁移、模板导入、跨型号复制属于后续需求。开发书后续的 PDF 工具栏与视图、图号库通用布局、制图任务列表与详情、二维码布局、AIT、BOM 和项目生成设置 UI 也未列入此批重做。个别页面随 P0 增加了真实扫描状态、状态展示或刷新，既有页面和历史功能继续随包交付。

本次未修改源码、测试、打包配置或数据库，也未启动候选应用或触碰正式资料。以上判断依据交付字节和已保存的运行证据，核查完成后暂停。
