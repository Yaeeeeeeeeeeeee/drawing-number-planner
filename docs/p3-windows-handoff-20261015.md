# P3 Windows隔离验收交付

应用源提交固定为`930615f5a79753ac9a23be84cec387c8e561f2de`，独立分支`codex/p3-module-alignment-20261015`。后续打包／文档提交不改变这份应用代码。原P1、P2、20261013记录及master保留，不创建PR或正式发布。

## 最少操作

从本次成功Actions运行下载`P3-Windows-x64-930615f`。解压到新空目录，例如`D:\Codex验收\P3-930615f\`（无D盘可用C盘），不要覆盖P1、P2或正式版本。关闭旧验收实例后双击`图号规划器验收版.exe`，保留整个目录，无需Node或开发服务器。

窗口标题必须显示`图号规划器 P3 验收版 · 930615f`。包内`resources/app/acceptance-version.json`必须是上述完整SHA；目录包未签名，不是安装器或正式版。首次启动复制内置样例到系统appData下`DrawingNumberPlannerAcceptance/930615f`，与P1/P2及正式数据分开，后续保留本版本验收操作。不要切换到正式资料根目录或复制正式数据库。

包内`Windows启动烟测.png`、`Windows-P3文件详情.png`、`windows-verification.json`记录CI烟测范围；不是完整Windows人工验收通过证明。

## 本轮重点

1. PDF资料批次与批次状态单行，除文件名左对齐外其余列居中；长图号和文件名仍可完整查看／复制。
2. 开文件详情前后列表宽度不变，可用局部横滚条或聚焦滚动区后按方向键；滚回左侧看原列表。长列表点击末行后详情可见，滚动条可到达。窄窗仍为抽屉，关闭／Escape回焦。
3. 字典选中主类别后，搜索框与父列表同宽、状态筛选与子详情起点对齐；窄窗堆叠。
4. 图号规划项目1/2/3保持单行；产品／BOM／QR等控件、标签与操作区对齐，字段和业务操作保留。
5. 所有主功能页统一中文标题及一行中文说明，无英文眉题；真实SKU、BOM和业务身份不翻译或伪造。

完整1080P／2K／4K、100/125/150/200%适用组合，实际CSS宽高、最大化／窗口化／半屏／跨不同缩放显示器按20261014标准记录。只使用样例，不执行正式恢复或真实数据清理。

## 失败后回到旧版

关闭P3，再打开保留的P2或旧版目录包。数据目录独立，不复制P3数据库给旧版，不reset、不覆盖或删除旧文件。4317端口占用时只关闭已确认的旧验收实例，不结束未知程序。

## 本地备用构建

需要Git for Windows、Node24、PowerShell7及网络。使用全新目录，不动原工作区：

```powershell
$delivery = Join-Path $env:USERPROFILE ('Documents\Codex\P3-build-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path $delivery) { throw '目录已存在，不覆盖' }
git clone --single-branch --branch codex/p3-module-alignment-20261015 https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git $delivery
if ($LASTEXITCODE -ne 0) { throw 'Git获取失败' }
pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $delivery 'scripts\build-p1-windows.ps1') -Revision 930615f5a79753ac9a23be84cec387c8e561f2de -Phase P3
```

脚本文件名为历史复用，不表示构建P1；明确Revision/Phase决定本次P3。新源码目录固定提交、干净检查、冻结依赖、类型及生产构建、隔离样例、全新输出目录，任何错误立即停止，不覆盖已有输出或源码修改。

## 实际交付结果

2026-10-15WindowsCI已通过：https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/38691184443

直接下载：https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/38691184443/artifacts/11952242940

包名P3-Windows-x64-930615f，166020048字节，保留至2026-10-29。ZIP SHA256：`0812d1e620b4d03d6bcf6935f9095069fb7b060d4b2aa96c021aa848cc079393`。实际完成类型、Renderer/Main编译、隔离样例与目录包；Electron真实启动、版本/隔离目录/样例产品/健康200及720×600等初始视口校准；PDF详情打开、列表宽度不缩窄、除文件名外居中、批次与状态nowrap断言均通过。

工具提交0ba0e3a／22eb518（修正P3分支触发条件）；应用源930615f不变。详细实现与原17项失败见`docs/p3-module-alignment-20261015.md`。完整Windows高DPI／跨屏及全模块人工验收仍待用户，不因CI成功关闭。
