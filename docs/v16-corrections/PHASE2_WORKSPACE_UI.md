# 阶段2：工作现场与AIT抽屉（部分实施）

## 已修改

- `src/renderer/layout/AppShell.tsx`：BOM、字典、迁移检查、外发模块首次访问后保留挂载，暂时导航不再视为丢弃编辑；各模块外层滚动位置分别恢复。既有规划、任务、PDF、QR和产品现场保留实现继续复用。对象更换、编辑器关闭等实际丢弃场景仍保留既有确认。
- `src/renderer/pages/packaging/PackagingEditors.tsx`、`packaging-catalog.css`：AIT新增/编辑为覆盖式右抽屉，不挤底表；响应式全屏、标题/对象、保存取消、焦点/键盘与关闭保护。保存成功更新dirty基线；保存失败保留输入；提交互斥。
- 对应修改 `workspace-shell`、`outbound-shell-guard`、`packaging-catalog-ui` 测试；新增 `tests/e2e/v16-workspace.spec.ts`。

## 已执行测试

5个组件/导航专项文件52项通过（包括图号跳转BOM的丢弃保护），`work/v16-corrections/phase2-ui.log`；一次类型检查通过（后续改动仍需最终复跑）。真实浏览器1项通过，验证BOM日期切换保留、抽屉不改变表格边界、拒绝关闭保留输入、1920/600宽度、取消按钮实际可点。截图：[宽屏](../../work/v16-corrections/evidence/phase2-ait-drawer-1920.png)、[窄屏](../../work/v16-corrections/evidence/phase2-ait-drawer-600.png)。日志 `work/v16-corrections/phase2-browser.log`。

测试先复现原先4处模块丢失、滚动不恢复和无抽屉/脏关闭无保护，再修复。浏览器实际发现窄屏通用遮罩z-index遮挡按钮，已限定抽屉自身层级修复，未用强制点击绕过。

## 尚未完成

模块挂载保留只覆盖当前应用会话，不能当作全部表单跨重启持久保存；规划草稿沿用已有持久化，其他模块按各自规则继续核查。扫描真实阶段和全表格回归与后续PDF服务联动实施，故本阶段整体仍标部分实施。跨重启外发邮件草稿另在OUT-DRAFT实施。真实Windows/DPI与Adobe未验证。

没有Schema或生产库变化，不触及原始业务文件。
