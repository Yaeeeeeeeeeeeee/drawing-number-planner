import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FileError } from '../../src/core/files/file-errors';
import { WorkspaceSettingsStore } from '../../src/core/files/workspace-settings';

describe('WorkspaceSettingsStore', () => {
  it('stores an independently configurable outbound output root without losing the workspace root', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'planner-settings-outbound-'));
    const workspace = join(dataDir, 'workspace'); const output = join(dataDir, 'outbound');
    mkdirSync(workspace); mkdirSync(output);
    const path = join(dataDir, 'settings.json'); const store = new WorkspaceSettingsStore(path);
    store.setWorkspaceRoot(workspace);
    expect(store.setOutboundOutputRoot(output)).toBe(realpathSync.native(output));
    expect(store.get()).toEqual({ workspaceRoot: realpathSync.native(workspace) });
    expect(store.getOutboundOutputRoot()).toBe(realpathSync.native(output));
    rmSync(dataDir, { recursive: true, force: true });
  });
  it('starts unconfigured and persists a normalized existing directory across instances', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'planner-settings-'));
    const workspace = join(dataDir, 'pdf-library'); mkdirSync(workspace);
    const path = join(dataDir, 'settings.json');

    expect(new WorkspaceSettingsStore(path).get()).toEqual({ workspaceRoot: null });
    const normalized = realpathSync.native(workspace);
    expect(new WorkspaceSettingsStore(path).setWorkspaceRoot(`${workspace}\\`)).toEqual({ workspaceRoot: normalized });
    expect(new WorkspaceSettingsStore(path).get()).toEqual({ workspaceRoot: normalized });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ workspaceRoot: normalized });
  });

  it('rejects relative, missing, and file paths without replacing the last valid setting', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'planner-settings-invalid-'));
    const workspace = join(dataDir, 'library'); mkdirSync(workspace);
    const file = join(dataDir, 'file.pdf'); writeFileSync(file, '%PDF-1.4');
    const path = join(dataDir, 'settings.json'); const store = new WorkspaceSettingsStore(path);
    store.setWorkspaceRoot(workspace);

    for (const candidate of ['relative-folder', join(dataDir, 'missing'), file]) {
      expect(() => store.setWorkspaceRoot(candidate)).toThrowError(FileError);
    }
    expect(store.get()).toEqual({ workspaceRoot: realpathSync.native(workspace) });
  });

  it('reports malformed settings instead of silently losing configuration', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'planner-settings-malformed-'));
    const path = join(dataDir, 'settings.json'); writeFileSync(path, '{broken');

    expect(() => new WorkspaceSettingsStore(path).get())
      .toThrowError(expect.objectContaining({ code: 'SETTINGS_INVALID' }));
  });

  it('atomically replaces settings and leaves no temporary file behind', () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'planner-settings-atomic-'));
    const first = join(dataDir, 'first'); const second = join(dataDir, 'second');
    mkdirSync(first); mkdirSync(second);
    const path = join(dataDir, 'settings.json'); const store = new WorkspaceSettingsStore(path);

    store.setWorkspaceRoot(first); store.setWorkspaceRoot(second);

    expect(existsSync(path)).toBe(true);
    expect(readdirSync(dataDir).filter((name) => name.includes('.tmp'))).toEqual([]);
    expect(store.get()).toEqual({ workspaceRoot: realpathSync.native(second) });
  });
});
