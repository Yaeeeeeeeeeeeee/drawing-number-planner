# 图号规划器

用于包材图号规划、产品档案、BOM、PDF 文件整理、二维码和外发资料打包的 Windows 桌面工具。所有业务数据保存在用户选择的本地数据目录。

## 当前版本 v1.3.1 · V5.2 邮件导入修复

- [下载 Windows 中文安装包](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/download/v1.3.1/DrawingNumberPlanner-1.3.1-Windows-x64-Setup.exe)
- [版本说明、校验文件及运行报告](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.3.1)
- [安装、升级和恢复说明](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/cef41c481c5d77a9a4b24bf3d1c440fd5eafb6ae/docs/install-and-upgrade.md)
- [维护和发布方式](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/cef41c481c5d77a9a4b24bf3d1c440fd5eafb6ae/docs/maintenance.md)
- [上一版 v1.3.0（Schema23）](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.3.0)
- [v1.2.0（Schema22，回退须配套旧库备份）](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.2.0)
- [V5.1 邮件导入与草稿实现、验证和限制](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/cef41c481c5d77a9a4b24bf3d1c440fd5eafb6ae/docs/v51-mail-delivery-20261027.md)
- [V5 修改记录](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/cef41c481c5d77a9a4b24bf3d1c440fd5eafb6ae/docs/v5-delivery-20261026.md)

Windows 10 1809 及以上、x64；中文向导支持自定义路径，包括桌面下的中文文件夹。选择桌面根目录时安装至其中独立的 `DrawingNumberPlanner` 文件夹。安装目录只存程序，安装包不包含示例业务数据库或 PDF。

## V5.2 增量修正与邮件流程

在「迁移检查 → 导入邮件模板」选择现有 XLSX，核对厂家、场景、正文及历史示例后确认。模板、联系人和签名统一在「外发资料 → 邮件配置」维护。ZIP 成功后点击「生成邮件草稿」，填写实际修改原因、调整收件人和正文，再复制使用；程序不自动发送邮件。

已使用本轮上传的原始 Excel 验证：5 家供应商、20 个首批场景和 5 个更新案例独立解析，正文、签名和联系人分开处理；原始案例及单元格来源保存后仍可查看。实际历史内容始终先预览核对。Schema23 仅增量补充邮件配置关联，不清空旧库。详见 [V5.2说明](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/cef41c481c5d77a9a4b24bf3d1c440fd5eafb6ae/docs/release-1.3.0.md)。v1.3.1进一步修复单条导入共享抄送及底部反馈，见[本版说明](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/cef41c481c5d77a9a4b24bf3d1c440fd5eafb6ae/docs/release-1.3.1.md)。

## 主要功能

| 分组 | 页面 | 用途 |
|---|---|---|
| 日常工作 | 图号规划 / 更新包材 | 编码预览、查重和事务批量占号，关联所选产品 |
| 日常工作 | BOM 管理 | 当前关系、历史记录、差异和受保护的附件 |
| 日常工作 | 外发资料 | 选择批次、核对范围和文件、生成 ZIP、邮件草稿及历史快照 |
| 产品明细 | 产品档案 | SKU、型号、品牌、类别和用途入口；使用真实内部 ID 区分记录 |
| 产品明细 | 图号库 | 产品/编码主类别导航、颜色和来源、状态切换、关联诊断及纠正 |
| 产品明细 | 二维码管理 | 产品用途展开，手动校验、关联、更换或解除 PDF，网址打开和复制 |
| 数据来源 | PDF 文件中心 | 扫描索引、产品/批次导航、人工归纳、排除/恢复和安全移除记录 |
| 数据来源 | 编码字典 | 维护实际编码名称及停用、受保护删除 |
| 数据来源 | 迁移检查 | 编码字典及邮件模板 Excel 识别、编辑预览和备份后的确认导入 |

表格总宽度跟随可用窗口，拖动在列间重新分配宽度；支持表头换序及恢复默认布局；设置只保存在本机，不修改业务数据。产品、图号、PDF 和二维码长列表使用分块或虚拟滚动。

## 核心业务规则

- 完整图号按现有 Excel 编码契约和字典生成；外观码、颜色码分开解析，流水号按完整编码前缀检查占用。
- 正式规划、可靠历史扫描、删除但保留占号的记录共同参与查重。停用和删除记录都不等于释放号码。
- SKU、型号允许重复，数据库使用内部产品 ID 关联。一个产品可以引用多个外观编码；默认外观仅用于新规划，不恢复独立外观维护页面，不自动归并产品。
- PDF 的产品归属、图号匹配、转曲角色和磁盘存在是不同事实。按明确目录/业务规则识别；人工归纳记录在重扫后保留。相同名称不代表相同批次，相同图号的不同 PDF 实例保持独立。
- BOM 保留实际当前关系与历史快照。外发按明确选择的资料批次及打包范围核对文件，BOM 提供辅助依据；不隐式混入其他批次。
- 二维码是独立记录，不参与正式图号占号。文件关联不会自动改变二维码启停状态。

本版新扫描仅进入产品目录下的 `02.未转曲源文件` 与 `03.量产后的变更文件（已量产的产品看最新日期）`。范围外既存索引和历史引用保留，不因未扫描而标为缺失。源文件使用独立节点，不作为生产批次；二维码手动关联不受此限制。图号详情只读核实文件，展示全部对应批次，不再使用批次选择框。

详见 [项目 Skill](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/blob/cef41c481c5d77a9a4b24bf3d1c440fd5eafb6ae/.agents/skills/drawing-number-planner/SKILL.md) 及其业务、安全和模型参考。

## 数据安全与升级

每次安装或升级后首次启动先选择旧库或新库，日常重启沿用选择。新库自动创建在独立目录，无需选择文件，原库保留。升级前关闭旧程序并备份完整数据目录，再选择原 `planner.db`，核对资料根目录及外发输出目录。本版迁移到 Schema23：升级前创建并校验备份，失败回滚事务；不会重新初始化旧库。

移除 PDF 记录或删除内部空批次不会删除原始文件及磁盘文件夹。已用图号、BOM、产品归并及外发历史的引用继续受保护。普通取消占号继续执行原资格检查。新增的「强制取消占号并删除图号」是独立危险操作：显示真实影响后确认，释放当前占用但保留原身份、历史快照和审计；原 PDF 不删除，重扫旧同号文件不会自动关联到重新占用的号码。用户正式数据库及实际显示器 DPI 仍应在本地核对。

## 开发与验证

```sh
git fetch --tags
git switch --detach v1.3.1
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

`pnpm dev:web` 启动本机浏览器开发预览，`pnpm dev:desktop` 启动 Electron 开发窗口。两者共用业务服务和 React 页面；开发数据默认位于被忽略的 `work/runtime-data`。不得将生产数据库放入测试目录。

正式交付以 Release 中的 EXE 和对应 Tag 为准。历史开发记录留在 Git 和必要兼容文档中，旧测试数量不作为当前版本验收结果。
