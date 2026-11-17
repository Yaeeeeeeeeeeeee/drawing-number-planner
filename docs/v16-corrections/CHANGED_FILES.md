# 本轮实际修改文件

比对基线 `27c45a0` 与 Windows 候选源码 `0610c06e8d73c2e616b5b2c0b0364ecb55aba784`。文件状态来自 Git，不代表每个文件都新增业务功能。Windows验收脚本也单独列出。

## 业务、主进程与界面

| Git状态 | 文件 |
|---|---|
| M | `src/core/dictionaries/dictionary-repository.ts` |
| M | `src/core/dictionaries/dictionary-service.ts` |
| M | `src/core/files/file-service.ts` |
| M | `src/core/outbound/outbound-package-service.ts` |
| M | `src/core/outbound/outbound-types.ts` |
| A | `src/core/packaging/ait-selections.ts` |
| M | `src/core/packaging/illustrator-automation.ts` |
| M | `src/core/packaging/illustrator-jsx.ts` |
| M | `src/core/packaging/packaging-archive.ts` |
| M | `src/core/packaging/packaging-catalog.ts` |
| M | `src/core/packaging/packaging-matcher.ts` |
| M | `src/core/packaging/packaging-monitor.ts` |
| M | `src/core/packaging/packaging-task-service.ts` |
| M | `src/core/packaging/packaging-types.ts` |
| M | `src/core/planning/batch-planning-service.ts` |
| M | `src/core/planning/planning-types.ts` |
| A | `src/core/qr/qr-applicability.ts` |
| M | `src/core/qr/qr-errors.ts` |
| M | `src/core/qr/qr-manual-service.ts` |
| M | `src/core/qr/qr-repository.ts` |
| M | `src/core/qr/qr-service.ts` |
| M | `src/db/migrations.ts` |
| A | `src/main/ait-chooser.ts` |
| M | `src/main/database-reselection.ts` |
| M | `src/main/database-validation.ts` |
| M | `src/main/index.ts` |
| M | `src/main/local-service-controller.ts` |
| M | `src/main/open-file-location.ts` |
| M | `src/main/preload.cts` |
| M | `src/main/qr-manual-actions.ts` |
| M | `src/renderer/components/DataTable.tsx` |
| A | `src/renderer/components/PdfReader.tsx` |
| A | `src/renderer/components/QrPixelComparison.tsx` |
| M | `src/renderer/components/VirtualTableRows.tsx` |
| A | `src/renderer/components/pdf-reader.css` |
| M | `src/renderer/components/useTableLayout.ts` |
| M | `src/renderer/data/client.ts` |
| A | `src/renderer/data/image-pixels.ts` |
| M | `src/renderer/data/packaging-client.ts` |
| A | `src/renderer/data/qr-first-page-pixels.ts` |
| M | `src/renderer/data/qr-manual-client.ts` |
| M | `src/renderer/desktop-files.ts` |
| M | `src/renderer/layout/AppShell.tsx` |
| M | `src/renderer/pages/DictionariesPage.tsx` |
| M | `src/renderer/pages/FilesPage.tsx` |
| M | `src/renderer/pages/OutboundPage.tsx` |
| M | `src/renderer/pages/PackagingTemplatesPage.tsx` |
| M | `src/renderer/pages/PlanningPage.tsx` |
| M | `src/renderer/pages/ProductsPage.tsx` |
| M | `src/renderer/pages/QrCodesPage.tsx` |
| M | `src/renderer/pages/bom/BomHistoryComparison.tsx` |
| M | `src/renderer/pages/bom/BomQuery.tsx` |
| M | `src/renderer/pages/bom/bom-history-diff.ts` |
| M | `src/renderer/pages/outbound/EmailComposer.tsx` |
| M | `src/renderer/pages/outbound/PackageBuilder.tsx` |
| M | `src/renderer/pages/outbound/PackageResult.tsx` |
| M | `src/renderer/pages/packaging/PackagingEditors.tsx` |
| M | `src/renderer/pages/packaging/PackagingTaskPanel.tsx` |
| M | `src/renderer/pages/packaging/packaging-catalog.css` |
| M | `src/renderer/pages/packaging/packaging-dimensions.ts` |
| A | `src/renderer/pages/pdf-list-groups.ts` |
| M | `src/renderer/pages/planning/PlanningProductInputs.tsx` |
| A | `src/renderer/pages/useScanProgress.ts` |
| M | `src/renderer/pages/v4-files.css` |
| M | `src/server/routes/files.ts` |
| M | `src/server/routes/outbound-packages.ts` |
| M | `src/server/routes/packaging-catalog.ts` |
| M | `src/server/routes/packaging-tasks.ts` |
| M | `src/server/routes/packaging-template-inspection.ts` |
| M | `src/server/start-server.ts` |
| M | `src/service/protocol.ts` |

## 自动化与端到端测试

| Git状态 | 文件 |
|---|---|
| M | `tests/core/dictionary-permanent-deletion.test.ts` |
| M | `tests/core/dictionary-service.test.ts` |
| M | `tests/core/file-scan-coverage.test.ts` |
| M | `tests/core/file-service.test.ts` |
| M | `tests/core/illustrator-automation.test.ts` |
| A | `tests/core/illustrator-jsx-fullcode.test.ts` |
| M | `tests/core/outbound-package-service.test.ts` |
| M | `tests/core/packaging-task-service.test.ts` |
| A | `tests/core/packaging/ait-chooser.test.ts` |
| A | `tests/core/packaging/ait-selection.test.ts` |
| M | `tests/core/packaging/packaging-catalog.test.ts` |
| M | `tests/core/packaging/packaging-matcher.test.ts` |
| M | `tests/core/packaging/packaging-monitor.test.ts` |
| M | `tests/core/planning-batch.test.ts` |
| M | `tests/core/product-scoped-scan.test.ts` |
| M | `tests/core/qr-manual-service.test.ts` |
| M | `tests/db/backup.test.ts` |
| M | `tests/db/migrations-v14.test.ts` |
| M | `tests/db/migrations-v15.test.ts` |
| M | `tests/db/migrations-v16.test.ts` |
| M | `tests/db/migrations-v17.test.ts` |
| M | `tests/db/migrations-v18.test.ts` |
| M | `tests/db/migrations-v19.test.ts` |
| M | `tests/db/migrations-v20.test.ts` |
| M | `tests/db/migrations-v23.test.ts` |
| M | `tests/db/migrations-v24.test.ts` |
| M | `tests/db/migrations-v25.test.ts` |
| A | `tests/db/migrations-v26.test.ts` |
| M | `tests/db/migrations-v5.test.ts` |
| M | `tests/db/migrations.test.ts` |
| M | `tests/db/schema.test.ts` |
| M | `tests/e2e/ait-packaging.spec.ts` |
| A | `tests/e2e/bom-pixels.spec.ts` |
| A | `tests/e2e/outbound-draft-recovery.spec.ts` |
| M | `tests/e2e/pdf-batch-workflow.spec.ts` |
| A | `tests/e2e/pdf-list-groups.spec.ts` |
| A | `tests/e2e/pdf-reader.spec.ts` |
| M | `tests/e2e/phase-one.spec.ts` |
| M | `tests/e2e/phase-zz-compatibility.spec.ts` |
| M | `tests/e2e/planning-workspace.spec.ts` |
| A | `tests/e2e/qr-first-page-pixels.spec.ts` |
| A | `tests/e2e/v16-workspace.spec.ts` |
| M | `tests/e2e/v52-layout.spec.ts` |
| M | `tests/main/comprehensive-delivery.test.ts` |
| M | `tests/main/database-selection.test.ts` |
| M | `tests/main/database-validation.test.ts` |
| M | `tests/main/delivery-source-guard.test.ts` |
| A | `tests/main/pdf-open-default.test.ts` |
| M | `tests/main/qr-manual-actions.test.ts` |
| M | `tests/main/qr-manual-integration.test.ts` |
| M | `tests/renderer/bom-history-comparison.test.tsx` |
| M | `tests/renderer/bom-history-diff.test.ts` |
| M | `tests/renderer/bom-page.test.tsx` |
| M | `tests/renderer/dictionaries-page.test.tsx` |
| M | `tests/renderer/files-mock.test.tsx` |
| M | `tests/renderer/files-page.test.tsx` |
| M | `tests/renderer/outbound-page.test.tsx` |
| M | `tests/renderer/outbound-shell-guard.test.tsx` |
| M | `tests/renderer/packaging-catalog-ui.test.tsx` |
| M | `tests/renderer/packaging-client.test.ts` |
| M | `tests/renderer/packaging-workflow.test.tsx` |
| M | `tests/renderer/pdf-classification-page.test.tsx` |
| A | `tests/renderer/pdf-list-groups.test.ts` |
| M | `tests/renderer/pdf-management-page.test.tsx` |
| M | `tests/renderer/planning-page.test.tsx` |
| M | `tests/renderer/planning-workspace.test.tsx` |
| M | `tests/renderer/products-page.test.tsx` |
| M | `tests/renderer/qr-codes-page.test.tsx` |
| A | `tests/renderer/qr-pixel-comparison.test.tsx` |
| A | `tests/renderer/scan-progress.test.tsx` |
| M | `tests/renderer/table-layout.test.tsx` |
| M | `tests/renderer/v5-outbound-builder.test.tsx` |
| M | `tests/renderer/v51-mail-composer.test.tsx` |
| M | `tests/renderer/workspace-shell.test.tsx` |
| M | `tests/server/application-api.test.ts` |
| M | `tests/server/database-switch.test.ts` |
| M | `tests/server/dictionaries-api.test.ts` |
| M | `tests/server/outbound-packages-api.test.ts` |
| M | `tests/server/packaging/packaging-catalog.test.ts` |
| M | `tests/server/packaging/packaging-scan-scope.test.ts` |
| M | `tests/server/packaging/packaging-template-inspection.test.ts` |
| A | `tests/server/pdf-reader-stream.test.ts` |
| M | `tests/server/qr-codes-api.test.ts` |

## 构建、交付与配置

| Git状态 | 文件 |
|---|---|
| M | `.github/workflows/comprehensive-windows-delivery.yml` |
| M | `package.json` |
| M | `pnpm-lock.yaml` |
| M | `scripts/comprehensive-windows-installer.iss` |
| M | `scripts/initialize-empty-acceptance.ts` |
| M | `scripts/p4-delivery-source-guard.ts` |
| M | `scripts/production-profile.cjs` |
| M | `scripts/repack-comprehensive-windows.mjs` |
| M | `scripts/verify-ait-packaging-installed.cjs` |
| M | `scripts/verify-comprehensive-database.ts` |
| M | `scripts/verify-comprehensive-profile-dialog.ps1` |
| M | `scripts/verify-comprehensive-windows.cjs` |
| M | `scripts/verify-confirmed-installed.cjs` |
| M | `scripts/verify-v41-v42-installed.cjs` |
| M | `scripts/verify-v5-installed.cjs` |
| M | `scripts/verify-v51-mail.cjs` |
| M | `scripts/verify-v52-installed.cjs` |
| M | `vite.config.ts` |

## 文档与进度

| Git状态 | 文件 |
|---|---|
| M | `NEXT_STEPS.md` |
| M | `PROGRESS.md` |
| M | `docs/progress.json` |
| A | `docs/requirements/v16-corrections-20261111.md` |
| A | `docs/v16-corrections/BASELINE_AND_PLAN.md` |
| A | `docs/v16-corrections/CANDIDATE_DELIVERY.md` |
| A | `docs/v16-corrections/DECISIONS_20261117.md` |
| A | `docs/v16-corrections/INTEGRATION_REVIEW.md` |
| A | `docs/v16-corrections/PHASE1_TASK_SAFETY.md` |
| A | `docs/v16-corrections/PHASE2_WORKSPACE_UI.md` |
| A | `docs/v16-corrections/PHASE3_PLANNING_AIT.md` |
| A | `docs/v16-corrections/PHASE4_PDF_BOM.md` |
| A | `docs/v16-corrections/PHASE5_PRODUCTS_QR_DICTIONARY.md` |
| A | `docs/v16-corrections/PHASE6_DATABASE_OUTBOUND.md` |
| A | `docs/v16-corrections/REQUIREMENT_STATUS.md` |
| A | `docs/v16-corrections/status.json` |
| M | `progress.html` |


## 交付说明提交

Windows固定源码之后仅追加本轮版本说明、逐项报告、Linux实际截图/日志、进度及固定工件摘要的发布工作流，不修改应用源码。发布工作流不更新master或移动旧Tag。
