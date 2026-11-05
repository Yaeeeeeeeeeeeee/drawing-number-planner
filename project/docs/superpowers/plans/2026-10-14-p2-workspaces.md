# P1反馈修正与P2实施

依据：2026-10-14设计与验收标准；用户明确授权先修正三张截图，再直接实施P2，合并验收。P1仅获初步认可，完整Windows矩阵仍未验收。不进入P3–P5、不合并master。

1. 修正产品／字典操作列：操作单行，前面的文字列可换行／让出宽度，表格仅内部滚动；PDF文件名左对齐。
2. 建立固定宽度的模块工作区，按实际容器宽度折叠产品导航与详情；抽屉管理Escape、Tab、背景inert、关闭回焦；断点变化不卸载业务详情。
3. 图号详情从行内迁移到侧栏／抽屉，复用全部原始详情与危险操作，详情与勾选独立，复制完整图号，防止迟到详情覆盖后选记录。
4. PDF采用真实产品／批次导航、原文件列表及真实文件详情，复用既有筛选API；不伪造未关联／未归批次过滤（API没有对应精确空值参数时只展示说明与现有全量入口）。保留路径、缺失清理与全局清空的各自确认。没有内嵌预览、下载或拖动调宽。
5. renderer回归、类型／构建、隔离生产布局与键盘检查；独立审查；更新进度、Skill授权入口与实施报告。保留历史及已知基线失败。

## 验证重点

720×600 CSS窗口按钮单行、文件名左对齐、无整页溢出；宽屏详情与导航不挤压主表；抽屉焦点闭环与关闭回焦；缩放／折叠不丢输入；无导航写请求；图号历史、占号、批量预检、释放确认保持。完整Windows DPI仍待人工。

## 执行记录

- 基线：四个相关renderer文件66/66通过；分支从干净交付分支建立，应用基线7d9e7b7。Schema／迁移不改。
- Ruling: 未关联／未归批次没有现成精确API空值过滤，P2保留全量及待确认等真实入口并在导航明确说明，不用当前页过滤冒充全量筛选。

- Tasks 1–4: complete. 图号非行内／勾选独立、PDF真实导航及字段RED→GREEN；迟到详情、预检、手工PDF候选也有RED→GREEN回归。
- Final review: independent reviewer reported two Important; both fixed with failing-then-passing tests (drawer error visibility; manual PDF search identity). Full-suite 902/919, failures identical to P1; targeted53/53, layout224/224, production builds passed.
- Ruling: full suite retains the17 pre-existing failures rather than changing out-of-scope business/Mock code; cost is existing release blockers remain and cannot claim full-green. E2E retains two platform-specific baseline failures.
- Final: no deferred minor findings; Windows full DPI/cross-monitor remains human acceptance, not inferred from simulations.
