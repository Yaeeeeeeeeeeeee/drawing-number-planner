# V5.1 邮件模板导入与外发草稿

## 实现

沿用 Schema 22 的邮件模板、联系人和签名，不另建模板库、不发送邮件。迁移检查增加 XLSX 导入弹窗：真实工作表识别、厂家横向合并表头、多场景、多段正文、原始参考、编辑及明确勾选确认。旧版 XLS 需另存为 XLSX；ITR、配件下单等未支持场景仅显示，不映射为包材外发。

厂家/类型/场景及稳定导入标识匹配重复模板；相同跳过，更新须明确选择并核对预览指纹。备份失败不写入，模板与联系人在同一事务保存；联系人邮箱冲突可修正或跳过。未知历史文字保留原始参考并要求人工核对，不推测旧型号、PO、日期或修改原因。

邮件配置自动维护内部编码，日常无需填写；字段错误明确指出，变量点击插入。保存不需要实际产品、外发上下文或签名；生成时必须补齐必要变量，显式清空的变更说明可保留为空。签名独立追加，兼容旧变量。

更新资料通过实际 SHA256 和可靠上一业务批次对比；本次变更模式排除相同内容复制件。无法可靠比较时须按当前哈希明确核对，不自动宣称所有文件发生变更。当前完整资料仍保留未变化文件，但草稿不把它们列作变更。

成功 ZIP 返回从本次实际保存的选中文件快照形成的 mailFacts，前端不再用可变预览拼装草稿。03 结果中点击生成邮件草稿，明确厂家/场景，自动带入独立联系人配置，可调整收件人及抄送。变更逐项填写原因、上移下移、合并或删除描述、控制文件名显示。未直接编辑正文时同步，直接编辑后保留文字并明确确认再生成。复制主题、正文和整封内容均不发送邮件。

## 数据与保护

本轮无需数据库迁移；旧 Schema 仍走既有备份迁移路径到 22。不修改图号占用、BOM、原始 PDF 或既有外发快照。导入前生成真实 SQLite 备份，写入事务内重查。删除邮件说明仅作用草稿；不删除 ZIP 文件或其中条目。

## 当前验证

- 配置与兼容：73 项；导入相关 14 项；草稿与既有页面 65 项；外发核心 85 项通过。
- 新完整浏览器链路已通过：真实 XLSX 三工作表、两支持工作表、三模板候选，确认导入一个更新模板及两联系人；实际磁盘 PDF 对比后 ZIP 只含已确认变化的铭牌；说明书相同内容被排除。正文同步、手工正文保留、签名一次、原始 PDF 哈希及受保护表/外发快照不变。
- 界面实测发现并修复导入弹窗受页面 transform 影响的滚动/关闭问题，复用 Portal 与模态焦点机制；表格晚到 ResizeObserver 回调在卸载后安全退出，回归 18 项通过。
- 完整187文件1568项通过（/tmp/v51-full-final.log）；全浏览器E2E9项通过（/tmp/v51-e2e-final.log），含实际剪贴板复制；类型及生产构建通过。独立审查未发现显著正确性/数据安全问题。
- 首次Windows运行40487728441：安装、桌面路径、旧库和既有模块通过，新流程在保留旧预览刷新后的复选框脚本操作竞态失败。脚本等待控件明确可用再核对选择，复核端到端8.7秒通过。该失败构建未发布，最终成功结果见下文。

## 真实文件限制

当前未提供《包材资料更新-沟通模版(1).xlsx》原件，不能报告它的实际厂家、模板数或所有非标准布局识别通过。以上数量仅为隔离验收中实际生成并解析的 XLSX，不是用户工作簿数据。用户本地正式库和物理 DPI 也未在开发环境操作。

- 第二次Windows40488558369已通过复选框等待、真实ZIP生成及草稿编辑，在实际剪贴板文字比较发现Windows CRLF与DOM LF差异。验收只归一化行结束符，完整文字继续逐字核对，不修改应用复制内容。该失败构建未发布，第三次完整验收成功见下文。

## 最终 Windows 验收

- 应用源码：`33cbbe15f86bf5ff18bd6900ffe3f1f18ea34354`，版本1.2.0；相对首次全量通过的bf6cec3，应用源码和依赖没有再变更，后续仅修正验收脚本与文档。
- Windows完整运行 [40527223187](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/40527223187) 成功，实际安装/桌面路径/文件哈希、v15→22备份升级/WAL/回滚/重启、重复安装换库，以及既有模块和V5.1新流程全部通过。
- 新流程实际使用隔离生成的XLSX：3个工作表，2个支持场景工作表，3条模板候选；明确导入1条更新模板及2名联系人。实际ZIP仅含1个已核对变更的铭牌；说明书未变化不列入变更。实际剪贴板复制、独立签名、正文编辑保护及4个原始PDF哈希核对通过。此数量不代表未提供的用户原表。
- Setup Actions产物ID12745100854，ZIP摘要 `c364cd55307543e1155c2548cf89b9c64000d39c4f74736cae1b6a0cdbf78014`；验证产物ID12743543588，ZIP摘要 `1bdcf686ce0727cd10b8d0f3b968e1231f850c912930e6e0ccde98bfd3450027`。正式EXE摘要见以下实际下载核对。

## 正式发布与实际下载

- [v1.2.0 Release](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.2.0)，发布工作流40528362979成功；源码Tag保持33cbbe1，未替换旧版Tag或安装包。
- 公开EXE实际下载大小145102853字节，文件头MZ，SHA256：`0803cafaa91d28f79c9e0bfd0b51d7956cdd9b672ad9d076d157cb6dbd307f38`，与Release校验文件一致。
- 公开验证ZIP大小5943401字节，SHA256：`5f7f3bce154b31dc2d0667ddee1d30b7d8affc2ed47249d86eac0861aa1adc8a`。已实际解压核对原生报告、rendererErrors为空、新流程所有布尔验收项为真、重复安装两次旧库完整保留。
- 已查看实际Windows截图：V51-邮件模板导入预览.png、V51-真实ZIP邮件草稿.png，随验证ZIP提供。

## 主要修改位置

| 范围 | 文件 |
|---|---|
| Excel解析、合并单元格与导入保护 | src/core/import/email-template-import.ts、email-template-import-types.ts、email-workbook-merges.ts |
| 导入接口与迁移检查入口 | src/server/routes/email-template-import.ts、src/server/start-server.ts、src/renderer/pages/ImportPage.tsx、EmailTemplateImport.tsx/.css、data/client.ts |
| 模板校验、变量与独立签名 | src/core/outbound/outbound-reference-service.ts、src/server/routes/outbound-reference.ts、src/renderer/pages/outbound/TemplateSettings.tsx |
| 真实变更识别及成功ZIP事实 | src/core/outbound/outbound-batch-workflow.ts、outbound-package-service.ts、outbound-types.ts、src/renderer/pages/outbound/PackageBuilder.tsx |
| 草稿与逐项编辑 | src/renderer/pages/OutboundPage.tsx、outbound/EmailComposer.tsx、DraftChangeEditor.tsx、mail-draft.ts/.css |
| 相关页面切换 | src/renderer/components/LayoutTable.tsx |
| 回归与Windows验收 | tests/core/email-template-import.test.ts、v51-mail-configuration.test.ts、outbound-package-service.test.ts；对应server/renderer新回归；tests/e2e/v51-mail.spec.ts；scripts/verify-v51-mail.cjs |

用户本地需要执行：选择自己的旧planner.db保留业务；在迁移检查上传原始参考Excel，核对预览后导入。实际ZC100归并仍由用户本地明确确认，本版不在启动时自动归并。
