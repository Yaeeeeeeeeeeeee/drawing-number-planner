# master 合并与桌面验收交付（2026-10-13）

## 版本与保全

- 按用户明确授权，master 从 `8c0e40b` 快进至 UI 集成提交 `8bd386a164be642c152007ea55247d989a519f4a`。
- 原 master 已保存为 `backup/master-before-ui-20261013`；未清理原分支和两个工作树。
- 原 master 未跟踪的 `.agents` 已复制至 `C:/Users/Administrator/Documents/Codex/master-premerge-20261013-8c0e40b/.agents`，6 个文件 SHA256 核对一致。原文件未修改。
- 本次额外提交仅包含桌面验收打包工具、验证脚本和交付记录，不改变业务 UI、Schema、API、算法或恢复机制。

## 启动

双击 `C:/Users/Administrator/Documents/Codex/desktop-acceptance-8bd386a-20261013/图号规划器验收版.exe`。

这是可离线运行的 Windows Electron 桌面目录包，不需要开发服务器或另装 Node。必须保留整个目录，不能单独移动 exe。未制作安装器、未签名；不是正式发布验收完成。

首次启动将包内隔离样例复制到 Windows 应用数据的 `DrawingNumberPlannerAcceptance/8bd386a` 下，随后保留验收操作。资料与外发输出必须留在该隔离目录；不打开正式数据库。本机 Codex 的 Windows 应用数据目录存在重定向，使用规范实际路径验证隔离范围。目录缺少版本标记、被链接到其他目录或资料根目录越界时拒绝启动。

## 实装范围

采用 `8bd386a` 中的真实业务页面：编码字典、图号规划、产品档案紧凑预检、二维码第二版详情、迁移检查工作表、外发资料实际结果表及左下角安全恢复入口。图号库、BOM 管理、PDF 文件中心保留本轮已确认版本及原入口。公共 UI 验收台仍仅为开发工具；已否决的三步骤退出向导、APP 式往返 Mock 未接入真实流程。

## 实际验证

- 类型检查、浏览器构建、Main/API 编译：通过；浏览器大文件体积警告保留。
- 全量测试：907 项，900 通过、7 失败。失败位于 `outbound-mock`（1）、暂停的 `product-bom-roundtrip`（5）、`recovery-mock`（1），未将其标为通过。
- 现有隔离数据库 E2E：8/8 通过，涵盖正式占号、BOM、二维码、外发及 PDF 索引等关键流程；测试用临时数据，不操作正式业务数据。
- 独立 exe 实际启动：通过；本地 `/api/health` 返回 200，真实图号规划页面读取到 `PREVIEWF60 · F60` 样例。
- 桌面内容宽度 1080、1200、1280：启动页面均无整页横向溢出；此前其他业务页面宽度证据保留，不将本次单页检查宣称为全模块再次验收。
- 验证脚本再次启动同一版本，已有隔离验收目录正常复用。
- 桌面证据：交付目录下 `desktop-verification.json`、`桌面启动验收.png`、`regression-results.json`。

## 尚待验收

第一批保持条件通过；第二批及整体 UI 仍待用户真实桌面人工验收。完整“恢复应用”后的最终效果、实际生产环境文件权限与运行稳定性未据此自动宣称通过。不能把已知 Mock 失败视为新实装业务流程成功。

## 可回退步骤

无需覆盖 master 或删除任何工作树。关闭验收版后，使用独立回退工作树检查旧 master：

```powershell
git -c safe.directory=C:/Users/Administrator/Documents/Codex/2026-08-24/new-chat -C C:/Users/Administrator/Documents/Codex/2026-08-24/new-chat worktree add --detach C:/Users/Administrator/Documents/Codex/master-rollback-20261013 backup/master-before-ui-20261013
```

此命令要求目标目录尚不存在。旧代码对应原 master `8c0e40b`，与 UI 集成业务基线 `4b7f75a` 不同；另可在独立工作树检出 `4b7f75a` 核对业务基线。依赖和旧桌面运行环境需按旧版本原启动说明准备，不把新版本已迁移数据库交给旧版本。验收数据独立保留，不删除正式数据。若要撤销 master 历史，请另行明确授权；本次不执行强制重置。
