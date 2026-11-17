# 阶段1：任务安全结束复核

需求：BUG-T40-001、BASELINE-ADD-001中的G-03。基线已有正确实现，未重写任务状态或删除保护。

## 真实检查与测试

- 本轮运行4个既有专项文件、55项通过：`tests/core/packaging-task-service.test.ts`、`tests/server/packaging/packaging-workflow.test.ts`、`tests/renderer/packaging-workflow.test.tsx`、`tests/renderer/packaging-page-freshness.test.tsx`。日志：`work/v16-corrections/phase1-existing-p0.log`。
- 实际Chromium端到端：`tests/e2e/task-termination.spec.ts` 1项通过，日志 `work/v16-corrections/phase1-browser.log`。使用隔离数据库和实际临时PDF文件，从真实页面结束强制脱钩T40任务；检查文件字节、PDF索引和外键。
- 安全结束保留旧状态和历史，记录结束时间，不设置归档完成时间；新的同产品任务可创建。忙碌、未核对Illustrator操作仍保留任务与锁。
- 既有测试覆盖正常图号、已删除/释放、PDF脱钩、等待索引、已核对PDF、中断及无法确认停止；删除预检失效继续在当前弹窗取得新令牌、重新勾选确认。

## 本轮截图

[结束确认](../../work/v16-corrections/evidence/p0-termination-confirmation-1920.png)；[保留历史后的列表](../../work/v16-corrections/evidence/p0-terminated-history-1920.png)。均为本轮Linux Chromium实际交互，不是Windows截图，也不是用户正式库。

## 文件与数据影响

本阶段没有业务源代码修改、Schema迁移或生产数据操作。复用 `src/core/packaging/packaging-task-lifecycle.ts`、任务服务及已有UI。没有取消唯一任务保护，没有删除AIT/AI/PDF/BOM/正式索引，没有自动认领被强制脱钩文件。

## 未完成和限制

用户本机真实T40库未提供，不能声称已修复该库中的具体残留记录。真实Windows以及其他模块连带回归留到最终阶段；未知Illustrator操作继续阻止释放锁，不把安全结束伪装为成功归档。
