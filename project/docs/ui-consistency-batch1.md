# 第一批：错误状态与安全恢复反馈

仅本批实施；等待用户验收，不进入第二批，不合并 master。

## 文件
- src/renderer/components/QueryFeedback.tsx：仅四个页面使用的查询反馈，无新增样式。
- src/renderer/pages/DrawingLibraryPage.tsx：结果加载状态、重试、移除 Phase 2 文案。
- src/renderer/pages/DictionariesPage.tsx：查询错误与编辑错误分离，失败不显示空表结论。
- src/renderer/pages/ProductsPage.tsx：初始化与查询反馈、重试。
- src/renderer/pages/QrCodesPage.tsx：列表加载反馈、原筛选条件重试。
- src/renderer/components/SafeRecovery.tsx：按契约反馈，重启后使用现有健康查询。
- tests/renderer/query-feedback.test.tsx、recovery-feedback.test.tsx。

## 恢复契约
Main RecoveryController.terminateTask 返回 cancelled=true 表示 cancelTask 已返回，未等待任务终态：只显示请求受理，终止未验证。
cancelled=false 表示没有任务，不执行终止；字段缺失表示无法确认。
reloadRenderer 返回 ok=true 表示重新加载已调用，不证明新界面就绪。
restartService 返回 ok=true 表示子服务 ready 连接已返回；UI 再调用 checkServiceHealth，只有 status=ok 才显示健康验证通过。查询失败显示无法确认。
relaunchApp 会等待旧任务停止、重启子服务、发起应用重启和退出；旧界面不能证明重启后的状态，显示尚未验证。
ok=false 或抛错显示操作失败。未修改 Main、API 或恢复机制。

## 验证
受控浏览器只打开真实入口 /，全部 API 在浏览器内拦截，不访问真实数据库；失败为 503，成功为契约格式空集合。
四页面各检查 1080/1200/1280 的失败与重试空数据；写入请求 0，无整页横向溢出。
截图：C:/Users/Administrator/Documents/Codex/batch1-ui-shots/；failure 与 empty-after-retry 为对应页面对比。恢复截图采用单个浏览器页测试桥接，无真实 IPC。
六套基础测试 63/63 通过；加入恢复测试后一次并行运行遇到两套依赖解析失败，其余 54 项通过；受影响套件与恢复测试单独重跑 19/19 通过。并非宣称全量测试通过。
renderer 类型检查、Vite 构建、Main 编译通过。保留大于 500kB 包体积警告。

## 未解决 TODO
- Main 的取消返回值并非任务终态；renderer 声明不包含 taskId，暂不宣称任务已终止。
- 健康检查仅验证当前服务响应，不验证全部业务或应用重启后的状态；查询超时治理不在本批重构。
- 产品/二维码/图号原有并发查询迟到响应风险仍需专项处理；本批未改变查询/分页算法。
- 筛选选项等辅助数据加载失败不等同主列表失败，后续可分别提供辅助重试，不扩大本批。
- 桌面真实故障恢复、非空长内容与真实用户数据未测试。
