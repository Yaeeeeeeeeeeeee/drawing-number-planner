# P4 全页面数据工作区自适应：检查、实施方案与验收（2026-10-15）

## 授权与证据边界

用户要求先检查并形成方案，再修改现有布局，最终等待Windows本机验收；本轮属于P4，不进入P5、不合并master，不改数据库Schema/API/业务规则/IPC/安全或原文件。基线`3f100fe`，独立分支`codex/p4-adaptive-data-workspaces-20261015`。保留20261013、20261014及前轮P4证据。

当前云端`/workspace/library-files`、`/workspace/shared/downloads`未找到业务资料；`work/runtime-data/planner.db`为已存在空库（2026-10-13），使用better-sqlite3 readonly+query_only读取，产品/正式图号/历史图号/PDF/批次/BOM/二维码/字典/外发计数均0。/tmp及旧包中的数据库属于测试/验收样例，不冒充当前业务数据。本轮不生成、复制或扩写业务记录来铺满。云端截图只能证明该现有空库的真实空状态与CSS几何，不能证明Windows已有业务数据大列表验收通过。

## 交付版本

应用与验证工具提交：`b15773bb1e5d07434bd5796b8c071ee9b39b05cb`；后续交付记录提交仅更新文档。未合并master、未创建PR或发布。

## 已检查的问题

| 页面/组件 | 实际依据 | 问题与方案 |
|---|---|---|
| 共享工作区 | `workspace-theme.css`、`ModuleWorkspace.tsx`、P3/P4 CSS | 外层页面不限宽，但内层多处固定上限。按实际容器剩余宽高分配，列表/辅助面板独立滚动；短高允许外层滚动，按钮可达。保留导航生命周期。 |
| PDF | `FilesPage.tsx` pageSize=50、P3表格min-width1430、P4 max-height(100dvh-360px)、fileOverlay | 固定减值与真实顶部控件高度不一致；宽屏详情覆盖主数据。改并列三栏及测量剩余高度，中央最大，空间不足详情抽屉/导航折叠。保留批次状态独立、完整路径和原分页/索引规则。 |
| 图号库/回收站 | `DrawingLibraryPage.tsx`默认20、已有20/50/100，API上限100 | 4K每页20不足利用高度。默认50，手动选择/总数/完整分页保留；不随resize自动查询，避免清勾选。按当前筛选高度填充列表，详情独立滚动。 |
| 规划 | P4 planning-stage max1560、输入区900、无预览行1200 | 解除数据行/预览整体上限；输入按字段限宽，右侧预览利用余量，窄时对应行下方。阶段、横向行、失效/占号校验不变。 |
| BOM添加 | workspace-theme BOM1600；BomEditor横向编辑/历史对照 | 产品基本信息紧凑限宽；明细/附件/对照全宽，长路径换行。保留全部行、草稿与保存校验。 |
| BOM查询 | `bom/BomQuery.tsx`历史表/所选与上一条记录 | 表格全宽且局部横滚；宽屏并列对照、窄屏可滚动；不改变previousVersionId或历史字段含义。 |
| 外发 | P4选择1040、邮件1500、settings/draft双栏 | 选择区继续紧凑，预览/结果全宽，邮件设置限宽、正文使用余量并随高度增大。保留手改确认、generationRevision、新包保护及全部维护入口。 |
| QR | `QrCodesPage.tsx`产品DataTable与用途展开、独立详情页 | 保留已确认展开/详情导航，数据区全宽与合理滚动；编辑区限宽不挤主表；不将状态合并或擅自重构为新选中生命周期。 |
| 字典 | `DictionariesPage.tsx`主从轨道及P3共享宽度变量 | 保留五类/搜索与主从对齐，列表与明细全宽、单个输入限宽；编辑/引用/删除行为不变。 |
| 迁移 | `ImportPage.tsx`/真实报告与候选表 | 顶部选择紧凑，报告表占用剩余空间并明确滚动边界；不执行导入/审计写操作冒充只读验收。 |

## 实施顺序与风险

1. 先写并运行关键布局/交互回归，保留RED证据；实现共享剩余高度测量、PDF并列栏与折叠/调宽，图号默认50。
2. 按上述页面增加作用域明确的自适应样式/必要表格滚动包裹，不全局拉伸控件或替换业务组件；原表单、勾选、焦点与邮件草稿持续存在。
3. 开发验收只读启动工具使用既有路由和readonly连接，跳过startServer的迁移/备份/启动清理，拒绝业务写请求；不改生产路由或Main。前后读取表级数量与内容摘要，不修改原库/原文件。
4. 在现有空库上进行真实空状态CSS宽高/DPR几何检查和截图；不插入DOM克隆/Mock行。有数据分支由现有renderer单元测试覆盖，但不称为真实数据截图。完整业务大列表、原PDF与Windows系统DPI/跨屏留本机只读验收。
5. 类型、生产构建、相关renderer及全量测试（旧失败单独对比），独立审查，更新证据/Skill受影响指引，停止等待本机验收。

交互风险提前说明：停靠/抽屉切换需保留组件状态与焦点；调宽需保住主表核对宽度；默认分页增加不能限制全部记录访问；新的滚动容器不能剪裁确认区/下拉/历史对照。只做展示与前端查询默认值，不改占号、BOM、二维码、外发或文件语义。

## 本轮取代的视觉约束

用户本轮明确要求宽屏详情不遮挡数据，故取代前轮P4的PDF宽屏覆盖实现；窄窗仍覆盖抽屉。用户本轮要求仅已有真实数据，故本轮验收不沿用“新增40个样例图号”的旧交付方案。保留其历史记录，不覆盖旧文件。业务及数据保护规则保持Current。

## 实施及审查记录

- `useWorkspaceExtent.ts`按实际工作区/内容坐标测量剩余高度，不再固定减360px；使用offsetTop排除入场动效，滚动不改变高度。初轮459检查中8项因3–5px动效偏差失败，修复后489项通过；最终扩展视口结果另记。
- `ModuleWorkspace.tsx`使用并列轨道，详情预算之外至少800px主表（表格宽于此时内部横滚）；导航180–280、详情300–480且按可用宽度进一步夹限；手动收起、键盘/拖动/重置不持久化。
- `ViewportRegion`与可选DataTable.fillViewport仅约束滚动上限，少量数据自然高度，不拉高行/伪造内容。BOM/QR/字典/迁移/产品/外发按原业务DOM或滚动包裹调整，规划和邮件仅CSS。
- 独立审查无Critical；1项Important是停靠/抽屉切换偷走编辑焦点，1项导航折叠焦点问题按本轮键盘要求同时修复；原记录焦点仅在实际关闭恢复，断点中保留当前编辑控件。组合回归还发现宽屏展开留下navigationOpen导致窄窗关闭详情后冒出导航，已RED→GREEN修复。结构探针67断言通过。
- 结构探针仅用1430×2400空块测试边界、滚动及焦点，没有业务记录且不导出截图。不得将这些结构测试计作真实数据验收。
- `readonly-workspace.ts`开发工具直接readonly+query_only打开已有库、复用既有查询路由，入口拒绝业务写方法，不调用startServer/迁移/样例/备份/启动清理。独立一次性测试验证写请求403、表摘要和数据库字节不变。生产API与Main源码未改。

## 最终云端结果与数据安全

- 最终全量 **908/925**；17失败与前轮P4按文件+完整测试名逐项相同，无新增失败。相关12文件154项（来自最终全量报告）全部通过；旧7 Mock、10路径/链接/排序/子进程/临时文件清理问题继续保留，不能统称无害环境错误。完整失败列表见[p4-adaptive-verification-20261015.json](p4-adaptive-verification-20261015.json)。
- 隔离E2E **6/8**，仍是tar.exe ENOENT与Windows路径断言；未删除测试或放宽业务条件。
- 类型、Renderer生产构建、Main编译通过；已有>500kB chunk提示保留，未扩大为无关性能重构。
- 16组CSS宽高/DPR、**520**项现有空库页面几何检查0失败、0禁止写请求；覆盖3840×2160、2560×1440、1920×1080、1366×768、1024×720、720×600及对应125/150/200%CSS模拟。960×540低于最低高度，仅压力检查。
- **67**项实际共享组件结构检查通过：宽屏不覆盖、主表预算、独立滚动、面板底部、键盘/拖动/重置、导航折叠与详情断点/关闭焦点。只用空白尺寸块，无业务数据，无探针截图。
- 已关闭本轮只读查看服务，原库前后所有表数量/内容摘要及主文件SHA256一致：`806201e22c9ea99579c332750fe171b392790d6b9b5b7cb11d8a89ac1cd9cfe9`，`unchanged:true`。产品/正式图号/历史图号/PDF/批次/BOM/产品二维码/字典/外发记录均0；另有原已存在的邮件模板2、签名1、二维码用途3等基础配置，保持原样。不能称所有表0条。
- 数据来源仅云端已有`work/runtime-data/planner.db`，不是用户Windows业务库。原PDF未挂载，不能声称原文件数量/哈希通过；代码未添加对原文件的写操作，原正式数据也未连接。

## 修改页面与组件清单

- 共享：`components/ModuleWorkspace.tsx`、`DataTable.tsx`；新增`useWorkspaceExtent.ts`、`ViewportRegion.tsx`、`p4-adaptive-data.css`，在`main.tsx`最后显式加载workspace层。
- 规划、BOM添加、外发邮件：仅上述CSS调整，不改原页面状态/生成/确认/保存处理。
- PDF：`pages/FilesPage.tsx`使用并列文件工作区；图号库：`DrawingLibraryPage.tsx`默认50，原筛选/回收站/分页/勾选/占号等处理保留。
- 产品/字典/二维码/迁移：`ProductsPage.tsx`、`DictionariesPage.tsx`、`QrCodesPage.tsx`、`ImportPage.tsx`接入可选数据区域高度；字典原工具栏/主从同轨保留。
- BOM查询/外发清单：`bom/BomQuery.tsx`、`outbound/PackageBuilder.tsx`仅替换表格滚动包裹，不删字段或处理器。
- 新增开发工具`readonly-workspace.ts`、`verify-p4-adaptive-layout.mjs`、`verify-p4-workspace-geometry.mjs`；新增只读保护单元回归、扩展工作区/分页测试；Skill UI指引追加本轮Current/旧规则Historical区别。
- `src/core`、`src/db`、`src/server`、`src/main`未修改；旧20261013验收文件及旧30项编号/状态/证据保持原样。

## 仍待Windows本机验收与风险

1. 用户现有业务库大列表/长文件名/跨批次历史/BOM对照与真实迁移报告未在云端验证。前述只读空库/结构测试不证明真实数据铺满。
2. 真实4K显示器、Electron窗口最大化/窗口化/半屏、系统DPI/跨屏、原生文件定位/附件弹窗未在本轮执行；浏览器模拟不能代替。
3. 图号默认50增加单页读取量但未提高API上限，窗口缩放不自动重查。真实大库性能仍需本机；本轮不引入虚拟列表、响应裁剪或无关业务改造。
4. 长页面在控件/确认区超出低高度时允许外层纵滚，数据区有明确内部边界；真实大报告、附件展开及复杂确认仍需按本机清单核对，不能宣称全功能人工通过。

本轮无未处理的Critical/Important审查项或待批准的设计冲突；业务和数据保护不变。停止在P4，不合并、不发布、不进入P5。具体本机只读步骤见[p4-adaptive-windows-readonly-20261015.md](p4-adaptive-windows-readonly-20261015.md)。

## 截图（已有云端库，主要业务实体均0，非真实业务数据铺满验收）

这些是生产构建页面在Chromium CSS视口的截图，不是Windows本机/物理4K显示器截图。没有Mock/DOM克隆/新增记录。

| 页面 | 3840×2160 CSS | 1920×1080 CSS | 非最大化尺寸1024×720 CSS |
|---|---|---|---|
|PDF文件中心|[3840px](p4-adaptive-visuals-20261015/files-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/files-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/files-1024-existing-empty.png)|
|图号库|[3840px](p4-adaptive-visuals-20261015/drawings-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/drawings-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/drawings-1024-existing-empty.png)|
|图号规划|[3840px](p4-adaptive-visuals-20261015/planning-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/planning-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/planning-1024-existing-empty.png)|
|BOM添加|[3840px](p4-adaptive-visuals-20261015/bom-add-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/bom-add-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/bom-add-1024-existing-empty.png)|
|BOM查询|[3840px](p4-adaptive-visuals-20261015/bom-query-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/bom-query-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/bom-query-1024-existing-empty.png)|
|外发资料|[3840px](p4-adaptive-visuals-20261015/outbound-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/outbound-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/outbound-1024-existing-empty.png)|
|二维码管理|[3840px](p4-adaptive-visuals-20261015/qr-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/qr-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/qr-1024-existing-empty.png)|
|编码字典|[3840px](p4-adaptive-visuals-20261015/dictionary-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/dictionary-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/dictionary-1024-existing-empty.png)|
|迁移检查|[3840px](p4-adaptive-visuals-20261015/migration-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/migration-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/migration-1024-existing-empty.png)|
|产品档案|[3840px](p4-adaptive-visuals-20261015/products-3840-existing-empty.png)|[1920px](p4-adaptive-visuals-20261015/products-1920-existing-empty.png)|[1024px](p4-adaptive-visuals-20261015/products-1024-existing-empty.png)|
