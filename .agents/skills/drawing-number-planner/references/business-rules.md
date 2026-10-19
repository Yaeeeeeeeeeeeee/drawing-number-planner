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
