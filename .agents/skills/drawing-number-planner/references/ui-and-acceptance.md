# UI and acceptance

## UI principles

- Separate view, edit, and destructive actions. Keep dangerous operations visually and spatially distinct.
- Show current, historical, inactive, missing, pending, and exceptional states with both text and visual hierarchy; never rely on color alone.
- Preserve readable layouts at the supported desktop width. Long paths and filenames must wrap without horizontal overflow.
- Do not expose internal version labels or storage implementation details when they are not part of the user-facing business model.
- When a choice is ambiguous—product, batch, file instance, BOM record, or outbound source—ask the user rather than silently selecting one.
- Keep existing relationships when a feature is temporarily hidden or moved.

## Verification gates

For material changes, select checks proportionally to risk. Domain or persistence changes normally require relevant unit/integration tests, migration/rollback checks when applicable, API checks, and type checking. UI changes should include renderer tests and a realistic browser or desktop flow when available. Release-facing work should include production browser and desktop builds.

Read the latest project status and run the relevant commands rather than copying old counts from a progress document. A green isolated test run proves the tested behavior; it does not prove that real user data was changed safely.

Before claiming completion, report important discrepancies, unverified real-data steps, and any deferred acceptance item.


<!-- drawing-number-planner-ui-baseline-20261013 -->
## UI baseline and acceptance supplement (2026-10-13)

### Sources and status

Read project-root `docs/approved-ui-alignment-20261013.md` for confirmed visual choices, module scope and the real-page alignment candidate; read `docs/desktop-acceptance-20261013.md` for later desktop delivery evidence. From this reference their relative links are [UI alignment](../../../../docs/approved-ui-alignment-20261013.md) and [desktop acceptance](../../../../docs/desktop-acceptance-20261013.md). If absent, request the actual documents; do not reconstruct them from screenshots.

The later desktop record documents an authorized master fast-forward to `8bd386a164be642c152007ea55247d989a519f4a`; the earlier candidate record's “master not merged” describes that earlier stage. Neither grants permission for a future merge. Commit IDs, temporary paths, ports, counts and screenshots are dated provenance, not permanent product rules.

The alignment screenshot source is `C:/Users/Administrator/Documents/Codex/approved-ui-alignment-20261013`: final keys `drawings`, `drawings-detail`, `dictionary-main`, `dictionary-create`, `dictionary-edit`, `dictionary-hierarchy`, `planning`, `products`, `products-preflight`, `files`, `qr-list`, `qr-detail`, `outbound`, `migration`, `migration-detail`, `recovery` at 1080/1200/1280, plus `electron-qr.png` and `electron-recovery.png`. Earlier aliases are not this round's final comparison source. This supplement records the documents' evidence; it does not claim fresh screenshot inspection or pixel identity.

### Current confirmed module principles

| Module | Preserve confirmed UI and business behavior |
|---|---|
| Drawing library | User-approved third layout using shared real components; retain query, batches, recycle bin, official/historical occupancy and reference protection. |
| Coding dictionary | Five tabs, compact toolbar, parent/child browsing, locked-code editing with guide lines, equal-height Save/Cancel and operation colors. Keep name editing, enable/disable, history recovery and original deletion service. No fabricated independent reference preflight. |
| Drawing planning | Product/appearance inputs, derived information strip, preview beside planning rows, bottom confirmation and real saved results. Preserve dependencies/invalidation, complete appearance code, duplicate/serial checks and approved input/expectedFullCode validation. Optional brand/size code lookup is read-only; its failure must neither block base queries nor invent codes. |
| Product archive | Seven-column table, three attributes and three-column QR details, width-limited exit worksheet. Keep filtering, creation/editing, enable/disable and historical identity. Exact QR entry stays in expandable summary; deletion stays in details with full preflight and two confirmations. |
| BOM management | Keep the confirmed current version and existing entry points; preserve query, edit, deletion, snapshots and relationships. |
| PDF file center | Keep shared real styling and existing entry points; preserve scanning, indexing, file location and historical rules. |
| QR management | Reconfirmed second-version details: flat metadata and file worksheet, path entry beneath the full filename. Preserve independent business/file/match states, editing, linking, enable/disable, deletion protection and first-batch loading-failure handling. Sample QR images do not prove QR decoding capability; unconfirmed files remain unconfirmed. |
| Outbound materials | Continuous preparation/results/email areas, four selections, eight-column table and real package-result worksheet. Keep desktop directory authorization, preview token, explicit multi-BOM selection, blockers, ZIP writing, draft protection, contacts/templates/history. Do not fabricate per-ZIP counts from totals; unknown counts display “未提供”, uncertain physical availability “待核实”. |
| Migration checks | Issue-first filterable worksheet, real row reasons and candidate views. Preserve audit/selection/import rules. Select-all still covers all importable candidates, with explicit scope and selected-outside-filter count. |
| Safe recovery | Keep lower-left entry, overlay and feedback from actual return values. UI alignment alone does not authorize running recovery commands or changing Main Process. Full recovery application remains unverified in the cited record. |
| Shared UI | Acceptance bench is a development tool, outside production navigation. Avoid global style overrides that alter preserved modules. |

Real quantities, names, historical states, file availability and preflight decisions come from actual interfaces. Screenshot sample values are not data requirements. Existing safeguards and relationships survive presentation changes.

### Deprecated or excluded designs

Do not restore the rejected three-step product exit wizard/cards, APP-style product/BOM roundtrip Mock, simulated deletion/repair/recovery, Mock data in real flows, or fabricated historical/per-package results without a new explicit user decision. Keep their historical tests and records classified accurately; a failing excluded Mock test is not proof that a real business flow passed. Proposed alternatives remain Pending Confirmation, not Current.

### Acceptance levels and remaining gates

| Level | What the evidence establishes |
|---|---|
| Candidate UI | Alignment candidate and screenshots for comparison; not final human acceptance or pixel identity. |
| Automated verification | Only the tested scope/environment. The dated records report 900/907 passing with 7 Mock failures and 8/8 isolated E2E passing; these counts are not a future target or fresh run. |
| Desktop smoke verification | Real isolated exe startup, health response, sample planning read and same-version directory reuse. Desktop width checks in the delivery record cover the startup page only; earlier multi-page evidence must not be described as a new full-module desktop run. |
| Conditional acceptance | First batch remains conditionally passed, with real retry/desktop fault recovery, late-response and auxiliary-filter retry TODOs retained. |
| Manual desktop acceptance | Second batch and overall UI still require the user's real desktop visual/interaction review. Record reviewer, version, scope, result and exceptions when actually performed. No automated upgrade to this level. |
| Final release acceptance | Requires unresolved gates to be closed with evidence and actual applicable approval. Full recovery application effect, production file permissions and runtime stability are not established by the supplied records. |

The delivered directory package is offline-capable but unsigned and not an installer; it is not a final release acceptance certificate. Tests and acceptance operate on isolated sample/temporary data; desktop startup validates isolation markers, links and path boundaries. Never infer authorization to operate on a formal database, original files, occupied drawing numbers or recovery commands from this UI supplement.

Report acceptance as separate fields: confirmed UI choices; candidate scope; automated results (including failures); desktop evidence; human acceptance status; outstanding release blockers. Keep unresolved outbound contact/template simultaneous-open behavior and migration failed-audit/old-report policy outside this update's implementation scope.

### Future Skill impact check

Before delivering a future change, identify affected modules and compare against Current rules, confirmed UI principles, Deprecated designs and acceptance gates. Verify against the actual implementation and newest dated evidence; distinguish a new confirmed decision from a proposal or implementation accident. If a confirmed policy changed, update only affected Skill text and supporting source/classification. If none changed, report “Skill impact checked: no rule update needed.” Do not silently rewrite historical evidence, remove unresolved acceptance items, grant merge/real-data authorization, or change Schema/API/core algorithms as part of a UI/Skill maintenance task.


<!-- drawing-number-planner-workspace-20261014 -->
## Minimal Engineering Workspace supplement (2026-10-14)

### Sources, classification and authority

Read [confirmed design and phases](../../../../docs/minimal-engineering-workspace-design-20261014.md) and [Windows acceptance standard](../../../../docs/minimal-engineering-workspace-acceptance-20261014.md). Current design is unified grayscale, module-specific workspaces and auxiliary panels folded by actual available CSS width. P0 is confirmed. Its documentation-only gate records that earlier stage; the user later explicitly authorized P1. Read `docs/p1-minimal-workspace-20261014.md` for implementation evidence and current limitations. Authorization and validation for P1 do not authorize P2–P5. Do not request renewed approval for the decisions already confirmed below.

The 2026-10-13 section remains dated evidence. New confirmed visual decisions override conflicting layout/color constraints for future work, not historical results, business behavior or acceptance gates. Read both dated sources and preserve originals. No merge, real-data or recovery-command authorization follows from these documents.

### Current confirmed changes

- Drawing library may replace inline expanded detail with a right-side drawing detail panel, using a drawer when narrow. Preserve full details, historical relationships, occupancy explanation, dangerous actions, Escape/close/focus behavior. Batch checkboxes and detail selection are independent; PDF preview is not the default detail.
- Navigation, tables, buttons, typography, spacing and panels may adopt grayscale even in previously frozen modules. Retain confirmed BOM, QR, dictionary and outbound information structures and interactions, plus small text-backed success/warning/error/activation/deletion colors. Do not gray out all semantic distinctions or restore excluded designs.
- PDF center scope is product/batch navigation, file list and real file details using existing interfaces. General embedded PDF preview is excluded this round: no fake preview. Future preview requires separate API/security/performance evaluation and authorization.
- Minimum complete desktop workflow target is 720×600 CSS px, both dimensions. All auxiliary areas may fold or become drawers. Core actions, full drawing-code viewing/copying, confirmations and dialogs must remain reachable; internal scrolling is allowed, whole-page horizontal overflow is not.
- Breakpoints use measured CSS viewport/container width and table budget, not physical screen resolution. Document breakpoint numbers are initial tuning values, not domain rules. Fold panels before compromising codes. At 4K increase useful information rather than magnifying everything; no global CSS zoom.
- Future window changes are limited to minimum dimensions and necessary background color. Measure outer window/content/CSS viewport differences; never equate Electron minWidth/minHeight directly to 720×600. Main recovery, IPC, security and unrelated desktop behavior remain out of scope. No configuration is changed by this documentation update.
- P1–P2 use fixed widths and automatic folding. P4 adds product-navigation/detail resizing constrained by usable table width, keyboard support and reset-to-default. No width persistence this round; resizing is not business authorization.
- Windows acceptance covers 1920×1080, 2560×1440, 3840×2160 with supported 100%/125%/150%/200% combinations; measure width AND height in maximized/windowed/half-screen/narrow modes and after moving between differently scaled monitors. Sub-720×600 cases are not complete-workflow passes; missing device evidence stays unverified.

### Remaining gates and impact

Keep business rules, schema/migrations/API, original files, occupancy, history and reference safeguards unchanged. UI approval does not close late-response/auxiliary-retry TODOs, old Mock failures or full recovery/production permissions/stability gates. Future results require actual versioned evidence; old counts and screenshots are not new runs. Skill impact checked: only confirmed UI direction and acceptance guidance updated; no business-rule update.

### Later authorized P1 feedback and P2

User explicitly authorized P1 narrow-layout fixes followed directly by P2 and combined acceptance. Product/dictionary row actions stay on one line, text columns may yield width and tables may scroll internally; PDF filenames align left. P2 uses fixed auxiliary widths, automatically folded by actual container width, and preserves independent checkbox/detail selection, complete detail safeguards and modal keyboard/error feedback. Evidence is in `docs/p2-workspaces-20261014.md`. Existing APIs do not expose an exact null-product/null-batch file filter: preserve a clearly labelled full-list checking entry rather than inventing an API or filtering only the current page as if global. No new business rule, P3 authorization or human Windows pass is inferred.

### P3 feedback authorization (2026-10-15)

P3 was subsequently explicitly authorized: planning/product/BOM/dictionary/QR visual alignment plus shared module headings and the user's PDF feedback. PDF batch and batch-state stay single-line, table content centers except left-aligned filenames, and a bounded local scroll workspace preserves list width on detail opening. Narrow mode continues to use a modal drawer. Validate long-list detail/scrollbar reachability as well as short samples; overflow must not move the sticky detail out of the viewport. Headings use a Chinese title and one Chinese description, preserving safety notices and business identifiers. Dictionary toolbar/master/detail use matching tracks; planning item numbers never wrap. Implementation evidence: `docs/p3-module-alignment-20261015.md`. This does not change business rules or grant P4/merge/real-data/final-release approval.

### P4 feedback and resizing authorization (2026-10-15)

Current authorization/evidence: `docs/p4-workspace-refinement-20261015.md`. Supersedes the P3 whole-workspace local scroll candidate: **only the central PDF table scrolls**; navigation remains in place; file detail overlays the central table, never compressing it. Narrow detail still uses the existing focus-trapped drawer. Product/batch tree hierarchy and spacing are explicit. User approved P4 constrained navigation/detail resizing with mouse, keyboard, reset and no persistence; fold before compromising full-code checking.

Product QR uses the user's permitted direct-entry option; display every actual purpose and actual active/inactive state, preserve exact-ID navigation and custom purposes. This supersedes the 20261013 count-summary placement only, not QR semantics. No third state is fabricated from missing records/files. Planning retains horizontal rows, associated preview and invalidation/confirmation; outbound remains a continuous scope/result/email workspace with local responsive settings/draft columns. Existing manual-edit confirmation, generationRevision and new-package protection remain mandatory. No new business steps, fake preview/statistics or file actions.

Acceptance sample is generated only in new isolated temporary data, with 40 actual planned drawing records for density checks. Automated browser DPR emulation and Windows CI smoke are evidence only for their stated checks, never complete Windows system-DPI/cross-monitor or human approval. Preserve older acceptance records and known failures. P4 scope does not authorize P5, merge, release, schema/API/IPC/security or recovery changes.

### Latest P4 all-page existing-data refinement (2026-10-15, later request)

**Current:** `docs/p4-adaptive-data-workspaces-20261015.md`. The later user request explicitly replaces the earlier wide-PDF-overlay constraint: on sufficient measured CSS width, navigation/list/detail occupy separate tracks so detail does not cover primary data; insufficient width retains the modal drawer and focus/inert/Escape/close protection. Lists and detail scroll independently, with table width protected and auxiliary panels folded/resized before excessive compression. Clear stale drawer state when a navigation panel docks; focus must survive breakpoint changes and return to the exact originating control on actual close.

Data regions use actual available width/height, derived from layout coordinates rather than fixed top-offset guesses or physical monitor pixels. Avoid page caps that waste a large workspace; keep normal-sized controls and complete horizontal planning rows. Existing pagination and total counts remain accessible, with no response slicing, artificial result limits, fabricated placeholders or giant controls to simulate density. Preserve prior dictionary toolbar/master alignment and all business/history states.

**Historical for this refinement:** earlier P4 overlay placement and the 40-record sample delivery rule. Do not remove those records/documents, but do not run sample creation or duplicate records for this user's existing-data density acceptance. Existing unit/E2E fixtures and blank component geometry probes are automated test evidence only, never populated-business-data screenshots.

A separate development read-only viewer may open an explicitly selected existing database with readonly/query_only and reused query handlers, without migrations, seeds, backups, startup cleanup, recovery, scan or business writes. It must not change production API/Main/security settings or silently choose a database. Verify counts/content fingerprints before/after and mark missing original-PDF, populated-history, physical Windows/4K/DPI/cross-monitor evidence unverified. A cloud empty database or Chromium CSS/DPR emulation is not a Windows business-data pass. This refinement stays P4; business/data protections and old release gates remain unchanged.

### P4 local layout feedback (2026-10-16)

See `docs/p4-filter-feedback-20261016.md`. Expanded drawing filters distribute across measured width rather than remaining two columns; PDF/QR filters use responsive workspace tracks with bounded controls. Wide outbound scope/result may sit beside each other with mail below; narrow layouts retain original sequence and hidden maintenance views keep draft state. This changes presentation only, never preview/confirmation/history rules. The user has explicitly selected the existing old P4 acceptance-seed database for read-only sample layout review; label it sample evidence, do not create new records or claim populated business-data acceptance.

### Product purpose columns (2026-10-16, later explicit request)

Current product-table presentation is separate columns in the order 说明书 / 售后卡 / 菜谱, superseding the single 关联资料 column. Keep actual per-product purpose states and exact-record navigation. Missing records display no-record information, not an invented inactive business state. Existing custom purposes remain accessible rather than being discarded by the standard three-column presentation. See `docs/p4-product-purpose-columns-20261016.md`; no data/API/model changes or final acceptance follow.

The same feedback later explicitly places each planning item number outside its planning-row frame as a standalone label, retaining horizontal inputs and linked preview. BOM detail effective-batch displays show the name without its path in selected/original/previous views. The user subsequently clarified that image and diagram paths and filename path tooltips should also be absent from these detail/edit views; retain actual filenames, preview and open-location actions. Stored snapshots, actual paths and path-based query filters remain intact.

Later explicit feedback also removes the source/status subtext under BOM detail drawing numbers (selected/original/previous), retaining full codes and all stored state/reference checks. Email per-field copy actions use icon-only buttons with the existing Chinese accessible names and title hints, preserving keyboard access, exact copied text, feedback and manual-draft protection. Planning labels must be visually outside the legacy list border too: the enclosing list is unframed, with each input/preview row framed separately below its standalone number.

Later in the same session the user extends icon-only presentation to **all existing copy actions**, including full email copy, codes, paths, URLs and copy/archive. Retain each actual handler, permission, disabled condition, confirmation and feedback; a file-copy icon and explicit hint distinguish archive from clipboard actions. PDF filename **header** centers while its body values stay left aligned (supersedes header-left only). Horizontal planning inputs do not deform into a tiny color column or giant remove button: remove the legacy number track and first-child row span, keep readable minimum widths with local horizontal scroll when needed, and keep item numbers outside the frame. No business/API/file-storage changes follow.

### P4 BOM history query comparison (2026-10-16, latest explicit request)

**Current:** The user authorized query-detail-only history summaries, reliable project matching, default changed-only fields, collapsible projects and separate attachment comparisons. See `docs/p4-bom-history-comparison-20261016.md`. Use the explicit previousVersionId and same product; never infer predecessor/order or treat unreadable relations as first records. Match unique projectItemId; ambiguous identities stay pending. Include removed projects and compare raw stored values/associations, not live dictionary/status labels or list positions. Preserve all snapshots, business actions, Schema/API/IPC/security and original historical asset references.

**Current for this query area:** complete attachment paths may be revealed/copied on demand (supersedes the earlier always-hidden-path presentation only here); default filenames and code-only drawing presentation remain. Batch raw snapshots may likewise be disclosed to explain same-label reference/path differences. Valid stored hashes support content-digest comparisons, not claims about current disk files. Preview/open availability requires the existing actual file checks, with honest error/unknown states and recovery; missing hashes or duplicate attachment roles never prove unchanged content. First records show complete single-sided data without fabricated difference counts. Existing mock/isolated-sample evidence remains separate from real business-data and Windows/DPI acceptance. No merge, P5 or real-data write authorization follows.

### Latest P4 BOM edit/detail corrections (2026-10-16)

**Current:** The user subsequently requires historical edits to preserve record count and original ID/date/submission time. An active editor tab must not discard edit identity; missing/mismatched edit state must never route to create. Save refreshes list/detail and server-returned attachment identities. See `docs/p4-bom-edit-corrections-20261016.md`; business-date editing behavior is superseded by the explicit immutable-date rule, with no schema changes.

**Current:** Effective-batch cells show only business names/dates. Raw IDs/names/paths belong to a separate default-closed batch-detail entry, superseding the inline batch-snapshot expansion from the preceding P4 query candidate. Read-only BOM value/copy controls stay horizontal, including long values and snapshot detail. Remove the QR row and QR IDs from BOM historical field-diff counts while preserving all actual QR relationships and independent QR business behavior. Preserve justified disabled states and explain conditions instead of making unavailable files appear operable. Real Windows CI/native CSS sizes and physical 4K-maximized/DPI acceptance must be distinguished.

### Latest BOM copy-control removal (2026-10-16)

The user subsequently requested no copy buttons in BOM details. BOM query first/history fields, batch disclosures, historical attachment path disclosures and edit comparison display complete selectable text without copy controls. This supersedes the preceding inline-copy requirement only within BOM; retain copy actions in other modules and all business/data protections.

### Product archive table and purpose navigation (2026-10-16)

Latest explicit request: see docs/p4-products-list-20261016.md. The real product archive uses exactly eight combined identity/specification/status/purpose/action columns, with only Edit in row actions. No inline detail/edit expansion; lifecycle and protected cleanup remain in the separate product editor. Standard purpose status links use product identity and stable purpose keys; missing, single and multiple records have distinct navigation without automatic writes. Returning preserves filters/scroll and refreshes QR business states; file availability does not infer business state. This supersedes earlier product expansion/dynamic-purpose-column UI rules only. User explicitly paused Windows-package delivery pending further requests; do not package automatically. Preserve Schema, uniqueness, inactive-product creation restrictions and all data safeguards.


### P4 图号库与外发配置整合（2026-10-17，最新明确授权）

用户明确授权图号库按产品与实际使用批次导航、紧凑查看/同抽屉管理，以及外发工作台与邮件配置互斥三标签整合。见 docs/p4-integrated-ui-20261017.md。实际使用只依赖明确BOM/已完成外发关系，不以PDF扫描、同码文本或日期最新推断；保留所有历史/占号/引用保护。配置离开确认、单表单和返回工作台刷新可用选项应保留手工草稿。无Schema/业务规则变更。

用户已再次明确要求本轮全部完成后直接给Windows验收包，此授权替代此前“暂停打包”要求。仅允许独立隔离验收包，不合并master，不打开用户正式数据库。UI自动化、原生CI和物理Windows4K/DPI人工验收仍分别记录。


### P4 实际截图反馈（2026-10-17，整合包之后）

本轮用户要求复制图号成功不显示任何文字并保持行高、产品列表全列居中且独立资料状态有颜色/边框、图号范围标题紧凑、图号/PDF导航区分实体批次与查询入口、安全恢复浮层收窄及二维码产品主表移除用途数量列。见 docs/p4-layout-feedback-20261017.md。仅UI表示与明确的全部文件筛选重置，保留用途子表、原查询/关联/占号/恢复/文件操作规则；不增加Schema或执行恢复命令。旧布局自动化未覆盖复制后行高，不能据其通过认定当前截图无错位。

### P4 版本确认与合并授权（2026-10-17）

用户明确表示“这版已确定”，随后要求“合并到master”。已交付 fc236a6 应用为本次确认版本，本次主分支合并已授权；此前未合并限制保留为历史记录，不再阻止本次操作。不得把确认版本/合并授权改写为全量测试全绿、实体4K/DPI或真实业务数据自动验收通过。见 docs/p4-master-merge-20261017.md。

### 默认展开的浮动目录（2026-10-19）

Current：用户明确要求去掉截图顶部应用横栏，并先后纠正为“不要默认收起”“不覆盖内容上方，只要宽度到必须覆盖的时候再覆盖”。默认展开、宽屏并排且互不遮挡；保留手动关闭/重开状态，窄屏才覆盖并保留遮罩、Esc和焦点保护。去除Renderer顶部栏，Windows原生菜单默认隐藏但恢复功能及Alt入口不删除。当前1024 CSS px切换点源于220px目录、24px间隔及720px内容预算，属于可验证布局选择，不是业务规则；物理4K/DPI证据仍单列。见 docs/p4-floating-navigation-20261019.md。
## Latest product and drawing presentation corrections (2026-10-19)

See docs/p4-product-corrections-20261019.md. Product dictionary options refresh on workspace reactivation and editor opening; loading failure is visible and retryable, not silently represented as an empty dictionary. Product exit presents independent unselected occupancy/history choices, explicit impact counts and inline final confirmation; retain exact identity/code confirmations and transactional safeguards.

Drawing origin is an independent 来源 column. User selected a low-saturation grey-blue bordered category badge (11px) and smaller dark project text (12px), centered, with complete wrapping names. Category colors describe classification presentation only, never infer business status. Shared batch display formatting removes recognized directory ordinals from valid date/range/description labels while preserving dates, colors and parentheses; raw name/path/ID/order remain unchanged and identical displayed names must not merge identities. Native Windows installation and browser fixture screenshots are distinct evidence; do not execute product-history clearing on user or existing acceptance data to manufacture a screenshot.

### 共享目录与中文空数据候选（2026-10-20）

Current：图号/PDF共用目录树与Lucide18px/1.8图标；标题行图标收起，默认300px、可调260–420px。待关联入口位于树后同一滚动区，不固定底部。单套兼容文件筛选折叠，待关联只清导航冲突条件，保留手动条件。计数按唯一索引/实际图号身份、明确关联查询；修改后刷新列表与统计。图号七列不含默认文件完整性列，详情仍保留。

Current：用户要求交付无示例、中文、自选路径。本候选不携带acceptance-seed；首次新库移除预设示例模板和个人签名，保留系统用途定义；已存在用户数据不重置。旧样例安装目标拒绝并要求新目录，禁止靠清理AppData或原始PDF实现空数据。仅隔离交付，不自动合并或覆盖已发布版本。见docs/p4-unified-navigation-empty-installer-20261020.md。

## Current: V4 compact lists and shared column interactions (2026-10-23)

PDF has no right file detail panel; per-row path/open only and top bulk management/manual classification, nav-only batch rename. Drawing nav third level is actual coding main categories, not batches/appearance versions. Products, QR, PDF and drawings have no traditional paging UI; bounded DOM/chunks preserve selections/query scope. Shared tables provide resize/minima/6px snap/double-click fit, header reorder, local persistence and reset. Text stays within its column, filenames/batches at most two lines each, composite file lists keep all independent actions. Old no-wrap and drawing pagination constraints are superseded by V4; history APIs and protected actions remain. Browser/CI fixture acceptance does not establish local user data or physical DPI acceptance.

## Current: V4.1 / V4.2

The current Skill defines exact status names, category/color layout, batch context-menu actions, one-row toolbar and visible shared-table reset/handles. It supersedes old uniform category badge colors, two-line project layout, historical-version drawing label and persistent batch pencils. Verify native installation folder browsing, Desktop child/root paths, installed app version, source revision and actual API/DOM mutations; a Linux unit result does not establish Windows interaction success. Preserve earlier safety evidence without treating dated UI acceptance as current approval.
