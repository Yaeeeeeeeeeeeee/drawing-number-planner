# 本分支开发进度管理

每次开始/恢复工作，先读取 PROGRESS.md、NEXT_STEPS.md、docs/progress.json 和 docs/superpowers/plans/2026-09-22-second-acceptance-corrections.md，再核对 git 状态及对应代码测试。不得只凭聊天摘要决定进度。

每完成有意义的实施或测试步骤，更新 docs/progress.json 的逐项状态/证据/时间和任务日志，再执行 `node node_modules/tsx/dist/cli.mjs scripts/update-progress.ts` 生成 PROGRESS.md 与 progress.html。同步维护 NEXT_STEPS.md。

30项编号和名称必须与 docs/second-acceptance-requirements.txt 一一对应。仅整项验收通过并记录证据才标记已完成，不以提交/测试数量估算完成率。静态页面只报告上次保存状态，不声明执行器在线。

看板是独立开发工具，不入业务菜单、不读写业务数据库。不合并 master，不改原始 PDF，不扩大二维码业务模型。
