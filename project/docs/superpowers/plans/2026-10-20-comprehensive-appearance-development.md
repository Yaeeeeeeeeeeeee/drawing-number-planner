# 综合外观版本、资料关联与手动二维码 Implementation Plan

> 执行方式：superpowers:subagent-driven-development。用户已确认实施前方案并正式授权所有阶段连续编码、Schema迁移与测试，不再等待阶段/计划确认；真实库不在环境中，ZC100真实归并由用户本地确认。

**Goal:** 产品同SKU/型号多外观、版本独立BOM/图号/PDF/QR/外发，安全旧库升级与完整Windows安装交付。
**Architecture:** 规范产品身份映射保留raw products/历史FK，外观版本与当前指针增量引入；显式版本上下文贯穿服务和UI。QR复用既有页面/记录，改为本地PDF手动校验、关联与留痕。扫描身份/忽略决定、批次显示名与可重建事实分离。
**Tech Stack:** Electron43、React19、Fastify5、SQLite/better-sqlite3、Vitest/Playwright、InnoSetup。
**Spec:** docs/comprehensive-redesign-preflight-20261020.md，用户2026-10-20完整开发授权及最新手动QR规范优先。

## Global Constraints
- 不操作真实库/原始PDF；启动不自动归并ZC100。Schema先核验备份、事务、旧行/占号/快照不变，旧客户端拒绝高版本。
- 产品只有一个当前外观；draft/historical不是停用产品或回收站。图号主记录唯一，跨版本显式复用不重写编码、不释放占号。
- 历史BOM保留可审计纠错，原ID/日期/前序不改；纠错前后留完整快照；外发已冻结快照不重写。
- 外发按用户后来确认的V2选择明确批次，BOM仅辅助；不隐式拼接新旧批次。QR不参与占号，文件关联/业务状态独立。
- QR纯手动：用途五列；真实本地PDF经原生选择/安全读取；型号/用途/URL末段7位校验，全半角括号；例外需理由、明确确认与审计。取消不持久化。
- Product9列SKU左其余中；Drawing8列仅code左；QR主6列仅SKU左、用途子5列仅file左；12pxpadding，统一10/25/50/100且记忆。
- 查询缓存完整条件键/去重/最后请求胜出，数据变化显式失效；不以夹具或模拟保存替代真实文件/旧库升级验收。

## Review Focus
- 含同用途两套QR、混合外观BOM的别名归并必须预览并保留旧FK/快照，不静默选一条。
- 文件内容在预检与确认间变化/链接逃逸/URL尾码歧义必须拒绝；替换/解除只改当前关系并留历史。
- 清索引有SET NULL引用不得误解除；忽略决定重扫继续有效、不同同名副本独立。
- 版本选择必须进入规划/BOM/外发/诊断查询和缓存键，不能仅UI标签。
- 原有16基线失败中相关安全/路径/外发/产品BOM用例本轮必须调查修复，不用无新增替代相关测试通过。

## Task 1：版本Schema、产品服务与本地归并
Files: src/db/schema.sql.ts,migrations.ts; src/core/products/appearance-*.ts; src/server/routes/appearances.ts; product-service/repository; tests/db及core/API。
Interfaces: canonical productId沿用主products.id，原products行不删除；get/list/createDraft/updateDraft/activate/mergePreview/mergeConfirm，类型集中appearance-types.ts。新版本与QR/PDF所需Schema由本任务唯一编辑者统筹。
- [x] RED旧v15含BOM/QR/PDF/外发副本升级不丢ID/引用/快照、失败回滚/备份先行。
- [x] 实现版本、身份映射、当前约束、并发revision、归并预览/指纹确认/审计，旧库不自动归并。
- [x] GREEN相关迁移/核心/API；记录精确接口供下游使用。

## Task 2：版本BOM/外发/历史纠错
Files: src/core/bom、outbound；相关routes、BomPage/Editor/Query及PackageBuilder；feature-client与tests。
- [x] RED新版本复制/差异/独立current、合法旧物料复用、历史纠错快照、外发不混代。
- [x] 版本上下文服务校验/数据库约束/有效BOM材料集，保存旧外发事实；UI可选版本且返回状态保留。
- [x] GREEN核心/API/UI相关用例。

## Task 3：QR手动PDF全链路
Files: src/core/qr、routes/qr-codes、QrCodesPage/desktop-qr-files；src/main/qr-*与preload/index注册最小增量；qr-manual-client。
- [x] RED真实PDF命名/内容/型号/用途/尾码校验、预检过期、替换/解除审计、取消无写入。
- [x] 原生选择、只读安全文件句柄/令牌、服务确认、必要Schema协同Task1；禁止路径越界/任意文件读取。
- [x] UI主6列/子5列、真实URL打开复制、未配置虚拟用途不计数量；取消自动匹配流程而保留历史索引。
- [x] GREEN真实文件/API/桌面动作/UI与重启持久化。

## Task 4：PDF索引/批次/UI
Files: core/files file/batch services/repositories/types、routes、FilesPage/CSS、pdf-management-client。
- [x] RED纯扫描安全清除、被引用记录保留追溯、忽略持久/恢复/内容变化复核、批次显示名重扫不覆盖、同名ID独立。
- [x] 实现预检和批量操作/忽略、批次rename；清理不顺带删QR索引/批次历史；单套筛选及宽度分页。
- [x] GREEN核心/API/真实临时PDF与UI竞态/缓存/末页回退。

## Task 5：图号版本关联/诊断/界面
Files: core/drawings/planning相关、routes/drawings/planning、DrawingLibraryPage及CSS；drawing-management-client。
- [x] RED唯一可信证据关联/歧义待确认、无循环证据、占号不变、跨版本唯一记录。
- [x] 产品创建后增量诊断、人工/批量预览确认、版本导航/8列/详情依据与历史；规划选择版本且查全部占号。
- [x] GREEN核心/API/UI和快速切换/变更刷新。

## Task 6：产品主表/换代/归并UI
Files: ProductsPage、products/*、样式，appearance-client UI绑定。
- [x] RED九列/版本展开/单版本可查/草稿不切当前、BOM复制差异、归并预览确认而不自动执行。
- [x] 实现真实服务的换代与版本查看/入口联动，保留QR跳转/产品退出保护。
- [x] GREEN相关UI与服务联通。

## Task 7：整合/审核/Windows升级交付
Root owns shared PlannerApi组合、server路由组合、ProductCatalogNavigation版本适配、查询缓存公共组件、打包/升级/说明。
- [x] 验证相关测试全绿，调查既有相关失败；完整套件、tsc/build、真实临时PDF/E2E、旧v15升级/失败恢复。
- [x] 独立审查Schema/历史与端到端UI，修复重要问题并复审。
- [x] Windows构建安装、选择旧库副本升级、二维码原生选择/真实校验关联重启、各尺寸截图；数据路径不再每revision隔离导致无法升级。
- [x] 最终记录提交/变更/升级/恢复步骤、本地ZC100操作；不合并master；交付真实安装包。

## User-approved additions: planning attribution and outbound V2

- Formal reserve validates live product/version and persists identity plus occupancy in one transaction. Plan success links to the selected version in the library; explicit reuse is a usage relationship only, not a BOM insertion or primary-attribution rewrite.
- Source requirements: `docs/outbound-v2-requirements-20261020.md` (uploaded by user). These explicitly supersede the earlier BOM-gated outbound proposal: batch files supply candidates; BOM is advisory only. Complete packages use only the selected batch, change packages compare a proven baseline; no implicit historical carry-forward.
- Add additive v17 outbound batch scope/completeness/audit and immutable package snapshots; legacy rows remain unbound, pending and untouched. Manual binding must preview/confirm with revision. ZIP provenance, per-part count/hash and real source fingerprints are persisted; selected valid subset may proceed despite unselected warnings.
- Extend end-to-end tests for no-BOM, full selected batch, exact hash changes, explicit baseline, version ambiguity, missing/ignored files, split manifests, stale source rejection and immutable history. Finish vertical UI, native Windows verification and installer only after these pass.

最终证据：应用34bf336，完整152文件1270项通过，Windows39636465335全成功；交付说明及不可由自动化代替的本地操作见docs/comprehensive-redesign-delivery-20261021.md。
