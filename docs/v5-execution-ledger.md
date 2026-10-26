# V5 执行记录 — 2026-10-26

基准：c7f2d1a（v1.0.0正式应用源码ec915e7）；需求 docs/v5-system-requirements-20261026.md。

Ruling: 已有连续开发及不逐阶段审批授权继续有效；本次采用现有架构增量实现，不重复审批。
Ruling: 独立领域采用dispatching-parallel-agents，而非逐任务串行SDD；每个写任务具有排他的文件范围，父执行器负责共享Schema/API整合、独立审查及完整验收。这样避免跨领域阻塞；若边界判断有误，顺序整合并补回归。
Preflight: BOM/外发共享图像展示→父执行器提供ImagePreviewDialog；PDF/外发共享文件存在性→PDF领域定义统一结果后外发接入；强制释放与邮件都需Schema→父执行器独占migrations.ts/schema.sql.ts登记，领域仅提供独立SQL模块；client.ts多领域接口→各领域只提交补丁说明，由父执行器顺序合入。

- Task1 全局UI：初稿已集成，20项表格/图片及39项规划/导航/打开相关回归通过，待实际浏览器。
- Task2 PDF：初稿已集成；13项新边界/存在性及受保护批次专项通过，完整目录夹具回归收敛中。
- Task3 BOM：初稿已集成，领域报告work/v5-bom-report.md；尚待整体验收。
- Task4 强制释放：初稿已集成，保留身份tombstone+路径隔离，正式/历史/同号双来源/重扫/回滚专项通过；待独立复核。
- Task5 外发：初稿已集成，实际1/50/69/100/200MB文件及ZIP内容验证；报告work/v5-outbound-report.md。
- Task6 邮件：初稿已集成，21项领域测试和50项外发页面回归报告；报告work/v5-mail-report.md。
- Task7 整体验收与发布：进行首次完整回归；尚未完成/发布。

Ruling: V5未要求取消ZIP原硬上限50,000,000字节。大PDF允许进入清单并独立尝试压缩，以实际ZIP大小验证；不能达限时明确提示文件存在但分包超限，不误报缺失、不拆改PDF、不静默放宽上限。
