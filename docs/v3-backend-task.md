# V3 产品归属与兼容层验证（2026-10-22）

## 范围与实际根因

本报告只依据隔离 SQLite fixture、代码及自动化测试；没有读取用户所述 758 条历史图号的真实数据库，不能提供该数据库修复数量，也未执行生产数据修复。

原链路存在三类不一致：历史扫描的 `product_id`、SKU/型号来自目录识别，只能作为候选；图号库原先直接读取这一字段，未统一读取完整图号对应的可靠业务 ID 证据。旧关联修复还要求独立外观版本，且自动资格依赖 BOM，导致已可靠确认的批次 PDF 与无独立版本的产品无法获得同等关联。新建产品自动建立“初始外观”进一步把产品身份与独立版本对象捆绑。

现在图号库查询、未关联筛选与导航数量共享 `effectiveDrawingProductSql`。可靠证据来自正式规划产品 ID、人工绑定、BOM/已完成外发的精确 drawing ID，以及已确认批次归属与 PDF 精确 drawing ID；全部规范化为现有产品身份。目录 SKU/型号、扫描字段、相同编码前缀不能自动确认；不同可靠产品证据冲突时不自动覆盖。已有人工绑定继续保留，诊断会揭示冲突。

## 修复前后数量（隔离 fixture）

`tests/core/v3-drawing-product-association.test.ts` 的“repairs unique exact BOM evidence…”场景：

| 指标 | 确认写入前 | 确认写入后 |
| --- | ---: | ---: |
| 历史图号总数 | 1 | 1 |
| 图号库可靠查询已关联 | 1 | 1 |
| 图号库可靠查询未关联 | 0 | 0 |
| 已持久化人工绑定 | 0 | 1 |
| 尚无持久化绑定 | 1 | 0 |
| 新增审计 | 0 | 1 |

这是一条无独立外观版本、BOM 精确历史图号 ID 唯一确认产品的样例。原历史图号行逐字段保持不变；原 BOM 引用未改写。可信证据还可直接在查询时显示产品，因此“可靠查询关联数”与“已持久化绑定数”不是同一指标：该样例确认前已经可以可靠查询到产品，确认操作只补充既有绑定表和审计。

另一个已确认批次 PDF 场景证明：查询产品树、历史图号表与未关联数量无需持久化修复即可一致，`query_only` 下读取成功，读取前后数据库字节一致。目录候选场景仍为未确认；两产品竞争 BOM 证据场景仍为冲突，自动写入为 0。测试未发现强制归属；上述保留场景正是防止错误归属的验证。

## 数据与接口

- 新建产品只创建现有产品身份，不创建独立外观版本；字典外观编码仍保存。
- 规划可只传 `productId` / 字典 `appearanceId`。产品归属绑定与占号同一事务，`appearanceVersionId` 可空；显式旧版本参数仍保留归属验证。
- `DrawingAssociationTarget.appearanceVersionId` 为可选/可空；预览提供 `automaticEligible`、精确证据、指纹与汇总。确认返回 `updated/before/after/backupPath`；`historicalAssociated/plannedAssociated` 与图号库有效归属使用相同 SQL，另列 `historicalConfirmedBindings/plannedConfirmedBindings` 统计已保存绑定，避免把持久化可靠证据误报为新增产品归属。人工更正继续使用既有绑定与审计。
- v18 仅移除绑定表 `appearance_version_id` 的 NOT NULL 约束。旧版本表、历史外键、所有旧绑定值、索引、触发器与其他业务表不变。迁移会备份；事务内逐表比较旧业务行并检查外键。故障回归证明版本登记失败会完整恢复旧约束与旧记录。
- 未添加应用启动时修复；产品创建/修改不隐式执行归属写入。兼容的显式 `diagnoseProduct(autoApply:true)` 使用原有指纹预览/确认/备份事务管线，当前生产代码没有该选项的调用点。
- 磁盘数据库的确认修复先生成可读取的备份，测试验证备份中仍无新绑定/审计且历史图号完整。内存 fixture 不生成磁盘备份。显式历史产品候选确认会在其外层事务开始前创建磁盘备份，随后原子创建产品、绑定与审计；拒绝会绕过该备份时机的嵌套磁盘事务。新增磁盘 fixture 验证备份仍是原始空产品归属，尚无新产品、绑定和审计。
- 正式图号、历史图号及永久占号不改写；无释放操作，无源 PDF 文件操作，无 BOM 或外发快照重写。

## 验证证据

初次聚焦 13 文件：192 通过、1 失败。失败是旧 drawing-query 测试同一 fixture 已断言导航未关联为 1，却断言筛选未关联为 0。已改为两者精确一致，符合冲突保留要求。

后续实际通过：

- `node node_modules/vitest/vitest.mjs run tests/core/v3-drawing-product-association.test.ts tests/core/drawing-query.test.ts tests/core/product-service.test.ts tests/core/file-navigation.test.ts tests/core/qr-service.test.ts`：5 文件 67 项通过（随后新增一项磁盘备份回归）。
- `node node_modules/vitest/vitest.mjs run tests/core/v3-drawing-product-association.test.ts`：9 项通过（后续补充候选确认备份回归见下），包含磁盘修复备份、精确批次 PDF 只读归属、无版本产品规划及绑定失败回滚。
- `node node_modules/vitest/vitest.mjs run tests/db tests/core/appearance-service.test.ts tests/core/bom-service.test.ts tests/core/drawing-association.test.ts tests/core/planning-service.test.ts tests/core/product-cleanup.test.ts tests/server/planning-api.test.ts tests/server/appearances-api.test.ts tests/server/appearance-client-contract.test.ts`：16 文件 187 项通过，包含 v18 迁移/回滚、WAL 备份与旧版迁移兼容。

完整测试、构建与 Windows 验收由集成任务另行记录，不以此处聚焦结果代替。

复核发现并修复：历史产品候选确认原先在外层事务内调用关联写入，导致内部备份被跳过。现已将该动作备份提前至事务之前，磁盘回归覆盖备份内容及修复后的审计。

最终指标修正后再跑 `node node_modules/vitest/vitest.mjs run tests/core/v3-drawing-product-association.test.ts tests/core/drawing-association.test.ts tests/core/drawing-query.test.ts tests/server/appearances-api.test.ts`：4 文件 44 项通过（V3 专项 10 项）；`node node_modules/typescript/bin/tsc --noEmit --pretty false` 通过。
