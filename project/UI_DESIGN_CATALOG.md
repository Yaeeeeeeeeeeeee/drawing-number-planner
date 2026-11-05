# UI设计与实现目录

日期：2026-11-05（上海）；审计起点45450c0，发行UI1.5.0。**候选目录，等待用户确认；本轮没有重新设计或更改任何UI。**

## 1. 如何区分设计与现状

| 标记 | 含义 |
|---|---|
| U | 用户原文/需求归档明确要求的结构或操作，不代表每个像素已签收 |
| U-R | 用户后续明确撤销/替代的旧方案，不能恢复为当前默认 |
| A | AI设计/整理/候选/交付说明；可说明来源，不单独证明用户确认 |
| I | 当前代码事实；即使有测试也不能自动提升为U |
| V | 过去的截图/测试/Windows记录；本轮只读取，不是新运行 |
| ? | 原始批准记录缺失、范围有歧义或实际未验证 |

实际生产入口以AppShell及其调用链为准。Mock、PublicUiMock、旧独立外观面板、旧ZIP历史组件存在，不表示日常UI有这些入口。确切状态与来源链见REQUIREMENT_STATUS。

## 2. 页面地图与跳转

`src/renderer/layout/AppShell.tsx:33–53`：

| 分组 | 页面 | 进入/离开与上下文 |
|---|---|---|
| 日常工作 | 图号规划 / 更新包材 | 默认首页；已占号结果→精确图号库；生成文件→带产品与保存ID的制图任务 |
| 日常工作 | 制图任务 | 从规划接入或手选占号；已有任务→继续/详情；详情→历史；辅助批量00操作折叠 |
| 日常工作 | BOM管理 | 新增/查询；图号首次BOM→精确记录；查询→查看/编辑/删除；图片→预览 |
| 日常工作 | 外发资料 | 工作台四步；邮件配置三页签互斥；dirty配置离开有保护；不显示日常历史ZIP区 |
| 产品明细 | 产品档案 | 列表→新增/编辑/退出；用途摘要→QR详情或展开；返回保筛选/滚动 |
| 产品明细 | 图号库 | 树→列表→四组详情；关联诊断/纠正；图号PDF→PDF中心；首次BOM→精确BOM |
| 产品明细 | 二维码管理 | 产品用途展开→详情；子行直接手动关联；详情返回；可返回发起跳转的产品档案 |
| 数据来源 | PDF文件中心 | 产品/批次树与特殊查询入口→列表；批次右键；人工归纳/索引管理弹窗 |
| 数据来源 | 包材模板 | AIT管理/规则/项目设置；不承载任务页面 |
| 数据来源 | 编码字典 | 五一级页签；主类别→子项目；编辑/恢复/删除/永久删除 |
| 数据来源 | 迁移检查 | 字典Excel检查→异常/候选/确认；导入邮件模板模态 |
| 全局入口 | 安全恢复 | 导航底部/原生恢复菜单；任务、界面与进程恢复，不是独立备份管理页 |

宽屏默认展开导航与内容并排；手动隐藏/重开；窄屏<=1023px浮层、遮罩、inert、Esc和焦点循环。阈值、默认导航宽度为I，不当业务规则。各模块辅助树与详情由ModuleWorkspace按可用宽度停靠/抽屉，不能要求所有屏幕都三栏并排。

已访问的规划/任务/模板/产品/QR/PDF/图号按组件逻辑保挂载；BOM/字典/导入不应推断为同等永久缓存。手工主导航可清精确target但保页内状态；图号和外发有离开保护。代码 `AppShell.tsx:64–101,125–160`、`ModuleWorkspace.tsx:18–80`。

## 3. v15三专项与backend review资料定位

| 用户指定名称 | 找到的实际依据 | 不能声称的内容 |
|---|---|---|
| UI catalog v15 | 用户需求归档`docs/packaging-ui-requirements-20261102.md:92–259`；PackagingTemplatesPage/PackagingEditors；catalog专项测试；三页签代码 | 未找到该名字的独立原设计文件或用户逐图确认记录 |
| UI planning v15 | 同需求`:261–350`；PlanningPage、planning-workspace.css；实时预览/结果/精确跳转测试；planning-windows-1920.png | 不把现有布局全部像素/1023阈值当用户批准 |
| UI tasks v15 | 同需求`:352–645`；DrawingTasksPage/PackagingTaskPanel；任务专项；两张Windows任务截图 | 不把旧包材页任务UI或UUID子目录当当前设计 |
| V15 backend review | packaging-ui-workflow计划`:52`声称独立审查无阻塞；源码/测试/旧库摘要可独立核查 | 未找到独立可归属的review全文；不能恢复其未存结论/审查者原话 |

仓库中的`acceptance-recycle-bin-v15.md`、`migrations-v15.test.ts`是**Schema15时期**资料，不是v1.5.0 UI。不能因为同样写v15就交叉认定。

### 3.1 UI catalog v15：包材模板

**U方向**：只负责基础配置，撤出任务和复杂尺寸档案必经流程；图号用中文映射；尺寸用于选模板而不是改设计；保留旧参数/规则兼容。当前三页签采用了用户文档中的组织建议，具体视觉尚不能据“已实现”视为最终认可。

**I页面**：PageHeader，Illustrator状态/必要的未结束操作检查；三个tab；名称搜索、项目、状态、刷新。模板表含模板名/原文件、类别项目、品牌/产品范围、图号映射数、启用、编辑/替换/本机检查。规则表含名称、目标模板、中文条件、长宽互换、状态、编辑。设置以项目、制作方式、匹配依据、保存组织。

**I表单**：标签上方，字段适度网格；模板名/类别/项目/状态，品牌及产品多选；产品多选可搜SKU/型号/品牌。选AIT后自动检查对象/字体，失败仍保手工设置；对象名可输入/自动列表，填入内容只有完整图号，必填勾选，字体自动或手工，新增/移除图号映射，保存/取消。非图号旧映射存储保留，生成不应用。规则是固定模板或数字比较/闭区间，长宽互换不交换高；跨项目换模板清不兼容条件。制作方式AIT/人工/无需；AIT时0/2/3维，保存复用旧key，仍被规则引用的轴不能静默丢。

**I状态**：初次loading；载入失败alert+reload；回页刷新序列防旧响应并保编辑；局部本机检查状态。过滤无结果及空历史提示不完整，G-05。当前没有模板批量删除/新增版本入口，不把它们登记为已确认未实现。

**源码**：`src/renderer/pages/PackagingTemplatesPage.tsx:22–59`，`packaging/PackagingEditors.tsx:31–94`，`packaging/packaging-catalog.css`、`packaging-dimensions.ts`。
**测试规格**：`tests/renderer/packaging-catalog-ui.test.tsx`、`packaging-page-freshness.test.tsx`；本轮未运行。

### 3.2 UI planning v15：图号规划

**U方向**：无制图尺寸区，保留实际查重/占号，字段下紧凑实时预览、成功卡片、复制及精确跳转。

**I布局/交互**：01产品信息（类别/型号/外观+派生品牌尺寸）、02项目行、03查重确认。每行主类、项目、颜色、备注、移除，至少一行；添加项目。行预览完整码/推荐序号/可占用/尚未占号；250ms请求，输入变更后旧响应不覆盖。底部生成文件→查重预览→批量确认，生成入口只有已保存身份可用。批量成功同一紧凑白卡、绿色check、每条完整码及品牌/型号/颜色/项目、复制、右上看图号库；无大面积绿底或单独侧栏。

**I状态/恢复**：不完整禁查重，未获一致preview禁确认；占号冲突显示error，不部分保存；本次成功保留直到主动更改相关输入；回页refresh lookups但保草稿/结果。复制成功不额外插文字/撑行高，失败提示。初次loading与alert语义见G-05；同前缀实时预计值见G-04，不影响正式批量事务。

**源码**：`PlanningPage.tsx:42–189`、`planning-workspace.css:1–42`、`AppShell.tsx:157`、`DrawingLibraryPage.tsx`的navigationTarget。
**V图片**：[规划实际Windows1920](docs/screenshots/v1.5.0/planning-windows-1920.png)。截图本轮查看；其余分辨率在历史验证ZIP，不假装所有已受控保存。
**测试规格**：`tests/renderer/planning-page.test.tsx:178–300`、`tests/core/planning-service.test.ts`、`tests/e2e/phase-two.spec.ts`。

### 3.3 UI tasks v15：制图任务

**U方向**：独立菜单、自动命名/目录、不要UUID标题、紧凑行/展开设置、完成和未完成记录可确认删除且保物理/业务历史。

**I创建**：品牌·型号标题，产品、任务类型；规划target时已保存图号只读带入，无需再勾选；日常直接进入可勾已占号项目。唯一可靠目录自动选，有多个合法目录/不可用时才选。已有未完成只显示紧凑提示+状态+继续。主区无常驻“建00”按钮，辅助操作折叠后可多产品创建。

**I历史**：型号、类型、状态、项目数、创建/完成当地可读时间、查看、删除；固定创建倒序，表头拖序/调宽/重置。不是可按列任意升降排序。有新建/修改记录，删除成功当前列表即时去行。无任务时empty提示不足；回页历史刷新见G-02。

**I详情**：品牌·型号、状态、文件/完成/待处理计数；UUID和完整目录只在诊断details。批量生成、刷新、识别人工、索引重试、归档预览。七字段行：完整码/项目/颜色/制作方式/模板匹配/文件状态/设置检查；设置展开才显示模式、AIT模板/所需尺寸/兼容规格/保存。人工/无需不显示无关尺寸；多候选需手选，不可匹配显示原因。人工待关联指定项目并确认；PDF预览、实际文件检查、确认精确SHA、Illustrator打开、核实备份。

**I归档/删除对话**：归档列目标/替换备份/阻止原因，需整批checkbox再确认；部分失败保文件可重试。带遮罩及焦点管理的删除模态，显示产品/状态/时间和保文件影响；未完成另勾知晓，忙碌/部分归档禁执行并说明；failed保弹窗/输入，旧token恢复不足G-03。不新增审批。

**I响应式**：中等宽行局部滚动，<=700px两列带标签，不把整页撑出；表格/按钮统一共享组件，日期不显示原始ISO。

**源码**：`DrawingTasksPage.tsx:15–33`、`PackagingTaskPanel.tsx:21–128`、`packaging.css:1,5`。
**V图片**：[紧凑任务](docs/screenshots/v1.5.0/drawing-tasks-windows-1920.png)、[历史](docs/screenshots/v1.5.0/task-history-windows-1920.png)。本轮已查看，不等于生产Adobe结果。
**测试规格**：`tests/renderer/drawing-tasks-page.test.tsx`、`packaging-page-freshness.test.tsx`、`tests/e2e/ait-packaging.spec.ts`。

## 4. 其他所有生产页面与操作

### 4.1 PDF文件中心

- U：产品/批次左树，右文件表；不常驻文件详情；右键改内部批次，六图标分左右，筛选不改归属、不限制全批次扫描。
- I顶部：标题/数量、详细信息/根目录/保存/索引统计/布局恢复、当前型号扫描/全库扫描；详情可折叠。产品/QR/PDF顶部冻结与表头关系由已有sticky样式控制。
- I树：搜索SKU/型号/产品名；全部、类别、产品、源文件节点、真实批次、孤立批次/待关联。右键重命名/删除图标菜单，鼠标附近/窗口边缘调整；外点/Esc关闭/键盘，右键不切选择。
- I表：选择、文件名、资料批次、批次状态、产品、匹配图号、匹配状态、类型、文件状态、操作；组合列以实际定义为准，列宽/顺序可改。文件名/批次/匹配码居中。无传统页码，100项后端页逐块虚拟加载，已加载/总数/加载更多失败重试。
- I筛选：快捷全部/源/转曲后/缺失；关键词、匹配、转曲、存在、纳入、手动批次、修改日期起止。手动批次与导航批次相交，不换目录身份。
- I批量：全选已加载、取消、人工归纳；排除、恢复、移除。UI仍需服务预检/确认。管理弹窗含影响/阻止项/确认，不通过按钮改名扩大删除权；人工归纳含具体产品/批次/差异、理由、备份后确认。
- I行操作：查看路径、打开位置，真实无法读不可伪装可开。源文件显示未转曲源文件与批次状态—；不归到首批生产批次。
- I状态：扫描成功统计/本次变化/范围/未匹配；完整失败保上次统计并标本次未知，不强制归零。列表loading保旧数据；元数据静默/背景状态/500条上限差异见G-05/07/08。
- 代码：`FilesPage.tsx:195–557`、`ProductCatalogNavigation.tsx:30–113`、`PdfClassificationDialog.tsx`；测试files-page/pdf-batch-context-menu/pdf-management-page/files-filters-scope。

### 4.2 图号库及详情

- U：型号归类，关联产品不重复SKU；颜色替代版本；主类浅标签/项目一行；状态只两名；四详情组，BOM精确关联。
- I顶部搜索/主类/状态/更多筛选/清除，诊断/一键归类/批量管理；导航全部/待关联/回收站与类别→型号→主类。后端50项逐块虚拟，无传统页码。
- I列表选择、完整码/复制、主类标签/项目、来源、关联产品、颜色、状态、查看/管理；只有完整码规则左对齐，其余按最新显式列定义居中。
- I详情：标题码/复制/来源/状态；01双列SKU/型号/品牌/类别/主类/项目；02源文件与所有转曲后批次，每条文件名省略+打开位置同一行、状态一次、空直接短提示；03首次BOM+日期/精确跳转或未进入；04状态选择、改变所属、保号删/普通释放/独立强释。
- I确认：普通释放先资格原因，不因停用隐藏；强释影响预览/准确码/确认；批量删除逐项结果/阻止/跳过。关联纠正理由/指纹，已有绑定不暗改；批量确认候选并非无条件跨产品猜配。
- I异常：索引缺不直接报磁盘缺；同批次不同内容冲突不任选；不可访问独立状态；旧同号被强释隔离。加载/详情失败保留重试，复制不撑高。
- 代码：`DrawingLibraryPage.tsx:352–534`、`DrawingBatchDeletion.tsx`、`pages/DrawingForceRelease.tsx`、`drawing-library-presentation.ts`；测试drawing-library-page/drawing-v41-page/v5-force-release/drawing-bom-navigation。

### 4.3 BOM新增、查询、编辑、对比

- U：不显示BOM V编号/录入类型；类别在型号前；查询三下拉，项目列；选中左、前驱右；图片点击放大，不常驻文件名/路径/复制；允许精确原地改业务日期。
- I新增表：类别/型号/日期，新增项目，独立图号/白色沿用/生效批次/材质/尺寸/位置/图片/示意图/修改明细/备注。历史只读原值放按需抽屉，QR输入撤出。上传失败保旧选择。
- I查询：型号、主类、项目、日期起止、图号输入、查询/清除；业务日期/提交时间/型号/项目/最后修改/操作，查看/编辑/删一条与整产品删除分开。
- I详情：首次单侧，其他明确前驱比较；默认变化，可切所有字段、全部展开/折叠；新增/移除/变化/待核项目，原始批次快照details；文字自然换行，不压成长单行，不显示无意义0统计。
- I附件：缩略图分别对比图片/示意图，点击共用zoom/pan/gallery；哈希相同不因路径/ID变报变化，不可信待核。BOM详情无复制控件（后续明确取消），不把早期复制按钮建议列漏做。
- I保存/失败：新建成功清录入临时状态；编辑精确ID/revision，刷新列表/详情；前驱失败有说明，不能把失败当首记录。单条删除确认，整产品危险区型号+再确认，保其他历史。
- 代码：`BomPage.tsx:42–202`、`bom/BomEditor.tsx`、`BomQuery.tsx`、`BomHistoryComparison.tsx`、`BomEditComparison.tsx`、`BomAssetPreview.tsx`；tests/bom-v5-controls/bom-page/bom-history-*。

### 4.4 产品档案

- U后续规则：9个拆分身份/用途列、禁止独立外观行展开；指定列居中。早期产品外观行内展开图只作历史，不能恢复。
- I固定顶部标题、新建、识别历史；SKU/型号、品牌、类别、状态过滤；主表SKU/型号/品牌/产品类别/状态/说明书/售后卡/菜谱/编辑，当前全居中，虚拟加载。
- I新增/编辑独立区域：SKU、型号、类别、品牌、品类尺寸、可空默认外观、参考来源；返回/取消/保存；编辑状态与退出另组，不在每行塞危险按钮。活动/停用旧字典项合理显示且保存校验。
- I用途摘要：无记录未配置，任一记录启用则启用，多记录显示数；点用途传真实产品/用途上下文进QR。回页保应用筛选/滚动并刷新。
- I历史候选：准确目录/歧义、SKU/型号/类别/数量，补字典信息后确认并显示关联条数，歧义禁确认。
- I退出：只读影响/展开工作表、保号或释放/保留或清历史两组不预选、型号一次、末确认；阻止原因不隐藏，敏感引用不静默删。
- I空态：无档案/无筛选结果分开；字典/主查询/操作失败分别显示且可重试。
- 代码：`ProductsPage.tsx:59–285`、`ProductCleanupPanel.tsx`、`ProductExitWorksheet.tsx`；tests/products-page/products-dictionaries/product-cleanup-options。

### 4.5 QR主列表、展开、详情与手动弹窗

- U：纯手动文件、用途五列、URL真实独立、文件名简化、业务/文件状态分开。当前主表由V3等后续修改覆盖最早“数量/关联比例”示例。
- I列表：SKU、型号、类别、三用途状态、查看/新增；筛选SKU/型号/类别/用途/状态，虚拟无分页。SKU/型号居中，展开状态保留。
- I子行：用途中、文件左、URL中、状态中、操作中。简名去尾码括号/pdf，完整tooltip；缺失留简名提示；真实网址可打开/复制，无配置—。普通文字操作关联/更换/重联/查看/新增。
- I详情：名称/URL编辑、用途/产品/状态、当前文件与路径/打开、启停、解除、删除；旧手工关联和旧扫描文件默认折叠，无自动候选/匹配区域。删除当前仍原生confirm，与其他内联确认不同，未擅改。
- I关联弹窗：居中portal/遮罩/焦点锁，产品/用途/名称/URL/七位尾码、原生选PDF、文件原名/路径/校验、例外理由与勾选、确认/取消；选择中/保存中防重复/错误关闭。失败保所选，取消无写入；只允许登记文件ID打开，不传任意路径。
- I加载/空：主查询error/retry，辅助产品/用途错误静默可能影响新增，G-05；过滤后未配产品补行语义Q-17。
- 代码：`QrCodesPage.tsx:18–120`、`qr-manual.css`、`desktop-qr-files.ts`；tests/qr-codes-page/qr-manual-*；原生Windows记录不等本轮重验。

### 4.6 编码字典

- U：删除恢复名称可编辑、永久删除受保护；表头/单元名称居中；去常驻拖拽图标/提示。
- I五tab品牌/品类尺寸/外观/颜色/主类；根搜索/状态/已删切换/计数/新增。普通表编码/名称/状态/操作，名称内联编辑编码只读；启停/普通删除/恢复；永久删除先预检、输入完整编码、确认/取消，失败预检失效重查。
- I主类工作区：父类列表、选中子项目表及内联新增/编辑，停用父禁界面新增；搜索未包含子项，UI/API约束边界Q-11。
- I空/加载/异常：无数据/无匹配/无主类/未选父/无项目分开；请求序列防旧响应，失败重试/禁新增。
- 代码：`DictionariesPage.tsx:12–174`、`DictionaryPermanentDelete.tsx`；tests/dictionaries-density/dictionary-restore-edit/dictionary-permanent-delete。

### 4.7 迁移检查与邮件导入

- I字典检查：Excel选择（真实xls需另存），检查、摘要，异常/候选视图；异常项展开原因，关键词/字典范围/结果筛；候选复选、全选所有可导入、取消；筛选外已选明确提示；底部确认。
- I检查不是全库数据审计，只识别固定编码字典sheet/列；冲突不能选，失败保选择，成功消费报告；服务有任务API不等本页有取消后台按钮。
- I邮件模态：同一迁移页入口，无重复邮件配置导入；sheet支持/不支持、候选来源/厂家/场景、收抄送/主题/正文/签名/原始案例折叠。每条选择及新增/更新/跳过；独立联系人新增/复用/跳过/角色，原公司不被模板厂家强改；签名单独确认不设默认；每条历史/话术核对勾选。
- I底部固定选择数、导入按钮/忙碌/错误/成功近邻；失败保编辑与已选文件/审查，成功锁定已消费；关闭焦点恢复。未知/不支持不静默导入。
- 代码：`ImportPage.tsx:25–55`、`EmailTemplateImport.tsx:17–88`；tests/import-page/email-template-import/email-template-provenance。

### 4.8 外发工作台、本次结果、邮件配置/草稿

- U：品牌/类别/产品型号/批次/资料类型/打包范围，真实预览/检查/ZIP/邮件四步骤；默认转曲，BOM辅助；无日常ZIP历史区/额外材料入口。
- I文件表：选中、文件名（较宽）、完整码居中、来源、状态、查看；可用/需核对计数，全选可用/清选择；文件详情抽屉有实际hash/大小/路径/基准/BOM，人工理由至少5字并绑定hash，重预览后选中清理。
- I生成：预检清单/阻止、确认后原生选输出目录，取消不创建；真实分包结果名/大小/文件数/每包路径/打开。保存在原包/快照不等历史UI仍展示。
- I邮件配置互斥三tab（模板/签名/联系人）；可新增/编辑/启停/删除，单编辑器和dirty离开保护。模板字段/厂家/场景/subject/body/变量预览/原始来源折叠；联系人公司/称呼/邮箱/默认角色/备注；签名单独default。
- I草稿：成功ZIP才有上下文，选厂家/类型/场景、收抄可编辑、变更项理由/BOM读入、显示文件控制、合并/顺序/移除说明不改ZIP；手改正文保留，新上下文需确认替换，签名一次。复制各段/完整邮件，未知占位阻止复制，不自动发送。React草稿不等持久保存，Q-13。
- I状态：变化条件使预览/结果失效；并发序列防旧结果；错误保足够输入可重试；保存成功但刷新失败不重写。遗留target类别赋值风险G-10；当前未找到日常入口，普通手选不证明该兼容路径。
- 代码：`OutboundPage.tsx:18–57`、`outbound/PackageBuilder.tsx:47–251`、`PackageResult.tsx`、`EmailComposer.tsx:49–185`、`MailConfiguration.tsx`、`TemplateSettings.tsx`。

### 4.9 设置、安全恢复与首次数据库选择

- I没有独立“软件设置”总菜单。资料根在PDF详细信息；外发输出原生选取；布局设置在本机表格/导航。安装后的旧/新数据库选择是原生窗口，与业务web页面不同。
- I旧库窗口选planner.db，不是选PDF/Excel；新库直接另建，普通重启不弹选择；每次安装marker使首次再次问。桌面安装Shell选择与数据选择独立。
- I安全恢复浮层：状态、通用本地任务、结束任务、重载界面、重启本地服务、重启软件、确认/错误/重试；有任务需说明影响，服务重启与整机重启流程不完全一样。
- I不提供DB备份恢复/重新选数据目录/完整资料备份界面，尽管安装说明声称安全恢复能选库，G-11。不要虚构已有页面截图。
- 代码：`SafeRecovery.tsx:95–132`、`main/recovery-controller.ts`、`scripts/production-profile.cjs`、`scripts/comprehensive-windows-installer.iss`；tests/safe-recovery/recovery-feedback/production-profile/installer-data-policy。

## 5. 共享组件及视觉/状态一致性

| 内容 | 现有组件/代码 | 设计与实现边界 |
|---|---|---|
| 标题 | PageHeader.tsx:4–7 | 不渲染description，避免重复副标题；传参存在不代表有文字 |
| 表格 | DataTable/LayoutTable/useTableLayout | 拖表头/锁边界/Alt移动、边缘pointer和键盘调宽、双击适应、重置、LocalStorage；列序非行排序 |
| 总宽稳定 | LayoutTable.tsx:20–34、useTableLayout.ts | 测容器扣边框/padding、最右可伸缩列接收，真实min不足才局部横滚；不承诺所有宽度永不滚 |
| 列对齐 | 每页columns.align + columnAlignment | V5.2指定列覆盖旧身份左对齐；操作组居中，不只按钮自身 |
| 视口/虚拟 | VirtualTableRows/useWorkspaceExtent/ViewportRegion | 分块/overscan/滚动key；后端pageSize和UI分页不是同义 |
| 导航/详情 | ModuleWorkspace/ProductCatalogNavigation | 局部可调宽、停靠/抽屉、遮罩/焦点；状态变化不应重新定义目录归属 |
| 图标/按钮 | Lucide、CopyButton、shared CSS | 六PDF图标靠title/aria-label可识别；忙碌禁重复，危险与普通有间距；确切尺寸为I |
| 图片 | ImagePreviewDialog.tsx:6–50 | 滚轮/按钮缩放、拖动、fit、多图箭头、Esc/Tab、读取失败；不显示多余文件名/打开位置 |
| 模态 | useModalFocus及各portal | 初始焦点、Tab/Esc/返回；QR删除window.confirm仍是当前差异 |
| 查询反馈 | QueryFeedback/EmptyState | 组件已存在不代表所有页面/元数据路径都使用，G-05 |
| 业务状态 | drawing-library-presentation与各领域映射 | 名称必须保留；浅色类别标签不表示使用状态，文件缺不推停用 |
| 缓存 | data/query-cache.ts、client-cache-invalidation测试 | scoped缓存/失效/旧请求保护；不等于自动实时刷新全部历史/磁盘 |

## 6. 历史设计与资源家族

| 家族 | 对应资料 | 当前使用方式 |
|---|---|---|
| 早期图号/BOM/产品/外发Mock | drawing-library-v3、bom-ui-v1/v2、products-ui-v1、outbound-ui-v1-acceptance | 当时设计/候选证据；待验收/未冻结字样保留，不能自行补为批准 |
| 灰阶工程工作区 | minimal-engineering-workspace-design、p1/p2/p3、p4-workspace/adaptive | 后续布局方向/实施记录；不能把旧禁止打包当今天永久规则 |
| P4截图反馈 | filter/detail/product-purpose/bom-history/bom-edit/layout/floating-navigation等文档 | 记录具体后续修改，未有完整原对话处标转述；新V3–V5.2明确覆盖者不恢复 |
| 综合改版 | comprehensive-redesign-preflight、delivery、verification与screenshots | preflight明确待确认，delivery是实现声明；旧多外观设计后来撤销 |
| V3–V5.2 | requirements、reports、deliveries、UI consistency audit | 逐条取明确最新范围，旧文件不整体一票否决或整体Current |
| v1.5 | packaging-ui requirements/plan/delivery、三张真实WindowsPNG | 最新专项；有执行与截图证据，但真实Adobe/正式库/DPI仍未验 |

受控文件中没有fig/sketch/xd/AIT/AI/PDF/XLSX设计原稿；不据PNG构造不存在的Figma/Spline源文件。原始聊天参考图和私人Excel不在受控图片清单内，不重复上传个人信息。

## 7. 图片索引与确认状态

下列**187张受控PNG**逐文件列位置、像素尺寸、对应模块/家族。页面对应按文件名及同目录验收文档定位；不能唯一识别者明确待核。旧图不据当前代码重建。文件名含existing-empty/sample/mock/windows只是资料线索，实际数据/平台以相邻记录为准。

本轮实际查看了三张v1.5 Windows图；187张清单中其余184张历史图建立索引并查其所属记录，**没有宣称逐张重新执行/验收，也没有完整的用户逐图批准证据**。即使图表明曾原生运行，仍属V，不自动成为U。


### 7.1 docs/p4-adaptive-visuals-20261015（40张）

关联记录：[docs/p4-adaptive-data-workspaces-20261015.md](docs/p4-adaptive-data-workspaces-20261015.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/p4-adaptive-visuals-20261015/bom-add-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-add-1024-existing-empty.png) | 1024×720 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/bom-add-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-add-1366-existing-empty.png) | 1366×768 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/bom-add-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-add-1920-existing-empty.png) | 1920×1080 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/bom-add-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-add-3840-existing-empty.png) | 3840×2160 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/bom-query-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-query-1024-existing-empty.png) | 1024×720 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/bom-query-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-query-1366-existing-empty.png) | 1366×768 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/bom-query-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-query-1920-existing-empty.png) | 1920×1080 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/bom-query-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/bom-query-3840-existing-empty.png) | 3840×2160 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/dictionary-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/dictionary-1024-existing-empty.png) | 1024×720 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/dictionary-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/dictionary-1366-existing-empty.png) | 1366×768 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/dictionary-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/dictionary-1920-existing-empty.png) | 1920×1080 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/dictionary-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/dictionary-3840-existing-empty.png) | 3840×2160 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/drawings-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/drawings-1024-existing-empty.png) | 1024×720 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/drawings-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/drawings-1366-existing-empty.png) | 1366×768 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/drawings-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/drawings-1920-existing-empty.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/drawings-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/drawings-3840-existing-empty.png) | 3840×2160 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/files-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/files-1024-existing-empty.png) | 1024×720 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/files-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/files-1366-existing-empty.png) | 1366×768 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/files-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/files-1920-existing-empty.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/files-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/files-3840-existing-empty.png) | 3840×2160 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/migration-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/migration-1024-existing-empty.png) | 1024×720 | 迁移检查（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/migration-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/migration-1366-existing-empty.png) | 1366×768 | 迁移检查（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/migration-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/migration-1920-existing-empty.png) | 1920×1080 | 迁移检查（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/migration-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/migration-3840-existing-empty.png) | 3840×2160 | 迁移检查（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/outbound-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/outbound-1024-existing-empty.png) | 1024×720 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/outbound-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/outbound-1366-existing-empty.png) | 1366×768 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/outbound-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/outbound-1920-existing-empty.png) | 1920×1080 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/outbound-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/outbound-3840-existing-empty.png) | 3840×2160 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/planning-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/planning-1024-existing-empty.png) | 1024×720 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/planning-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/planning-1366-existing-empty.png) | 1366×768 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/planning-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/planning-1920-existing-empty.png) | 1920×1080 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/planning-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/planning-3840-existing-empty.png) | 3840×2160 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/products-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/products-1024-existing-empty.png) | 1024×720 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/products-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/products-1366-existing-empty.png) | 1366×768 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/products-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/products-1920-existing-empty.png) | 1920×1080 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/products-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/products-3840-existing-empty.png) | 3840×2160 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/qr-1024-existing-empty.png](docs/p4-adaptive-visuals-20261015/qr-1024-existing-empty.png) | 1024×720 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/qr-1366-existing-empty.png](docs/p4-adaptive-visuals-20261015/qr-1366-existing-empty.png) | 1366×768 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/qr-1920-existing-empty.png](docs/p4-adaptive-visuals-20261015/qr-1920-existing-empty.png) | 1920×1080 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-adaptive-visuals-20261015/qr-3840-existing-empty.png](docs/p4-adaptive-visuals-20261015/qr-3840-existing-empty.png) | 3840×2160 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.2 docs/p4-detail-feedback-visuals-20261016（8张）

关联记录：[docs/p4-bom-edit-corrections-20261016.md](docs/p4-bom-edit-corrections-20261016.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/p4-detail-feedback-visuals-20261016/outbound-1366-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/outbound-1366-existing-empty.png) | 1366×768 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-detail-feedback-visuals-20261016/outbound-1920-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/outbound-1920-existing-empty.png) | 1920×1080 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-detail-feedback-visuals-20261016/outbound-3840-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/outbound-3840-existing-empty.png) | 3840×2160 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-detail-feedback-visuals-20261016/outbound-720-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/outbound-720-existing-empty.png) | 720×600 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-detail-feedback-visuals-20261016/planning-1366-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/planning-1366-existing-empty.png) | 1366×768 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-detail-feedback-visuals-20261016/planning-1920-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/planning-1920-existing-empty.png) | 1920×1080 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-detail-feedback-visuals-20261016/planning-3840-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/planning-3840-existing-empty.png) | 3840×2160 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-detail-feedback-visuals-20261016/planning-720-existing-empty.png](docs/p4-detail-feedback-visuals-20261016/planning-720-existing-empty.png) | 720×600 | 图号规划（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.3 docs/p4-filter-visuals-20261016（12张）

关联记录：[docs/p4-filter-feedback-20261016.md](docs/p4-filter-feedback-20261016.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/p4-filter-visuals-20261016/drawings-expanded-1366-existing-empty.png](docs/p4-filter-visuals-20261016/drawings-expanded-1366-existing-empty.png) | 1366×768 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/drawings-expanded-1920-existing-empty.png](docs/p4-filter-visuals-20261016/drawings-expanded-1920-existing-empty.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/drawings-expanded-3840-existing-empty.png](docs/p4-filter-visuals-20261016/drawings-expanded-3840-existing-empty.png) | 3840×2160 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/files-1366-existing-empty.png](docs/p4-filter-visuals-20261016/files-1366-existing-empty.png) | 1366×768 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/files-1920-existing-empty.png](docs/p4-filter-visuals-20261016/files-1920-existing-empty.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/files-3840-existing-empty.png](docs/p4-filter-visuals-20261016/files-3840-existing-empty.png) | 3840×2160 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/outbound-1366-existing-empty.png](docs/p4-filter-visuals-20261016/outbound-1366-existing-empty.png) | 1366×768 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/outbound-1920-existing-empty.png](docs/p4-filter-visuals-20261016/outbound-1920-existing-empty.png) | 1920×1080 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/outbound-3840-existing-empty.png](docs/p4-filter-visuals-20261016/outbound-3840-existing-empty.png) | 3840×2160 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/qr-1366-existing-empty.png](docs/p4-filter-visuals-20261016/qr-1366-existing-empty.png) | 1366×768 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/qr-1920-existing-empty.png](docs/p4-filter-visuals-20261016/qr-1920-existing-empty.png) | 1920×1080 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-filter-visuals-20261016/qr-3840-existing-empty.png](docs/p4-filter-visuals-20261016/qr-3840-existing-empty.png) | 3840×2160 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.4 docs/p4-visual-evidence-20261015（3张）

关联记录：[docs/p4-workspace-refinement-20261015.md](docs/p4-workspace-refinement-20261015.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/p4-visual-evidence-20261015/drawing-details.png](docs/p4-visual-evidence-20261015/drawing-details.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-visual-evidence-20261015/pdf-overlay-and-tree.png](docs/p4-visual-evidence-20261015/pdf-overlay-and-tree.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/p4-visual-evidence-20261015/product-qr-direct.png](docs/p4-visual-evidence-20261015/product-qr-direct.png) | 1920×1080 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.5 docs/screenshots/comprehensive-20261020（4张）

关联记录：[docs/comprehensive-redesign-preflight-20261020.md](docs/comprehensive-redesign-preflight-20261020.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/comprehensive-20261020/qr-manual-1366.png](docs/screenshots/comprehensive-20261020/qr-manual-1366.png) | 1366×768 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-20261020/qr-manual-1920.png](docs/screenshots/comprehensive-20261020/qr-manual-1920.png) | 1920×1080 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-20261020/qr-manual-2560.png](docs/screenshots/comprehensive-20261020/qr-manual-2560.png) | 2560×1440 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-20261020/qr-manual-3840.png](docs/screenshots/comprehensive-20261020/qr-manual-3840.png) | 3840×2160 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.6 docs/screenshots/comprehensive-windows-20261021（10张）

关联记录：[docs/comprehensive-redesign-delivery-20261021.md](docs/comprehensive-redesign-delivery-20261021.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/comprehensive-windows-20261021/bom-1920.png](docs/screenshots/comprehensive-windows-20261021/bom-1920.png) | 1920×1080 | BOM（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/chinese-installer.png](docs/screenshots/comprehensive-windows-20261021/chinese-installer.png) | 612×471 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/drawings-1920.png](docs/screenshots/comprehensive-windows-20261021/drawings-1920.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/outbound-1920.png](docs/screenshots/comprehensive-windows-20261021/outbound-1920.png) | 1920×1080 | 外发资料（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/pdf-1920.png](docs/screenshots/comprehensive-windows-20261021/pdf-1920.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/products-1920.png](docs/screenshots/comprehensive-windows-20261021/products-1920.png) | 1920×1080 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/qr-1920.png](docs/screenshots/comprehensive-windows-20261021/qr-1920.png) | 1920×1080 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/qr-after-restart.png](docs/screenshots/comprehensive-windows-20261021/qr-after-restart.png) | 1008×681 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/qr-manual-validation.png](docs/screenshots/comprehensive-windows-20261021/qr-manual-validation.png) | 1008×681 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/comprehensive-windows-20261021/qr-replacement-validation.png](docs/screenshots/comprehensive-windows-20261021/qr-replacement-validation.png) | 1008×681 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.7 docs/screenshots/p4-bom-edit-fix-20261016（3张）

关联记录：[docs/p4-bom-edit-corrections-20261016.md](docs/p4-bom-edit-corrections-20261016.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/p4-bom-edit-fix-20261016/developer-mock-1100.png](docs/screenshots/p4-bom-edit-fix-20261016/developer-mock-1100.png) | 1100×1080 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-edit-fix-20261016/developer-mock-1920.png](docs/screenshots/p4-bom-edit-fix-20261016/developer-mock-1920.png) | 1920×1080 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-edit-fix-20261016/developer-mock-3840.png](docs/screenshots/p4-bom-edit-fix-20261016/developer-mock-3840.png) | 3840×2160 | BOM（目录定位） | V：历史图；用户逐图确认待核 |

### 7.8 docs/screenshots/p4-bom-history-20261016（7张）

关联记录：[docs/p4-bom-history-comparison-20261016.md](docs/p4-bom-history-comparison-20261016.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/p4-bom-history-20261016/developer-mock-1100.png](docs/screenshots/p4-bom-history-20261016/developer-mock-1100.png) | 1100×760 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-history-20261016/developer-mock-1920.png](docs/screenshots/p4-bom-history-20261016/developer-mock-1920.png) | 1920×1080 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-history-20261016/developer-mock-3840.png](docs/screenshots/p4-bom-history-20261016/developer-mock-3840.png) | 3840×2160 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-history-20261016/developer-mock-field-comparison.png](docs/screenshots/p4-bom-history-20261016/developer-mock-field-comparison.png) | 1650×1025 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-history-20261016/existing-sample-1100.png](docs/screenshots/p4-bom-history-20261016/existing-sample-1100.png) | 1100×760 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-history-20261016/existing-sample-1920.png](docs/screenshots/p4-bom-history-20261016/existing-sample-1920.png) | 1920×1080 | BOM（目录定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-bom-history-20261016/existing-sample-3840.png](docs/screenshots/p4-bom-history-20261016/existing-sample-3840.png) | 3840×2160 | BOM（目录定位） | V：历史图；用户逐图确认待核 |

### 7.9 docs/screenshots/p4-drawing-alignment-20261017（18张）

关联记录：[docs/p4-layout-feedback-20261017.md](docs/p4-layout-feedback-20261017.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/p4-drawing-alignment-20261017/after-copy-1100.png](docs/screenshots/p4-drawing-alignment-20261017/after-copy-1100.png) | 1100×760 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/after-copy-1920.png](docs/screenshots/p4-drawing-alignment-20261017/after-copy-1920.png) | 1920×1080 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/after-copy-3840.png](docs/screenshots/p4-drawing-alignment-20261017/after-copy-3840.png) | 3840×2160 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/files-navigation-1100.png](docs/screenshots/p4-drawing-alignment-20261017/files-navigation-1100.png) | 1100×760 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/files-navigation-1920.png](docs/screenshots/p4-drawing-alignment-20261017/files-navigation-1920.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/files-navigation-3840.png](docs/screenshots/p4-drawing-alignment-20261017/files-navigation-3840.png) | 3840×2160 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/product-scope-1100.png](docs/screenshots/p4-drawing-alignment-20261017/product-scope-1100.png) | 1100×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/product-scope-1920.png](docs/screenshots/p4-drawing-alignment-20261017/product-scope-1920.png) | 1920×1080 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/product-scope-3840.png](docs/screenshots/p4-drawing-alignment-20261017/product-scope-3840.png) | 3840×2160 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/products-centered-1100.png](docs/screenshots/p4-drawing-alignment-20261017/products-centered-1100.png) | 1100×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/products-centered-1920.png](docs/screenshots/p4-drawing-alignment-20261017/products-centered-1920.png) | 1920×1080 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/products-centered-3840.png](docs/screenshots/p4-drawing-alignment-20261017/products-centered-3840.png) | 3840×2160 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/qr-no-count-1100.png](docs/screenshots/p4-drawing-alignment-20261017/qr-no-count-1100.png) | 1100×760 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/qr-no-count-1920.png](docs/screenshots/p4-drawing-alignment-20261017/qr-no-count-1920.png) | 1920×1080 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/qr-no-count-3840.png](docs/screenshots/p4-drawing-alignment-20261017/qr-no-count-3840.png) | 3840×2160 | 二维码（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/recovery-compact-1100.png](docs/screenshots/p4-drawing-alignment-20261017/recovery-compact-1100.png) | 1100×760 | 安全恢复（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/recovery-compact-1920.png](docs/screenshots/p4-drawing-alignment-20261017/recovery-compact-1920.png) | 1920×1080 | 安全恢复（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-drawing-alignment-20261017/recovery-compact-3840.png](docs/screenshots/p4-drawing-alignment-20261017/recovery-compact-3840.png) | 3840×2160 | 安全恢复（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.10 docs/screenshots/p4-floating-navigation-20261019（45张）

关联记录：[docs/p4-floating-navigation-20261019.md](docs/p4-floating-navigation-20261019.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/p4-floating-navigation-20261019/batch-labels-1920.png](docs/screenshots/p4-floating-navigation-20261019/batch-labels-1920.png) | 215×661 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-parent-project-actions-1920.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-parent-project-actions-1920.png) | 1920×1080 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1023.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1023.png) | 1023×760 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1024.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1024.png) | 1024×760 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1100.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1100.png) | 1100×760 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1920.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-1920.png) | 1920×1080 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-3840.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-3840.png) | 3840×2160 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-720.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-permanent-delete-720.png) | 720×600 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1023.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1023.png) | 1023×760 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1024.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1024.png) | 1024×760 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1100.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1100.png) | 1100×760 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1920.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-1920.png) | 1920×1080 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-3840.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-3840.png) | 3840×2160 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-720.png](docs/screenshots/p4-floating-navigation-20261019/dictionary-restored-edit-720.png) | 720×600 | 编码字典（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/drawing-category-closeup.png](docs/screenshots/p4-floating-navigation-20261019/drawing-category-closeup.png) | 190×180 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1023.png](docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1023.png) | 1023×760 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1024.png](docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1024.png) | 1024×760 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1100.png](docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1100.png) | 1100×760 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1920.png](docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-1920.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-3840.png](docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-3840.png) | 3840×2160 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-720.png](docs/screenshots/p4-floating-navigation-20261019/drawing-source-category-720.png) | 720×600 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1023.png](docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1023.png) | 1023×760 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1024.png](docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1024.png) | 1024×760 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1100.png](docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1100.png) | 1100×760 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1920.png](docs/screenshots/p4-floating-navigation-20261019/navigation-closed-1920.png) | 1920×1080 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-closed-3840.png](docs/screenshots/p4-floating-navigation-20261019/navigation-closed-3840.png) | 3840×2160 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-closed-720.png](docs/screenshots/p4-floating-navigation-20261019/navigation-closed-720.png) | 720×600 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-open-1023.png](docs/screenshots/p4-floating-navigation-20261019/navigation-open-1023.png) | 1023×760 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-open-1024.png](docs/screenshots/p4-floating-navigation-20261019/navigation-open-1024.png) | 1024×760 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-open-1100.png](docs/screenshots/p4-floating-navigation-20261019/navigation-open-1100.png) | 1100×760 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-open-1920.png](docs/screenshots/p4-floating-navigation-20261019/navigation-open-1920.png) | 1920×1080 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-open-3840.png](docs/screenshots/p4-floating-navigation-20261019/navigation-open-3840.png) | 3840×2160 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/navigation-open-720.png](docs/screenshots/p4-floating-navigation-20261019/navigation-open-720.png) | 720×600 | 导航/关联工作区；具体页待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1023.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1023.png) | 1023×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1024.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1024.png) | 1024×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1100.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1100.png) | 1100×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1920.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-1920.png) | 1920×1080 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-3840.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-3840.png) | 3840×2160 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-720.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-buttons-720.png) | 720×600 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1023.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1023.png) | 1023×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1024.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1024.png) | 1024×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1100.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1100.png) | 1100×760 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1920.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-1920.png) | 1920×1080 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-3840.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-3840.png) | 3840×2160 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-720.png](docs/screenshots/p4-floating-navigation-20261019/product-cleanup-review-720.png) | 720×600 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.11 docs/screenshots/p4-integrated-20261017（18张）

关联记录：[docs/p4-integrated-ui-20261017.md](docs/p4-integrated-ui-20261017.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/p4-integrated-20261017/contact-editor-1100.png](docs/screenshots/p4-integrated-20261017/contact-editor-1100.png) | 1100×760 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/contact-editor-1920.png](docs/screenshots/p4-integrated-20261017/contact-editor-1920.png) | 1920×1080 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/contact-editor-3840.png](docs/screenshots/p4-integrated-20261017/contact-editor-3840.png) | 3840×2160 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/drawing-detail-1100.png](docs/screenshots/p4-integrated-20261017/drawing-detail-1100.png) | 1100×760 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/drawing-detail-1920.png](docs/screenshots/p4-integrated-20261017/drawing-detail-1920.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/drawing-detail-3840.png](docs/screenshots/p4-integrated-20261017/drawing-detail-3840.png) | 3840×2160 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-联系人-1100.png](docs/screenshots/p4-integrated-20261017/mail-%E8%81%94%E7%B3%BB%E4%BA%BA-1100.png) | 1100×760 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-联系人-1920.png](docs/screenshots/p4-integrated-20261017/mail-%E8%81%94%E7%B3%BB%E4%BA%BA-1920.png) | 1920×1080 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-联系人-3840.png](docs/screenshots/p4-integrated-20261017/mail-%E8%81%94%E7%B3%BB%E4%BA%BA-3840.png) | 3840×2160 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-邮件模板-1100.png](docs/screenshots/p4-integrated-20261017/mail-%E9%82%AE%E4%BB%B6%E6%A8%A1%E6%9D%BF-1100.png) | 1100×760 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-邮件模板-1920.png](docs/screenshots/p4-integrated-20261017/mail-%E9%82%AE%E4%BB%B6%E6%A8%A1%E6%9D%BF-1920.png) | 1920×1080 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-邮件模板-3840.png](docs/screenshots/p4-integrated-20261017/mail-%E9%82%AE%E4%BB%B6%E6%A8%A1%E6%9D%BF-3840.png) | 3840×2160 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-邮件签名-1100.png](docs/screenshots/p4-integrated-20261017/mail-%E9%82%AE%E4%BB%B6%E7%AD%BE%E5%90%8D-1100.png) | 1100×760 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-邮件签名-1920.png](docs/screenshots/p4-integrated-20261017/mail-%E9%82%AE%E4%BB%B6%E7%AD%BE%E5%90%8D-1920.png) | 1920×1080 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/mail-邮件签名-3840.png](docs/screenshots/p4-integrated-20261017/mail-%E9%82%AE%E4%BB%B6%E7%AD%BE%E5%90%8D-3840.png) | 3840×2160 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/workbench-1100.png](docs/screenshots/p4-integrated-20261017/workbench-1100.png) | 1100×760 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/workbench-1920.png](docs/screenshots/p4-integrated-20261017/workbench-1920.png) | 1920×1080 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-integrated-20261017/workbench-3840.png](docs/screenshots/p4-integrated-20261017/workbench-3840.png) | 3840×2160 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |

### 7.12 docs/screenshots/p4-pdf-navigation-20261019（13张）

关联记录：[docs/p4-pdf-navigation-20261019.md](docs/p4-pdf-navigation-20261019.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/p4-pdf-navigation-20261019/drawing-pdf-side-by-side-1920.png](docs/screenshots/p4-pdf-navigation-20261019/drawing-pdf-side-by-side-1920.png) | 1920×650 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/drawings-empty-1920.png](docs/screenshots/p4-pdf-navigation-20261019/drawings-empty-1920.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/drawings-empty-800.png](docs/screenshots/p4-pdf-navigation-20261019/drawings-empty-800.png) | 800×650 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/drawings-shared-1920.png](docs/screenshots/p4-pdf-navigation-20261019/drawings-shared-1920.png) | 1920×1080 | 图号库（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-empty-1920.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-empty-1920.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-empty-800.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-empty-800.png) | 800×650 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-1280.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-1280.png) | 1280×800 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-1920.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-1920.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-2560.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-2560.png) | 2560×1440 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-3840.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-3840.png) | 3840×2160 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-800.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-navigation-800.png) | 800×650 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/pdf-shared-1920.png](docs/screenshots/p4-pdf-navigation-20261019/pdf-shared-1920.png) | 1920×1080 | PDF文件中心（文件名定位） | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-pdf-navigation-20261019/product-bulk-confirmation-40.png](docs/screenshots/p4-pdf-navigation-20261019/product-bulk-confirmation-40.png) | 1920×1080 | 产品档案（文件名定位） | V：历史图；用户逐图确认待核 |

### 7.13 docs/screenshots/p4-products-list-20261016（3张）

关联记录：[docs/p4-products-list-20261016.md](docs/p4-products-list-20261016.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/p4-products-list-20261016/api-fixture-1100.png](docs/screenshots/p4-products-list-20261016/api-fixture-1100.png) | 1100×760 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-products-list-20261016/api-fixture-1920.png](docs/screenshots/p4-products-list-20261016/api-fixture-1920.png) | 1920×1080 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |
| [docs/screenshots/p4-products-list-20261016/api-fixture-3840.png](docs/screenshots/p4-products-list-20261016/api-fixture-3840.png) | 3840×2160 | 全局/具体页面待核 | V：历史图；用户逐图确认待核 |

### 7.14 docs/screenshots/v1.5.0（3张）

关联记录：[docs/packaging-ui-delivery-20261102.md](docs/packaging-ui-delivery-20261102.md)。此关联是资料家族定位，不代表原文件内每一图片都获用户批准。

| 图片位置 | 像素 | 页面索引 | 证据/确认状态 |
|---|---|---|---|
| [docs/screenshots/v1.5.0/drawing-tasks-windows-1920.png](docs/screenshots/v1.5.0/drawing-tasks-windows-1920.png) | 1920×1000 | 制图任务（文件名定位） | V：已存原生截图；本轮查看，非用户逐图签认 |
| [docs/screenshots/v1.5.0/planning-windows-1920.png](docs/screenshots/v1.5.0/planning-windows-1920.png) | 1920×1000 | 图号规划（文件名定位） | V：已存原生截图；本轮查看，非用户逐图签认 |
| [docs/screenshots/v1.5.0/task-history-windows-1920.png](docs/screenshots/v1.5.0/task-history-windows-1920.png) | 1920×1000 | 制图任务（文件名定位） | V：已存原生截图；本轮查看，非用户逐图签认 |

## 8. 未受控/未取得的资源

- `work/v15/release/verification/`：此前下载并解压的Windows报告/多分辨率图，属于忽略工作产物；没有移动/删除，也不把其所有文件作为永久项目源。受控摘要S20和Release验证ZIP才是可分享追溯入口。
- 旧work中的构建缓存、源码archive、原Excel/匿名工作簿/脚本属于执行辅助或私人材料；未把它们作为用户UI批准记录，不复制真实邮箱/签名/业务库到审计。
- 原始聊天上传示例图、完整可编辑设计稿及四份v15工作项原报告未形成可核验完整受控链，列Q-01/Q-25。
- 三个历史设计Skill（ui-ux-pro-max、frontend-design、impeccable）的使用记载在`docs/design-audit-three-skills-20261023.md`。记载不能证明每次实际调用，也不能替代用户视觉确认；本轮没有安装新插件或借它重设计。

本目录到此只登记设计来源、当前实现和缺口；不将所有I/V升级为U。
