# Drawing Number Planner Phase 4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe local workspace setting and a real PDF index that scans, matches, and classifies files without storing absolute business paths.

**Architecture:** Keep the existing Electron/React/Fastify/SQLite monolith. Store the absolute workspace root only in an application-data JSON setting; route all file access through a core path service; store only normalized relative paths and scan metadata in additive schema version 4.

**Tech Stack:** TypeScript, Node.js filesystem APIs, SQLite/better-sqlite3, Fastify/Zod, React, Vitest, Playwright, Electron.

**Spec:** `docs/superpowers/specs/2026-08-25-drawing-number-planner-phase-4-design.md`

## Global Constraints

- The local workspace is the daily working library; V1 has no server API, upload, synchronization, or comparison service.
- No drive letter, username, or current-computer absolute path may be hard-coded in code or business data.
- The configured workspace root is stored outside SQLite in the application-data settings file.
- Every PDF business record stores only a path relative to the workspace root.
- Path resolution is centralized and must reject absolute, drive-qualified, UNC, parent-traversal, NUL, and symlink/junction escape paths.
- Matching uses filenames only. Do not parse PDF contents, OCR, or infer from folder levels.
- A filename containing exactly one known full drawing code is matched; zero is unmatched; two or more distinct codes are conflict.
- The complete Chinese marker `（转曲）` means outlined; otherwise the PDF is source.
- Scanning is read-only and does not rename, copy, open, modify, or delete PDFs.
- Phase 4 does not implement reference-copy, rename/undo, export packages/history, or any Phase 5+ action.
- All schema changes are additive version 4 changes and retain the existing pre-migration backup gate.
- Existing untracked `outputs/` content is user-owned and must remain untouched.

---

### Task 1: Workspace Settings, Safe Paths, and Directory Policy

**Files:**
- Modify: `src/core/config/app-paths.ts`
- Create: `src/core/files/file-errors.ts`
- Create: `src/core/files/workspace-settings.ts`
- Create: `src/core/files/workspace-paths.ts`
- Create: `src/core/files/directory-policy.ts`
- Modify: `tests/core/app-paths.test.ts`
- Create: `tests/core/workspace-settings.test.ts`
- Create: `tests/core/workspace-paths.test.ts`
- Create: `tests/core/directory-policy.test.ts`

**Interfaces:**
- Produces: `AppPaths.settings`, `WorkspaceSettingsStore.get()`, `WorkspaceSettingsStore.setWorkspaceRoot(path)`, `validateWorkspaceRoot(path)`, `resolveWorkspacePath(root, relativePath)`, `toWorkspaceRelativePath(root, absolutePath)`, and `buildDefaultProductDirectory(input)`.
- Invariants: settings write through a sibling temporary file and atomic rename; stored settings JSON may contain the absolute root, but no SQLite row does.

- [ ] **Step 1: Write failing settings tests** for unset settings, existing absolute directory, nonexistent/file/relative rejection, restart persistence, malformed JSON, and atomic temporary-file cleanup.
- [ ] **Step 2: Run the settings tests and confirm the missing implementation fails.**
- [ ] **Step 3: Add `settings` to `AppPaths` and implement the minimal JSON settings store with stable error codes.**
- [ ] **Step 4: Run settings and app-path tests until green.**
- [ ] **Step 5: Write failing path tests** for valid nested paths, `..`, absolute paths, drive-qualified paths, UNC paths, NUL, sibling-prefix escape, and a real directory symlink/junction escape when supported by the test environment.
- [ ] **Step 6: Run the path tests and confirm failure.**
- [ ] **Step 7: Implement centralized root normalization, containment comparison, relative conversion, and realpath containment checks.**
- [ ] **Step 8: Write and run failing directory-policy tests** for `{brand}\{category}\{model}`, trimming, Windows invalid characters, reserved trailing characters, and empty segments.
- [ ] **Step 9: Implement the pure directory policy without creating folders.**
- [ ] **Step 10: Run all Task 1 tests and typecheck.**
- [ ] **Step 11: Commit with message `feat: add safe workspace configuration`.**

### Task 2: Additive PDF Index Schema and Repository

**Files:**
- Modify: `src/db/schema.sql.ts`
- Modify: `src/db/migrations.ts`
- Modify: `tests/db/migrations.test.ts`
- Modify: `tests/server/application-api.test.ts`
- Create: `src/core/files/file-types.ts`
- Create: `src/core/files/file-repository.ts`
- Create: `tests/core/file-repository.test.ts`

**Interfaces:**
- Produces schema version 4 table `pdf_files` and `FileRepository.replaceScan(records, scannedAt)`, `FileRepository.search(filters)`, and `FileRepository.listDrawingCodes()`.
- `pdf_files`: `id`, unique `relative_path`, `file_name`, nullable `drawing_id`, `match_status`, `detected_codes_json`, `conversion_type`, `size_bytes`, `modified_at`, `scanned_at`, `is_present`.
- Search results join drawing code, model, brand, project, and color display data without inferring relationships from folders.

- [ ] **Step 1: Extend migration tests to expect version 4, the complete `pdf_files` schema/checks/indexes, backup before v3-to-v4, idempotence, rollback, and rejection of version 5.**
- [ ] **Step 2: Run migration tests and confirm they fail at version 3.**
- [ ] **Step 3: Add `schemaVersionFour`, advance migration support to 4, and retain a single backup/transaction for every older upgrade path.**
- [ ] **Step 4: Run migration and application-startup tests until green.**
- [ ] **Step 5: Write failing repository tests** using a real in-memory database for scan upsert, metadata refresh, old-record missing marking, matched drawing joins, relative-path uniqueness, pagination, keyword/status/type/presence filters, and JSON code decoding.
- [ ] **Step 6: Run repository tests and confirm failure.**
- [ ] **Step 7: Implement focused file types and repository SQL with one immediate transaction for each completed scan.**
- [ ] **Step 8: Run repository tests and typecheck.**
- [ ] **Step 9: Commit with message `feat: add relative pdf index schema`.**

### Task 3: Filename Matching and Read-Only Scanner

**Files:**
- Create: `src/core/files/pdf-matcher.ts`
- Create: `src/core/files/pdf-scanner.ts`
- Create: `src/core/files/file-service.ts`
- Create: `tests/core/pdf-matcher.test.ts`
- Create: `tests/core/pdf-scanner.test.ts`
- Create: `tests/core/file-service.test.ts`

**Interfaces:**
- Produces: `matchPdfFilename(fileName, drawings)`, `scanPdfWorkspace(root)`, `FileService.getSettings()`, `FileService.updateSettings(input)`, `FileService.scan()`, and `FileService.search(filters)`.
- Scan result: total, matched, unmatched, conflict, source, outlined, missing, scannedAt.
- File service owns the in-process scan lock; repository writes occur only after full enumeration and classification succeeds.

- [ ] **Step 1: Write failing matcher tests** for one complete code, no code, repeated same code, two distinct codes, partial/prefix text, `.pdf`/`.PDF`, non-PDF, and exact `（转曲）` marker.
- [ ] **Step 2: Run matcher tests and confirm failure.**
- [ ] **Step 3: Implement deterministic filename-only matching with distinct detected codes and no regex injection.**
- [ ] **Step 4: Run matcher tests until green.**
- [ ] **Step 5: Write failing scanner tests** with nested real files for recursive PDFs, non-PDF exclusion, relative paths, sizes/mtime, symlink/junction skipping, and unreadable-entry failure where supported.
- [ ] **Step 6: Run scanner tests and confirm failure.**
- [ ] **Step 7: Implement a read-only recursive scanner using `Dirent`, `lstat`, `realpath`, and centralized containment checks.**
- [ ] **Step 8: Write failing service tests** for first scan, metadata update, missing marking, failure preserving prior index, no workspace setting, invalid setting, and concurrent-scan rejection.
- [ ] **Step 9: Implement the file service orchestration and stable `FileError` codes.**
- [ ] **Step 10: Run all Task 3 tests and typecheck.**
- [ ] **Step 11: Commit with message `feat: scan and match local pdf files`.**

### Task 4: Validated Local File APIs

**Files:**
- Create: `src/server/routes/files.ts`
- Modify: `src/server/start-server.ts`
- Create: `tests/server/files-api.test.ts`
- Modify: `tests/server/application-api.test.ts`

**Interfaces:**
- Produces routes: `GET /api/files/settings`, `PUT /api/files/settings`, `POST /api/files/scan`, and `GET /api/files`.
- Strict Zod request validation; stable mapping: malformed 400, missing resource 404 when applicable, scan conflict 409, workspace/path/filesystem business errors 422, unexpected errors rethrown.

- [ ] **Step 1: Write failing API tests** for unconfigured settings, valid/invalid root save, token/origin protection, scan statistics, filtered results, strict unknown-field rejection, and stable business error mapping.
- [ ] **Step 2: Run the API tests and confirm route-not-found failures.**
- [ ] **Step 3: Implement strict schemas and error mapping in `files.ts`; construct one settings store/file service in `startServer`.**
- [ ] **Step 4: Run file API, local-access, and application API tests.**
- [ ] **Step 5: Run typecheck and commit with message `feat: expose local pdf file APIs`.**

### Task 5: PDF File Center Desktop UI

**Files:**
- Modify: `src/renderer/data/client.ts`
- Create: `src/renderer/pages/FilesPage.tsx`
- Modify: `src/renderer/layout/AppShell.tsx`
- Modify: `src/renderer/styles.css`
- Modify: `tests/renderer/api-client.test.ts`
- Create: `tests/renderer/files-page.test.tsx`
- Modify: `tests/smoke/app-shell.test.tsx`

**Interfaces:**
- Adds client views/methods for workspace settings, scan statistics, and paginated file search.
- `FilesPage` saves a typed root, scans only the saved root, renders counts and filters, and never offers Phase 5+ actions.

- [ ] **Step 1: Write failing client tests** for authenticated root save and scan plus encoded read filters.
- [ ] **Step 2: Add typed client interfaces and API methods.**
- [ ] **Step 3: Write failing page tests** for unconfigured state, valid root save, invalid root error without losing input, scan busy state, counts, filters, matched/unmatched/conflict rows, source/outlined labels, missing state, and request-race protection.
- [ ] **Step 4: Implement `FilesPage` with the existing dense internal-tool visual language and accessible labels.**
- [ ] **Step 5: Enable only the PDF navigation item, update footer to `Phase 4 · PDF 文件中心`, and leave Phase 5+ actions absent or visibly disabled.**
- [ ] **Step 6: Run renderer/smoke tests and typecheck.**
- [ ] **Step 7: Commit with message `feat: add pdf file center workspace`.**

### Task 6: Real Workflow, Documentation, Review, and Preview

**Files:**
- Create: `tests/e2e/phase-four.spec.ts`
- Modify: `tests/e2e/global-setup.ts`
- Modify: `README.md`

**Interfaces:**
- E2E obtains an isolated temporary workspace from global setup without hard-coded absolute paths.
- Acceptance proves one source and one `（转曲）` PDF for the same drawing, plus unmatched/conflict handling and relative-only database storage.

- [ ] **Step 1: Write the failing Phase 4 E2E** that creates a drawing, writes minimal real PDF files under a temporary workspace, saves the root through the UI, scans, filters, and verifies source/outlined rows for one drawing.
- [ ] **Step 2: Add safe E2E workspace setup/cleanup plumbing and run the new test until green.**
- [ ] **Step 3: Verify via API/database that file rows contain only relative paths and that unmatched/conflict files remain unassociated.**
- [ ] **Step 4: Update README** with configuration, scan/match rules, relative-path portability, missing-state behavior, Phase 4 boundary, and unchanged no-server-sync rule.
- [ ] **Step 5: Run `git diff --check`, all Vitest tests, TypeScript checks, production renderer/main build, all Playwright E2E tests, and a migration against an existing v3 database fixture.**
- [ ] **Step 6: Request independent read-only code review from base `15debb8` to Phase 4 HEAD; fix all Critical and Important findings with regression tests.**
- [ ] **Step 7: Re-run the complete verification suite after review fixes.**
- [ ] **Step 8: Build and launch the production Electron window on the Phase 4 branch; verify `/api/health`; keep the desktop preview available.**
- [ ] **Step 9: Stop without merging Phase 4, starting Phase 5, or deleting the worktree. Present the three branch-finish choices only after user preview.**

## Completion Criteria

- The workspace root is configurable and persisted outside SQLite with no hard-coded machine path.
- Every PDF index record contains a safe relative path only.
- Scanning is read-only, recursive, symlink-safe, atomic at the database boundary, and marks missing records without deleting them.
- Unique, unmatched, conflict, source, and outlined classifications follow the approved filename rules.
- PDF File Center uses real APIs/data in both Electron and browser preview.
- No Phase 5+ file mutation, export, or sync behavior exists.
- All verification passes on the Phase 4 branch and the user receives a running desktop preview before any merge decision.
