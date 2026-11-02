# 包材模板、制图任务及规划 UI 修改记录

对应 [本轮需求](packaging-ui-requirements-20261102.md)。版本1.5.0，Schema25；在现有React/Fastify/SQLite/Illustrator实现上增量修改，无新增运行依赖。

## 页面与实际逻辑

- `AppShell.tsx`、`DrawingTasksPage.tsx`：独立任务菜单与原任务数据复用，实际产品ID唯一未完成任务；自动目录/命名、精确图号交接、可恢复任务及历史删除。
- `PlanningPage.tsx`、`DrawingLibraryPage.tsx`：去尺寸与模板请求，紧凑实时预览、明确查重占号、紧凑成功卡片和已保存ID精确定位；保留草稿和结果。
- `PackagingTemplatesPage.tsx`、`packaging/PackagingEditors.tsx`、`packaging-dimensions.ts`：三页签、中文映射、自动对象/字体读取、简化匹配依据/规则，保存旧键及未展示的旧映射。
- `PackagingTaskPanel.tsx`、相关CSS：紧凑文件行、设置展开、人工模式隐藏尺寸、本地日期、忙碌/未完成删除提示。页面激活刷新有序列保护，保持已有DOM和编辑内容；后台失败保留数据供重试。
- `illustrator-automation.ts`、`illustrator-jsx.ts`、`packaging-template-inspection.ts`：只传入和替换DRAWING_NO，其他设计内容不写入；上传检查使用受控暂存，未完成原生操作保留恢复证据。尚未选对象时过滤空映射再检查，允许先读取对象列表。
- `packaging-task-service/store/workspace/file-operations/archive.ts`、API/client：新任务平铺00；旧路径权威保留；原件副本目标先持久化、排他创建、归档限定实际发布文件。删除采用原表留痕，释放唯一任务锁但保留历史和文件。
- `file-repository.ts`、`file-types.ts`、`routes/files.ts`、`FilesPage.tsx`：列表筛选与导航/扫描范围分离，修改时间按真实时间解析，目录与手动批次条件相交；不改已有扫描及缺失保护。

## 数据与路径兼容

Schema25仅为任务增加 `deleted_at`、`deletion_snapshot_json`，为项目增加 `copy_destination_path`，调整未完成任务唯一索引以排除留痕删除。原占号、BOM、PDF、外发、邮件数据与原始文件不迁移位置。

使用原v1.4.0源码实际生成Schema24旧库及已核对的嵌套任务，再由当前程序升级：61个原表的旧列与数据保持、备份仍可读为24、外键正常、旧任务按原路径继续与归档、新任务平铺00、删除完成记录保留正式文件和占号、重复升级幂等。升级失败回滚专项覆盖备份失败与异常库。测试库及材料只在忽略目录中，不提交GitHub。

删除记录不等于删除文件；原任务曾创建但尚未提交文件关联的副本，其持久目标仍受原任务保护，新任务不会自动认领。归档重试不会清理较早生成但本次未发布的文件。原始AIT、根00、旧任务目录和未知文件始终保留。

## 测试与验收状态

最终运行、Windows安装与发布证据将在实际执行后补齐，不以阶段通过数代替最终结果。

阶段覆盖包括：核心任务26项、Schema24→25与回滚、模板检查HTTP真实暂存、JSX仅图号替换、任务删除锁与并发保护、跨页面刷新保草稿、列表筛选不改变扫描归属。真实浏览器走占号→精确图号→独立任务→监听人工文件→确认哈希→统一归档→正式副本修改→备份核验→历史删除及新建任务。

完整回归初次并行运行218文件1855项，有1项原编码字典HTTP测试超过5秒；单独复跑通过，正在单进程全量验证。原端到端有2处测试定位匹配隐藏保留表单，已改为可见角色/精确按钮定位，不删除应用保留的编辑状态。

## 尚未验证

真实AIT、授权Illustrator字体/版式、PDF重开可编辑能力；用户正式数据库及物理显示器DPI。没有生产库自动操作，也没有服务器部署或共享路径切换。
