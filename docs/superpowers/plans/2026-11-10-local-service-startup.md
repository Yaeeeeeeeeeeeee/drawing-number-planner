# Local service startup repair implementation plan

> **For agentic workers:** Use superpowers:executing-plans inline, with test-driven-development. User approved implementation after read-only diagnosis; do not ask for another plan approval.

**Goal:** Allow protected large-database initialization to complete, diagnose the actual failing phase, and preserve the selected database/profile on failure.

**Architecture:** Keep the existing child-process controller and production profile transaction. Add typed startup progress, phase-specific bounded waits plus an overall deadline, append-only startup diagnostics, and an actual loopback health check before publishing readiness. Keep all integrity/migration/backup protections.

**Tech Stack:** Electron, Node child-process IPC, TypeScript, better-sqlite3, Vitest.

**Spec:** User's November 10 startup incident and approved three-point repair in this conversation. The saved profile points to a different database than the user's intended original; neither database is available here and neither may be switched or modified automatically.

## Global constraints

- No production database/configuration operations, automatic database switch, initialization, or user-file deletion.
- No Schema changes. Continue requiring existing production database files and atomic profile persistence after successful verification.
- Tests use isolated data; the exact cause on the user's machine remains unverified until new logs are collected.

## Review focus

- Large synchronous validation must not be terminated after the old 15-second limit.
- Progress cannot keep a permanently stuck service alive indefinitely.
- Late readiness after failure/stop must not resurrect the old child.
- Diagnostics must retain phase, database, PID and exit reason, never session tokens or business payloads; log failure must not block startup.
- A failed reinstall verification must preserve the previous profile and expose the attempted database path.

### Task 1: Controller deadlines and diagnostics

Files: `src/main/local-service-controller.ts`, `src/service/startup-progress.ts`, `src/service/protocol.ts`, `tests/main/local-service-controller.test.ts`.

- [x] Add failing tests for validation beyond 15 seconds, phase timeout/overall deadline, late ready, diagnostic log redaction and exit code.
- [x] Run the tests and observe the relevant failures.
- [x] Implement typed phase messages, bounded phase waits, append-only JSONL logging, and rejection of failed/stopping-child readiness.
- [x] Verify the controller tests.

### Task 2: Startup entry points and truthful readiness

Files: `src/server/start-server.ts`, `src/service/entry.ts`, `src/main/index.ts`, `scripts/production-entry.cjs`, profile/server tests.

- [x] Add failing tests for progress across real initialization and native failure reporting the attempted database while preserving the saved profile.
- [x] Instrument the existing initialization sequence, verify HTTP health before ready, and connect diagnostics on initial start/restart/database verification without choosing another database.
- [x] Run targeted lifecycle/profile/database/server regression tests.

### Task 3: Integration verification and delivery record

- [x] Run full unit tests, typecheck and desktop/renderer build; reproduce initialization using a disposable large Schema25 database and record measured stages.
- [x] Review the final change independently; update progress/maintenance instructions and record unresolved local Windows/user-data validation.
- [x] Commit the focused fix and use the existing Windows verification/delivery workflow if available. Do not claim the user's database has been repaired or switched.


Review: one Important stop/start race reproduced and fixed RED→GREEN; repeated phase and unhealthy-port release assertions now covered. Original local-machine cause remains unverified.
