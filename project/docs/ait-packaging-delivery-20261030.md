# AIT 包材模板工作流实现与验证

## 使用

1. 保持当前本地资料根目录；在「包材模板」上传真实 `.ait`，选择实际编码项目和适用产品，配置命名对象→数据字段及必须字体。
2. 在项目生成配置选择 AIT、人工提供或无需生成，并定义数字/文本参数。尺寸档案独立于 BOM，可多个指定产品共用，指定规格优先，默认规格按产品保存。
3. 根据模板配置尺寸比较规则。长宽可互换，高度不交换；多个符合时由用户选择。临时尺寸不回写原规格；另存或改默认需要明确操作。
4. 规划并确认占号，然后「生成文件」。创建或继续实际产品任务，目录存在歧义时明确选择。人工 PDF 放入同级 `00.临时文件`，稳定后自动发现；未知文件在任务中手动关联。
5. 每个文件可预览或在本机 Illustrator 检查/修改；核对当前文件后确认。文件内容变化使旧确认失效。
6. 归档预览全部通过后统一确认。新建进入02；修改任务保留已验证原件备份。归档/索引失败保留任务目录，可重试索引。
7. PDF 文件中心保留全量扫描，并可在选定产品后使用「扫描当前型号」。临时00始终排除正式索引。自动监听仅处理已创建00或有未完成制图任务的产品，升级不突袭扫描所有旧产品。

## 代码与数据

- `src/core/packaging/`：目录及 immutable AIT 资产、独立尺寸/匹配、持久任务、稳定文件操作、归档日志、监听、本机 Illustrator/JSX。
- `src/db/schema-v24-packaging.ts` / `migrations.ts`：Schema24，旧行/旧列/FK保护、先验证备份、迁移回滚。
- `src/core/files/`：指定产品扫描约束扫描前后快照、差异、缺失、批次和管理状态，不只是过滤返回列表；文件写入中或观察不完整拒绝提交。
- `src/server/routes/packaging-*.ts` / `start-server.ts`：本地安全 API、task/item ID 文件动作、启动恢复、监听/任务退出排空。任务固定原根目录，切换设置后旧相对路径不得指向另一份文件。
- `src/renderer/pages/PackagingTemplatesPage.tsx`、`packaging/`、`PlanningPage.tsx`、`FilesPage.tsx`、`packaging-client.ts`：真实表单、任务、确认、备份和局部刷新。
- 新增测试见 `tests/core/packaging*`、`tests/core/illustrator-automation.test.ts`、`product-scoped-scan.test.ts`、`file-scan-stability.test.ts`、`tests/db/migrations-v24.test.ts`、`tests/server/packaging/`、`tests/renderer/packaging*` 和 `tests/e2e/ait-packaging.spec.ts`。

## 已定位并修复的问题

- 原扫描仅全量，归档后无法限定之前的索引/缺失比较：增加真实 scope，所有相关读取和更新同一范围。
- 原项目没有临时目录监听：增加生命周期管理的 fs.watch、启动与周期补查。首次配置根目录/创建任务必须即时刷新监听，不能等下一轮60秒。
- 人工确认与设置异步竞态：复用 task 操作锁，确认绑定当前文件哈希。
- 归档已清理但数据库未记完成的中断：用已索引日志、正式文件和备份验证完成恢复，不能要求已清除的临时源重现。
- 未改内容的修改任务仍须保留备份；复制中断必须用持久原始哈希安全重试。
- 已关联输入文件名被新内容复用时重新进入待关联；自动匹配失去唯一性时清除旧自动选择，不继续静默生成。
- 修改归档后的页面回到创建任务时同时刷新图号文件事实，避免正式源文件已存在但选择列表仍旧。

## 验证状态

- 最终完整自动化：212 文件、1793 项通过；命令 `vitest run --maxWorkers=2`，退出0。
- Chromium真实端到端：13项通过，包含隔离数据库/文件、规划前临时尺寸→占号→任务、监听自动发现、手动关联、归档与修改备份实际哈希检查；其余邮件、BOM、二维码和原有工作流一并回归。
- TypeScript、前端和Main构建通过；无新增依赖。
- 独立复查：六项已复现的并发/归档恢复问题修复并有回归；最终规划交接/监听/退出集成复查无新增实质问题。
- Windows安装后业务验收：[运行41080505744](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/actions/runs/41080505744)成功，源码`541219c6dc17e7d6a207c2ed58f4b20bb41bd614`。实际中文/桌面安装、旧库15升级24备份/WAL/回滚、既有业务及新AIT任务目录/真实文件/哈希/归档/备份/真实进程重启全部通过；两次同版本重装及新旧库选择通过。

全量期间发现旧测试Proxy将新增可选API伪装成函数，以及两个外发测试在异步预览未结束就点击禁用按钮；修正测试夹具和等待可用条件，未修改恢复/外发业务代码。最终完整运行全部通过。

实际旧 Schema23 测试库复制升级24：52个原业务表旧列值逐行相同、备份仍23可读、外键无错、重开24幂等。原始业务库/Excel不随源码或安装包发布。

无真实 AIT 和授权 Illustrator：真实自动制图、字体替代、版式一致性及可编辑 PDF 重开尚未验证。此限制不能由上传合约样本、JSX VM或人工PDF归档成功代替。用户本地正式数据库和物理显示器 DPI 同样不在开发环境。

Windows前轮的任务归档功能已执行成功；重启验收脚本误把正常补扫元数据当业务变化。PDF表无product_id，改用已确认索引ID，只有该文件的scanned_at及last_seen_scan_run_id允许变化；内容、图号关联、其他文件和任务均需不变，新扫描限对应产品且变化仅unchanged。新增8项校验覆盖误改归属、内容、其他文件、任务和越界扫描，最终全量通过。

## 提交与发布

- `67a21a7`：Schema24、模板/尺寸/匹配、本机适配、持久任务、监听、归档及UI主实现。
- `72ce39e`：隔离真实浏览器夹具及启动恢复校验。
- `1c0e92a`、`e191f6a`：旧恢复Proxy、外发异步点击测试夹具修正。
- `541219c`：按真实索引ID验证启动补扫，保持业务与其他产品严格不变。
- 正式源码Tag：`v1.4.0`固定`541219c6dc17e7d6a207c2ed58f4b20bb41bd614`。
- Windows同次工件：Setup ZIP SHA256 `83cd7908a0d3912b7614f2785630a6bcaab2fe1519c2513879ae17220fa11d48`；Verification ZIP SHA256 `62a7591e086c6f5392d7135baf82c8a12ad86895ac5c707c0d909b9fd1cd2a80`。这是Actions工件ZIP摘要；最终EXE摘要以Release的SHA256SUMS为准。
- 安装前关闭程序并完整备份数据目录，下载新安装器、选择原planner.db继续升级24。真实AIT字段名/字体需本地配置；不需要清空数据库或重扫全库解决兼容。

## 公开交付核验

[正式Release v1.4.0](https://github.com/Yaeeeeeeeeeeeee/drawing-number-planner/releases/tag/v1.4.0)，发布运行41081678867成功。公开安装器和验证ZIP已实际下载，匹配Release的SHA256SUMS；EXE头为MZ，实际Windows截图已查看，报告确认安装版本1.4.0与源码541219c一致。

- `DrawingNumberPlanner-1.4.0-Windows-x64-Setup.exe`：145163780字节，SHA256 `bb2e031ff0347a4ace290a9d3643d2959969bb0796ede90e0d3229dd6b011d91`。
- `Verification-Windows-1.4.0.zip`：7244166字节，SHA256 `041a0b44cf305ec75bc04509fdb4d9b26240fb575aedfbfd1a5e17f7c2ce3bbe`；92张Windows截图，未包含DB、PDF、AIT或XLSX原始夹具。
- 报告中 `realIllustratorGeneration=false`、`editablePdfReopenVerified=false`，明确保留真实Adobe验收限制，不把人工PDF与上传合约样本冒充真实自动制图。

本地仍需：备份旧数据后继续原planner.db升级24；保持原资料路径；导入真实AIT，核对命名文字对象映射与字体，先单文件生成并在本机Illustrator重新打开确认版式和可编辑性；物理DPI另行核对。ZC100或其他真实产品归并不在启动时执行。
