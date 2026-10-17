# P2 Windows隔离交付

应用源提交：`c74f469db3f4b48c44ddb514e42028dd65fa961c`。分支`codex/p2-workspaces-20261014`后续交付工具／文档提交不改变这份应用源码；包内acceptance-version.json为准。

## 使用新包

在Actions的P2 Windows isolated acceptance package成功运行中下载`P2-Windows-x64-c74f469`，解压到全新空目录，例如`D:\Codex验收\P2-c74f469\`，没有D盘可用C盘同名新目录。不要覆盖旧P1或正式版本。关闭旧验收实例后，双击包内`图号规划器验收版.exe`，保留全部旁边文件。无需Node或开发服务器；目录包未签名，不是正式安装器。

窗口标题必须显示`图号规划器 P2 验收版 · c74f469`。包内`resources/app/acceptance-version.json`必须是完整源SHA。隔离数据在系统appData下`DrawingNumberPlannerAcceptance/c74f469`，与P1的7d9e7b7及旧8bd386a分开；首次复制内置样例，后续保留本版本验收操作。不要修改根目录为正式资料路径或复制正式数据库。

验收失败：关闭P2，打开原P1或8bd386a目录包，不reset、不覆盖旧工作区，不把P2数据库复制给旧版。端口4317占用时只关闭已确认的旧验收实例，不盲目结束其他程序。

## 本地备用构建

需要Git for Windows、Node24、PowerShell7及网络。新目录clone不覆盖现有修改：

```powershell
$delivery = Join-Path $env:USERPROFILE ('Documents\Codex\P2-build-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path $delivery) { throw '目录已存在，不覆盖' }
git clone --single-branch --branch codex/p2-workspaces-20261014 https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git $delivery
if ($LASTEXITCODE -ne 0) { throw 'Git获取失败' }
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $delivery 'scripts\build-p1-windows.ps1') -Revision c74f469db3f4b48c44ddb514e42028dd65fa961c -Phase P2
```

复用脚本文件名保留P1历史；新增Revision/Phase参数用于P2。脚本只在新目录获取固定源码，检查精确SHA及干净状态，安装锁定依赖、类型检查、Renderer/Main生产编译并建立隔离样例后输出新的目录包。已有输出拒绝覆盖；不会启动默认正式userData。

## 人工验收

先核对三张反馈图对应的按钮单行／文件名左对齐，再查看图号详情、PDF产品／批次导航和文件详情。720×600下核对关闭、Escape、Tab、错误可见、完整图号复制及确认可到达；宽窄切换保留输入与勾选。

完整1080P／2K／4K、100/125/150/200%适用组合，宽高、最大化／窗口化／半屏／跨不同缩放显示器按20261014标准检查。CI烟测仅证明其记录范围，不代表完整人工通过。未关联／未归批次核对入口明确是全量核对，现有API不支持精确空值筛选。

## 本次实际交付结果

Windows CI成功运行：https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/38531104786

直接下载：https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/38531104786/artifacts/11878311405

大小166030272字节，保留至2026-10-28。ZIP SHA256：`5ef91564e520c5703b6d0ba70fb8625dfa41d4c14a092206200fa025fa3567f3`。应用源提交c74f469不变，交付工具提交228ef6e／7b82051。第一次工作流因YAML命令格式失败，没有执行构建；7b82051修正后成功，不将失败运行记为通过。

实际WindowsCI通过：类型检查、生产两端编译、新隔离样例及目录包生成；Electron真实启动、标题源版本／隔离userData与版本标记／样例产品／健康HTTP200、按实际CSS视口校准720×600等三组初始布局、PDF模块文件详情真实打开。包内`Windows启动烟测.png`、`Windows-P2文件详情.png`、`windows-verification.json`记录该范围。尚未完成完整Windows系统DPI／跨屏／全模块人工验收。
