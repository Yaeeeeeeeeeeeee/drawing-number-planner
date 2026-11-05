# 需求与实现差异审计

日期：2026-11-05（上海）。基准HEAD `45450c0`，应用Tag `v1.5.0` / `096dabc`。状态：**记录差异，未修改实现；等待用户确认。**

## 1. 证据与分类

- **确认差异**：可对照明确需求/文字声明与代码，看到范围或行为不一致。
- **静态风险**：代码路径可指向异常，但本轮未启动/复现，不能称已发生数据损坏。
- **待决定**：需求范围/词义/交互恢复方式不确定；只记观察，不自行新增要求。
- **验收缺口**：缺真实环境证据，不等于代码未实现。

优先级只供审核顺序，不构成开发任务授权：P1影响关联/范围/启动；P2反馈/操作一致性；P3资料口径。本轮未发现可据现有证据断言“真实生产库已丢数据”的事实，也未做保证全项目无缺陷的证明。

## 2. 已核实差异与静态风险

### G-01 自动监听范围附加了包材工作流的进入条件

**类型**：已确认代码范围限制；是否构成最终需求覆盖差异待核，P1，不是无监听。

- 最终需求：`docs/packaging-ui-requirements-20261102.md:676–686` 要求保留完善自动监听、增量/指定型号/全量/启动补查，发现变化只对相关型号检查；没有明确写出“所有无00、无任务产品也必须监听”。较早`docs/ait-packaging-delivery-20261030.md:11`已记录opt-in实现，但交付报告本身不是用户批准。
- 当前：`src/core/packaging/packaging-monitor.ts:108–114` 仅将“未完成任务”或实际存在`00.临时文件`的唯一归属产品放入known；`:135–138` 对不在known的普通02/03文件事件直接返回。
- 静态测试依据：`tests/core/packaging/packaging-monitor.test.ts:66–69` 明确测试这一opt-in边界，而不是证明全体正常产品均监听。
- 影响：无00且无任务的既有产品，手动扫描能工作，但不能据交付文字认为其后续正式文件变化必定自动更新。
- 未确定：原始批准的监听产品范围；不能因最新需求未写限制就认定用户已要求全覆盖，也不能因旧交付/测试写了opt-in就认定用户认可。保留Q-16，不自行扩大监听。

### G-02 返回制图任务页面不自动重载任务历史

**类型**：代码事实/交付刷新表述范围不完整，P2。

- `DrawingTasksPage.tsx:19–24` 的active刷新读catalog和lookups；`PackagingTaskPanel.tsx:31` 的listTasks effect只依赖packaging对象，没有active。
- 历史只有显式刷新、创建/返回详情等路径触发refresh；已选详情另有轮询，不等于历史列表刷新。
- 交付 `docs/packaging-ui-delivery-20261102.md:10` 的“页面激活刷新”应限定资料层。`tests/renderer/packaging-page-freshness.test.tsx` 覆盖配置/产品/草稿，没有覆盖历史行回页刷新。
- 影响场景：保留挂载的历史列表，在其他操作/后台改变任务状态后返回，可能仍显示上次行状态；可用刷新按钮恢复。
- 是否要求每次激活刷新全部历史见Q-04；没有清空页面或改轮询。

### G-03 删除任务指纹失效后，弹窗继续使用原token

**类型**：有限操作恢复缺口，P2，数据保护仍正确。

- 服务 `packaging-task-service.ts:135–148` 将task/owned/journal快照hash用于确认，变化后拒绝旧token。
- UI `PackagingTaskPanel.tsx:70` 失败只设置deleteError，保留deletion及旧token；直接再按确认重复提交同值。
- 当前可恢复方式：取消并重新点删除，重新获取预检。并非完全无法删除，也不是可绕过校验。
- `tests/renderer/drawing-tasks-page.test.tsx` 有普通失败保留/重试，但未证明实际旧指纹重新预检流程。
- 待决定：错误文案明确指引重开，还是弹窗内重新预检；本轮不选择方案。

### G-04 同前缀多行的实时预计码可能相同

**类型**：静态可推导UI行为，是否违背最终期待待确认，P2。

- `PlanningPage.tsx:170,177` 每行实时预览发送rows:[singleRow]。
- `planning-service.ts:24–44` 的连续分配只在一个请求内推进；因此尚未批量查重时，两条相同前缀草稿各显示相同的下一个号码。
- 最终明确“查重并预览”整批调用与占号事务正确，**不能据此声称重复正式占号**。
- `tests/renderer/planning-page.test.tsx:236–249` 的实时预览用不同项目前缀，未覆盖同前缀场景。
- 需求 `docs/packaging-ui-requirements-20261102.md:315–333` 强调逐行预计完整码/推荐流水/状态，但“独立”是否要求整批预计唯一未直接写明。见Q-05。

### G-05 空态、初始加载与元数据失败反馈未完全统一

**类型**：确认的交互覆盖不足，P2；不代表主查询所有失败都被吞掉。

| 路径 | 当前行为 | 依据 |
|---|---|---|
| 模板/规则搜索无结果 | 空提示仅判断未过滤全数组；过滤后空表无说明 | PackagingTemplatesPage.tsx:49,57；DataTable.tsx:16–23 |
| 无制图任务历史 | 空tbody，无明确首次空态 | PackagingTaskPanel.tsx:64 |
| 规划初始读取 | 无专门初始loading，选择项可暂空；错误banner没有role=alert | PlanningPage.tsx:42–64,160 |
| PDF辅助元数据失败 | drawingNavigation清空batches，products/batches失败转[]，无各源失败说明 | FilesPage.tsx:201–206 |
| QR辅助产品/用途失败 | catch(()=>undefined)，可能看似无辅助选项；主列表错误仍另显示 | QrCodesPage.tsx:45 |

最新需求 `docs/packaging-ui-requirements-20261102.md:731–750` 要统一空/成功/错误反馈；旧UI一致性记录也强调失败不能充当真空数据。现有QueryFeedback/EmptyState存在不代表每条路径都用了。没有通过固定高度、隐藏内容或制造假数据修改。

### G-06 类别导航与扫描范围的语义没有完整落地

**类型**：待确认范围差异，P1。

- 需求最新`:665–674`列全部/类别/型号导航并明确型号范围；`:706`说“左侧产品目录决定扫描范围”。
- UI `FilesPage.tsx:401` 只有“扫描当前型号”和“扫描资料库”；`:289–292` 处理productId或全量，`routes/packaging-tasks.ts:22` 单型号API不接受类别。
- 选类别后点“扫描资料库”仍全库，并无类别范围扫描能力；按钮全库文字本身明确，不能断言用户明确要求每个类别也必须单独扫描。
- 需要Q-02决定类别是否属于受支持扫描范围；工作中的“按型号扫描”本身已实现。

### G-07 后台监听失败状态没有业务UI消费者

**类型**：可观察性缺口/需求范围待核，P2。

- monitor保留status/error/重试队列：`packaging-monitor.ts:43–44,160–171`；未找到renderer或route读取该status。
- 手动scan错误有明确提示且失败不批量标缺失；这不能证明后台失败会同样显示。
- 最新`:710–721`要求扫描结果/失败数，但后台状态应放在哪里没有明确决定。源错误不等于已清索引。

### G-08 PDF全选已加载可超过服务500条上限

**类型**：静态前后端容量不衔接，P2。

- `FilesPage.tsx:440` 全选所有已加载files；列表可继续载入很多页。
- `pdf-classification.ts:17`、`pdf-management.ts:55–58` 拒绝超过500IDs；未见前端限选或分组提交。
- 用户加载超过500再全选归纳/排除/恢复/移除，可能收到数量错误；服务拒绝保护仍在，不是批量误删。
- 500是代码限制，不是已确认业务常量；不把分批或扩大限制自动写成已批准方案，见Q-09。

### G-09 存在状态筛选与逐行磁盘事实不是同一时点

**类型**：当前语义限制/待确认，P2。

- PDF筛选/计数以存储is_present为准：`file-repository.ts:101–102`；图号聚合类似 `drawing-repository.ts:65–72,105–110,207–211`。
- 实际行状态/打开与图号详情会重新检查磁盘：`file-service.ts:54–60`、`pdf-presence.ts:4–22`、`drawing-file-observation.ts:31–113`。
- 外部删/还原文件后、重扫前，可能“筛选命中/计数”仍属旧扫描状态而行文字反映新观察。并非详情必然误判缺失。
- 是否明确显示“上次扫描状态”或要求筛选实时核实需Q-03，不能擅自把每次查询变全盘探测。

### G-10 外发精确跳转把品类尺寸ID写进产品类别筛选

**类型**：遗留target路径静态不一致，P2；本轮未运行复现，未找到日常生产触发入口。

- `PackageBuilder.tsx:63` target effect赋 `categoryId=String(product.productSizeId)`。
- 同文件`:88` 初始加载target赋`product.productCategory`；`:110–112`类别列表/过滤值也都是productCategory文字。
- 后续products/target effect可覆盖正确值，目标产品列表可能为空/选择状态不相符。不能把品类尺寸ID与产品类别混同。
- 出处要求品牌→产品类别→产品型号级联（V5§10与V5.2§8）。但当前AppShell仅把openVersion回调传给ProductsPage，ProductsWorkspace未取用该回调（ProductsPage.tsx:23–26）；原ProductAppearancePanel/ProductVersionResources均未挂载。**没有找到正常菜单可触发此外发target的入口**，不能据此称用户现有普通打包已发生错位。
- 未改代码；若需要继续支持/启用legacy target，应单独验证，不能凭普通手选打包测试称已覆盖，也不能为复现而恢复已否决外观UI。

### G-11 安装恢复说明提供了当前不存在的重新选库入口

**类型**：确认的文档/实现不一致，P1。

- `docs/install-and-upgrade.md:10,22` 声称安全恢复可重新选择数据目录/备份planner.db。
- 实际 `SafeRecovery.tsx:117–120`、`main/index.ts:131–152`、`main/preload.cts:38–42` 仅结束任务、重载、重启服务/程序。
- `production-profile.cjs:45–49` 同安装marker普通重启沿用原profile，不会重新给选择窗口。
- 当前支持的完整恢复是文档的人工关闭/另存/恢复完整目录步骤，不是集成按钮。
- 不自行选择“补功能”还是“改说明”，因原始全备份/选库UI批准证据不足，见Q-06/Q-07。

### G-12 新profile提交先于Schema迁移，后续启动失败的保证要限定

**类型**：静态失败路径，P1；没有实际打开/构造数据库。

- 旧库选择仅格式+quick_check：`scripts/production-profile.cjs:14–34,56–64`，`:83–94`写profile。
- `scripts/production-entry.cjs:12` 随后启动应用；`migrations.ts:784`才拒绝未来Schema。
- 一份有效SQLite但Schema高于25的planner.db可先被选中并写profile，再在迁移失败；“任何启动失败都保留之前profile”不能从现代码推出。
- 取消、格式校验失败、profile写失败保原profile已有保护；实际旧库数据并未因此删除。问题是选择状态与启动兼容性的先后，不能夸张为数据库损坏。
- 需Q-06明确保证范围和恢复预期；本轮不运行迁移或修改启动顺序。

## 3. 其他现状限制，不直接判为已确认功能遗漏

| ID | 观察 | 状态/依据 |
|---|---|---|
| L-01 | 一个产品有V2不可变外发范围/快照，或手工QR历史时，集中退出/永久清历史可能被保护阻断 | product-cleanup-service.ts:21–57；product-cleanup-options.ts:52–81。早期“集中退出”目标不等于任意解除现代保护；新方案需Q-18 |
| L-02 | 任务留痕删除后没有恢复入口；删除预览只有当前item路径数，已完成归档源被清理但历史仍在 | store.task过滤deleted；删除语义用户已要求，不据“保留行”推断可恢复 |
| L-03 | QR解除后仍有历史link，因此删除可继续阻止 | qr-repository.ts:170–183；不将解除等于可删 |
| L-04 | BOM图片比较只比较有效二进制SHA256，没有已验证的像素/感知等价比较 | bom-history-diff.ts:24–32；Q-12，不把重编码文件一律判相同 |
| L-05 | 字典搜索过滤根/父items，不搜已选主类子项目；停用父限制UI与API不同 | DictionariesPage.tsx:31,74,98；dictionary-service.ts:19；Q-11 |
| L-06 | 当前邮件草稿保在React，没有调用持久draft保存API | EmailComposer.tsx；表存在不能推出autosave，V5.1并未明确要求重启恢复草稿，Q-13 |
| L-07 | 普通TaskRegistry内存、直接重启服务没有整程序重启同等任务等待 | task-registry.ts:21,124；recovery-controller.ts:74–94；不声称所有作业都持久自动恢复 |
| L-08 | legacy归并/外观/沿用API仍可调用，但普通面板撤出 | routes/appearances.ts；DrawingReusePanel无生产调用；已取消UI不等于获准删历史/API，Q-19 |
| L-09 | 普通PDF/批次是一个root解释相对路径，换根不是多workspace独立库 | schema及indexed-pdf-resolver；保持原本地root要求有效，Q-08 |
| L-10 | 旧二进制xls不原生导入，只明确提示另存xlsx | ImportPage accept与excel-audit/parser错误；不报为已支持xls |
| L-11 | AIT20MiB、QR64MiB、BOM图片10MiB等为实现边界，不是统一“PDF大小上限” | inspection route/qr-manual-service/bom-asset-service；不能套用到正式PDF存在判定 |
| L-12 | 表头拖序、固定新到旧任务顺序，不是所有表支持可点击行排序 | LayoutTable.tsx:44；packaging-task-service.ts:48；“保留排序”不能扩成新排序需求 |
| L-13 | 正常文件预览不一定DB零写入，外发可能补NULL内容hash | outbound-batch-workflow.ts:181；仅对应数据预览流程，审计本身未调用 |
| L-14 | 全文件归档可部分发布后待重试，不是整批磁盘回滚 | packaging-archive.ts:65–115；原正式备份和journal保留 |
| L-15 | 旧嵌套任务的人工输入整理可复制入任务目录并删除未变的原临时输入 | packaging-task-service.ts:236–239；不是删除原正式PDF，旧要求曾允许整理，不武断判新缺陷 |
| L-16 | 手动QR IPC精确校验sender，但部分旧文件/输出/恢复handler没有同等独立sender检查 | main/index.ts:148–152,175–178；open-file-location.ts:17,45,77；outbound-file-actions.ts:21。属于当前安全边界，不声称本轮证明了远程漏洞 |
| L-17 | 旧原始单文件50MB示例与后续大PDF入清单要求需核对最终阈值粒度 | 当前按最终ZIP实际大小决定；S03/S05/S09存在语义边界，不据实现认定已确认原文件任意大小都可发，Q-30 |

## 4. 需求与文档层面的冲突/缺证

### D-01 v15四个工作项没有独立可追溯原报告

没有找到独立名为UI catalog v15、UI planning v15、UI tasks v15、V15 backend review的受控原稿。可以审查实际对应实现、计划、测试和截图，不能冒充拿到了四份原始评审。计划只记录“independent final review found no blocker”，不含评审全文/逐项结论/反驳和签认。详见Q-01。

### D-02 老文档自称Current/已确认并不总是最终状态

- schema/model参考仍止于24，当前registry25。
- 初版BOM“只看当前有效转曲文件”被V5.2“全部批次直接显示”替代。
- 初版外观版本/行内展开被V3/V4撤销；旧版本BOM/归并代码留存不复活旧需求。
- AI预案中的颜色跨版QR、自动创建默认版本等建议并非原始用户默认；有后续明确取消的不得列待开发。
- V5.2归档摘要把多个型号显示要求相邻概括；**完整用户原文§7.1仅限定产品档案下拉品牌·型号，不能据摘要把外发SKU option判为已确认违约**。
- `docs/ui-integration-ledger.md`的“下一模块请求即视觉认可”属于记录中的推断规则，不能替用户逐张验收。

这些资料本轮保留原样，用本审计的来源等级和冲突表提醒；没有清理、改写或删除旧文档。

### D-03 历史Backlog不能被“已存字段”或旧100%吞掉

`docs/DEVELOPMENT_PAUSE_AND_CONFIRMED_REQUIREMENTS.md:20,140–143,226–228`登记批量重命名、参考旧型号复制和未来服务器差异比较。当前产品仅保存referenceProductId，未找到跨型号文件/配置复制流程；当前rename是内部批次显示名，不是批量物理改名。前两项当前是否仍有效见Q-27/Q-28；服务器自动同步明确不属当前本地范围，不能一概列为违约未做。

### D-04 生产源码与默认分支首页不同

本地已有origin/master的README指向1.5.0，但package.json0.1.0；Tag1.5.0才是已验证应用。发布工作流明确仅改master首页，这是既有发布策略事实，不是本轮授权合并/重排Git历史。后续统一默认源码入口见Q-21。

## 5. 验收证据缺口

| ID | 未闭合内容 | 可以确认的范围 |
|---|---|---|
| E-01 | 真实AIT/授权Adobe对象读取、字体替代、画板/刀模/排版、PDF重新打开仍可编辑 | 三层仅DRAWING_NO约束、JSX导出选项及VM/协议测试源码、人工PDF真实归档的历史记录；不替代Adobe实测 |
| E-02 | 用户正式库升级、真实复杂目录/同步/文件大小组合、物理Windows缩放/DPI/IME | 匿名旧Schema实测摘要、已存Windows截图与历史报告，不等同用户现场 |
| E-03 | 本次完整测试和运行结果 | 只静态审阅218个测试文件、13个E2E规格与旧运行记录，没有重新运行 |
| E-04 | 所有历史参考图的逐张用户确认与原始设计源文件 | 187张PNG建立索引；PNG存在不代表已批准，未找到fig/sketch/xd等可编辑设计源 |
| E-05 | 完整备份/恢复产品功能曾被用户确认的精确范围 | 现只有DB快照与人工完整备份说明；“安全恢复”实际是进程恢复 |

## 6. 已实现且不应误报为缺口的重点

1. 新正式占号和产品/外观归属同事务，未自动加BOM；图号库精确定位已保存ID。
2. 图号双向启停与字典颜色解析已经存在；停用不释放。
3. 仅源/全部生产批次直接检索，索引缺失与物理缺失分开；没有为精简UI删除历史。
4. PDF内部空批次右键删除不删真实目录，删除失败有保护原因；移除索引不删原件。
5. QR纯手动PDF、五列用途展开、URL独立、解除与状态分开；没有自动匹配待确认区。
6. 新任务平铺00、旧任务路径继续、持久拷贝claim、删除留文件/锁释放、归档日志和备份均已实施。
7. BOM精确记录原地改日期、附件角色沿用/替换、相同SHA内容比较、成功清表单已经实施。
8. 外发不被BOM缺失卡住、选批次不隐式历史补齐、整文件分包及快照保留已实施；日常历史UI移除是明确后续要求。
9. Excel供应商/场景/案例/签名/联系人独立解析及审查，跨公司共享联系人、底部错误反馈已有代码与历史验证。
10. 完整备份没有产品实现证据，不能拿DB备份或安全重启冒充；同样不能在无用户范围确认前擅自新增。

**本报告不执行修复，不表示用户批准任何建议。** 下一步只等待用户对基线、差异性质和OPEN_QUESTIONS的确认。
