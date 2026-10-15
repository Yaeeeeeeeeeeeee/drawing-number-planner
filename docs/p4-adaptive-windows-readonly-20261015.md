# P4 本机已有数据只读验收指引（2026-10-15）

本轮代码在独立分支`codex/p4-adaptive-data-workspaces-20261015`，不是旧`8dc2112`的相同UI。不要继续用旧8dc2112验收本轮布局。应用代码及工具提交在完成验证后写入主记录；不合并master，不进入P5。

## 本轮证据边界

云端只存在主要业务实体均0条（另有原已存在的模板/签名/用途基础配置）的`work/runtime-data/planner.db`；`/workspace/library-files`没有原始资料。已用readonly/query_only访问这一已有空库，没有种子/DOM克隆/样例铺满。截图只证明已有空库下的页面几何；不能证明你的Windows当前数据库已通过。已有单元/E2E的隔离fixture与空白结构探针也不是业务数据截图。

## 读取本机已有数据库

开发只读工具是浏览器查看模式，不会启动生产Main，不会自动迁移/备份/清理/扫描/恢复，也不会执行保存、占号、删除、打包、导入等业务写请求。界面仍是本轮真实页面，数据来自你明确选择的已有库。原桌面API/IPC/安全机制未改；浏览器没有原生文件位置/附件窗口能力，不能据此宣称这些桌面功能通过。

先关闭正式应用以避免其他进程修改计数，但不要结束不明进程。保留旧版本目录/数据库，不覆盖。Windows已有Node24和Git可复用，新建源码目录以避免覆盖旧工作树：

```powershell
git clone --single-branch --branch codex/p4-adaptive-data-workspaces-20261015 https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git C:\Users\Administrator\Desktop\UI修正\P4-adaptive-readonly
cd C:\Users\Administrator\Desktop\UI修正\P4-adaptive-readonly
npx.cmd --yes pnpm@11.25.0 install --frozen-lockfile --ignore-scripts
node node_modules/vite/bin/vite.js build
```

仅在上述步骤成功后选择**已有业务planner.db**。不要选择旧验收包的样例库来代替正式来源。可在PowerShell用标准文件选择框，不自动挑选不明数据库：

```powershell
Add-Type -AssemblyName System.Windows.Forms
$layoutDbPicker = New-Object System.Windows.Forms.OpenFileDialog
$layoutDbPicker.Title = '选择已有业务数据库（本工具只读）'
$layoutDbPicker.Filter = 'SQLite database (*.db;*.sqlite;*.sqlite3)|*.db;*.sqlite;*.sqlite3'
if ($layoutDbPicker.ShowDialog() -eq 'OK') {
    node --import tsx scripts/readonly-workspace.ts --database $layoutDbPicker.FileName
}
```

工具默认读取数据库旁的settings.json；如实际设置文件不在旁边，用`--settings '实际设置文件完整路径'`明确指定。不选择或不存在的数据库会停止，不新建空库/不迁移。报缺少表/字段表示版本不兼容，停止并核对来源，不手动改库。启动后访问打印的`http://127.0.0.1:5190`，保持PowerShell打开。工具拒绝写操作时会明确显示“只读布局验收环境”，不代表正式版功能被移除。

结束时在PowerShell按Ctrl+C，报告保存到源码目录`work/p4-adaptive/readonly-data-时间戳.json`，包含前后各表数量/内容摘要及主数据库文件SHA256。`unchanged:true`仅证明本次所选数据库的核对范围；原始PDF未挂载/未进行磁盘核对时仍标为未验证。若false，先排除其他进程并停止验收，不自行清理/恢复。

## 人工验收矩阵与证据记录

记录实际版本、数据库路径（可脱敏）、数据计数、显示器分辨率、Windows缩放、应用/浏览器CSS宽高、窗口模式及结论。至少覆盖3840×2160、2560×1440、1920×1080、1366×768与非最大化，适用125/150/200%；720×600仍是完整工作流最低CSS目标。低于此高度/宽度只能作压力检查，不能宣称完整支持。跨不同DPI显示器移动亦待本机确认。

- PDF：足够真实数据时三栏并列，中央最大；详情不遮挡、滚到底可操作，导航与表格分别滚动；关闭/收起/拖宽/键盘/重置正常；完整路径、状态/批次不混淆。
- 图号库/回收站：实际总数完整，每页50默认，可切20/50/100并翻页；查看全部页面不丢记录；展开筛选让出高度，收起恢复；选中与批量勾选独立，断点不清输入/焦点，图号可核对/复制。
- 规划：只读选择已有产品/外观、添加/移除草稿行，横向字段与相邻预览区域比例合理；本只读工具不执行预览POST或确认占号，真实查重/确认流程仍以隔离业务环境验收，不可在正式库占号。
- BOM：添加页基本信息紧凑，已有明细全宽；查询表/所选与上一条对照完整，长附件/图号不溢出。只读工具不保存/上传/删除；快照与关联摘要前后不变。
- 外发：范围紧凑，已有历史/结果查询完整，邮件设置不过宽、正文利用空间；预览/打包/生成/维护在本只读工具被禁止，原业务保护由回归测试与后续隔离桌面验收核对，不在正式库试写。
- QR、字典、产品：列表/明细充分利用宽高；已有用途、启停、文件/匹配状态独立；字典五类/主从对齐及编辑入口保留，只读不提交。
- 迁移：文件选择紧凑；本工具不执行审计/导入写操作，因此真实大报告布局仍待可授权只读报告来源或隔离业务验收。

浏览器实测可先核对已有数据与CSS，但不代替Electron原生窗口/原生弹窗/文件定位和Windows完整高DPI验收。不要将已有空库截图、自动DPR模拟或旧P4样例升级为这些通过结论。
