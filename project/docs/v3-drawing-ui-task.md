# V3 图号库界面实施记录

## 完成

- 图号库不再加载、选择或维护独立外观版本；删除页面中的版本沿用面板。编码字典外观筛选继续保留。
- 从规划页进入图号库时按产品定位，兼容旧导航目标中的版本字段但不据此启用独立版本目录。
- 产品关联修正只要求真实产品 ID 与原因，调用既有修正接口并传 `appearanceVersionId: null`；保存后刷新当前详情、列表和导航统计。
- 关联诊断继续使用既有预览/确认流程，展示服务端历史/正式图号关联统计、待确认/歧义/冲突数；完成后展示服务端返回的修复前后数量。不写死业务数据。
- 抽屉使用单一图号标题、复制、来源、业务状态及关闭图标；分为基础信息、文件信息、业务关联、关联维护、其他操作五组。产品字段双列，可靠解析的外观编码仅作编码信息。
- 源文件、转曲文件、历史文件统一卡片；每个文件的存在状态显示一次，文件名省略并可悬停，路径折叠，原文件定位入口保留。
- 保留现有有效批次/目录文件隔离算法，PDF 出现位置和实际 BOM/外发使用分别展示；空关联审计不再占用板块。
- 状态操作、文件维护和危险操作保留原有服务/API与引用检查；没有修改占号、BOM、PDF或外发历史规则。
- 列表关联产品保持型号；版本列仅显示实际 `version` 字符串，未提供则显示“未记录”，不把独立外观标签或最终流水号伪装成修订版本。
- CSS 抽屉宽度常规 640px、宽屏 680px，窄窗自适应；父任务同步将共用工作区的绘图详情默认/最大宽度调整为 640/680。

## 验证

- 红测：新增五分组与产品单独修正测试、替换旧版属性断言，旧实现 2 项失败/40 项通过（`/tmp/v3-drawing-red.log`）。
- 绿测：`node node_modules/vitest/vitest.mjs run tests/renderer/drawing-library-page.test.tsx tests/renderer/drawing-library-origin-column.test.tsx tests/renderer/drawing-library-mock.test.ts --maxWorkers=1`，3 文件、52 测试通过，日志 `work/v3-drawing-final2.log`。
- 覆盖现有删除预检/占号、恢复、只读预览保护、文件定位、批次文件隔离、分页偏好、请求竞态、列表稳定性；新增产品无需版本修正及服务端前后统计展示。
- `git diff --check` 针对所改文件通过。
- 全仓 `tsc --noEmit` 当次剩余问题仅为共用 AppShell 导航目标仍要求版本 ID，以及并行修改的 DataTable 测试 `ByRoleOptions.exact`；所改图号 UI 和关联客户端无类型错误。日志 `work/v3-drawing-typecheck.log`，已通知父任务协调。

## 接口与保留事项

- `DrawingAssociationTarget.appearanceVersionId` 由后端任务改为可选/null；绑定旧版本的历史关系由服务端保护，不由前端删除。
- 关联预览支持可选 `summary`；确认/修正支持 `{updated,before?,after?,backupPath?}`，字段均来自真实服务。
- 旧 `DrawingReusePanel` 及 reuse API 本身未删除，以保留兼容；该页不再挂载或暴露独立版本沿用入口。
- 本任务没有真实本地业务库，未声称验证用户 758 条数据或执行真实归并。Windows 安装包、多分辨率实际运行截图及整体回归由父任务统一完成。
