# Business rules

## Classification

The classifications in `SKILL.md` are authoritative for this reference. Current rules are deliberately limited to stable decisions; implementation details that may change belong in the code and current project status files.

## Current

- The application is a local-first tool for drawing-number planning, product records, BOM relationships, package-material PDF indexing, QR records, and outbound-material workflows.
- SKU and model are separate product fields. Product directories use the `{SKU}-{model}` convention under a configurable material root.
- A formal drawing number follows the verified Excel coding contract. Appearance code is part of the formal code and participates in generation, duplicate checks, sequence recommendation, and combination identity.
- The occupied-number set includes software reservations and reliably identified historical formal drawing numbers. A reliably identified historical number enters that set by default; it can leave only through an explicit release operation with exact full-code confirmation and reference-safety checks.
- Retained occupancy and released occupancy are distinct. Restoring a deleted drawing preserves its original number.
- Product identity, current business records, historical records, and historical snapshots must remain distinguishable.
- Historical PDF discovery is read-only and must not silently invent product identity, drawing identity, batch meaning, or conversion status.
- Source and converted PDF roles are distinct. Missing files describe material completeness, not drawing validity.
- Current and historical material usage must be distinguishable. A current-file decision must use explicit business-batch semantics; it must not silently use file modification time as a proxy.
- BOM current relationships and BOM historical relationships are separate concerns. Current BOM describes what the product currently uses; historical BOM/snapshots may preserve past drawing numbers and past business state.
- BOM fields for material, dimensions, position, image, diagram, notes, and change details must not be collapsed when the domain requires them separately. Existing QR relationships must survive a UI that currently does not expose QR editing.
- QR is an independent business area. It does not generate drawing numbers or participate in drawing-number occupancy, sequence recommendation, or formal drawing parsing.
- QR business status, file existence, and match/confirmation status are independent.
- Outbound history must preserve the product identity, drawing/file facts, and relevant change-detail snapshot used at the time. Later BOM edits must not rewrite historical outbound records.
- Outbound messages must not expose internal paths, batch sources, database IDs, or other internal storage details.

## Confirmed Backlog

- QR content decoding and automatic URL discovery.
- Batch renaming, richer old-model copying, server synchronization, and server-side difference comparison.
- Any future QR editing UI, including whether it should be restored to BOM editing.
- Further outbound automation beyond the currently implemented workflow.

## Pending Confirmation

- Whether and how an exited product may be automatically restored to current business use.
- Whether future BOM QR editing should return and what authorization rules it should have.
- Any change to batch selection semantics, outbound template defaults, or the current package-size limit.
- Any new cross-product sharing or historical-identity behavior not already covered by current code and tests.

The original Excel workbook is an authority when coding structure, dictionary mapping, historical-number recognition, or a rule conflict is involved. It need not be loaded for unrelated work.

## Current P4 BOM historical editing correction (2026-10-16)

The latest explicit user request makes an existing BOM record's ID, business date (including legacy NULL), original createdAt, predecessor and version identity immutable during ordinary editing. Only an explicit create action may create a new record. Preserve editRevision concurrency and updatedAt; refresh the exact selected snapshot and do not fall back from a missing edit target to POST. The earlier date-correction-and-rearchive behavior is Historical for ordinary edits and must not be restored silently. Preserve unchanged legacy NULL-date attachments without inventing a dated archive; explicit new/replaced managed attachments must still pass existing path/type/size/existence/hash checks. Do not clean up duplicate user rows as part of this fix. See `docs/p4-bom-edit-corrections-20261016.md`.

## 字典永久删除与恢复（2026-10-19）

用户要求编码字典对已删除记录提供永久删除入口。仅已删除且无直接/历史编码引用的记录可物理删除，需完整编码及核对身份，事务内再检查；禁止级联、解除引用或通过旧DELETE绕过。普通删除遇到引用保留字典历史身份。恢复后仍可改名称，编码保持锁定，历史快照及图号字符串不随改名重写。见docs/p4-dictionary-corrections-20261019.md。本次功能授权不等于授权执行用户真实数据删除。

## Current：产品退出选项（2026-10-19 后续）

用户明确要求分别选择占号和是否保留业务历史。界面不可替用户预选；释放必须逐条完整图号确认并复用既有释放规则。永久清除仅涵盖明确属于本产品的BOM/二维码/批次/外发及邮件业务记录，需清除确认和事务重检，范围外引用必须阻止；文件索引和磁盘文件、图号凭据、退出审计保留并明示。这仅取代产品退出全部历史一律保留的旧处理；未选择清除时保持旧历史保护，其他模块不可据此自动清除历史。详见docs/p4-product-corrections-20261019.md。
## Current：整产品批量确认的最新交互（2026-10-19）

用户明确纠正整产品删除须逐个输入图号的不合理要求。仅整产品向导改为一次输入型号、明确选择占号和历史策略、核对数量后确认；完整图号/ID列表从已显示可展开的预检快照自动形成载荷，服务端逐项精确校验和指纹/引用重查不变。历史清除的额外手输短语同样由明确选择和最终确认代替。独立单图号释放不因本交互改动而减省规则。见docs/p4-pdf-navigation-20261019.md。

## Current：综合产品外观与手工二维码、外发V2（2026-10-20～21）

用户已确认并授权完整实施：同一规范产品SKU/型号允许多个独立外观版本，一个当前，其余历史或草稿；归并保留原身份与历史外键，实际归并由用户本地确认。正式占号与产品/外观绑定在同一事务内；明确沿用关系不改原始归属、不自动加入BOM。扫描派生产品信息只作候选，不冒充确认事实。PDF索引清除与忽略不删除磁盘文件；批次改显示名，不按同名合并。二维码为纯手工PDF关联，原有扫描字段保留兼容而不继续自动确认流程。外发V2以用户选择批次为来源、BOM仅辅助，禁止隐式拼接历史批次；具体规则、确认条件和数据安全见当前综合计划及 `docs/outbound-v2-requirements-20261020.md`。本轮确认的批次命名、QR操作与身份归并不再属于上述对应的历史Backlog/Pending条目；未确认的其他跨产品行为仍不可推断授权。

## Current：唯一候选直接归类（2026-10-22 后续授权）

用户明确要求无需先审查直接归类，并保留纠错。独立“一键自动归类”操作可将唯一产品候选（旧扫描产品身份、精确SKU-型号目录及明确业务依据）写入归属绑定，备份、事务、审计及实际保存校验必须齐备。预览本身仍只读；已有明确绑定不自动覆盖，多产品歧义不强选。保留产品关联修正，不改图号、占号、PDF原件、BOM和外发快照，不启动自动修复真实库。此为前述扫描信息仅供人工确认规则的窄范围后续替代。

## Current：图号详情四板块及历史释放资格（2026-10-22最新）

详情只保留基础、文件、业务关联、状态操作，隐藏历史明细不等于删除历史。使用中/历史版本都可发起释放核查；历史扫描、正式启用、旧作废无法证明未使用、受保护历史引用均不放行。仅无引用且可证明未启用的正式reserved允许释放；事务重查包含PDF脱链检测码、软删BOM、外发快照、已删图号关系与删除前引用汇总。旧测试中直接释放历史扫描的行为被本次要求取代。reserved用占位状态保留明确启用操作，不因UI仅两种业务选项就自动启用或允许历史占号复用。详见docs/drawing-detail-four-groups-20261022.md。
