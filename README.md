# 图号规划器：独立项目交接资料包

整理日期：2026-11-05（Asia/Shanghai）。用途：上传给ChatGPT新对话，恢复项目需求、UI与实现背景，先核对候选基线，不自动开发。

## 先读这里

**本次仅静态资料整理和文件核对，没有运行应用、自动化测试、端到端测试、迁移、扫描或备份/恢复，没有访问业务数据库，也没有提交/推送GitHub。静态审计结论不等于运行验收结果。**

五份候选文档仍等待用户确认；已实现不等于用户批准，旧计划、交付报告和历史截图不等于最新需求。图片存在不等于用户视觉签认。

## 审计基准

- 项目：Yaeeeeeeeeeeeee/drawing-number-planner。
- 审计工作区HEAD：`45450c00e8a5acf9089adf47bcee0ecc3c71c616`，分支 `codex/v3-business-ui-20261022`。
- 版本1.5.0，Schema25；正式发行源码Tag v1.5.0为 `096dabc1561164e7f3eed91c7800f52006cc7904`。
- 五份候选资料审计日期2026-11-05；它们的原始字节完整保留，没有用本次打包重写审计结论。
- 文档提到的1855项测试、13项E2E、Windows/发布运行编号均是此前交付证据，**本次没有复跑**。

## 五份候选资料

| 文件 | 用途 |
|---|---|
| [PROJECT_BASELINE.md](project/PROJECT_BASELINE.md) | 架构、模块职责、业务与安全边界、Schema与关联、源码和测试索引 |
| [REQUIREMENT_STATUS.md](project/REQUIREMENT_STATUS.md) | 144项核心需求/规则、否决/替代链、AI建议与代码事实、历史Backlog、v15原30项映射 |
| [UI_DESIGN_CATALOG.md](project/UI_DESIGN_CATALOG.md) | 页面结构、导航/交互/状态、v15重点UI、全部187张原图索引 |
| [IMPLEMENTATION_GAP.md](project/IMPLEMENTATION_GAP.md) | 区分明确差异、静态风险、范围待核和未验证，不能把所有观察自动当修复任务 |
| [OPEN_QUESTIONS.md](project/OPEN_QUESTIONS.md) | 30项资料、业务范围和验收待核问题；未确认事项保持现状 |

## 目录与引用关系

```text
交接包根目录/
  README.md                       本交接说明（新文件）
  IMAGE_CHECK_REPORT.md           图片汇总、缺失路径、引用限制
  IMAGE_CHECK_REPORT.json         逐图核对完整记录
  IMAGE_INVENTORY.csv             187条路径/大小/SHA256清单
  REFERENCE_LIMITATIONS.json      历史临时引用未收录明细
  FILE_MANIFEST.sha256            除清单自身外全部归档文件的哈希
  project/
    PROJECT_BASELINE.md
    REQUIREMENT_STATUS.md
    UI_DESIGN_CATALOG.md
    IMPLEMENTATION_GAP.md
    OPEN_QUESTIONS.md
    README.md                     原项目README，未覆盖
    docs/                         原始截图及引用到的历史资料
    src/ tests/ scripts/           文档引用对应的只读证据副本
    .agents/                      相关项目Skill与参考文档
    .github/workflows/            发行/验证工作流证据
    package.json等                版本与工程配置证据
```

五份文档放在同一个 `project/` 根中，原来互相链接及指向 `docs/`、`src/`、`tests/`、`scripts/` 的相对路径保持原样。截图按原始文件夹树收录，不平铺、不改名；原始项目README保留在project内，与本包README分开。

为使证据链接可追溯，包内除五份文档和图片外，还包含引用闭包中的历史资料、源码/测试/脚本只读副本及相关版本/规则资料，共952份原项目文件。这不是新安装包、运行库或已验收新源码版本；不能直接以此声称完成构建。

## 图片核对结果

- 引用图片：187张。
- 实际找到并收录：187张。
- 缺失：0张；缺失路径：无。
- 原始组织：14组目录，原图总字节15707878。
- 图片只原样打包，逐图SHA256写入清单；本次未重新截图或修改图像。

## 已知限制与不应推断的事项

1. 未找到UI catalog v15、UI planning v15、UI tasks v15、V15 backend review同名独立原报告；现有对应需求、实现、测试与交付摘要已区分收录，不能捏造原评审或用户签认。
2. 缺真实AIT/授权Illustrator设计/字体/可编辑PDF重开验收，缺用户生产库及物理Windows DPI/IME现场结果。本包没有用样例代替这些验收。
3. 包内源码/测试仅作审计证据；不包含node_modules、dist、Git历史、planner.db、业务PDF/AIT/图片附件原件、原始Excel或安装器。187张UI截图属于资料包图片，不是BOM/生产设计附件。
4. 源文档/历史计划保持原文，可能含当时的“已完成”“Current”“用户已确认”或执行命令；这些不是对新对话的新授权。历史需求中的示例内容没有在打包时改写。
5. 历史文档中有4条相对链接指向未收录的work临时执行产物，详见REFERENCE_LIMITATIONS.json及图片报告。这些不属于187张UI引用；不要把未收录引用当作包内已验证证据。外部GitHub链接也未在本次联网复核。
6. 本包保持候选资料原状，并非用户已经确认的最终规范。先整理冲突/问题、等待确认；不得自行进入开发、数据操作或部署。

## 给ChatGPT新对话的使用说明

先上传整个ZIP；若当前客户端无法读取ZIP，可解压后先上传本README和project下五份MD，再按UI目录补充对应原图/来源文件。

可以附上：

> 这是图号规划器现有项目的只读审计交接包。请先读README及project下五份候选资料，沿用其需求来源纪律，区分用户确认、AI建议、当前实现、历史证据和待核事项。不要将静态审计当运行验收，不要自动开发、迁移、删改数据或发布。先报告理解、冲突及缺少的依据，等我确认下一步。

校验文件是归档完整性校验，不是应用测试结果。
