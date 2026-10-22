---
name: drawing-number-planner
description: Preserve and apply the confirmed business rules, data-safety boundaries, and acceptance principles of the Drawing Number Planner project. Use for changes, reviews, debugging, migrations, UI work, or domain questions in this project; do not treat historical documents or current implementation details as permanent rules without verification.
---

# Drawing Number Planner

Use this skill only for the Drawing Number Planner project. Its purpose is to preserve confirmed domain decisions and prevent accidental restoration of superseded behavior.

## Before making decisions

First inspect the actual working tree, current implementation, `src/db/schema.sql.ts`, `src/db/migrations.ts`, and the latest `PROGRESS.md` / `NEXT_STEPS.md` when present. Treat code and current migration behavior as implementation evidence, not automatically as business policy.

Classify every relevant statement as exactly one of:

- **Current** — stable, confirmed business rule suitable for implementation.
- **Confirmed Backlog** — confirmed direction, but not implemented or not part of the current scope.
- **Historical** — retained for traceability only.
- **Deprecated** — explicitly superseded; do not restore without a new request.
- **Pending Confirmation** — unresolved or requiring a new user decision.

Only **Current** rules may silently guide implementation. If code, schema, documents, and tests disagree, report the discrepancy and preserve data until the user resolves any material ambiguity.

Read the topic reference needed for the task:

- [business-rules.md](references/business-rules.md) for domain behavior and classification.
- [data-safety-and-storage.md](references/data-safety-and-storage.md) for paths, files, migrations, destructive actions, and isolation.
- [schema-and-domain-model.md](references/schema-and-domain-model.md) for domain entities and how to verify the live schema without hard-coding a version.
- [ui-and-acceptance.md](references/ui-and-acceptance.md) for interaction principles and verification gates.
- [historical-and-deprecated-rules.md](references/historical-and-deprecated-rules.md) when evaluating old designs or compatibility questions.

## Non-negotiable boundaries

- Do not infer a permanent rule from a branch name, current port, temporary database, test count, current data count, or a single acceptance snapshot.
- Do not modify, move, rename, or delete original user files during indexing or acceptance work unless explicitly authorized.
- Do not release an occupied drawing number without an explicit release action, exact full-code confirmation, reference-safety checks, and clear confirmation.
- Do not silently guess when product identity, batch meaning, file ownership, BOM history, or outbound mapping is ambiguous.
- Do not merge branches, start a new phase, or operate on real user data unless the request explicitly authorizes it.

When a task changes a rule, update the classification and supporting reference only after the user has confirmed the new behavior.


<!-- drawing-number-planner-ui-baseline-20261013 -->
## UI baseline and acceptance evidence

For UI, desktop delivery, acceptance claims, or changes affecting confirmed rules, read [the UI baseline and acceptance supplement](references/ui-and-acceptance.md#ui-baseline-and-acceptance-supplement-2026-10-13) and the project documents `docs/approved-ui-alignment-20261013.md` and `docs/desktop-acceptance-20261013.md`. These are dated evidence, not blanket authorization or proof of final acceptance.

Preserve confirmed module layouts and real business safeguards. Keep candidate UI, automated verification, conditional acceptance, manual desktop acceptance, and final release acceptance separate. Before concluding future work, check whether it changes a Current rule, a module UI principle, a deprecated design, or an acceptance boundary; update only affected Skill guidance when a confirmed rule actually changes. Report missing evidence and unresolved discrepancies rather than promoting a candidate or test result to human approval.


<!-- drawing-number-planner-workspace-20261014 -->
## Current UI direction (2026-10-14)

For future UI work, also read [the current workspace supplement](references/ui-and-acceptance.md#minimal-engineering-workspace-supplement-2026-10-14), `docs/minimal-engineering-workspace-design-20261014.md` and `docs/minimal-engineering-workspace-acceptance-20261014.md`. These confirmed decisions supersede conflicting earlier visual constraints only; preserve the 2026-10-13 historical evidence and all business protections. P0 design approval alone does not authorize implementation. Check the latest explicit phase authorization; the 2026-10-14 P1 authorization and evidence are routed by `docs/p1-minimal-workspace-20261014.md`. P1 does not authorize P2 or later phases.

### Later P2 authorization and P1 feedback

The user subsequently gave preliminary approval to P1 and explicitly authorized fixing narrow product/dictionary action wrapping and left-aligning PDF filenames, then continuing directly into P2 for combined acceptance. Read `docs/p2-workspaces-20261014.md` and `docs/superpowers/plans/2026-10-14-p2-workspaces.md` for that scope and fresh evidence. This does not authorize P3–P5, merge, production data, embedded PDF preview or draggable widths. Preliminary P1 approval is not full Windows/DPI or release acceptance.

### P3 authorization (2026-10-15)

The user explicitly authorized P3 and included PDF/dictionary/planning feedback. Read `docs/p3-module-alignment-20261015.md`: module headings use one Chinese title and one Chinese description, without English eyebrows; PDF table columns center except the filename, with single-line batch and batch state; opening file detail preserves list width with local scrolling; dictionary columns align with their toolbar; planning item numbers remain single-line. P3 preserves all confirmed information structures, business actions, semantic colors and historical evidence. No P4 resizing, merge or production-data authorization follows.

### P4 authorization and current refinements (2026-10-15)

User explicitly authorized P4 including latest feedback. Read `docs/p4-workspace-refinement-20261015.md` and the P4 plan. PDF now scrolls only its central file table; product/batch navigation stays fixed and file detail overlays that central workspace, with the narrow modal preserved. Product QR entry is a direct list of real purposes/states rather than a count disclosure. P4 permits constrained, keyboard-accessible panel resizing and reset without persistence; planning/outbound gain visual stage grouping while keeping existing business actions, validation and manual-draft protection. Historical P3 scroll and QR disclosure requirements are superseded only by these confirmed UI changes. No P5/merge/production-data authorization follows.

### Latest P4 existing-data adaptive layout (2026-10-15)

Read `docs/p4-adaptive-data-workspaces-20261015.md` for the user's later all-page width/height refinement. It supersedes the earlier P4 wide PDF overlay: dock detail beside the primary list when the measured width budget permits, use a drawer when narrow, and preserve independent scrolling, resizing, focus and selection. Data regions may use full available width/height while controls remain bounded; preserve complete pagination and all record/history semantics. For this refinement, use existing data read-only and do not create/clone records or run the old 40-record seed to simulate density. Earlier sample evidence remains historical, not real-data acceptance. Explicitly report missing populated data, physical 4K/Windows DPI and native-window evidence. No P5/merge/production write authorization follows.

### Latest P4 BOM query history refinement (2026-10-16)

For the later explicit query-only history comparison request, read `docs/p4-bom-history-comparison-20261016.md` and the matching supplement in `references/ui-and-acceptance.md`. This authorizes summaries, reliable matching, changed-field filtering, project folding and verified historical attachments only in query details. Earlier path hiding is superseded here only by on-demand disclosure; all data safety and manual Windows acceptance boundaries remain.

### P4 historical edit and detail corrections (latest 2026-10-16)

Read `docs/p4-bom-edit-corrections-20261016.md` and the matching business/UI reference supplements. The latest user request explicitly protects original record identity/date/submission time and count on edits, separates batch metadata from field cells, puts copy icons beside values, and removes QR from BOM query fields/diff counting without deleting relationships. This supersedes preceding date-correction/inline-batch-details presentation only; no duplicate-data cleanup, Schema/merge or production write authorization follows.

### Latest BOM copy-control removal (2026-10-16)

The user subsequently requested no copy buttons in BOM details. BOM query first/history fields, batch disclosures, historical attachment path disclosures and edit comparison display complete selectable text without copy controls. This supersedes the preceding inline-copy requirement only within BOM; retain copy actions in other modules and all business/data protections.

### Product archive table and purpose navigation (2026-10-16)

Latest explicit request: see docs/p4-products-list-20261016.md. The real product archive uses exactly eight combined identity/specification/status/purpose/action columns, with only Edit in row actions. No inline detail/edit expansion; lifecycle and protected cleanup remain in the separate product editor. Standard purpose status links use product identity and stable purpose keys; missing, single and multiple records have distinct navigation without automatic writes. Returning preserves filters/scroll and refreshes QR business states; file availability does not infer business state. This supersedes earlier product expansion/dynamic-purpose-column UI rules only. User explicitly paused Windows-package delivery pending further requests; do not package automatically. Preserve Schema, uniqueness, inactive-product creation restrictions and all data safeguards.

### P4 用户确认及 master 合并授权（2026-10-17）

用户确认本轮版本，并随后明确要求“合并到master”。本次将已交付的 fc236a6 应用及后续文档合入 master 已获授权，替代此前 P4 未授权合并的限制。保持既有测试失败、物理Windows/DPI证据边界的诚实记录，不因此修改已确认应用、真实业务数据、Schema或历史文件。合并记录见 docs/p4-master-merge-20261017.md。

### 浮动工作导航（2026-10-19）

最新明确UI要求去掉应用内顶部横栏，目录默认展开。宽度允许时浮动样式目录与业务内容并排，不遮挡；仅实际CSS宽度不足时转覆盖模式，手动开关及窗口缩放保留当前输入与打开状态。Windows原生“应用”菜单默认隐藏，原恢复菜单/IPC和Alt访问保留。见 docs/p4-floating-navigation-20261019.md。本次只允许UI与隔离Windows候选包；2026-10-17合并/发布的是此前已确认版本，不自动替换该Release或合并本轮。

### 字典补充修正（2026-10-19）

用户补充已删除记录永久删除、恢复后只能粘贴无法键盘编辑及右侧按钮尺寸一致。见docs/p4-dictionary-corrections-20261019.md及business-rules相应节。永久删除须无引用、完整编码确认、事务重查，旧DELETE不得绕过；恢复采用页面内确认，保留名称编辑与锁定编码。控件统一尺寸但状态语义保持。仅隔离自动化及候选包，不执行真实业务数据删除。

### 产品退出处理选项及字典下拉（2026-10-19 后续明确要求）

见 docs/p4-product-corrections-20261019.md。用户要求占号与业务历史分别决定；界面两组选项不预选，释放需逐条完整图号确认，清除指定本产品业务历史需额外确认、实际外键预检和事务重查。仅这项明确选择取代此前产品退出一律保留历史；共享/他产品引用及磁盘文件不受清除授权。图号记录与退出审计仍保留且必须明示。新建产品字典从当前启用、未删除记录刷新，加载失败明示，不能猜造选项。图号 origin 移至独立来源列，不改变来源业务定义。
### 最新：整产品批量确认与PDF三级导航（2026-10-19）

见docs/p4-pdf-navigation-20261019.md。用户纠正批量删除逐个手输图号，整产品只输入一次型号、明确选择占号/历史、核对数量后确认，清单折叠；载荷按预检自动带完整号码/ID和指纹，后台重查不变。这取代此前本向导逐条输入及额外历史短语要求，单条释放规则不变。PDF导航按类别/产品/批次，真实索引聚合且共用列表条件；状态优先使用明确BOM/外发证据，不采信目录序号推断的currentState。手工文件筛选只保留导航内一套，全部文件只清树范围。无Schema、业务归属写入或真实数据删除授权。

### 最新共享目录与空数据中文安装候选（2026-10-20）

见docs/p4-unified-navigation-empty-installer-20261020.md。图号/PDF共用Lucide目录树，待关联入口处于树后同一滚动区，统计与真实查询共用谓词；图号默认七列且文件信息仍在详情。用户明确要求移除交付示例、中文并可自选安装路径，取代此前必须复用样例的交付要求：不携带原样例，仅新建隔离库移除预设示例模板/个人签名，系统用途定义保留，已存在用户库及旧版样例不清理。无Schema及原始PDF写入、自动关联变更或本轮master合并授权。

### 综合改版完整开发授权（2026-10-20～21，当前）

用户明确批准综合方案并授权连续完成源码、Schema、API、迁移、测试与中文自选路径安装包，不再分阶段等待批准。见 `docs/superpowers/plans/2026-10-20-comprehensive-appearance-development.md`、`docs/comprehensive-redesign-preflight-20261020.md` 和 `docs/outbound-v2-requirements-20261020.md`。上述仅限旧阶段的“不扩大二维码模型”“不允许Schema调整”“暂停打包”和阶段授权限制不再适用于本轮已确认范围。当前产品身份/多外观、独立BOM、图号原子归属/明确沿用、PDF索引管理、QR纯手动关联和外发V2规则以这些确认文档为准。用户真实库不在开发环境；升级须备份并事务执行，不清空旧库、不自动归并ZC100、不改磁盘原始PDF或历史占号/快照。真实产品归并必须在用户本地预览并明确确认。历史2026-10-17 master授权不自动涵盖本轮；开发分支可提交推送并执行Windows交付验证。

### V3.0 全局业务修正授权（2026-10-22，当前）

用户以 docs/v3-business-ui-requirements-20261022.md 明确替代独立外观版本日常管理、旧产品/QR/PDF分页和部分外发选择流程。按同名计划连续实施，无须逐阶段批准：保留原外观编码与旧版本表/FK兼容，不再要求创建/选择/维护独立外观对象；可靠产品证据共享图号/PDF查询与既有绑定审计，目录或前缀不能冒充确认。仅产品/QR/PDF取消传统分页并采用有界DOM加载；外发按明确批次、自动同编码可靠前序、BOM仅辅助；QR仍纯手工并兼容合理用途大小写/括号空格。保留原始PDF、占号、历史BOM和外发快照，禁止启动时不可逆修复真实数据。旧2026-10-20～21独立外观UI授权为历史，不能反向覆盖本次简化。用户本地758历史图号数据未提供，不得伪报实际修复数量。
