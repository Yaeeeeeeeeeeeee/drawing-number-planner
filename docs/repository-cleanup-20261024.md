# 正式版本仓库整理

整理前保留已验证源码 ceaf7ac 及永久 Release rollback-v4-20261023（安装器、源码 Tag、SHA256 与恢复说明），原 P4/V3 里程碑继续保留。无远端 Release/Tag 删除、无强推或提交历史改写。

## 已检查后移除

六份2026-10-12隔离样板草稿：dictionaries-ui-v1-mock.md、migration-ui-v1-mock.md、planning-ui-v1-mock.md、products-bom-roundtrip-mock.md、products-exit-guide-mock.md、recovery-ui-v1-mock.md（原均在 docs 下）。全仓跟踪文本引用检查没有调用或文档依赖；其样板约束已由正式业务实现、当前 Skill 和真实测试替代，旧测试依赖失败/未实现待办不再作为当前说明。源码、测试和构建未读取这些 Markdown。需要追溯时可从清理前提交恢复。

移除 .github/workflows/p2-windows-acceptance.yml 和 p3-windows-acceptance.yml：仅引用自身、固定退休的样板提交、使用同一旧打包逻辑，不参与当前正式构建或原生运行库来源；保留历史运行及 Git。另移除本轮仅用于读取既有失败窗口工件的临时 inspect-installer-evidence.yml。

## 合并与保留

README改为当前功能、正式下载、核心规则及安全概览；安装/升级/恢复与维护发布分别集中到 install-and-upgrade.md、maintenance.md。Skill主文件改为当前规则路由，旧历史设计由五份参考和必要原始需求/验收记录追溯。NEXT_STEPS只保留当前待办，历史任务日志仍存于 docs/progress.json 与 Git。

未删除仍被测试或开发入口调用的样板代码/数据，未把 legacy/backup 字样当作无用依据。保留所有数据库迁移、产品身份/外观兼容服务、图号永久占用与释放资格、历史 BOM/外发快照、索引保护、旧回归夹具及 P4 运行库交付所需脚本。业务层中本轮已被替代的版本列、重复历史文件卡片及常驻批次铅笔随功能修正移除，没有额外删除业务模块。

根目录无受跟踪的程序安装包或业务数据库需要清理；不触碰本地业务资料。新增忽略 installer、Comprehensive-Windows、existing-p4、TypeScript缓存和系统临时文件，原node_modules/dist/work等忽略继续生效。

清理后重新执行完整自动化、类型、前端/Main构建和Windows实际安装运行；实际证据在本轮交付说明及Release验证报告中。用户正式库和物理DPI不在本环境验收范围。
