# V4 PDF 文件中心实施记录

## 范围

- 新增 `PdfClassificationDialog`，所选 PDF 实例统一提交一次预览、一次确认写入；产品使用 SKU、型号、类别、内部 ID，批次使用显示名、真实目录与 ID 区分。
- 真实批次列表不按当前产品归属过滤，待识别或目前属于其他产品的实际批次仍可选择，合法性与冲突由后端实际预检决定。
- 预览逐文件显示原产品/批次与目标产品/批次，冲突明确展示并阻止确认；必须填写原因及勾选核对。取消或写入失败保留文件选择；失败保留弹窗目标、原因和预览。
- 保存后失效共享查询缓存，刷新产品目录数据、批次、使用证据、PDF 列表和导航计数。写入委托现有 API 的数据变化事件，局部处理期间抑制重复列表请求。
- 删除文件详情状态、面板及文件名入口。行仅保留查看路径与打开位置，保持缺失禁用、桌面索引 ID 定位及实际异常反馈。待确认理由保留表格内显示，其余异常可通过状态 title 查看。
- 顶部根目录、PDF 数、未匹配数、折叠详细信息、恢复默认表格布局、扫描收于一条工具栏。详情默认折叠；原根目录设置和扫描统计保留。
- 保留顶部批量清除/暂不纳入/恢复及真实预览确认；旧 API 的缺失索引批量清理亦保留。批次改名只保留导航入口。
- DataTable 使用 `pdf-files` 布局 ID，选择和操作锁定；文件名与批次最多两行，完整内容 title，操作水平不压缩。
- 保留原分块加载、虚拟行、选择、查询竞态防护及重试逻辑。

## 验证

新要求先添加 renderer 回归并运行 RED：`pdf-classification-page.test.tsx` 2 项因缺少人工归纳入口失败；实现后 2 项通过。随后增加写入失败保留状态回归。

现有测试按 V4 更新详情面板入口和单行清理入口：改为列表错误反馈、路径展开和顶部批量清理，保留原桌面调用、缺失禁用、清理确认、历史保留、Mock 网络隔离等断言。共享表格新增可访问列控件后筛选测试改用 combobox 精确匹配。

最终自动化结果由后续命令追加；未进行真实 Windows 或浏览器像素截图验收。生产数据与 PDF 原文件均未操作。

## 跨文件接口

- 使用已约定 `PdfManagementApi.previewPdfClassification/applyPdfClassification` 类型。
- 使用 DataTable `tableId`, `width`, `minWidth`, `align`, `locked` 与 `resetTableLayouts('pdf-files')`。
- ModuleWorkspace 使用父任务增加的 `hideLayoutReset`，单个顶部重置还派发 `module-workspace:reset-layout` 事件恢复导航宽度。
- Mock 的代理对未知可选 API 返回隔离报错函数，因此本页在 Mock 模式明确关闭新增归纳入口，避免把未知能力当作真实服务。

最终证据（2026-10-23 UTC）：

- `npx vitest run --maxWorkers=1 tests/renderer/files-page.test.tsx tests/renderer/files-mock.test.tsx tests/renderer/pdf-management-page.test.tsx tests/renderer/pdf-classification-page.test.tsx`：4 文件 / 45 测试通过。
- 随后新增单文件预览/取消测试，`npx vitest run --maxWorkers=1 tests/renderer/pdf-classification-page.test.tsx`：4 测试通过（其余三文件未改，合计 46 项覆盖）。
- `npx tsc --noEmit`：本任务文件无类型错误；共享工作树当时剩余 BOM History Comparison 的 LayoutColumn 类型错误由对应负责者收口，不宣称整仓类型检查通过。
- 初次四文件并行运行有一个旧 Mock 综合流程超过 5 秒；以单 worker 完整复跑全部通过，未放宽 timeout 或删除任何安全断言。
