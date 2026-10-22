# V3 外发资料实施与验证

最后核验：2026-10-22 07:13 UTC。范围为 V3 需求第十节和实施计划 Task 5；本记录不代表 Windows 人工验收或整轮交付完成。

## 根因与修改

旧外发 V2 将独立外观对象、批次外观确认及完整性管理带入日常选择流程。V3 新请求仍使用已有 `workflowVersion: 2` 的预检、文件哈希、ZIP 校验与冻结快照管道，但省略 `appearanceVersionId` 时改走产品/明确批次流程；显式携带旧外观 ID 的历史请求保留原分支。

- 选择区保留品牌、产品、资料批次、资料类型、打包范围；移除产品搜索、独立外观选择、对比基准及跨外观确认。资料类型不依赖 BOM 或独立外观对象。
- 完整资料仅默认读取所选批次中未排除的转曲后 PDF，不自动拼接历史批次。BOM 只提供核对信息。
- 变更资料按品牌码、尺寸码、字典外观码划定比较范围，使用完整可比范围内的可靠序号或业务日期选上一批。混合外观、未知顺序或并列顺序不猜测、不默认勾选；有效文件仍可手动选择。
- 保留异常文件人工确认、实际路径/内容哈希核对、真实 ZIP 分包数量、不可变历史、历史重生成，以及手工邮件草稿保护。
- 页面采用全宽纵向阶段、三列同高选择控件、单行左对齐文件名；详情和预检通过 portal 展示，避免被内部滚动容器裁切。

## 顺序回归

独立审查发现：当前批次无序号时，全范围按日期比较，但传入上一批子集后通用选择器会因子集恰好都有序号而切回序号。隔离 SQLite 和磁盘 PDF 用例为：当前日期 10-22/序号空，A 日期 10-20/序号 2，B 日期 10-21/序号 1；正确上一批应为 B。

`outbound-batch-workflow.ts` 在日期模式下将传给选择器的子集序号置空，确保完整范围和子集使用同一顺序依据。测试同时检查 B 为基准、相同 PDF 识别为未变化、保持可选择且默认不选。

2026-10-22 07:11 UTC，临时恢复旧调用 `selectLatestBusinessBatch(earlier)` 后运行：

```sh
node node_modules/vitest/vitest.mjs run tests/core/outbound-package-service.test.ts -t 'keeps date ordering when only the current batch lacks a sequence'
```

RED：预期基准 ID 2，实际 ID 1，1 failed / 74 skipped。随后立即恢复修复。07:12:47 UTC 对最终断言重新运行同命令，GREEN：1 passed / 74 skipped。

## 自动化证据

```sh
node node_modules/vitest/vitest.mjs run tests/core/outbound-package-service.test.ts tests/core/outbound-reference-service.test.ts tests/core/outbound-partition.test.ts tests/core/outbound-bom-context.test.ts tests/core/outbound-artifact-ownership.test.ts tests/core/batch-business-order.test.ts tests/renderer/outbound-page.test.tsx tests/renderer/outbound-shell-guard.test.tsx tests/renderer/outbound-mock.test.tsx tests/server/outbound-packages-api.test.ts tests/server/outbound-reference-api.test.ts tests/main/outbound-file-actions.test.ts
```

首次受限沙箱运行 175 passed / 1 failed：`never records half a multipart publication as completed after abrupt process exit` 的 Node 子进程被 `spawnSync ... EPERM` 阻止。自动审批允许以相同命令重跑后，07:12:09 UTC 开始、52.31 秒结束，12 files / 176 tests 全部通过，退出码 0。

覆盖无 BOM/无独立外观的真实 API 预览、预检、ZIP 生成及历史读取；同编码比较、混合编码/顺序歧义、哈希变化阻断重生成；ZIP 独立解码、50 MB 分包、发布失败/崩溃恢复；UI 简化及乱序响应不覆盖当前选择或邮件草稿。

本任务未操作真实业务库或源 PDF；测试均使用临时目录和隔离库。整仓测试、类型/生产构建、原生 Windows 验证和交付由根任务汇总，不能以本专项结果替代。
