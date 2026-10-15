# P4 Windows隔离验收交付（2026-10-15）

本轮仅P4。独立分支`codex/p4-workspace-refinement-20261015`，应用与Windows构建证据在完成构建后补入下方。未合并master、未创建PR或正式发布，P1/P2/P3旧目录和历史记录保留。

## 最少操作

1. 关闭当前旧验收版，避免4317端口冲突；不要结束不明进程。
2. 从下方GitHub Actions制品链接下载完整ZIP。建议解压到新目录`D:\Codex验收\P4-版本号\`，不要放入旧版目录，也不要只复制exe。
3. 双击`图号规划器验收版.exe`。标题应为“图号规划器 P4 验收版 · 应用短SHA”。本包无须Node、开发服务器或另建数据库。
4. 图号库选择每页50，应有40条；PDF有实际隔离样例，产品关联二维码按真实状态直接显示。具体验收见`p4-workspace-refinement-20261015.md`。

仅使用包内隔离资料；不要选择正式数据库、正式资料根或导入真实资料。首次启动由原隔离bootstrap复制样例到系统appData下`DrawingNumberPlannerAcceptance\应用短SHA\`；与正式版及旧验收版各目录隔离。样例仅用于索引/布局，不是PDF预览实现或二维码扫描通过证明。

## 版本核对与恢复

窗口标题的P4+短SHA、`resources\app\acceptance-version.json`完整SHA、运行隔离目录`.acceptance-version`必须一致。Git分支文档交付提交可能晚于应用固定SHA，包固定的应用SHA才是运行版本。`windows-verification.json`记录实际WindowsCI启动、健康检查、实测CSS视口及隔离路径；`Windows-smoke-outcome.txt`应为success。

验收失败：关闭P4，重新启动保留的P3/P2/P1或正式旧版目录。不要把P4验收数据库复制给旧版本，不需要git reset或覆盖安装。重验需要全新样例时，先关闭应用，将**本P4 SHA专属**隔离目录改名备份再启动；不处理正式或其他SHA目录。

## 本地重建备用

需要Git for Windows、Node.js24和PowerShell。使用新源码目录，以下不覆盖旧工作树或未提交修改：

```powershell
git clone --single-branch --branch codex/p4-workspace-refinement-20261015 https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner.git D:\Codex验收\P4-build-tools
cd D:\Codex验收\P4-build-tools
# 固定完整应用SHA在交付完成后列于下方；工具自动另建干净固定源码与全新输出目录。
./scripts/build-p1-windows.ps1 -Phase P4 -Revision <完整应用SHA>
```

不将工具默认P1 SHA作为P4版本。不要在有未提交修改的旧仓库强行切分支；工具会拒绝脏源码和已存在输出目录。

## 尚待Windows人工确认

本包WindowsCI仅启动及部分布局/键盘/数据密度烟测；不代表人工视觉验收。1920×1080/2560×1440/3840×2160，适用100/125/150/200%系统缩放、最大化/窗口化/半屏/窄窗、跨不同DPI显示器移动，均需你在实际Windows设备核对宽高。720×600 CSS px核心操作/弹窗/完整图号复制可达，不强求三栏；图号/文件详情拖宽不能破坏主表核对。所有危险操作和真实文件动作仅在隔离样例中验收。
