# P1反馈修正与P2工作区实施（2026-10-14）

## 授权及状态

用户初步认可P1，明确要求窄窗产品／字典行操作按钮同一行、PDF文件名不居中；修正后直接进入P2并一起验收。独立分支`codex/p2-workspaces-20261014`，基线应用7d9e7b7，交付工具基线7d21a4b。实现及自动验证完成，等待用户P1/P2合并人工验收。不进入P3–P5、不合并master、不发布正式版本。

依据：`docs/minimal-engineering-workspace-design-20261014.md`、`docs/minimal-engineering-workspace-acceptance-20261014.md`、项目Skill及最新明确授权；实施计划`docs/superpowers/plans/2026-10-14-p2-workspaces.md`。20261013原记录不覆盖。

## 实现与修改文件

- `src/renderer/module-workspace.css`、`main.tsx`：独立workspace层，保留产品七列及字典操作语义色，操作区nowrap与宽度预算，前面文字列让出空间，常见SKU保留120px；PDF文件名左对齐。原模块legacy样式不覆盖新规则。
- `components/ModuleWorkspace.tsx`：实际容器ResizeObserver测宽；列表先保留800px预算，详情340px、导航200px及间距。不足时优先收导航，详情转模态抽屉；抽屉Tab闭环、Escape／遮罩关闭、背景inert及回焦。宽窄切换不卸载详情或清空业务输入。没有拖动／宽度持久化。
- `pages/DrawingLibraryPage.tsx`：从DataTable行内迁移原完整详情到右侧／抽屉，保留源／转曲文件、历史、批次、当前BOM、正式／历史状态、作废恢复、占号解释、引用预检、完整图号释放确认及危险分区。勾选独立，完整图号可查看／选择／复制。维护及定位错误在详情内可见。详情、PDF候选及预检迟到响应有身份保护；状态刷新不会把用户拉回旧详情。
- `pages/FilesPage.tsx`：产品与批次真实导航，列表仍为原索引／筛选／分页；独立文件详情显示原文件名、完整图号／历史图号、产品、批次、转曲、存在／匹配、字节大小、修改／扫描时间与完整相对路径，复用原复制／桌面定位。保留缺失索引选择、独立清理确认、全局清空预检及短语二次确认。查询／清理刷新后不展示已消失旧详情。
- `tests/renderer/{drawing-library-page,files-page}.test.tsx`：新增选择独立、非行内详情、真实导航、详情字段、迟到详情／手工PDF搜索／删除预检和抽屉内错误反馈回归。
- `scripts/verify-p2-layout.mjs`：隔离生产页面、只读请求、15视口及DPR模拟，操作单行、文件名左对齐、侧栏／抽屉、焦点、宽窄输入保持和横向溢出检查及实际截图。
- `docs/progress.json`、`PROGRESS.md`、`progress.html`、`NEXT_STEPS.md`：只更新本轮入口与日志，旧30项编号、名称和验收证据不变。Skill仅更新授权和UI指引，无业务规则更新。

## 明确保留的限制与裁定

现有接口不支持精确筛选productId/null或materialBatchId/null。未关联／未归批次核对入口明确打开全量（含缺失）并提示核对列；待确认文件使用真实matchStatus筛选；其他／待关联批次以真实批次ID查询。没有把当前页筛选冒充全量，也没有伪造总数。这项限制需要未来另行授权API能力才能提供精确全量未归属筛选。

本轮没有PDF内嵌预览／下载空壳、容量统计、拖动调宽或跨模块业务重构；Schema、迁移、core、server业务API、Main／IPC／安全和依赖锁没有改动。

## 实际验证

- 相关四renderer基线66/66；扩展相关7文件87/87（当时新增测试数）；独立审查修正后图号／文件／进度53/53。
- 全量919项902通过、17失败，与P1全量913项的17失败按完整测试名称逐项相同。7项旧Mock：outbound-mock1、暂停product-bom-roundtrip5、recovery-mock1；10项既有路径／链接／排序／临时文件恢复与子进程相关失败保留。详见下方失败清单，不能宣称全绿或全部仅为环境问题。
- 隔离E2E8项6通过：失败仍为`phase-real-usage-outbound`的tar.exe ENOENT、`phase-z-four`的Windows反斜杠断言，其他6项通过。临时配置仅指定云端Chromium，不删除原测试。
- 类型检查、Vite生产Renderer、tsconfig.main编译实际通过；大于500kB的chunk提示保留。
- 15视口224项生产布局／键盘断言0失败、0业务写请求；720×600、短高960×540、原1080/1280、2K／4K及1.25/1.5/2 DPR模拟，包含宽窄来回保留输入。结果`work/p2/layout/result.json`；截图在同目录。模拟不是Windows系统DPI验收。
- 独立审查2项Important（错误留在遮罩后、旧手工PDF搜索串候选）已各用RED→GREEN回归修正。无未处理Critical／Important；没有第二次独立复审，修正以覆盖回归和构建证据核对。

## 全量失败名称（与P1完全一致）

1. IndexedPdfResolver — rejects unsafe stored paths and a junction whose real target escapes the workspace
2. outbound temporary artifact ownership — recovers all abandoned part temporaries while preserving unrelated files and published ZIPs
3. OutboundPackageService — never records half a multipart publication as completed after abrupt process exit
4. OutboundPackageService — rejects a canonical path that escapes through a filesystem link
5. OutboundPackageService — rejects two indexes resolving to the same canonical actual path
6. scanQrWorkspace — returns QR naming candidates across supported file types without rewriting any workspace file
7. workspace paths — normalizes a real root and resolves a nested relative path inside it
8. workspace paths — rejects a directory junction that resolves outside the workspace
9. WorkspaceSettingsStore — starts unconfigured and persists a normalized existing directory across instances
10. real application API — removes only stale task-owned outbound claim and temporary files after restart
11. outbound isolated UI mock — routes exclusively to Mock and performs package, mail, copy, history and maintenance without real calls
12. isolated BOM roundtrip — restores source filter and forces fresh check
13. isolated BOM roundtrip — protects unsaved changes on tab switch and return
14. isolated BOM roundtrip — does not assume cancelled processing succeeded
15. isolated BOM roundtrip — uses completed memory result but still checks other blockers
16. isolated BOM roundtrip — fails closed after product disappears
17. isolated recovery panel — never mounts real recovery or queries API

## Windows合并验收重点

先确认包内acceptance-version、窗口标题和运行数据目录一致；只用内置隔离样例。复核用户三张图对应的720×600按钮单行及文件名左对齐。宽屏打开图号详情／PDF导航与详情，再缩窄、恢复，检查输入、勾选、图号、关闭回焦、错误和确认按钮可到达。

完整1920×1080／2560×1440／3840×2160、100/125/150/200%适用组合，最大化／窗口化／半屏／短高／跨不同缩放显示器，按20261014验收标准记录真实CSS宽高。云端模拟和WindowsCI烟测不能代替此人工矩阵。恢复完整效果、正式权限、稳定性及其他既有业务TODO未因本轮关闭。
