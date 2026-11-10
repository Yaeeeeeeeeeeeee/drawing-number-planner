# v1.6.1 启动修复验证记录（最终验证）

应用修复提交：`3ae9e8b84507b914846b5cb5971fbdce72aa748a`；Windows验收调用修正源码：`8d6c9e87eaae5ed9c12ab74de7885b6167a0ac5c`，Schema25。首轮Windows运行42868770302的安装/旧库/业务通过，但新增大库脚本调用失败；已修正验收入口并重跑。最终正式候选源码：`a296e04ee1570d9af6721a4879a60261cdb2cd6a`。最终Windows运行 [42872891491](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/42872891491) 全部成功，正在发布并核对公开附件。

## 数据边界及诊断

未连接或操作用户电脑的535MB/980MB数据库、profile.json、本地资料目录或真实PDF/AIT/AI。两份库的内容差异及现场唯一根因尚未确认。已证实旧控制器的15秒等待覆盖全部同步初始化，且缺少阶段/退出诊断。新增的停止/再次启动竞态已独立复核并修正，但不能据此断言是用户现场唯一原因。

## 已执行

- 最初基线：4文件42项通过。
- 控制器RED：6项失败；阶段等待、诊断、迟到就绪修复后19项通过。
- 启动入口RED：3项失败；实际初始化进度、健康失败和失败选库提示修复后专项5文件57项通过。
- 停止/启动竞态：独立复核发现1项Important；新用例先失败，再修复并通过。重复同阶段进度、健康失败后的端口复用也已覆盖。
- 观察时间验收：原AIT验收将scannedAt变化视为关联变化；新增断言用例先失败，修复仅允许已知索引的扫描时间变化，继续严格比较ID、路径、关联等全部其他事实。复核后专项4文件41项通过。
- 真实进程隔离测试：960MiB载荷，数据库1,008,640,000字节；启动7285ms、重启3934ms。HTTP健康、行数、FK、相同数据库路径通过。**此机器未复现耗时超过15秒**，不能用它证明用户原库已恢复。
- 类型检查与renderer/Main构建通过。构建保留既有大chunk提示，无新增依赖或Schema迁移。

## 完整回归尝试及剩余验证

首次完整执行在实施期间读到尚未修正的停止竞态及1.6.1发布白名单：232文件中2文件失败，1980项中2项失败；两项随后修正并专项通过。

第二次完整执行使用4个worker，同时运行浏览器，在2CPU执行环境中出现多项5秒超时及监听时序失败：232文件，21项失败。最终已按单并发、CLI测试/钩子超时30秒重新整套运行：**232文件、1981项全部通过**，496.43秒。命令 `npm test -- --maxWorkers=1 --testTimeout=30000 --hookTimeout=30000`。不修改项目默认配置，不将先前失败记录为通过。

第二次失败名称：

- tests/read-only-workspace.test.ts > serves existing data read-only, rejects writes before handlers, and preserves database bytes and rows
- tests/core/dictionary-permanent-deletion.test.ts > explicit permanent dictionary deletion > preserves deleted children and rolls back a failed physical delete
- tests/core/file-navigation.test.ts > PDF navigation statistics > aggregates beyond the list page limit without parsing filenames or fetching list pages
- tests/main/database-selection.test.ts > rejects future without modifying target or saved profile
- tests/main/database-selection.test.ts > rejects incompatible without modifying target or saved profile
- tests/main/database-selection.test.ts > rejects foreign-key without modifying target or saved profile
- tests/main/database-selection.test.ts > rejects a selected filename that would resolve to a different runtime database
- tests/main/database-validation.test.ts > rehearses a genuine v15 ledger without changing bytes, then backs up before upgrading
- tests/main/database-validation.test.ts > validates committed WAL pages without touching any source file and backs them up independently
- tests/main/database-validation.test.ts > rejects missing or changed trigger safety constraints even with an intact ledger
- tests/main/production-profile.test.ts > preserves the previous profile marker and database on cancel after reinstall, and asks again next time
- tests/main/production-profile.test.ts > preserves the previous profile marker and database on file-cancel after reinstall, and asks again next time
- tests/main/production-profile.test.ts > rejects a database with valid SQLite magic but damaged-data-page before saving the installation choice
- tests/main/production-profile.test.ts > production entry reads the installer marker outside resources/app (marker present: true)
- tests/main/production-profile.test.ts > production entry reads the installer marker outside resources/app (marker present: false)
- tests/renderer/files-mock.test.tsx > PDF renderer-only preview isolation > opens files directly without recovery, business API, or desktop calls
- tests/renderer/files-mock.test.tsx > PDF renderer-only preview isolation > isolates missing cleanup and cancellation through actual UI controls
- tests/renderer/outbound-mock.test.tsx > outbound isolated UI mock > routes exclusively to Mock and performs package, mail, copy, history and maintenance without real calls
- tests/server/dictionary-permanent-deletion-api.test.ts > requires exact confirmation metadata and returns 204 only after physical deletion
- tests/core/packaging/packaging-monitor.test.ts > preserves the original busy-event time so a later archive scan satisfies its retry
- tests/server/packaging/packaging-template-inspection.test.ts > inspects a selected upload over real HTTP without saving catalog/task rows, moving originals or retaining a settled upload

浏览器最初按仓库Chrome通道启动时，该环境未安装Google Chrome；随后使用已有 `/usr/bin/chromium` 的临时配置执行18项，17通过、1项AIT扫描观察时间断言失败。随后完整浏览器运行16通过、2失败：AIT确认等待及表格ResizeObserver时序；失败项单独复测1通过/1失败。通过明确响应处理TASK_BUSY、在同一弹窗重新确认TASK_DELETE_CHANGED令牌，以及等待布局帧完成修正验收脚本，未改变业务源代码。两项复测通过，最终完整 **18项全部通过（1.7分钟）**。临时Chromium配置保留于work，不进入产品。

Windows最终已通过：中文自定义路径及桌面目录安装、安装文件哈希、真实旧库升级与备份/WAL/回滚、原生选库取消/切换/切回、完整业务及截图、960MiB服务启动/重启。不会自动安装用户电脑。

最终类型/构建证据：`work/startup-timeout/typecheck-before-commit.log`、`build-final.log`；完整回归：`full-suite-serial.log`。工作日志留在开发工作区，正式Release另附本报告。

Windows第二次42869916596在任务删除弹窗等待关闭超时；第三次42871520360明确捕获TASK_DELETE_BLOCKED，原因是任务仍在处理文件。验收脚本现等待实际空闲再进入删除；TASK_DELETE_CHANGED仍在同一弹窗重新获取令牌并再次明确确认。服务端保护没有放宽，其他阻止原因不重试、不绕过。最终候选3ecc8be仅在已通过1981项的应用之上修改验收脚本及布局测试同步；`git diff 3ae9e8b..3ecc8be -- src tests/main package.json`为空。

## 最终 Windows 大数据库实测及故障机制

- 源码a296e04；运行42872891491，安装版Electron及其实际better-sqlite3。
- 数据库1,008,640,000字节，首次启动 **29,317ms**，重启 **3,408ms**；实际HTTP健康、相同数据库路径、载荷行数及外键检查通过。
- 首次数据库校验1,910ms，每日备份阶段 **26,979ms**。首次启动超过旧控制器统一15秒限额，复现了“备份尚未结束就会被旧限额中断”的同类机制；新阶段等待允许完成。仍不能把隔离数据的具体耗时当成用户现场日志，用户两份实际库均未操作。
- 232文件1981项完整回归通过；最终18项Chromium回归通过，之后仅对验收脚本增加实际空闲等待，AIT针对性复测及最新完整18项再次通过。类型检查、renderer/Main构建通过。
- 独立审查发现的停止竞态已通过先失败后通过测试关闭；同阶段重复消息、整体期限、迟到就绪、健康失败端口释放及日志写失败/令牌不落日志均已覆盖。没有待处理的审查阻断项。

## 发布固定信息

- Tag目标：a296e04ee1570d9af6721a4879a60261cdb2cd6a；Schema25，无新增迁移。
- 安装工件13790876366：sha256:6351a649393b045fa37b716214a6121a28893d3aa64536df0d6217a7ce4ff72f。
- 验证工件13790368518：sha256:e9062185f4e014a65d040ca221ef67dc19ededf87e53d2ee7ff3a00b6ecb5179。
- 上述是Actions ZIP摘要，不能当作EXE摘要；公开EXE的SHA256以Release的SHA256SUMS及下载核对结果为准。
- 生产数据库操作记录：无。未连接用户电脑，未更改其配置或数据库、未切库、未运行恢复、未操作原始业务文件。安装后的原库环境恢复由用户本机最终验收。
