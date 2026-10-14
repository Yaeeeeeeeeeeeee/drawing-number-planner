# P1 Windows 本地验收交付（2026-10-14）

## 固定版本与分支

应用源提交必须是 `7d9e7b74ee1222c9b789946dd69d94f89704bfe7`，P1分支 `codex/p1-minimal-workspace-20261014` 已推送。独立交付分支 `codex/p1-windows-delivery-20261014` 只添加打包／启动验证工具及本文档，应用src、Schema、API、业务规则与P1提交无差异。master不合并、不改动，不进入P2。

## 最少步骤：下载独立目录包

打开仓库Actions中的 **P1 Windows isolated acceptance package**：
https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/workflows/p1-windows-acceptance.yml

选择交付分支的本次运行，下载artifact **P1-Windows-x64-7d9e7b7**，解压到全新目录，关闭旧验收实例后双击“图号规划器验收版.exe”。包可离线启动，不需要Node、Git或开发服务器。保留整个目录，不能仅拷贝exe。它是未签名目录包，不是安装器或正式发布。

若CI构建未成功／未产生artifact，使用下方本机构建。CI启动烟测失败时仍保留artifact并记录Windows-smoke-outcome.txt，必须检查原因，不得称Windows通过。只有windows-verification.json存在且内容正确，才表示对应范围的WindowsCI启动烟测通过；DPI／跨屏人工验收仍待本机执行。

包使用版本专属隔离数据：系统appData/ DrawingNumberPlannerAcceptance / 7d9e7b7。appData实际位置可能被重定向，以启动验证结果为准；不写死盘符或用户名。首次复制内置样例，后续保留验收操作；原8bd386a数据目录保留。缺版本标记、链接或资料路径越界时原验收bootstrap拒绝启动。

## 一次本机构建（备用）

前置：Windows x64、Git for Windows、Node.js24或更高兼容版本、网络；旧验收实例需关闭以释放本地4317，构建样例使用5187。不要结束未知进程，不修改正式数据库设置。

在任意普通PowerShell执行（目录名不必沿用旧仓库）：

```powershell
$delivery = Join-Path $env:USERPROFILE ('Documents\Codex\P1-delivery-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path $delivery) { throw '目标目录已存在，不覆盖' }
git clone --single-branch --branch codex/p1-windows-delivery-20261014 https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git $delivery
if ($LASTEXITCODE -ne 0) { throw 'Git获取失败' }
powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $delivery 'scripts\build-p1-windows.ps1')
```

ExecutionPolicy参数仅作用于这次进程，不修改全局策略。脚本会在新的work子目录获取P1分支，检查精确SHA和干净状态，安装锁定依赖（pnpm11.25.0、frozen lock、ignore scripts），单独安装Windows Electron，执行类型检查、Renderer/Main/API构建，新建并检查隔离样例，输出新的目录包。已有目录拒绝覆盖；任何非零退出停止，不reset/stash旧工作区。

最终终端显示输出目录，打开其中exe即可。不应使用 `npm run dev:desktop` 启动默认正式userData。

等价的构建和打包命令（脚本已自动执行，无需再逐条运行）：

```powershell
npx.cmd --yes pnpm@11.25.0 install --frozen-lockfile --ignore-scripts
node node_modules/electron/install.js
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vite/bin/vite.js build
node node_modules/typescript/bin/tsc -p tsconfig.main.json
# 工具路径来自独立交付checkout；source必须是干净的7d9e7b7 checkout，out必须不存在
node <delivery>\scripts\prepare-p1-delivery.mjs <source> <new-output>
# 可选：同一隔离目录包的实际Windows启动烟测，不操作正式库
node <delivery>\scripts\verify-p1-windows.cjs <source> <new-output>\图号规划器验收版.exe
```

## 仅获取P1源码，不改本地未提交内容

```powershell
$source = Join-Path $env:USERPROFILE ('Documents\Codex\P1-source-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
if (Test-Path $source) { throw '目标目录已存在，不覆盖' }
git clone --single-branch --branch codex/p1-minimal-workspace-20261014 https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git $source
git -C $source rev-parse HEAD
```

输出必须是完整7d9e7b7提交；不在原仓库执行checkout/reset/pull。也可在原仓库仅fetch分支，再在全新目录建立独立worktree；现有未提交内容保留，但最简方式是新目录clone。

## 确认运行身份

1. 源checkout的git rev-parse HEAD等于完整P1提交。
2. 打包目录resources/app/acceptance-version.json中的revision等于同一提交；delivery-manifest.json包含源版本、Electron／SQLite版本及逐文件SHA256。
3. 启动窗口标题必须显示“图号规划器 P1 验收版 · 7d9e7b7”。版本标题仅由交付bootstrap添加，不改变应用Main业务代码。
4. 实际userData的.acceptance-version为同一完整提交；目录名为7d9e7b7，不能是8bd386a。可用Windows启动验证脚本读取实际app.getPath('userData')并写入windows-verification.json。
5. P1的新灰阶导航只是辅助视觉识别，不以“看起来新”取代版本标记。

## 验收失败恢复旧版

关闭P1进程，重新启动保留的旧8bd386a独立目录包。P1与旧版的数据目录分开，禁止把P1库复制给旧软件，禁止重置master、覆盖旧目录或清理原始文件。若4317仍占用先确认旧实例是否关闭，不盲目结束所有Node/Electron进程。

回到原开发工作区时只关闭新的验收实例／终端并重新打开原目录；无需git reset或git checkout覆盖未提交修改。P1目录及验收证据保留供调查。

## 证据与未完成项

云端成功推送P1精确SHA；Windows Electron43.4.1 zip的官方SHA256为 `c2ef9a5f65472c34d14bd3e67b7d14e66b0c01f124aba45263d6a4232160e13a`。SQLite13.0.3带N-API跨平台预编译文件；Windows包必须含win32-x64.node的PE x64 DLL，不混用Linux二进制。

云端可跨平台组装目录包、检查文件／数据库及版本，不可在Linux宣称Windowsexe已启动。实际CI或本机结果另行记录。P1既有17项基线单元失败、2项平台相关E2E失败、完整恢复／生产权限／稳定性门禁保持，不因交付操作关闭。
