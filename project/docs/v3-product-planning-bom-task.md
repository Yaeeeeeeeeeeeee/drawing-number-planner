# V3 产品、规划与 BOM UI 修正

## 实施范围

- 产品档案保留九列与原编码字典默认外观字段，移除日常列表/编辑页独立外观版本、外观换代、版本资料、归并入口及传统分页。所有查询结果交给共享 DataTable 的 virtualize 渲染，旧页面尺寸偏好不再截掉记录。
- 产品二维码摘要按产品身份统计全部实际用途记录，不再仅统计当前独立外观版本；跳转二维码管理仅传产品与用途，保留查询与滚动恢复。
- 图号规划始终使用原编码字典外观选择器。默认值来自产品，可选择其他编码；不查询独立外观版本，不发送独立版本 ID。确认占号后的图号库入口传 productId，事务与正式归属保存由本轮后端任务实施。
- BOM 普通新增/查询不自动选择独立外观版本，不展示版本选择与跨版本物料开关。产品级新增读取 getCurrentBom/listBomCandidates。切换产品会清理旧链接的可选版本上下文。

## 历史兼容

未删除旧版本面板源文件、后端接口、Schema、历史记录或外键。BOM 精确历史链接仍用 bomVersionId 读取原记录；旧链接的可选 appearanceVersionId 只作为历史身份核对/读取上下文。历史编辑继续保存原始 productId、原版本引用（没有则不添加）、业务日期、记录 ID 与并发 editRevision，不降级为新增。已归并原所有者记录仍验证其 canonical 产品关系。原清理面板的确认与文件保护逻辑保留。

## 验证

先新增/替换 V3 行为断言再运行 renderer 测试，确认 5 个预期失败（旧版入口、分页截断、规划/BOM 版本依赖）。然后修改实现。废弃的是用户明确取消的产品独立版本入口测试；后端历史/迁移测试未删除。

验证命令：

```sh
npx vitest run tests/renderer/product-appearance.test.tsx tests/renderer/planning-page.test.tsx tests/renderer/bom-page.test.tsx tests/renderer/products-page.test.tsx tests/renderer/product-bom-roundtrip.test.tsx --reporter=dot
```

覆盖默认字典外观及其他外观编码、无独立版本请求/参数、确认占号的产品级跳转、旧分页偏好不截断、真实 QR 记录跨旧版本汇总、原产品编辑和清理守卫、筛选/滚动恢复及历史 BOM 原 ID/归属/日期/修订更新。

本任务不接触正式本地数据库，不声明已验证用户真实数据或 Windows 安装包。共享组件、API、后端、迁移及最终构建由主任务统一验收。

最终定向运行结果：5 个测试文件通过，57 个测试通过（2026-10-22）。`git diff --check` 在上述页面、测试范围通过。全仓类型检查曾在并发开发中运行，本任务页面/测试没有类型错误；共享 AppShell 的产品级导航类型及其他模块临时错误已告知主任务，不能据此声称全仓已通过。
