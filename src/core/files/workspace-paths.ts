import { existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, win32 } from 'node:path';

import { FileError } from './file-errors.js';

function normalizedForComparison(path: string): string {
  return process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path;
}

function assertInside(root: string, candidate: string): void {
  const difference = relative(normalizedForComparison(root), normalizedForComparison(candidate));
  if (difference === '..' || difference.startsWith(`..${win32.sep}`) || isAbsolute(difference)) {
    throw new FileError('PATH_OUTSIDE_WORKSPACE', '路径超出资料根目录');
  }
}

export function validateWorkspaceRoot(input: string): string {
  const value = input.trim();
  if (!value || !isAbsolute(value) || !existsSync(value)) {
    throw new FileError('WORKSPACE_INVALID', '资料根目录必须是已存在的本机绝对目录');
  }
  try {
    const root = realpathSync.native(value);
    if (!statSync(root).isDirectory()) throw new FileError('WORKSPACE_INVALID', '资料根目录不能是文件');
    return root;
  } catch (error) {
    if (error instanceof FileError) throw error;
    throw new FileError('WORKSPACE_INVALID', '资料根目录无法访问', { cause: error });
  }
}

function validateRelativeInput(relativePath: string): void {
  const segments = relativePath.split(/[\\/]+/);
  if (!relativePath || relativePath.includes('\0') || isAbsolute(relativePath) || win32.isAbsolute(relativePath)
    || /^[a-z]:/i.test(relativePath) || segments.includes('..')) {
    throw new FileError('PATH_OUTSIDE_WORKSPACE', '业务文件路径必须是资料根目录内的安全相对路径');
  }
}

function canonicalizeWithExistingAncestor(input: string): string {
  let probe = input; const missing: string[] = [];
  while (!existsSync(probe) && probe !== dirname(probe)) {
    missing.unshift(input.slice(dirname(probe).length + 1, probe.length));
    probe = dirname(probe);
  }
  return resolve(realpathSync.native(probe), ...missing);
}

export function resolveWorkspacePath(rootInput: string, relativePath: string,
  options: { requireExistingParent?: boolean } = {}): string {
  validateRelativeInput(relativePath);
  const root = validateWorkspaceRoot(rootInput);
  const candidate = resolve(root, relativePath);
  assertInside(root, candidate);
  if (options.requireExistingParent) {
    let probe = candidate;
    while (!existsSync(probe) && probe !== dirname(probe)) probe = dirname(probe);
    const realProbe = realpathSync.native(probe);
    assertInside(root, realProbe);
  }
  return candidate;
}

export function toWorkspaceRelativePath(rootInput: string, absolutePath: string): string {
  const root = validateWorkspaceRoot(rootInput);
  if (!isAbsolute(absolutePath) && !win32.isAbsolute(absolutePath)) {
    throw new FileError('PATH_OUTSIDE_WORKSPACE', '扫描文件必须使用绝对路径');
  }
  const candidate = canonicalizeWithExistingAncestor(resolve(absolutePath));
  assertInside(root, candidate);
  const result = relative(root, candidate);
  validateRelativeInput(result);
  return result;
}
