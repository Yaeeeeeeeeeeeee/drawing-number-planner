# 第一批 P0 Windows 验收包交付报告

2026-11-20（中国标准时间） · **1.6.2 / Schema26** · 固定源码 `ca5d58a430983b9875fe7ac46152f65561e9bdad`。

[下载 Windows x64 验收安装器](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/download/v1.6.2-p0-acceptance/DrawingNumberPlanner-1.6.2-P0-Windows-x64-Setup.exe) · [验收版全部附件](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.6.2-p0-acceptance)

文件为 147,190,675 字节。已从发布地址重新下载并验证 SHA256：
`d8b107b3608e9f08080236583a7b8b75525af444073a0653da79fb3eca743c3c`。

## 修复范围

上一次 Windows 失败是因为重启补扫先设置强制脱钩诊断，再被通用删除抑制规则覆盖。改动在扫描提交时保留已生成的强制脱钩诊断。同一隔离夹具确认强制脱钩前后的处理：重开 SQLite 后补扫，比较原索引 ID、正式及历史绑定、索引内容哈希、诊断、隔离记录及外键。实现与测试共两个文件。Schema、编码、占号、发布前的原生验收脚本及 Windows 安装构建脚本保持原版。

- [扫描实现](../../../../src/core/files/file-repository.ts#L251) · [回归测试](../../../../tests/core/v5-force-release.test.ts#L63)
- [修复前复现](red.log) · [修复后 94 项专项](targeted.log) · [类型检查](typecheck.log) · [源码构建](build.log)
- [上一次失败记录](../p0-ci-delivery/TEST-REPORT.md)

## Windows 结果和交付

原有 GitHub Actions `windows-latest`、Node.js 24、pnpm 11.25.0、项目固定的 v1.2.0 运行时与 Inno Setup 流程通过。原生验证包括中文安装及桌面路径、359 个已安装文件哈希比对、960 MiB 隔离数据库启动与重启、旧库升级与备份回退、原生数据库重选，以及上次失败的 PDF 重启保护断言。原生验证证据 ZIP 从 Actions 下载后通过 CRC 和 SHA256 检查。

- [Windows 构建与验收运行](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/44687980891) · [完整 Windows 构建日志](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/download/v1.6.2-p0-acceptance/Windows-build-logs.zip)
- [Windows 原生验证附件](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/download/v1.6.2-p0-acceptance/Verification-Windows-1.6.2-Verified.zip) · [发布附件 SHA256](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/download/v1.6.2-p0-acceptance/SHA256SUMS.txt)

发布阶段沿用项目既有的发布工作流，在单独交付分支固定新运行与产物哈希。验收标签 `v1.6.2-p0-acceptance` 指向应用源码提交，发布记录标记为预发布。原正式 `v1.6.2` 标签与已发布安装器保留。真实 SMB/NAS、生产 ZC 档案 ID 和用户本机仍待现场验收。

## 修复后完整回归

以下命令从隔离源码副本执行，Vitest 与 Chromium 分开运行，各有独立临时夹具目录。

| 命令 | 结果 |
| --- | --- |
| `npm test -- --maxWorkers=1` | 241 个文件，2,130 项通过。[日志](vitest.log) |
| `npm run test:e2e -- --config /tmp/planner-p0-native-fix/playwright.config.cjs` | 30 项通过。[日志](playwright.log) · [配置](playwright.config.cjs) |
| `npm run typecheck` | 通过。[日志](typecheck.log) |
| `npm run build` | 通过。[日志](build.log) |
