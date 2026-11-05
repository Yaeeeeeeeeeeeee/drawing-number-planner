import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  resolveWorkspacePath,
  toWorkspacePathKey,
  toWorkspaceRelativePath,
  validateWorkspaceRoot,
} from '../../src/core/files/workspace-paths';

describe('workspace paths', () => {
  it('creates one case-insensitive Windows key for equivalent safe relative paths', () => {
    expect(toWorkspacePathKey('01.洗碗机/SKDWT040JP-T40/A.PDF'))
      .toBe('01.洗碗机\\skdwt040jp-t40\\a.pdf');
    expect(toWorkspacePathKey('01.洗碗机\\SKDWT040JP-T40\\.\\A.PDF'))
      .toBe('01.洗碗机\\skdwt040jp-t40\\a.pdf');
  });

  it('normalizes a real root and resolves a nested relative path inside it', () => {
    const root = mkdtempSync(join(tmpdir(), 'planner-root-')); mkdirSync(join(root, 'SAMKYO', 'ZC100'), { recursive: true });

    expect(validateWorkspaceRoot(`${root}\\`)).toBe(realpathSync.native(root));
    expect(resolveWorkspacePath(root, join('SAMKYO', 'ZC100', 'drawing.pdf')))
      .toBe(join(realpathSync.native(root), 'SAMKYO', 'ZC100', 'drawing.pdf'));
    expect(toWorkspaceRelativePath(root, join(root, 'SAMKYO', 'ZC100', 'drawing.pdf')))
      .toBe(join('SAMKYO', 'ZC100', 'drawing.pdf'));
  });

  it.each([
    '..\\outside.pdf',
    'inside\\..\\..\\outside.pdf',
    'C:\\outside.pdf',
    '\\\\server\\share\\outside.pdf',
    '\\rooted.pdf',
    'bad\0name.pdf',
  ])('rejects unsafe relative path %s', (unsafe) => {
    const root = mkdtempSync(join(tmpdir(), 'planner-root-unsafe-'));
    expect(() => resolveWorkspacePath(root, unsafe)).toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));
  });

  it('rejects sibling paths whose text merely shares the root prefix', () => {
    const parent = mkdtempSync(join(tmpdir(), 'planner-root-prefix-'));
    const root = join(parent, 'library'); const sibling = join(parent, 'library-old', 'file.pdf'); mkdirSync(root); mkdirSync(join(parent, 'library-old'));

    expect(() => toWorkspaceRelativePath(root, sibling))
      .toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));
  });

  it('rejects a directory junction that resolves outside the workspace', () => {
    const parent = mkdtempSync(join(tmpdir(), 'planner-root-link-'));
    const root = join(parent, 'library'); const outside = join(parent, 'outside'); mkdirSync(root); mkdirSync(outside);
    const link = join(root, 'linked-outside');
    try { symlinkSync(outside, link, 'junction'); } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EPERM') return;
      throw error;
    }

    expect(relative(root, link)).not.toContain('..');
    expect(() => resolveWorkspacePath(root, join('linked-outside', 'file.pdf'), { requireExistingParent: true }))
      .toThrowError(expect.objectContaining({ code: 'PATH_OUTSIDE_WORKSPACE' }));
  });
});
