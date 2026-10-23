# V4 data association and table interactions Implementation Plan

> **For agentic workers:** Use systematic debugging/TDD for each domain and independent reviews before final delivery. Existing dedicated development branch is the authorized workspace. User authorized continuous implementation without new phase approvals.

**Goal:** Implement all V4.0 requirements with product-ID identity, persistent per-PDF manual classification and shared adjustable tables.
**Architecture:** Incremental React/Fastify/SQLite/Electron. Schema19 removes product string uniqueness while preserving every product ID/FK; adds per-file confirmed assignment and audit. Existing appearance tables retained for compatibility. Reuse DataTable and virtual rows, extend a shared table-layout layer to raw tables.
**Tech Stack:** Existing TypeScript, SQLite, React, Lucide, Vitest, Playwright.
**Spec:** docs/v4-data-interaction-requirements-20261023.md (user supplied, binding authority).

## Global Constraints

- 原始 PDF 不删除、移动或重命名；完整图号、占号、历史BOM和外发快照不改写。
- SKU和型号均可重复，内部产品ID区分身份；不得自动归并。
- 默认外观仅规划默认值；不恢复独立外观版本日常管理。
- 同名批次不同目录不合并；归纳作用于具体PDF实例，重扫保持。
- 迁移启动前备份，事务回滚，保留旧外观Schema和历史引用。
- 现有用户库不在环境中；不得把夹具统计描述为用户实际修复量。

## Review Focus

- 重复SKU/型号及不同外观不能以first/min随机匹配；歧义保留待处理。
- 人工归纳与已有图号归属冲突时明确反馈，不能静默覆盖；重扫不冲掉确认。
- 列重排不能错配表头/数据、破坏展开行或虚拟占位；选框/操作列可锁定。
- 旧库自定义索引/触发器/自增高水位及所有FK保留；失败恢复原库。
- 筛选和加载竞态、重复末页、重启布局持久化及长文本跨列溢出。

## Tasks

### Task 1: Product identity and safe migration
- [x] Reproduce duplicate SKU/model rejection and referenced product default-appearance edit rejection.
- [x] Schema19 remove only SKU/model uniqueness, preserve product rows, references, custom indexes/triggers/highwater; add confirmed PDF assignment/audit tables.
- [x] Allow duplicates and default appearance edits without altering existing drawings/appearance history.
- [x] Migration and product tests: old18 upgrade, injected rollback, existing history byte/row identity, FK integrity.

### Task 2: PDF manual classification backend
- [x] Preview/apply single and 12-file classification with fingerprint/recheck/backup/audit, target actual product and batch IDs.
- [x] Query/list/count/navigation use confirmed per-file attribution first. Preserve target batch on rescan and original paths.
- [x] Confirmed PDF evidence feeds drawing product queries; conflicts never overwrite existing binding.
- [x] API/client tests include JSON transport, invalid IDs/stale preview/multi-product conflicts and original bytes/history unchanged.

### Task 3: Multi-appearance matching correctness
- [x] Trace scanner, candidate and query joins; remove product-default-appearance identity restrictions.
- [x] Prevent automatic directory/model selection between duplicate actual product IDs; explicit IDs remain authoritative.
- [x] ZC100 two appearance codes, default change and duplicate products regressions; expose before/after counts in test report.

### Task 4: Shared table layout
- [x] Shared widths/order/minimum/6px snap/double-click fit/persistence/reset implementation.
- [x] Header and row columns move together, locked selection/actions, keyboard resize/reorder and pointer/drag handling.
- [x] Reuse in DataTable (virtual/expanded) and raw BOM/QR/outbound tables; stable per-table keys.
- [x] Tests verify persistence, reset, malformed old layout, min widths and content integrity.

### Task 5: PDF UI
- [x] Batch manual classification modal chooses distinguishable products and real batches, previews old/target/conflicts then saves.
- [x] Remove file detail panel and per-row more/index/ignore/rename; rows only path/open with inline exceptional reason.
- [x] One compact root/stats/details/reset/scan toolbar; shared table reset; two-line filenames/batches contained.
- [x] Renderer tests for 12-file apply, selection/scroll refresh, no old details, native path operations and failures.

### Task 6: Drawing navigation, compact toolbar and infinite list
- [x] Product tree third level actual coding main categories; no empty categories or appearance nodes.
- [x] Main-category node product+category filters, counts and invalid historical category visibility in all-product view.
- [x] Compact title/count/actions and one-row filters; remove traditional pagination, virtual bounded rows/chunk load with race guards.
- [x] Renderer/core regressions for category filtering, no paging, stable selection and no duplicates.

### Task 7: Global UI and review
- [x] Integrate shared layouts in product, QR, BOM, outbound and coding/planning multi-column tables.
- [x] Preserve four detail groups, business safety, QR functions and outbound selected-batch semantics.
- [x] Browser 1080/2K/4K/narrow checks: drag/fit/reorder/reset, persisted layout, long text no overlap, virtual rows bounded.
- [x] Independent domain and final review; correct important findings.

### Task 8: Verification and delivery
- [ ] Full automated suite, typecheck/build, old Schema18 and15 upgrade/rollback/FK/history checks.
- [ ] Actual Windows installed app: new/old DB, scan/classify/manual12-file/column interactions and restart persistence.
- [ ] Commit/push dev branch, Chinese custom-path installer, exact source/hash, GitHub download说明 and final direct download.
- [ ] Report root causes, isolated before/after counts/unresolved reasons, migration/backups and local verification steps; no fabricated production stats.

## Execution rulings

- Existing branch b9ea45f is the clean authorized development checkout; no master code merge.
- User's repeated opt-out of new phase approvals remains applicable. V4 is the approved scope, not a request to pause for another design approval.
- Independent-domain dispatch separates Schema/product, PDF backend, table component and page work by file ownership; parent integrates shared contracts and association rules.
