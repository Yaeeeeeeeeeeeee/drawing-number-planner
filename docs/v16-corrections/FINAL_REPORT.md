# V1.6 修正交付验证报告

日期：2026-11-17（上海）。交付版本：**1.6.2 / Schema26**。本轮以用户已验收V1.6和1.6.1启动修复为基线，保留原任务书44项，按用户后续明确答复实施。不是重新设计，也不代表用户已重新验收。

Windows固定源码：`0610c06e8d73c2e616b5b2c0b0364ecb55aba784`，分支 `codex/v16-corrections-20261111`。正式交付Tag为 `v1.6.2`，不移动既有Tag、不改变默认分支、不自动合并PR。文档和发布工作流后续提交不改变已验证的应用源码。

## 实际测试结果

| 范围 | 实际执行与结果 | 证据 |
|---|---|---|
| 完整自动化 | 241文件、2101项通过；543.40秒 | [Vitest原始日志](evidence/full-regression-final-1117.log) |
| 完整浏览器 | Chromium26项通过；随后目录隔离补强及抄送恢复各1项通过，不叠加为新的整套数量 | [整套日志](evidence/full-browser-decisions-final-1117.log)、[目录专项](evidence/pdf-directory-groups-browser.log)、[抄送专项](evidence/mail-cc-recovery-browser.log) |
| 类型与构建 | TypeScript、Vite渲染器、Main/服务编译通过；Windows另外从固定提交干净构建 | [类型](evidence/pre-final-candidate-typecheck.log)、[构建](evidence/pre-final-candidate-build.log) |
| Windows安装及业务 | Windows runner上实际安装后Electron/UIA/HTTP/SQLite验证全部通过 | [运行44011078119](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44011078119) |
| 大库启动 | 1,008,640,000字节隔离库；首次11,894ms、重启2,678ms；同路径、逻辑行与外键正确 | Windows附件`large-database-startup.json` |
| 安装选择 | 中文自选目录、桌面根重定向到独立子目录、桌面中文目录、逐文件哈希验证通过 | Windows附件安装JSON及截图 |
| 旧库升级 | 真实旧版结构经过增量迁移；备份含已提交WAL行，备份可读，失败回滚、旧历史/快照/设置和重开通过 | Windows附件`oldV15Upgrade`及Linux迁移回归 |
| Schema25→26 | 有实际内容的25库保留全部旧行、索引、触发器、序列、外键；128MiB BLOB在96MiB Node堆下升级通过 | 完整Vitest及阶段3记录 |
| 数据库重选 | 真实Windows文件选择器；取消保留配置，确认切到另一已有目录，再切回原目录；受保护数据不变 | Windows附件`databaseReselection`及两张原生重选截图 |
| 真正进程重启 | 已保存邮件在关闭Electron并重新启动后，通过UI恢复；主题/正文/收抄送及准确上下文与持久记录相同；不重新打包 | Windows附件`outboundDraftRestart`、`Windows-外发草稿-实际进程重启恢复.png` |
| 两次真实重装 | 每次询问新旧库；新库无需选文件，另建独立目录；日常重启沿用选择；旧业务库保留 | Windows附件`installationChoice` |

Windows报告ZIP已实际下载，SHA256 `632f53e9e2bea9e70bb42b9918c1fa9a71a68382c006e0e6e6c9018173fbecd8`，9,455,504字节，184文件、127张PNG，ZIP CRC通过。该SHA是**Actions原始报告ZIP**的摘要，不是安装器摘要。Release会重新封装报告，最终附件摘要请以同页`SHA256SUMS.txt`为准。

## 分阶段实现、问题与证据

| 阶段 | 实际结果与修正原因 | 文档/文件依据 |
|---|---|---|
| 0 基线 | 确认已有V1.6安全功能，不重开发；原Markdown逐字保留、44项独立追踪 | [基线](BASELINE_AND_PLAN.md)、[矩阵](REQUIREMENT_STATUS.md) |
| 1 任务安全 | 复用保留文件结束、任务锁和过期令牌原弹窗重检；隔离T40重构场景及Windows删除图号/脱钩后结束通过 | [阶段1](PHASE1_TASK_SAFETY.md)，`packaging-task-*`与P0 E2E |
| 2 全局UI | 原导航卸载BOM/外发等导致现场丢失，改为各模块保留挂载/滚动；AIT改为真正覆盖式右抽屉，修正窄屏遮挡与dirty保存基线 | [阶段2](PHASE2_WORKSPACE_UI.md)、实际[宽屏抽屉](evidence/phase2-ait-drawer-1920.png)/[窄屏](evidence/phase2-ait-drawer-600.png) |
| 3 规划/AIT/任务 | 复用两模式、持久草稿和占号事务；中文拆解/真实白色默认共用；原AIT路径能力令牌及队列后哈希复查；精确尺寸优先、其他多匹配冲突；完整图号文本替换、正式目标保护 | [阶段3](PHASE3_PLANNING_AIT.md)、Windows AIT原生选择和任务流程 |
| 4 PDF/BOM | 扫描真实进度、访问失败保护、501条分批；02/03目录加入分组键，避免相同转曲标记混组；只读阅读器尊重PDF原生Rotate；BOM使用真实RGBA而非路径/文件名比较 | [阶段4](PHASE4_PDF_BOM.md)、[阅读器](evidence/pdf-reader-1920.png)、[像素相同](evidence/bom-same-pixels-different-encoding.png) |
| 5 产品/QR/字典/导入 | 用户确认菜谱仅空气炸锅；新QR默认停用；QR仅PDF首页逐像素，后续页不参与；字典父级停用后端校验/搜索；原始XLSX只读25候选，原SHA不变 | [阶段5](PHASE5_PRODUCTS_QR_DICTIONARY.md)、[两项补充决定](DECISIONS_20261117.md)、Windows QR原生选择/首页比较 |
| 6 外发/数据库 | >50MB原PDF留独立清单、不进ZIP；准确草稿上下文与保存修订；单次数据库选择和兼容摘要，切换提交后失败也回退原配置/服务 | [阶段6](PHASE6_DATABASE_OUTBOUND.md)、Windows进程重启/重选验证 |
| 7 整合/交付 | 修复大库整表JSON内存、迟到保存覆盖新dirty、PDF原生旋转及打包依赖守卫；完整回归和Windows源码/安装器一一固定 | [整合复核](INTEGRATION_REVIEW.md)、[实际修改文件](CHANGED_FILES.md) |

Windows前五轮失败均保留记录，未发布失败工件：锁文件末尾LF规范化、旧筛选/选中工具栏断言、AIT标签等待、原生AIT模式漏分支，以及邮件抄送标签拼写。每次定位具体日志/截图后修正，最终第六轮全部成功。未通过提高任意超时、恢复已取消UI或伪造业务成功掩盖失败。

## 用户后续决定

- 菜谱：仅空气炸锅；历史已有其他类别关系不因本次删除。
- 尺寸：用户在现有产品/包材项目位置配置长宽高，不推测整机尺寸。
- AIT：仅完全等尺寸优先，其他多匹配仍冲突。
- QR：只比较第一页，72dpi、原生旋转/裁剪框、sRGB RGBA白底逐像素；不能解码或超限时无法比较，不缩小后宣称相同，不影响手动确认、启停或历史。
- 多份可靠正式PDF：优先唯一02源文件；没有唯一02时待确认。单一可靠03保留原有唯一候选行为；任何强制脱钩文件排除。

## 数据影响与生产操作

本轮**没有访问或修改用户生产数据库、用户配置或真实PDF/AIT/AI/图片**，没有生产数据修复、清理、归并或释放。测试全部使用隔离数据库/资料；用户原始Excel只读解析。安装器不含示例业务库、原Excel、用户文件或测试数据库。

仅新增Schema25→26既有制作方式兼容迁移；没有重复文件索引、模板库、任务库或备份中心。旧`none`保持旧含义，原AIT托管相对路径和旧任务快照仍可读。原路径的AIT不会被移动/复制管理，默认本地扫描路径不改变。

## 未验证及明确限制

1. **真实Adobe及AIT未验证**：没有授权Illustrator和用户真实AIT。字体、版式、画板/对象保持、实际可编辑PDF导出和重新打开，需要用户本机验收。Windows采用匿名路径/协议夹具，不能冒充Adobe成功。
2. **用户原T40库未访问**：阻断场景用隔离记录重构；用户现用库及真实型号仍需重新验收。
3. **物理显示/打印未验证**：实际DPI、跨显示器、打印机未执行。窗口720/1440/1920/2560/3840及Linux1366等尺寸有自动化证据，但不等于物理4K/DPI验收。
4. **阅读器特殊样本未验证**：CJK/CID/JPX真实业务样本未提供；必要字体/cMaps/wasm已打包，不代表这些样本已实际验收。
5. **临时状态范围**：模块切换保留当前会话；跨进程仅保证规划持久草稿和明确保存邮件草稿。临时BOM表单、勾选、文件选择对象不声称跨进程保存。
6. **全部独立传输**：没有ZIP时只保留当前会话清单，不创建虚假ZIP历史或包ID。
7. **小文案限制**：AIT已有目标冲突时“重新生成”的文案仍不够直接，实际操作明确阻止覆盖，未扩展新的覆盖规则。
8. **历史抽屉来源**：除本轮明确的AIT及已存在的详情抽屉，未找到独立v15原稿或逐图确认资料的页面未擅自统一改造；不把候选UI catalog中的实现记录当作用户批准。

无未答复的上述业务决定；本轮交用户重新验收，不自动进入额外需求开发。

## 安装与回退

见[版本操作说明](../release-1.6.2.md)。升级前关闭应用并完整备份实际dataDir；安装后选确认要沿用的planner.db，保留现有资料路径。Schema26不能用1.6.1直接打开；回退须在独立目录恢复迁移前Schema25备份，同时保留升级后的完整目录和新增业务。不要以新建空库代替兼容升级。

## 公开安装器核对

本报告完成后已发布v1.6.2，公开EXE实际下载147183693字节，SHA256 `31feead1adeb77525877753dafc7e7687f3caa7d0d04bbd71f14ee5dfb7ebfdb`。Windows和自动化ZIP均实际下载并通过摘要、CRC及清单核对；完整记录见[PUBLIC_DELIVERY.md](PUBLIC_DELIVERY.md)。
