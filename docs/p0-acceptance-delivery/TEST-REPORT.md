# 第一批 P0 Windows 验收版测试报告

- 版本为 **1.6.2 / Schema26**，固定应用源码 `ca5d58a430983b9875fe7ac46152f65561e9bdad`。
- 上一轮 Windows 运行 44684112424 在重启后发现强制脱钩诊断由 `drawing-force-released` 变为 `drawing-released-ignored`。本轮隔离测试对该问题先复现再修复，核对了索引 ID、绑定、PDF 哈希、隔离记录和外键。
- 修复后的专项 94 项、类型检查和构建通过。批准的既有联合基线在修复前通过 2,129 项 Vitest 和 30 项 Chromium。
- [Windows 原生运行 44687980891](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44687980891)通过。覆盖 Inno Setup、中文安装和桌面目录、安装文件哈希、960 MiB 库启动和重启、旧库升级、备份和回退、原生数据库重选，以及包含本次重启断言在内的安装版综合验证。
- 实际 SMB/NAS、用户本机和生产 ZC 档案 ID 仍待现场验收。验收用样例数据未纳入安装包。
