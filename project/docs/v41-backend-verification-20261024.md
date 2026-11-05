# V4.1 图号后端修正与隔离验证（2026-10-24）

本记录只描述源码与隔离夹具。未获得、打开或修复用户正式数据库；没有移动、修改或删除原始用户 PDF。

## 状态根因与修正

历史图号的既有专用启用/停用 API 本来支持双向切换；客户端会将签名负 ID 转为正历史 ID。历史记录 `readOnly` 限制编码/文件绑定，不能据此禁止状态切换，也不需要移除原有文件绑定保护。本轮保留该区分，将历史专用 API 的 ID 校验收紧为正整数。

旧查询对 `status=inactive` 使用单值匹配，遗漏正式 `voided` 及未启用 `reserved`。现在查询和目录计数统一将三个内部值归为停用筛选；不批量重写内部状态。`reserved` 仍是从未启用的占位，保持明确启用和严格释放资格。停用、启用只更新状态列，不释放号码，不修改产品、完整编码、PDF、BOM 或外发快照。

正式图号有明确沿用关系时，服务和 Schema17 引入的 `drawing_usage_planned_update` 触发器都会阻止 `voided`。用户本轮要求这类图号也可正常停用/启用，因此需要 Schema20。该迁移仅重建这一触发器，移除对停用状态的禁止；ID、产品归属、完整编码、删除、释放以及沿用和审计不可变保护全部保留。服务层对应的停用禁止同步移除。

升级沿用现有安全入口：既有数据库先备份，再在独立事务中变更，校验每张原业务表的内容和外键；失败恢复旧触发器、旧数据、旧版本账本和外键开关。Schema20 不增加业务字段、不重建业务表、不迁移或重写历史业务内容。

## PDF 根因与实际查询前后

`DrawingRepository.getDetail` 不按产品默认外观或资料批次过滤已关联 PDF。旧界面先依赖 `batchUsage.occurrences` / `effectiveCurrentFileIds` 判断文件是否进入“当前”栏；批次解析使用内连接，合法未分批文件没有 effective IDs，即使 API 已返回 `isPresent=true` 仍可能被藏入历史并误显示缺失。批次有效性和物理文件存在是不同事实，空 effective IDs 不能代表磁盘文件缺失。界面的候选/歧义展示由本轮前端修正负责。

另外确认了真实后端兼容缺口：正式详情可读取同完整编码、绑定到历史记录的 PDF；历史详情却只读取直接历史 ID，漏掉绑定到同完整编码正式记录的合法旧索引。现将这一明确、精确的已链接完整编码关系补齐到历史详情、存在性谓词与资料批次筛选。不读取未关联的检测码来猜测文件归属，不按时间或最新索引强选文件。

隔离临时目录实际写入 PDF 测试字节，并建立以下索引；缺失项没有磁盘文件：

| 索引 ID | 类型 | 原关联 | 磁盘存在 |
| --- | --- | --- | --- |
| 1 | 转曲前 | 同完整编码正式图号 | 是 |
| 2 | 转曲后 | 同完整编码正式图号 | 是 |
| 3 | 转曲后 | 历史图号 | 是 |
| 4 | 转曲后 | 历史图号 | 否 |

查询负历史 ID 时，旧结果为 source `[]`、outlined `[3,4]`、`hasSourceFile=false`；修正后为 source `[1]`、outlined `[2,3,4]`、`hasSourceFile=true`，缺失 ID4 保留 `isPresent=false`。未分批时 `effectiveCurrentFileIds=[]` 保持真实业务含义。测试核对所有 PDF 索引行和原始文件字节保持不变；同编码多个实例全部保留，不将其任意合并或选为唯一文件。返回文件额外提供 `materialBatchId`，使显式批次查询也可处理缺失文件，而不依赖只含存在文件的 occurrences。

颜色按完整编码第三段中的两位外观编码后的一位颜色码精确查现有字典，例如 `02.0402.020` 中 appearance=`02`、color=`0`。已映射返回字典名称；未知历史颜色显示“未识别”，保留原码，不猜测品牌或产品颜色。

## 验证证据

- RED：停用筛选仅返回历史 inactive，漏两条正式记录；未知颜色返回原码 `9`；历史同编码旧索引查询漏掉 source ID1。Schema20 实施前，新迁移测试三项按预期失败。
- GREEN：`node node_modules/vitest/vitest.mjs run tests/core/drawing-query.test.ts tests/server/drawings-api.test.ts tests/core/planning-service.test.ts tests/db/migrations-v19.test.ts tests/db/migrations-v20.test.ts --maxWorkers=1`：5 文件、66 项通过，10.47 秒。包含双向切换、关闭重开、占号/PDF/BOM/沿用/审计保留、释放保护、索引及缺失标记、迁移备份/回滚/自定义 schema 对象和外键保护。
- DB 全集：`tests/db` 的 10 文件、96 项通过。旧版本迁移测试的“最终 latest”断言同步为20，刻意的19夹具/触发器/回滚边界保留；未来版本拒绝测试改为21。
- 本地交付校验：`tests/main/comprehensive-delivery.test.ts --maxWorkers=1` 的4项通过，包含真实隔离 SQLite v15→20、WAL 备份、失败回滚和重启。初次沙箱执行的 Node 子进程被 EPERM 阻止；使用允许本地子进程的执行权限重试通过，未通过改测试规避。
- `scripts/verify-comprehensive-database.ts` 的升级审计和 `scripts/repack-comprehensive-windows.mjs` 的元数据同步到20；交付测试实际构建并运行数据库校验脚本；repack 脚本语法检查通过。本记录不宣称已执行完整 Windows 打包或原生验收。

全量应用测试、最终构建和 Windows 安装验收由主任务集成后记录，不以这里的专项通过代替。
