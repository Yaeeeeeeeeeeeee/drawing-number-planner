# 需求来源与实现状态清单

日期：2026-11-05（上海）。审计HEAD45450c0，发行应用1.5.0/Schema25。**本清单待用户确认，不构成新增业务决策。**

## 1. 状态定义：确认与实现分两轴

- 决策轴：**已确认**（明确用户指令/需求归档）；**已否决**（明确取消）；**已替代**（后续明确修改）；**待确认**（范围/依据不足）；**AI建议未确认**；**仅代码事实**。
- 实现轴：**已实现**（可达调用链/服务存在）；**部分实现**；**未找到实现**；**实现与需求不一致**；**仅兼容/不可达UI**；**未验证**。
- “已确认”指规则或方向，不表示用户已逐像素签收，也不表示本次测试通过。需求归档不是原附件逐字校验；缺原始批准记录的地方保留证据等级。
- 下表源码默认相对仓库根。测试均是已检查的测试**规格**；本轮不运行，不以旧通过数消除新差异。

## 2. 来源登记与权重

| 来源ID | 文件/原文 | 来源性质及使用边界 |
|---|---|---|
| S00 | 本次用户“全项目需求与实现基线审计” | 直接原文；只审计/文档、保未提交、不开发，优先此前持续开发授权 |
| S01 | docs/superpowers/specs/2026-08-24-drawing-number-planner-design.md及phase设计 | AI设计文档自称已批准；原始PRD作用候选，不能把自述当每项用户签认 |
| S02 | docs/DEVELOPMENT_PAUSE_AND_CONFIRMED_REQUIREMENTS.md | 历史确认登记/后续实施摘要；原始用户聊天不在文件内；Backlog按后续版本核对 |
| S03 | docs/second-acceptance-requirements.txt | 30条用户需求归档；后续V2/V3/V5/V5.2等逐条覆盖，progress100%仅此旧范围 |
| S04 | docs/comprehensive-redesign-preflight-20261020.md | AI待确认方案，原文明确未授权；§6建议不能自动当用户确认 |
| S05 | docs/outbound-v2-requirements-20261020.md | 用户外发V2需求归档；文件/批次/BOM辅助/历史安全有依据，后续精简UI优先 |
| S06 | docs/v3-business-ui-requirements-20261022.md | 用户V3需求归档；撤独立外观UI、产品ID、QR/PDF/列表结构 |
| S07 | docs/v4-data-interaction-requirements-20261023.md | 用户V4需求归档；重复SKU/型号、外观码、PDF人工归纳、表格/虚拟列表 |
| S08 | 本会话V4.1/V4.2用户全文；docs/v41-v42-delivery-20261024.md | 用户全文是规则；仓库只有合并交付记录，不能冒充独立原稿；颜色/状态/右键/工具栏按后续V5.2改动 |
| S09 | docs/v5-system-requirements-20261026.md | 用户V5需求归档；强释、BOM/UI/外发精简/全局表格；不能忽略V5.2后续 |
| S10 | docs/v51-mail-import-drafts-requirements-20261027.md | 用户V5.1需求归档；现有共享邮件配置+迁移导入+ZIP草稿；并非自动发送 |
| S11 | 本会话完整V5.2用户正文及空文件夹答复；docs/v52-requirements-and-audit-20261028.md | 原文为权威；仓库文件明确是需求/审计混合摘要，§第一阶段发现不能自动当新需求 |
| S12 | docs/ait-packaging-requirements-20261030.md | 用户AIT工作流需求归档；制图/归档核心保留，字段/尺寸/路径UI由S13修改 |
| S13 | docs/packaging-ui-requirements-20261102.md | 最新包材/任务/规划UI需求归档；文内“建议”具体选型与强制要求分开，不以实施证明像素认可 |
| S14 | docs/packaging-ui-delivery-20261102.md、ait-packaging-delivery-20261030.md | AI实施/运行/交付说明；可核对事实，不是新的用户需求 |
| S15 | .agents/skills/drawing-number-planner/SKILL.md及references | 当前综合规则/维护约束；二级整理，遇用户原文冲突必须追原文，不能单凭Current裁决 |
| S16 | docs/progress.json、PROGRESS.md、NEXT_STEPS.md | 已保存执行状态；旧30项100%不代表本轮无差异或所有需求都做完 |
| S17 | docs/design-audit-three-skills-20261023.md、ui-consistency-delivery、ui-integration-ledger | AI审计/设计/候选/交付；含“下一模块即认可”推断，不能代替逐图用户签认 |
| S18 | P4系列反馈/设计/交付文档 | 有些引用用户原话，有些仅“用户要求”转述或待批准；逐文件状态见附录，不整体视为有效新需求 |
| S19 | Git提交、tags、构建/发布工作流 | 实现版本/执行机制，不证明需求由用户提出；master首页与发行源码应分清 |
| S20 | docs/schema24-to25-upgrade-evidence.json、v1.5.0-public-download-verification.json | 匿名旧库/公开下载的历史证据摘要，未附用户生产库，不是本轮运行 |
| S21 | docs下187张PNG及相邻验收JSON/MD | 历史图/真实Windows图证据，不自动等于用户批准；全部图片索引见UI_DESIGN_CATALOG |
| C-QR | 本会话用户“产品主列表+用途五列+手动文件”全文 | 网址/尾码校验、手动流程、安全原文可读；没有找到独立完整原稿文件，后续主表V3/V5.2优先 |
| C-CLASS | 用户“你不用等我审查，你直接归类，归类错的，给我一个修改的功能” | 原文也被docs/direct-classification-h10-correction-20261022.md:11–23引用；只替代唯一候选交互，不授权启动乱归并 |
| C-ROOT | 用户V5.2空目录答复 | “仅移除系统内批次节点，不删除磁盘真实文件夹”；沿用原本地路径，不改共享盘；不可访问不能判空 |

未发现单独命名PRD及UI catalog/planning/tasks v15、V15 backend review原文件；V1设计/需求归档/源码可形成对应索引，不能捏造遗漏原稿。待核Q-01/Q-25。

## 3. 核心需求状态

### 3.1 身份、编码、规划

| ID | 最终规则/事项 | 决策状态 | 实现状态与依据 |
|---|---|---|---|
| R-ID01 | 产品用内部ID；SKU/同品牌型号可重复 | 已确认 S07§二 | 已实现；migrations.ts:981–1000、product-service/repository；tests/core/product-service.test.ts |
| R-ID02 | 不按SKU/型号自动归并，不启动ZC100真实归并 | 已确认 S06/S07/S09、用户持续限制 | 已实现约束；ProductsPage无自动归并，appearance-service保显式确认；真实归并未执行 |
| R-ID03 | 同产品可用多个外观码，默认仅规划默认 | 已确认 S07:54–64 | 已实现；planning-repository:51–58、product-service:158；v4-multi-appearance测试 |
| R-ID04 | 独立初始/当前/历史外观版本日常管理 | 已否决 S06:200–266、S09:792–798 | 当前UI撤出；legacy表/API保留，不列待开发 |
| R-ID05 | 产品档案新增不自动创建初始外观/QR | 已确认 S06 | 已实现；product-service.ts:30；product-appearance测试 |
| R-ID06 | 参考来源产品关系 | 已确认历史登记 S02 | 已实现元数据referenceProductId；不等于复制旧型号所有文件/配置，B-02 |
| R-CODE01 | 2.4.3.7码、AA/C分离、末段MMJJNNN | 已确认 S02/S06/S07 | 已实现；drawing-code.ts:21–51、code-generator/drawing-code测试 |
| R-CODE02 | 字典活动/项目父关系，001–999 | 已确认 S02/S06 | 已实现；planning-repository:25–76、planning-service:21–55 |
| R-CODE03 | 正式+可靠历史+留号删除共同占号 | 已确认 S02/S06，强释窄例外S09 | 已实现；occupied-number-repository:6–43，occupied-number测试 |
| R-CODE04 | 停用、删索引、删任务不释放 | 已确认 S06/C-QR/S13 | 已实现各服务分离；deletion/task/pdf-management测试规格 |
| R-PLAN01 | 任意字典项目行、颜色备注、增删 | 已确认 S02/S13§五 | 已实现；PlanningPage:143–154、planning-page测试 |
| R-PLAN02 | 显式查重/预览后批量占号，过期/并发保护 | 已确认 S02/规划追加要求 | 已实现；planning-service:59–81、planning-reservation测试 |
| R-PLAN03 | 占号与产品/外观归属同一事务 | 已确认 用户规划追加、S06/S13 | 已实现；planning-repository:92–105；不自动BOM |
| R-PLAN04 | 无效产品/外观不生成无归属正式码 | 已确认 用户规划追加 | 已实现校验；planning-repository、planning-api测试 |
| R-PLAN05 | 行下紧凑实时预览 | 已确认 S13:315–333 | 已实现UI；相同前缀独立预计码语义待核G-04/Q-05 |
| R-PLAN06 | 规划不维护AIT尺寸/规格 | 已确认 S13:278–305 | 已实现；PlanningPage无catalog/dimension；PlanningDimensions旧组件未作为生产规划入口 |
| R-PLAN07 | 生成→查重→确认顺序；只带已保存身份 | 已确认 S13:292–312 | 已实现；PlanningPage:158、AppShell:157、测试exact handoff |
| R-PLAN08 | 成功卡片复制、品牌型号色项目、精确图号库定位 | 已确认 S13:335–350 | 已实现；PlanningPage:116–161、DrawingLibrary navigationTarget；截图V1.5 |
| R-PLAN09 | 无关刷新/返回保结果，主动改输入使原查重确认失效 | 已确认 S13 | 已实现；PlanningPage:42–77、freshness测试；并非永远保留旧确认 |

### 3.2 制图任务与AIT模板

| ID | 最终规则/事项 | 决策状态 | 实现状态与依据 |
|---|---|---|---|
| R-TASK01 | 独立制图任务紧跟规划，包材紧跟PDF | 已确认 S13§三 | 已实现；AppShell:33–53、workspace-shell测试 |
| R-TASK02 | 任务复用现有ID/API而非第二套系统 | 已确认 S13 | 已实现；DrawingTasksPage挂原PackagingTasks/packaging-tasks路由 |
| R-TASK03 | 系统命名、品牌型号标题、日常隐藏UUID | 已确认 S13§六/八 | 已实现；task-service:78、TaskPanel:56,93；诊断details保留ID |
| R-TASK04 | 一个产品一个未完成任务，不同产品各自 | 已确认 S12/S13 | 已实现按真实ID，不按型号文本；Schema25 partial index、create事务 |
| R-TASK05 | 目录唯一自动取，歧义/异常才选择 | 已确认 S13§6.2 | 已实现；PackagingWorkspace.resolveProductDirectory，TaskPanel:34–38 |
| R-TASK06 | 已有未完成紧凑提示/继续，不重复建目录占号 | 已确认 S13§6.4 | 已实现；TaskPanel:58,62、drawing-tasks测试 |
| R-TASK07 | 新任务直接产品/00，不自动UUID子目录 | 已确认 S13§七 | 已实现；packaging-workspace:97、task-service availableTaskPath |
| R-TASK08 | 旧嵌套任务保路径/文件/历史，无启动批量搬迁 | 已确认 S13§7.2 | 已实现路径兼容；旧24→25证据S20；非本轮生产库验证 |
| R-TASK09 | 自动生成/人工/无需；尺寸只在AIT任务内 | 已确认 S13§8.3 | 已实现；TaskPanel:119–125、task configure/matcher |
| R-TASK10 | 逐项/批量生成、失败重试，不覆盖手改文件 | 已确认 S12/S13 | 适配/逻辑已实现；task-service/automation测试；真实Adobe E-01 |
| R-TASK11 | 人工监听、完整码优先、歧义人工关联 | 已确认 S12/S13 | 已实现已知任务范围；TaskPanel:97、runLinkFile；普通产品监听范围R-PDF09另列 |
| R-TASK12 | 核对实际SHA后整批确认归档 | 已确认 S12/S13 | 已实现；reviewItem/archive-preview/journal；不是跨文件全回滚 |
| R-TASK13 | 正式修改先副本/原件校验/备份后安全替换 | 已确认 S12:589–621 | 已实现；archive/file-operations；属于明确正式修改窄例外 |
| R-TASK14 | 成功索引核验后仅清本次受管临时，不删00/旧目录/其他文件 | 已确认 S13§7.3 | 已实现；archive:27–32、file-operations:76–91 |
| R-TASK15 | 已完成/未完成可确认删记录，后者明示后果 | 已确认 S13§九 | 已实现；delete-preview/delete、TaskPanel:70；busy/待索引安全阻止 |
| R-TASK16 | 删除不删物理/占号/BOM/外发/无关索引，释放任务锁 | 已确认 S13§9.2 | 已实现留痕；schema25、task-service:135–150、核心测试 |
| R-TASK17 | 其他/已删任务文件与未提交副本不自动认领 | 已确认安全目标S13；claim选型属实现 | 已实现；copy_destination_path、otherTaskOwns；核心copyclaim回归 |
| R-TASK18 | 回页更新任务历史 | 待核最终刷新范围 | 部分；只刷新资料不刷新历史G-02 |
| R-TASK19 | 删除过期预检可在弹窗直接重试恢复 | 未明确具体方案 | 当前反复旧token，需取消重开；G-03/Q-15 |
| R-TASK20 | 本地可读日期，历史查看/删除/列布局 | 已确认 S13§9.3 | 已实现；localTime、DataTable；行排序固定新到旧，不支持任意列排序 |
| R-AIT01 | 包材只基础配置，撤出任务/批量00 | 已确认 S13§3.2 | 已实现；PackagingTemplatesPage三tab |
| R-AIT02 | 不引入模板版本管理 | 已确认 S12/S13 | 当前无日常版本UI；资产/任务快照保留不等版本体系 |
| R-AIT03 | 仅DRAWING_NO替换，不改品牌型号颜色/几何 | 已确认 S13§4.3 | 三层已实现；task-service:188、automation:161、JSX:62；实际版式E-01 |
| R-AIT04 | PDF保留AI编辑能力、不另生成AI | 已确认 S12/S13 | 选项/协议实现；JSX:79–91；真实Adobe重开未验证 |
| R-AIT05 | 自动对象/字体读取与可靠手工回退 | 已确认 S13§4.4 | 已实现接口/UI；inspect-template-file、Editors；真实对象字体验证未闭合 |
| R-AIT06 | 中文完整图号选择，不让用户输入内部key | 已确认 S13§4.4 | 已实现；Editors:49–53；旧非图号映射保存不生成 |
| R-AIT07 | 制作方式+0/2/3维，旧key/规则不丢 | 已确认 S13§4.5 | 已实现；Editors:72–94、packaging-dimensions；catalog测试 |
| R-AIT08 | 固定/比较/范围/长宽互换、高不换，多匹配手选 | 已确认 S12/S13§4.6 | 已实现；matcher、Editors:63–69、TaskItem |
| R-AIT09 | 三页签具体组织、字段精确宽度与字体 | 用户给出组织建议；像素未签认 | 当前采用；视觉I/V不能自动算用户已验收 |
| R-AIT10 | 上传原件不可变、旧任务配置/快照兼容 | 已确认 S12/S13安全要求 | 已实现资产路径/旧映射/任务snapshot；源代码/旧库摘要证据 |

### 3.3 PDF、图号库与删除占号

| ID | 最终规则/事项 | 决策状态 | 实现状态与依据 |
|---|---|---|---|
| R-PDF01 | 正式扫描仅确切02和长03，全历史批次，00/根QR排除 | 已确认 S11/C-ROOT/S13§10.2 | 已实现；material-directory-policy、pdf-scanner、scoped测试 |
| R-PDF02 | 02为源；03按（转曲）文件名，不解析内容判转曲 | 已确认 S11 | 已实现；historical-file-classifier:21–30；冲突提示 |
| R-PDF03 | 真实无法访问/失败/未完整覆盖不判缺失 | 已确认 S11/S13§10.6 | 已实现原子scan、稳定指纹/覆盖测试；无生产现场新验 |
| R-PDF04 | 范围外旧索引/历史保留，不因新范围自动清空 | 已确认 S11，覆盖S09清理提议 | 已实现；file-repository:176–210、coverage测试 |
| R-PDF05 | 当前型号只扫该型号02/03全批次，列表筛选不限制扫描 | 已确认 S13:672–708 | 已实现；FilesPage:289、scanProducts、files-filters-scope测试 |
| R-PDF06 | 快捷全部/源/转曲/缺失+类型批次状态修改日期 | 已确认 S13§10.5 | 已实现；FilesPage:384–437、SQL日期交集 |
| R-PDF07 | 目录类别也限定扫描 | 范围待确认 S13:706 | 未找到类别API，G-06/Q-02；不能误报单型号未实现 |
| R-PDF08 | 增量指数据差异还是只读变化文件 | 待确认词义 | 当前产品范围全观察/哈希+索引diff，无独立changed-files-only接口 |
| R-PDF09 | 正式文件自动监听/相关型号增量与启动补查 | 已确认方向 S13:676–686；是否包括无00/无任务产品待核 | 已实现opt-in产品监听；当前覆盖范围事实明确，是否满足最终范围见G-01/Q-16，不能直接认定违约 |
| R-PDF10 | 后台扫描错误可见/失败统计 | 已确认失败如实反馈；后台位置待核 | 手动已实现；monitor状态未接UI，G-07 |
| R-PDF11 | PDF产品/图号/角色/存在/纳入独立 | 已确认 S07/S11 | 已实现；文件服务/decisions/assignments/实际presence |
| R-PDF12 | 人工归纳真实产品/批次，理由/备份/指纹/审计，重扫保留 | 已确认 S07 | 已实现；pdf-classification/repository、classification测试 |
| R-PDF13 | 图号归属冲突时仅改PDF，不覆盖图号 | 已确认S07独立关系目标；具体确认UI为实现 | 已实现可明确确认；非一律禁止所有冲突写PDF |
| R-PDF14 | 唯一候选直接归类+纠错，不再先逐条人工审查 | 已确认 C-CLASS | 已实现显式一键；drawing-association:104–118，不是启动批量自动 |
| R-PDF15 | 清索引不删原件/释放占号，排除下次不立即回来 | 已确认 用户综合/C-ROOT/S07 | 已实现；pdf-management/decisions及保护引用测试 |
| R-PDF16 | 批次显示名可改，路径/文件/外发快照不改 | 已确认 S08/S11 | 已实现；material-batch-service:68–77 |
| R-PDF17 | 右键仅重命名/删，边缘/Esc/外点，不触发切换 | 已确认 S08/S09 | 已实现；ProductCatalogNavigation:30–113、contextmenu测试 |
| R-PDF18 | 删除仅内部安全空批次，不能删真实目录 | 已确认 S08/C-ROOT/S11 | 已实现；material-batch-service:45–110、空目录保护测试 |
| R-PDF19 | 当前/历史按可靠业务顺序，不按mtime | 已确认 S05/S11 | 已实现；batch-business-order、material-batch-service |
| R-PDF20 | 同名批次不合并，目录/实例/ID可区分 | 已确认 S07/S08 | 已实现路径身份与显示分离；真实生产重复原因仍需现场核对 |
| R-PDF21 | 六图标两组，全选仅已加载，移除最右危险 | 已确认 S08/S11 | 已实现；FilesPage:438–448；>500容量衔接缺口G-08 |
| R-PDF22 | 筛选不丢产品目录归类、保存后刷新统计 | 已确认 用户反馈/S07 | 已实现独立导航/列表查询；元数据失败例外G-05 |
| R-LIB01 | 类别→型号→编码主类，不再独立外观/批次树 | 已确认 S06/S07 | 已实现；ProductCatalogNavigation、DrawingLibraryPage |
| R-LIB02 | 版本列改颜色，字典AA/C解析，无硬编码猜色 | 已确认 S08 | 已实现；drawing-library-presentation、drawing-v41测试 |
| R-LIB03 | 主类标签/项目一行，不同主类固定柔和色 | 已确认 S08 | 已实现；presentation/css；实际像素不等独立签认 |
| R-LIB04 | 关联产品只型号无SKU；完整码左其他居中 | 已确认 S08/S11指定列 | 已实现columns；drawing alignment测试 |
| R-LIB05 | 使用中⇄已停用，持久，不释放/改归属 | 已确认 S08 | 已实现；query-service/schema20/UI状态；reserved内部分开 |
| R-LIB06 | 文件与打开位置同行，省略，状态一次，无空大卡 | 已确认 用户详情修正/S08 | 已实现flex/no-wrap；DrawingLibraryPage:519–534及file-card测试 |
| R-LIB07 | 不因产品默认外观/批次未命中就说实际PDF缺 | 已确认 S08/S11 | 已实现只读直接观察；unavailable/conflict非假缺失 |
| R-LIB08 | 直接显示02源及03全部有效批次，无选择器/重复历史卡 | 已确认 S11 | 已实现；fileObservation/UI；覆盖早期只当前/看历史设计 |
| R-LIB09 | 03 BOM关联，仅首次记录+日期、精确跳转 | 已确认 S11 | 已实现；query-service:136–139、DrawingLibrary:475–476 |
| R-LIB10 | 普通保号删除/释放分开，两状态均能检查 | 已确认 用户详情修正/S08 | 已实现；drawing-deletion-service、batch deletion |
| R-LIB11 | 普通释放保护历史/正式使用/受保护引用 | 已确认 用户详情修正/S08 | 已实现；deletion-service:149–199 |
| R-LIB12 | 独立主动强制释放，影响确认、留旧身份/快照、隔离旧PDF | 已确认 S09§九/S11§6.9 | 已实现；force-release-service:27–124；不是普通释放保护取消 |
| R-LIB13 | 调归属不释放，不破坏PDF/BOM/外发历史 | 已确认 综合/规划追加/S07 | 已实现绑定/audit；相关引用保护测试 |

### 3.4 BOM、产品、QR、字典、导入、外发与恢复

| ID | 最终规则/事项 | 决策状态 | 实现状态与依据 |
|---|---|---|---|
| R-BOM01 | 当前使用关系+历史快照，不显V1/V2体系 | 已确认 S02/S03 | 已实现UI表达，保留version/predecessor/current内部结构 |
| R-BOM02 | 材质/尺寸/位置/图片/示意/修改明细分字段 | 已确认 S03 | 已实现BomEditor、bom-service，QR隐藏不删关系 |
| R-BOM03 | 三下拉+日期/图号查询，型号/项目居中 | 已确认 S11§6.3/6.4 | 已实现BomQuery:31–46 |
| R-BOM04 | 新增清临时行/图片/示意/待提交，保成功 | 已确认 S11§6.5 | 已实现BomPage:168–175，bom-page测试 |
| R-BOM05 | 取消当前/历史录入选择，业务日期可改 | 已确认 S11§6.6，取代旧不可改 | 已实现，BomPage/date，service:222保ID/前驱/快照 |
| R-BOM06 | 精确原记录编辑，不新建、不改其他历史 | 已确认 S03/P4/S11 | 已实现revision/current并发、快照；相关service/renderer测试 |
| R-BOM07 | 上一版同项目同角色附件沿用，本次替换独立 | 已确认 S11§6.7 | 已实现service:316–350、asset tests |
| R-BOM08 | 按型号/日期归档，重名排他，旧源不删 | 已确认 S03 | 已实现asset-service；日期仅改不重归档未变附件 |
| R-BOM09 | 选中左/前驱右、真实内容hash比较，无意义0摘要移除 | 已确认 S09/S11§6.8 | 已实现；视觉等价不同字节未有感知实现，Q-12 |
| R-BOM10 | 图片点放大无多余文件名/打开位置；BOM无复制 | 已确认 S09/S11，旧P4复制后被取消 | 已实现ImagePreview/BomHistoryAsset；保留数据无删图片 |
| R-BOM11 | 同一图号可出现在多BOM记录，未恢复禁止限制 | 已确认 S09:433–437/S11 | 已实现原逻辑，不能把图号重复出现当重复数据自行清 |
| R-BOM12 | 单条与整产品BOM删除区分，当前回退/历史保护 | 已确认 S03 | 已实现bom-service:119,139与UI确认 |
| R-PROD01 | SKU/型号/品牌/类别拆列，不再外观列/独立版本 | 已确认 S06/S07/S11 | 已实现ProductsPage9列，非最早6列+外观展开 |
| R-PROD02 | 用途摘要三列与稳定产品ID跳转QR | 已确认 S06/P4后续 | 已实现canonical分组，回页保过滤/滚动 |
| R-PROD03 | 型号下拉去#ID，只品牌·型号（产品档案范围） | 已确认 S11用户§7.1 | 已实现参考来源option；不能外推外发全部option禁SKU |
| R-PROD04 | 集中退出，不要求用户跨模块逐个清 | 已确认 S03/P4 | 已实现预检/选项/指纹/事务；现代受保护引用可阻止L-01 |
| R-PROD05 | 保号/释放、保留/清历史独立未预选，型号一次最终确认 | 已确认 P4后续明确纠正 | 已实现ProductCleanupPanel；自动携带预检图号非漏洞 |
| R-PROD06 | 退出保原件/其他产品引用与必要审计 | 已确认 全轮数据限制 | 已实现保护服务；无已退出档案恢复UI |
| R-QR01 | 纯手工PDF，取消自动候选/待确认/匹配状态 | 已确认 C-QR/S06 | 已实现QRCodePage/手动service，旧associate入口拒旁路 |
| R-QR02 | 当前主表拆身份/用途，展开五列，文件左余中 | 已确认 C-QR+S06/S11后续 | 已实现7主列/5子列；早期数量/关联比例主表已被替代 |
| R-QR03 | 简名去尾码/pdf，不改原文件名/DB原始名 | 已确认 C-QR | 已实现display helper/tooltip，不重命名磁盘 |
| R-QR04 | URL实际保存值，可开/复制，文件状态独立 | 已确认 C-QR | 已实现；不以文件名推URL |
| R-QR05 | 原生选PDF、型号/用途/7位尾码、全半括号、PDF头校验 | 已确认 C-QR | 已实现qr-manual-validation/service；不等解码QR内容 |
| R-QR06 | 例外命名受控确认/理由/audit，失败保输入 | 已确认 C-QR | 已实现弹窗/事务；5字为实现阈值 |
| R-QR07 | 更换留旧link/file事实，解除不删文件/停用 | 已确认 C-QR | 已实现不可变事实；有历史引用删QR可能阻止 |
| R-QR08 | 业务启停与文件存在独立、真实产品ID，不因外观换代删 | 已确认 C-QR/S06 | 已实现；QR不占号，legacyappearance不自动扩展 |
| R-DICT01 | 字典名称编辑、启停、删除恢复、永久删除资格 | 已确认 S02/P4 | 已实现repository真实FK/快照保护，permanent preview/recheck |
| R-DICT02 | 名称居中、无拖点、恢复后正常输入 | 已确认 P4/S11 | 已实现；真实中文IME现场未验证 |
| R-IMPORT01 | 字典Excel先检查冲突/可选候选，备份后事务写 | 已确认 S01/S02 | 已实现；仅固定编码字典审计，不是全业务迁移工具 |
| R-IMPORT02 | 真xls支持范围如实说明 | 条件支持 S10/S11 | 当前真正旧格式需另存xlsx；UIaccept不代表解析已支持 |
| R-MAIL01 | 导入只迁移检查，日常模板/签名/联系人同模型 | 已确认 S10/S11 | 已实现；不建第二套模板库/不重复配置导入入口 |
| R-MAIL02 | 每supplier/场景/案例单元格独立，来源可追，签名分开 | 已确认 S11§5 | 已实现matrix/parser/source JSON；旧原Excel实测记录非本轮新验 |
| R-MAIL03 | 不把主体/时间当厂家，不把铭牌/旧PO/理由做默认 | 已确认 S11 | 已实现结构识别/建议模板与原案例分离 |
| R-MAIL04 | 待核必须审查，不支持sheet明确，重复可更新/跳过不覆手改 | 已确认 S10/S11 | 已实现preview cache/fingerprint/backup/transaction |
| R-MAIL05 | 共享跨公司联系人保留字段，模板角色关联，签名一次 | 已确认 S11及1.3.1问题修正 | 已实现Schema23/导入/Composer；反馈紧靠底部按钮 |
| R-OUT01 | 品牌→类别→型号→批次，资料类型/模式独立 | 已确认 S05/S06/S09/S11 | 普通流程已实现；legacy target类别值静态不一致，但无当前日常入口，G-10 |
| R-OUT02 | 选批次完整/变更，不强制BOM、不自动旧批次补齐 | 已确认 S05/S06/S07 | 已实现batch-workflow/current set |
| R-OUT03 | 当前默认转曲，实际文件/基准比较，未知hash确认 | 已确认 S05/S09 | 已实现real PDF/presence/hash；大文件不仅因尺寸缺失 |
| R-OUT04 | 整文件ZIP、49目标/50百万硬限，实际分包数量/快照 | 已确认 S03/S05/S07 | 已实现service真实ZIP核验；49目标是工程余量选型；原始单文件>50MB政策见Q-30 |
| R-OUT05 | 只本次分包结果，去日常历史/额外材料区域但留历史数据 | 已确认 S09:613–638 | 已实现；PackageHistory未挂载有明确测试，不是漏做 |
| R-OUT06 | ZIP成功事实生成邮件，BOM仅辅助理由、未知人填 | 已确认 S10/S11 | 已实现mailFacts/mail-draft，不擅猜当前原因 |
| R-OUT07 | 收抄送/主题/正文可编辑复制，手改保留，重生成确认，无自动发 | 已确认 S10/S11 | 已实现EmailComposer/保护测试；重启草稿持久化未明确 |
| R-SAFE01 | 迁移前一致DB备份/校验/事务/失败回滚/拒未来Schema | 已确认 全轮兼容要求 | 已实现backup/migrations；不同版本检查深度有差异，不夸大统一证明 |
| R-SAFE02 | 每次安装首次问旧/新，新库不选文件，普通重启沿用 | 已确认 用户安装补充 | 已实现production-profile/installer marker；Windows旧记录2次重装 |
| R-SAFE03 | 桌面根转专用子目录，桌面子目录可选，不删旧目标/业务 | 已确认 用户安装路径问题 | 已实现InnoShell路径与原生测试记录 |
| R-SAFE04 | 日常DB自动备份 | 设计/实现与历史记录 | 已实现启动日一次/30有效；无运行中定时，不是全资料备份 |
| R-SAFE05 | 安全恢复可重新选库/选备份 | 安装说明声明，用户批准范围待核 | **实现与说明不一致**G-11；不直接列已确认未实现新功能 |
| R-SAFE06 | 所有启动升级失败保原profile | 广义表述缺依据；已有取消/验证保护明确 | 超出当前保证；未来Schema先写profile后拒绝，G-12 |
| R-SAFE07 | 完整资料备份/DB还原产品入口 | 待确认原始范围 | 未找到实现；人工关闭复制/独立目录恢复说明存在，Q-07 |
| R-SAFE08 | 不切服务器，不删磁盘空目录，不操作生产库 | 已确认 C-ROOT/S13/S00 | 当前本地模式；本轮严格遵守，不因旧server backlog启动部署 |

### 3.5 全局UI

| ID | 要求 | 决策状态 | 实现状态与证据 |
|---|---|---|---|
| R-UI01 | 极简白灰低饱和、紧凑可读、危险分隔 | 已确认方向，S06/S09/S13 | 当前共享CSS和实际截图；并非每像素用户签认 |
| R-UI02 | 全表调序/调宽/记忆/重置，去拖点常驻说明 | 已确认 S07/S09/S11 | 已实现LayoutTable/useTableLayout；隐藏提示不移除操作 |
| R-UI03 | 总宽随窗口，缩列余量最右伸缩列接收 | 已确认 S11 | 已实现预算/minimum/ResizeObserver；极窄真实min仍可内滚 |
| R-UI04 | V5.2指定列头/内容居中 | 已确认 S11 | 已实现各页显式align；覆盖旧通用SKU左规则 |
| R-UI05 | 产品/QR/PDF顶部冻结、长列表稳定 | 已确认 S11 | 已实现sticky/virtual/chunk与测试；用户物理DPI E-02 |
| R-UI06 | 产品/QR/PDF/图号取消传统分页 | 已确认 S06/S07/S09，替代早期10/25/50/100 | 已实现逐块/虚拟；APIpageSize留存不是UI页码 |
| R-UI07 | 图片直接放大/缩放拖动/适应/Esc，不额外文件名定位 | 已确认 S09/S11 | 已实现ImagePreviewDialog；不推广为删除PDF/QR必要路径操作 |
| R-UI08 | 空/加载/异常/成功一致，不假装空成功 | 已确认原则 S09/S13 | 部分不一致G-05；不能仅凭EmptyState组件存在声称全覆盖 |
| R-UI09 | 返回刷新新数据且保草稿/展开，无串页 | 已确认 用户反馈/S11/S13 | 多页已有序列/缓存/active；任务历史例外G-02 |
| R-UI10 | 所有历史截图都已用户认可 | 无此确认 | 不成立；图证据/AI验收/用户批准分开，Q-25 |

## 4. 已否决或明确后续替代：不得算作待开发

| ID | 旧方案 | 最后有效来源/当前处理 |
|---|---|---|
| X-01 | 早期SKU/同品牌型号唯一约束，或用字符串强制推定同产品/归并 | S07改为真实ID/允许重复/不自动合并；不能沿最早问题陈述做唯一限制 |
| X-02 | 初始/当前/历史独立外观档案、版本BOM日常管理、版本行展开 | S06§三/S07/S09明确撤销；保表/FK不恢复UI |
| X-03 | 图号版本列“未记录”、历史版本作为第三状态 | S08改颜色和使用中/已停用 |
| X-04 | 图号只显示当前转曲PDF、历史文件另大区/批次选择器 | S11改直接02源+03所有有效批次，无重复历史卡 |
| X-05 | 唯一候选也必须逐条先人工核查才能一键归类 | C-CLASS后续允许直接一键，保纠错；多义不猜 |
| X-06 | 所有情况下历史占号绝不可能释放 | S09明确独立强释例外；普通删/停用仍不释放 |
| X-07 | 旧文件在新扫描范围外就自动清索引/批量标缺 | S11/C-ROOT禁止；旧引用保留 |
| X-08 | 批次常驻铅笔/删除按钮，删除真实文件夹 | S08右键；C-ROOT只清内部空节点 |
| X-09 | PDF六个大文字按钮/两行，名称仍清除已选索引等 | S08改名；S11统一六图标两组同行；tooltip保名称 |
| X-10 | 传统10/25/50/100分页UI | S06/S07/S09改长列表虚拟/分块；不删后端兼容参数 |
| X-11 | 二维码自动候选/待人工确认/自动关联激活 | C-QR明确取消；历史扫描字段保留兼容 |
| X-12 | 二维码业务状态由文件是否存在决定 | C-QR明确独立；未配文件仍可启用 |
| X-13 | 必须BOM先有才打包、旧批次自动填满资料 | S05/S06/S07明确批次主来源，BOM辅助 |
| X-14 | 日常外发历史ZIP筛选/详情/额外资料UI | S09§10.5精简；数据/API保留 |
| X-15 | BOM日常V版本选择、仅新增不可精确修改、同图号不能跨BOM | S03/S09/S11否决或撤回；内部revision不删 |
| X-16 | BOM普通编辑业务日期永不可改 | S11明确允许精确记录更正，保其他身份/快照 |
| X-17 | BOM详情复制控件和常驻附件文件名/打开位置 | P4后续取消copy；S09/S11改图片直接预览 |
| X-18 | AIT自动替换品牌/型号/颜色/尺寸等非图号内容 | S13仅DRAWING_NO；旧映射存储不抹掉 |
| X-19 | 规划页尺寸档案、比例/另存默认规格必填 | S13撤出，在任务匹配；旧档案兼容保留 |
| X-20 | 新任务UUID子目录/用户必填无意义任务名 | S13改自动命名+平铺00；旧任务不自动搬 |
| X-21 | 默认收起/宽屏一律覆盖顶部导航 | 用户后续“不要默认收起”“宽度必须覆盖才覆盖”，P4转述；当前并排/窄覆盖 |
| X-22 | 所有产品退出逐个手输图号/额外历史短语 | docs/p4-pdf-navigation-20261019.md:3–9后续单型号一次确认+全预检载荷 |
| X-23 | 直接改原AIT、另生AI中间稿、清空DB解决兼容 | S12/S13/全轮明确禁止，保副本/编辑PDF/迁移 |
| X-24 | 自动服务器部署/双向同步/自动发送邮件 | S02排除V1、S10/S11保持本地与复制邮件，不在当前范围 |

## 5. AI建议/工程选择，不自行提升为业务规则

| ID | 内容与来源 | 审计处理 |
|---|---|---|
| A-01 | S04§6“一代外观含多色”、每色BOM边界 | 待确认预案；后独立外观UI撤销，不当已批准补功能 |
| A-02 | S04§6版本共享/独立QR选择与初始策略 | AI建议，未有完整批准原稿，且后续纯手动/撤版本优先 |
| A-03 | S04按选外观当前BOM自动拼全资料 | 待确认建议；S05/S06后来明确批次主来源，不复活 |
| A-04 | ui-integration-ledger把“下一模块请求”作设计认可 | 不能当独立签认规则；待核历史截图确认 |
| A-05 | 1023px导航阈值、260/300/640px面板预算 | 当前工程布局参数，不是不可变用户规则；不要求逐参数新审批 |
| A-06 | 缓存TTL、导入报告30min/20份、预检15min等 | 工程资源/过期策略，不作为业务必须值；需保过期提示/安全 |
| A-07 | 自动DB备份保30个有效daily | 当前策略/历史设计证据，未把“30”冒称用户逐项确认 |
| A-08 | Schema25留痕删除而非物理删任务 | 实现用户安全目标的选型；当前隐藏/保行，无自动已批准undeleteUI |
| A-09 | 表格最小宽、6px吸附、键盘微调、默认后端页大小 | 有旧规格/代码依据，范围技术，不承诺任何窗口无滚动 |
| A-10 | 187张图/测试通过即全UI用户验收 | 无此授权，V/测试规格不等于U |

## 6. 历史确认Backlog与未实现边界

| ID | 事项 | 状态与证据 |
|---|---|---|
| B-01 | 批量重命名业务文件 | S02:20,226登记后续Backlog，当前仅批次显示名rename，未找到批量物理文件重命名服务/UI；**历史已登记，当前是否仍实施待核**，不能自动开展改原件 |
| B-02 | 新型号基于旧型号复制 | S02:140–143,227登记；当前只referenceProductId元数据，未找到完整跨型号文件/配置复制工作流；**不把元数据误记为复制已完成**；最新范围是否保留待核 |
| B-03 | 本地/服务器资料差异比较/同步 | S02:20,228未来可能，明确非V1自动同步；S11/S13仍本地。未实现不是当前违约，不启动部署 |
| B-04 | 自动监听覆盖所有普通产品 | R-PDF09确认监听方向；现opt-in限制与旧交付一致，原始批准是否覆盖全产品不明；**范围待核，不能确认为已确认未实现**，G-01/Q-16 |
| B-05 | 真实Adobe/正式库/物理DPI验收 | 实现/验证分离：未验证，不写成代码功能已完成验收，也不自动删/改用户库来验证 |
| B-06 | 全资料备份/恢复UI、草稿autosave、已删任务恢复 | 未找到明确最终批准范围与实现；不是“已确认未实现”的默认清单，见Q-07/13/20 |

## 7. 关键替代链与仍未裁决的冲突

| 主题 | 旧来源 | 后续明确来源 | 本次结论 |
|---|---|---|---|
| 外观管理 | 综合初稿/版本BOM | S06/S07/S09取消独立UI | 旧数据兼容，不恢复日常机制 |
| SKU/型号身份 | 早期唯一限制 | S07明确可重复 | 内部ID身份，不能恢复唯一索引 |
| 图号展示 | 历史版本/版本未记录 | S08颜色+两状态 | 显示更正已实现，内部reserved保留 |
| 文件详情 | S03仅当前/历史折叠、后批次选择器 | S11全部批次直接列/03BOM | 明确后续替代，不算历史方案未落地 |
| 普通释放 | 历史占用保护 | S09独立强释 | 普通保护+明确强释例外并存，不互相抹掉 |
| 日期编辑 | P4普通日期锁定 | S11允许精确日期更正 | 原记录/快照保护继续 |
| 指定列对齐 | S06仅SKU左/S09身份左 | S11指定列中 | 指定页列优先；不是全系统一律居中 |
| PDF工具栏 | S08文字按钮 | S11六图标 | 原选择/权限作用域不变 |
| AIT映射/路径 | S12多字段/UUID子目录/规划尺寸 | S13仅图号/平铺00/任务内尺寸 | 新任务新路径、旧记录不搬 |
| 外发历史 | S05要求历史页 | S09明确删日常历史UI保数据 | 未挂载是符合后续要求，不当缺入口 |
| 型号option范围 | S11摘要简写 | 用户原文§7.1只产品档案 | 不扩大到外发等所有页面，范围Q-10 |
| 安全恢复选库 | 安装说明声称可用 | 当前代码只有进程恢复，缺精确批准记录 | 保留冲突G-11，等待选“改说明/补功能”，不自行定 |
| 原始PDF大小/最终ZIP大小 | S03有单文件>50MB阻止示例 | S09要求50/100/200MB存在且可入清单；交付改按ZIP实际限额 | 当前实现按ZIP结果，需求最终阈值粒度Q-30待核，不能只因代码通过而确认 |
| 类别扫描/监听进入条件 | 最新S13目录决定扫描/自动监听 | 代码只有型号/全局，且opt-in | G-01确认代码限制；监听边界Q-16、类别语义Q-02均待决定 |

## 8. 全部持久文档索引

以下列出起点docs目录159个MD/TXT/JSON及各文件自述性质。标题含“已确认/Current”只作为原文件自述，不自动提升为用户批准；来源权重以前文为准。187个PNG在UI_DESIGN_CATALOG完整列出。根README/AGENTS/进度与Skill在S15–S19另列。

| 文件 | 标题/标识 | 性质（非批准结论） |
|---|---|---|
| [docs/DEVELOPMENT_PAUSE_AND_CONFIRMED_REQUIREMENTS.md](docs/DEVELOPMENT_PAUSE_AND_CONFIRMED_REQUIREMENTS.md) | 图号规划器：开发暂停与已确认需求登记 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/acceptance-recycle-bin-v15.md](docs/acceptance-recycle-bin-v15.md) | 验收补充：简单回收站 / Schema v15 | 验收/候选/交付记录；不等用户签收 |
| [docs/ait-packaging-delivery-20261030.md](docs/ait-packaging-delivery-20261030.md) | AIT 包材模板工作流实现与验证 | 实施/发布/验证说明；非需求确认 |
| [docs/ait-packaging-requirements-20261030.md](docs/ait-packaging-requirements-20261030.md) | 图号规划器｜AIT 模板管理与自动制图工作流需求 | 需求正文归档；后续逐条替代链优先 |
| [docs/approved-ui-alignment-20261013.md](docs/approved-ui-alignment-20261013.md) | 已认可 UI 的真实页面对齐候选（2026-10-13） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/bom-ui-v1-acceptance.md](docs/bom-ui-v1-acceptance.md) | BOM UI 第一版 · 待用户验收 | 验收/候选/交付记录；不等用户签收 |
| [docs/bom-ui-v2-acceptance.md](docs/bom-ui-v2-acceptance.md) | BOM UI 第二版验收记录 | 验收/候选/交付记录；不等用户签收 |
| [docs/classification-drawer-delivery-20261022.md](docs/classification-drawer-delivery-20261022.md) | 图号归类、H10与详情抽屉修正版交付 | 实施/发布/验证说明；非需求确认 |
| [docs/comprehensive-redesign-delivery-20261021.md](docs/comprehensive-redesign-delivery-20261021.md) | 综合改版交付记录（2026-10-21） | AI设计/审查/待确认材料；看原状态 |
| [docs/comprehensive-redesign-preflight-20261020.md](docs/comprehensive-redesign-preflight-20261020.md) | 综合改版：实施前审查与待确认设计（2026-10-20） | AI设计/审查/待确认材料；看原状态 |
| [docs/comprehensive-task5-verification-20261020.md](docs/comprehensive-task5-verification-20261020.md) | 图号规划、外观关联与资料库验证记录 | 实施/发布/验证说明；非需求确认 |
| [docs/design-audit-three-skills-20261023.md](docs/design-audit-three-skills-20261023.md) | 图号规划器全局 UI / UX 复查（2026-10-23） | AI设计/审查/待确认材料；看原状态 |
| [docs/desktop-acceptance-20261013.md](docs/desktop-acceptance-20261013.md) | master 合并与桌面验收交付（2026-10-13） | 验收/候选/交付记录；不等用户签收 |
| [docs/direct-classification-h10-correction-20261022.md](docs/direct-classification-h10-correction-20261022.md) | 图号直接归类与 H10 首批大货修正（2026-10-22） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/drawing-detail-four-groups-20261022.md](docs/drawing-detail-four-groups-20261022.md) | 图号详情四板块与释放资格修正（2026-10-22 后续） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/drawing-library-v3-acceptance.md](docs/drawing-library-v3-acceptance.md) | 图号库第三版收口（开发 Mock 预览） | 验收/候选/交付记录；不等用户签收 |
| [docs/hotfix-1.1.1-20261027.md](docs/hotfix-1.1.1-20261027.md) | v1.1.1 修复与验证记录 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/hotfix-1.1.2-20261027.md](docs/hotfix-1.1.2-20261027.md) | v1.1.2 最终补充修复 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/hotfix-1.3.1-20261030.md](docs/hotfix-1.3.1-20261030.md) | v1.3.1 邮件导入热修复 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/install-and-upgrade.md](docs/install-and-upgrade.md) | 安装、升级与恢复 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/maintenance.md](docs/maintenance.md) | 维护与发布 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/minimal-engineering-workspace-acceptance-20261014.md](docs/minimal-engineering-workspace-acceptance-20261014.md) | Minimal Engineering Workspace：Windows验收标准（2026-10-14） | 验收/候选/交付记录；不等用户签收 |
| [docs/minimal-engineering-workspace-design-20261014.md](docs/minimal-engineering-workspace-design-20261014.md) | Minimal Engineering Workspace：已确认设计与实施阶段（2026-10-14） | AI设计/审查/待确认材料；看原状态 |
| [docs/outbound-ui-v1-acceptance.md](docs/outbound-ui-v1-acceptance.md) | 外发资料 UI 第一版 Mock 验收（2026-10-09） | 验收/候选/交付记录；不等用户签收 |
| [docs/outbound-v2-requirements-20261020.md](docs/outbound-v2-requirements-20261020.md) | 图号规划器｜外发资料模块完整改造需求 V2.0 | 需求正文归档；后续逐条替代链优先 |
| [docs/p1-minimal-workspace-20261014.md](docs/p1-minimal-workspace-20261014.md) | P1 视觉基础与响应式框架：实施与验证记录（2026-10-14） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p1-windows-handoff-20261014.md](docs/p1-windows-handoff-20261014.md) | P1 Windows 本地验收交付（2026-10-14） | 验收/候选/交付记录；不等用户签收 |
| [docs/p2-windows-handoff-20261014.md](docs/p2-windows-handoff-20261014.md) | P2 Windows隔离交付 | 验收/候选/交付记录；不等用户签收 |
| [docs/p2-workspaces-20261014.md](docs/p2-workspaces-20261014.md) | P1反馈修正与P2工作区实施（2026-10-14） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p3-module-alignment-20261015.md](docs/p3-module-alignment-20261015.md) | P3模块视觉与对齐（2026-10-15） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p3-windows-handoff-20261015.md](docs/p3-windows-handoff-20261015.md) | P3 Windows隔离验收交付 | 验收/候选/交付记录；不等用户签收 |
| [docs/p4-adaptive-data-workspaces-20261015.md](docs/p4-adaptive-data-workspaces-20261015.md) | P4 全页面数据工作区自适应：检查、实施方案与验收（2026-10-15） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-adaptive-verification-20261015.json](docs/p4-adaptive-verification-20261015.json) | p4-adaptive-verification-20261015 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-adaptive-windows-readonly-20261015.md](docs/p4-adaptive-windows-readonly-20261015.md) | P4 本机已有数据只读验收指引（2026-10-15） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-bom-edit-corrections-20261016.md](docs/p4-bom-edit-corrections-20261016.md) | P4 BOM历史编辑与详情修正（2026-10-16） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-bom-edit-fix-verification-20261016.json](docs/p4-bom-edit-fix-verification-20261016.json) | p4-bom-edit-fix-verification-20261016 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-bom-history-comparison-20261016.md](docs/p4-bom-history-comparison-20261016.md) | P4 BOM 查询历史对照（2026-10-16） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-bom-history-verification-20261016.json](docs/p4-bom-history-verification-20261016.json) | p4-bom-history-verification-20261016 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-bom-windows-handoff-20261016.md](docs/p4-bom-windows-handoff-20261016.md) | P4 BOM Windows免安装验收包（2026-10-16） | 验收/候选/交付记录；不等用户签收 |
| [docs/p4-detail-feedback-verification-20261016.json](docs/p4-detail-feedback-verification-20261016.json) | p4-detail-feedback-verification-20261016 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-dictionary-corrections-20261019.md](docs/p4-dictionary-corrections-20261019.md) | 编码字典补充修正（2026-10-19） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-filter-feedback-20261016.md](docs/p4-filter-feedback-20261016.md) | P4 本机截图反馈：筛选区与外发横向空间（2026-10-16） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-filter-feedback-verification-20261016.json](docs/p4-filter-feedback-verification-20261016.json) | p4-filter-feedback-verification-20261016 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-floating-navigation-20261019.md](docs/p4-floating-navigation-20261019.md) | 默认展开的浮动工作导航（2026-10-19） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-integrated-ui-20261017.md](docs/p4-integrated-ui-20261017.md) | P4 图号库与外发配置整合候选 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-integrated-ui-verification-20261017.json](docs/p4-integrated-ui-verification-20261017.json) | p4-integrated-ui-verification-20261017 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-layout-feedback-20261017.md](docs/p4-layout-feedback-20261017.md) | P4 截图反馈修正 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-layout-feedback-verification-20261017.json](docs/p4-layout-feedback-verification-20261017.json) | p4-layout-feedback-verification-20261017 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-master-merge-20261017.md](docs/p4-master-merge-20261017.md) | P4 已确认版本合并 master（2026-10-17） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-master-merge-verification-20261017.json](docs/p4-master-merge-verification-20261017.json) | p4-master-merge-verification-20261017 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-navigation-dictionary-verification-20261019.json](docs/p4-navigation-dictionary-verification-20261019.json) | p4-navigation-dictionary-verification-20261019 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-offline-update-20261016.md](docs/p4-offline-update-20261016.md) | P4 GitHub连接失败后的离线更新（2026-10-16） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-pdf-navigation-20261019.md](docs/p4-pdf-navigation-20261019.md) | PDF 三级导航与产品批量确认（2026-10-19） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-pdf-navigation-verification-20261019.json](docs/p4-pdf-navigation-verification-20261019.json) | p4-pdf-navigation-verification-20261019 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-product-corrections-20261019.md](docs/p4-product-corrections-20261019.md) | 产品删除选项、字典下拉与来源列修正（2026-10-19） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-product-purpose-columns-20261016.md](docs/p4-product-purpose-columns-20261016.md) | P4 产品用途列、规划编号、BOM明细及复制图标反馈（2026-10-16） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-products-list-20261016.md](docs/p4-products-list-20261016.md) | P4 产品档案八列列表与二维码导航（2026-10-16） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-products-list-verification-20261016.json](docs/p4-products-list-verification-20261016.json) | p4-products-list-verification-20261016 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-release-notes-20261017.md](docs/p4-release-notes-20261017.md) | 图号规划器 P4 · Windows 安装版 | 实施/发布/验证说明；非需求确认 |
| [docs/p4-release-verification-20261017.json](docs/p4-release-verification-20261017.json) | p4-release-verification-20261017 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-unified-navigation-empty-installer-20261020.json](docs/p4-unified-navigation-empty-installer-20261020.json) | p4-unified-navigation-empty-installer-20261020 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-unified-navigation-empty-installer-20261020.md](docs/p4-unified-navigation-empty-installer-20261020.md) | 图号/PDF统一导航与中文空数据安装包（2026-10-20） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/p4-verification-20261015.json](docs/p4-verification-20261015.json) | p4-verification-20261015 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/p4-windows-handoff-20261015.md](docs/p4-windows-handoff-20261015.md) | P4 Windows隔离验收交付（2026-10-15） | 验收/候选/交付记录；不等用户签收 |
| [docs/p4-workspace-refinement-20261015.md](docs/p4-workspace-refinement-20261015.md) | P4工作区细化与验收记录（2026-10-15） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/packaging-ui-delivery-20261102.md](docs/packaging-ui-delivery-20261102.md) | 包材模板、制图任务及规划 UI 修改记录 | 实施/发布/验证说明；非需求确认 |
| [docs/packaging-ui-requirements-20261102.md](docs/packaging-ui-requirements-20261102.md) | 图号规划器｜包材模板、制图任务及图号规划 UI 优化需求 | 需求正文归档；后续逐条替代链优先 |
| [docs/pdf-catalog-correction-20261023.md](docs/pdf-catalog-correction-20261023.md) | PDF 管理及产品目录修正（2026-10-23） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/pdf-directory-zero-correction-20261022.md](docs/pdf-directory-zero-correction-20261022.md) | PDF 产品导航全为0：根因与修正 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/products-ui-v1-acceptance.md](docs/products-ui-v1-acceptance.md) | 产品档案 UI Mock（展开详情重新验收，暂不冻结，2026-10-10） | 验收/候选/交付记录；不等用户签收 |
| [docs/progress.json](docs/progress.json) | progress | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/release-1.0.0.md](docs/release-1.0.0.md) | 图号规划器 v1.0.0 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.1.0.md](docs/release-1.1.0.md) | 图号规划器 v1.1.0 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.1.1.md](docs/release-1.1.1.md) | 图号规划器 v1.1.1 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.1.2.md](docs/release-1.1.2.md) | 图号规划器 v1.1.2 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.2.0.md](docs/release-1.2.0.md) | 图号规划器 v1.2.0 · 邮件模板导入与外发草稿 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.3.0.md](docs/release-1.3.0.md) | 图号规划器 v1.3.0 · V5.2 增量修正 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.3.1.md](docs/release-1.3.1.md) | 图号规划器 v1.3.1 · 邮件导入修复 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.4.0.md](docs/release-1.4.0.md) | 图号规划器 v1.4.0 · 包材模板与制图任务 | 实施/发布/验证说明；非需求确认 |
| [docs/release-1.5.0.md](docs/release-1.5.0.md) | 图号规划器 v1.5.0 · 包材模板与制图任务交互优化 | 实施/发布/验证说明；非需求确认 |
| [docs/repository-cleanup-20261024.md](docs/repository-cleanup-20261024.md) | 正式版本仓库整理 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/schema24-to25-upgrade-evidence.json](docs/schema24-to25-upgrade-evidence.json) | schema24-to25-upgrade-evidence | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/screenshots/comprehensive-20261020/qr-manual-measurements.json](docs/screenshots/comprehensive-20261020/qr-manual-measurements.json) | qr-manual-measurements | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/second-acceptance-requirements.txt](docs/second-acceptance-requirements.txt) | second-acceptance-requirements | 需求正文归档；后续逐条替代链优先 |
| [docs/second-acceptance-review-2026-09-29.md](docs/second-acceptance-review-2026-09-29.md) | 整分支独立审查 | 验收/候选/交付记录；不等用户签收 |
| [docs/superpowers/plans/2026-08-24-drawing-number-planner-phase-1.md](docs/superpowers/plans/2026-08-24-drawing-number-planner-phase-1.md) | 图号规划器 Phase 1 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-08-24-drawing-number-planner-phase-2.md](docs/superpowers/plans/2026-08-24-drawing-number-planner-phase-2.md) | 图号规划器 Phase 2 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-08-25-drawing-number-planner-phase-3.md](docs/superpowers/plans/2026-08-25-drawing-number-planner-phase-3.md) | 图号规划器 Phase 3 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-08-25-drawing-number-planner-phase-4.md](docs/superpowers/plans/2026-08-25-drawing-number-planner-phase-4.md) | Drawing Number Planner Phase 4 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-08-26-drawing-number-planner-business-flow-usability-correction.md](docs/superpowers/plans/2026-08-26-drawing-number-planner-business-flow-usability-correction.md) | 图号规划器：业务流程与可用性修正阶段 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-08-26-drawing-number-planner-compatibility-correction.md](docs/superpowers/plans/2026-08-26-drawing-number-planner-compatibility-correction.md) | 图号规划器兼容性修正阶段 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-08-28-drawing-number-planner-material-batches-usability.md](docs/superpowers/plans/2026-08-28-drawing-number-planner-material-batches-usability.md) | 图号规划器资料批次与交互修正 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-08-31-drawing-number-planner-real-usage-acceptance-corrections.md](docs/superpowers/plans/2026-08-31-drawing-number-planner-real-usage-acceptance-corrections.md) | 图号规划器真实使用验收修正 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-09-10-drawing-number-planner-outbound-and-recovery.md](docs/superpowers/plans/2026-09-10-drawing-number-planner-outbound-and-recovery.md) | 图号规划器真实使用修正、外发资料与安全恢复 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-09-22-drawing-number-deletion.md](docs/superpowers/plans/2026-09-22-drawing-number-deletion.md) | Drawing Number Deletion Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-09-22-second-acceptance-corrections.md](docs/superpowers/plans/2026-09-22-second-acceptance-corrections.md) | 第二轮实际使用验收修正 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-14-p2-workspaces.md](docs/superpowers/plans/2026-10-14-p2-workspaces.md) | P1反馈修正与P2实施 | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-15-p4-workspace-refinement.md](docs/superpowers/plans/2026-10-15-p4-workspace-refinement.md) | P4实施计划与记录 | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-20-comprehensive-appearance-development.md](docs/superpowers/plans/2026-10-20-comprehensive-appearance-development.md) | 综合外观版本、资料关联与手动二维码 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-22-v3-business-ui.md](docs/superpowers/plans/2026-10-22-v3-business-ui.md) | V3 global business correction Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-23-ui-consistency.md](docs/superpowers/plans/2026-10-23-ui-consistency.md) | 全局 UI 一致性修正 | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-23-v4-data-interaction.md](docs/superpowers/plans/2026-10-23-v4-data-interaction.md) | V4 data association and table interactions Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-26-v5-system-corrections.md](docs/superpowers/plans/2026-10-26-v5-system-corrections.md) | V5 全系统增量修正 Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-27-v51-mail-import-drafts.md](docs/superpowers/plans/2026-10-27-v51-mail-import-drafts.md) | V5.1 Email import and outbound drafts implementation plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-28-v52-incremental.md](docs/superpowers/plans/2026-10-28-v52-incremental.md) | V5.2 incremental implementation plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-10-30-ait-packaging-workflow.md](docs/superpowers/plans/2026-10-30-ait-packaging-workflow.md) | AIT Packaging Workflow Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/plans/2026-11-02-packaging-ui-workflow.md](docs/superpowers/plans/2026-11-02-packaging-ui-workflow.md) | Packaging and drawing workflow UI Implementation Plan | AI实施计划/记录；非独立批准 |
| [docs/superpowers/specs/2026-08-24-drawing-number-planner-design.md](docs/superpowers/specs/2026-08-24-drawing-number-planner-design.md) | 图号规划、BOM 及包材文件管理系统设计 | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-08-25-drawing-number-planner-phase-4-design.md](docs/superpowers/specs/2026-08-25-drawing-number-planner-phase-4-design.md) | 图号规划器 Phase 4 设计 | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-08-26-drawing-number-planner-business-flow-usability-correction-design.md](docs/superpowers/specs/2026-08-26-drawing-number-planner-business-flow-usability-correction-design.md) | 图号规划器：业务流程与可用性修正阶段设计 | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-08-26-drawing-number-planner-compatibility-correction-design.md](docs/superpowers/specs/2026-08-26-drawing-number-planner-compatibility-correction-design.md) | 图号规划器兼容性修正阶段设计 | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-08-28-drawing-number-planner-material-batches-usability-design.md](docs/superpowers/specs/2026-08-28-drawing-number-planner-material-batches-usability-design.md) | 图号规划器：资料批次、业务动线与交互修正 Design Document | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-08-31-drawing-number-planner-real-usage-acceptance-corrections-design.md](docs/superpowers/specs/2026-08-31-drawing-number-planner-real-usage-acceptance-corrections-design.md) | 图号规划器——真实使用验收修正 Design Document | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-09-10-drawing-number-planner-outbound-and-recovery-design.md](docs/superpowers/specs/2026-09-10-drawing-number-planner-outbound-and-recovery-design.md) | 图号规划器——真实使用修正、外发资料与安全恢复 Design Document | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-09-22-drawing-number-deletion-design.md](docs/superpowers/specs/2026-09-22-drawing-number-deletion-design.md) | 图号删除与占号释放设计（Schema v13） | AI设计/审查/待确认材料；看原状态 |
| [docs/superpowers/specs/2026-09-22-second-acceptance-corrections-design.md](docs/superpowers/specs/2026-09-22-second-acceptance-corrections-design.md) | 第二轮实际使用验收修正：调查与设计提案 | AI设计/审查/待确认材料；看原状态 |
| [docs/ui-consistency-batch1.md](docs/ui-consistency-batch1.md) | 第一批：错误状态与安全恢复反馈 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/ui-consistency-delivery-20261023.md](docs/ui-consistency-delivery-20261023.md) | UI 一致性修正版（2026-10-23） | 实施/发布/验证说明；非需求确认 |
| [docs/ui-integrated-trial.md](docs/ui-integrated-trial.md) | 图号规划器 UI 集成候选：受控试用 | 验收/候选/交付记录；不等用户签收 |
| [docs/ui-integration-ledger.md](docs/ui-integration-ledger.md) | UI integrated candidate | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v1.5.0-public-download-verification.json](docs/v1.5.0-public-download-verification.json) | v1.5.0-public-download-verification | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/v3-backend-task.md](docs/v3-backend-task.md) | V3 产品归属与兼容层验证（2026-10-22） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-business-ui-requirements-20261022.md](docs/v3-business-ui-requirements-20261022.md) | 图号规划器｜全局业务修正与 UI 优化需求 V3.0 | 需求正文归档；后续逐条替代链优先 |
| [docs/v3-delivery-20261022.md](docs/v3-delivery-20261022.md) | V3 全局业务修正最终交付 | 实施/发布/验证说明；非需求确认 |
| [docs/v3-drawing-ui-task.md](docs/v3-drawing-ui-task.md) | V3 图号库界面实施记录 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-installation-20261022.md](docs/v3-installation-20261022.md) | V3 本地安装、升级与验收 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-outbound-task.md](docs/v3-outbound-task.md) | V3 外发资料实施与验证 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-pdf-task.md](docs/v3-pdf-task.md) | V3 PDF 文件中心实施与复核 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-product-planning-bom-task.md](docs/v3-product-planning-bom-task.md) | V3 产品、规划与 BOM UI 修正 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-qr-task.md](docs/v3-qr-task.md) | V3 二维码管理实施与验证（2026-10-22） | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-release-notes-20261022.md](docs/v3-release-notes-20261022.md) | 图号规划器 V3.1 中文修正版 | 实施/发布/验证说明；非需求确认 |
| [docs/v3-review-20261022.md](docs/v3-review-20261022.md) | V3 独立审查结果 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-root-task.md](docs/v3-root-task.md) | V3 共享组件与交付整合 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v3-test-results-20261022.json](docs/v3-test-results-20261022.json) | v3-test-results-20261022 | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/v3-work-log.md](docs/v3-work-log.md) | V3 实施验证日志 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v4-data-interaction-requirements-20261023.md](docs/v4-data-interaction-requirements-20261023.md) | 图号规划器｜数据关联修复与全局交互优化需求 V4.0 | 需求正文归档；后续逐条替代链优先 |
| [docs/v4-delivery-20261023.md](docs/v4-delivery-20261023.md) | V4 数据关联与表格交互交付记录 | 实施/发布/验证说明；非需求确认 |
| [docs/v4-reports/files-ui.md](docs/v4-reports/files-ui.md) | V4 PDF 文件中心实施记录 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v4-reports/matching.md](docs/v4-reports/matching.md) | V4 matching safety report — 2026-10-23 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v4-reports/page-tables.md](docs/v4-reports/page-tables.md) | V4 页面表格接入报告 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v4-reports/pdf-backend.md](docs/v4-reports/pdf-backend.md) | V4 PDF manual classification backend | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v4-reports/schema.md](docs/v4-reports/schema.md) | V4 Task 1: product identity and migration | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v4-reports/tables.md](docs/v4-reports/tables.md) | V4 shared table implementation | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v4-rollback-baseline.md](docs/v4-rollback-baseline.md) | V4 回退基准 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v41-backend-verification-20261024.md](docs/v41-backend-verification-20261024.md) | V4.1 图号后端修正与隔离验证（2026-10-24） | 实施/发布/验证说明；非需求确认 |
| [docs/v41-v42-delivery-20261024.md](docs/v41-v42-delivery-20261024.md) | V4.1 / V4.2 与 v1.0.0 交付记录 | 实施/发布/验证说明；非需求确认 |
| [docs/v5-delivery-20261026.md](docs/v5-delivery-20261026.md) | V5 / v1.1.0 修改与验收记录 | 实施/发布/验证说明；非需求确认 |
| [docs/v5-execution-ledger.md](docs/v5-execution-ledger.md) | V5 执行记录 — 2026-10-26 | 维护/用户要求转述/历史记录；逐项回溯 |
| [docs/v5-system-requirements-20261026.md](docs/v5-system-requirements-20261026.md) | 图号规划器｜新一轮全系统修改需求 V5.0 | 需求正文归档；后续逐条替代链优先 |
| [docs/v51-mail-delivery-20261027.md](docs/v51-mail-delivery-20261027.md) | V5.1 邮件模板导入与外发草稿 | 实施/发布/验证说明；非需求确认 |
| [docs/v51-mail-import-drafts-requirements-20261027.md](docs/v51-mail-import-drafts-requirements-20261027.md) | 图号规划器｜邮件模板导入与外发邮件草稿功能需求 V5.1 | 需求正文归档；后续逐条替代链优先 |
| [docs/v52-delivery-20261030.md](docs/v52-delivery-20261030.md) | V5.2 实施与交付验证 | 实施/发布/验证说明；非需求确认 |
| [docs/v52-requirements-and-audit-20261028.md](docs/v52-requirements-and-audit-20261028.md) | V5.2 增量范围与第一阶段核对 | 需求摘要+发现混合；详细用户原文优先 |
| [docs/verification/comprehensive-20261021/delivery.json](docs/verification/comprehensive-20261021/delivery.json) | delivery | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/verification/comprehensive-20261021/installed-file-hash-verification.json](docs/verification/comprehensive-20261021/installed-file-hash-verification.json) | installed-file-hash-verification | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/verification/comprehensive-20261021/windows-chinese-installer.json](docs/verification/comprehensive-20261021/windows-chinese-installer.json) | windows-chinese-installer | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/verification/comprehensive-20261021/windows-comprehensive-verification.json](docs/verification/comprehensive-20261021/windows-comprehensive-verification.json) | windows-comprehensive-verification | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/verification/comprehensive-20261021/windows-comprehensive-viewports.json](docs/verification/comprehensive-20261021/windows-comprehensive-viewports.json) | windows-comprehensive-viewports | 已保存执行/验证/进度数据；本轮未重跑 |
| [docs/verification/comprehensive-20261021/windows-qr-modal-layout.json](docs/verification/comprehensive-20261021/windows-qr-modal-layout.json) | windows-qr-modal-layout | 已保存执行/验证/进度数据；本轮未重跑 |

## 9. 最新v15原30项验收逐项映射

来源S13:849–882；这是审计映射，不是新的通过打勾。测试/截图记录与本轮运行/用户签收严格分开。

| 原项 | 内容 | 需求ID | 实现/验证范围 |
|---:|---|---|---|
| 1 | 制图任务独立菜单 | R-TASK01 | 已实现 |
| 2 | 包材模板无任务功能 | R-AIT01 | 已实现 |
| 3 | 普通用户不手填内部参数键 | R-AIT06/07 | 已实现中文映射/匹配配置 |
| 4 | 生成仅换完整图号 | R-AIT03 | 三层代码/合约实现；真实Adobe未验 |
| 5 | 原AIT尺寸/刀模/排版不变 | R-AIT03 | 不写几何的代码约束；真实设计版式E-01未验 |
| 6 | PDF仍能Illustrator编辑 | R-AIT04 | 导出选项实现；真实重开未验 |
| 7 | 不独立生成AI | R-AIT04 | 现导出路径/协议实现 |
| 8 | 规划无复杂尺寸区 | R-PLAN06 | 已实现 |
| 9 | 紧凑实时预览 | R-PLAN05 | 已实现；同前缀预计语义G-04 |
| 10 | 紧凑成功卡片 | R-PLAN08 | 已实现，有存储截图 |
| 11 | 图号库精确定位 | R-PLAN08 | 已实现实际保存ID交接 |
| 12 | 无需填无意义任务名 | R-TASK03 | 已实现自动命名 |
| 13 | 日常不显完整UUID | R-TASK03 | 已实现，诊断折叠保ID |
| 14 | 直接继续未完成任务 | R-TASK06 | 已实现 |
| 15 | 一个型号不多未完成任务 | R-TASK04 | 按真实产品ID唯一；重复型号文本不合并 |
| 16 | 目录从已有配置自动取 | R-TASK05 | 唯一可靠目录自动，多义明确选择 |
| 17 | 生成PDF直接00 | R-TASK07/10 | 新任务路径与发布机制实现；真实Adobe实际生成未验 |
| 18 | 不再自动UUID子目录 | R-TASK07 | 已实现新任务规则 |
| 19 | 旧任务目录/数据保护 | R-TASK08 | 兼容代码/历史匿名24升级证据；非生产实测 |
| 20 | 详情紧凑项目行 | R-TASK09 | 已实现，实际Windows存图 |
| 21 | 批量/失败重试/人工识别继续 | R-TASK10/11 | 逻辑/合约和历史人工文件流程证据；真实Adobe批量未验 |
| 22 | 归档后只清本任务对应临时 | R-TASK14 | 已实现journal+所有权+hash限定 |
| 23 | 历史查看与删除 | R-TASK15 | 已实现；不含undelete新功能 |
| 24 | 删记录不删正式/释放/改BOM | R-TASK16 | 留痕/文件保护实现及历史测试证据 |
| 25 | 本地可读时间 | R-TASK20 | 已实现，不规定用户时区值 |
| 26 | 指定型号扫描 | R-PDF05 | 已实现；类别语义G-06 |
| 27 | 筛选与扫描范围分开 | R-PDF05/06 | 已实现；监听范围G-01单独待核 |
| 28 | 00不入正式索引 | R-PDF01 | 已实现确切扫描目录策略 |
| 29 | 缩放/滚动/刷新稳定 | R-UI03/05/09 | 已有实现与历史截图；G-02/05等局部差异和物理DPI未验 |
| 30 | 不破坏原正常Illustrator生成 | R-AIT03/04 | 保留适配机制/合约；缺真实AIT/授权Adobe复验，不宣称已闭合 |

## 10. 本次审计结论的使用限制

本轮未能无争议认定“仍有效且整体完全未实现”的新模块；已登记的批量改名/跨型号复制确未找到完整实现，但当前有效性要核对后续决定。自动监听存在明确代码范围限制，用户是否要求扩到全部无00/无任务产品仍待核。其余差异按G编号分为文字不一致、静态风险、部分覆盖或待确认语义，不能一概当新开发任务。历史批量改名/跨型号复制Backlog没有自动复活。所有仅代码实现/AI参数/旧截图仍保留来源等级，等待用户确认五份审计后再决定修复范围。
