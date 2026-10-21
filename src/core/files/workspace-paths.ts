import { existsSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, relative, resolve, win32 } from 'node:path';

import { FileError } from './file-errors.js';

function normalizedForComparison(path: string): string {
  return process.platform === 'win32' ? path.toLocaleLowerCase('en-US') : path;
}

function assertInside(root: string, candidate: string): void {
  const difference = relative(normalizedForComparison(root), normalizedForComparison(candidate));
  if (difference === '..' || /^\.\.[\\/]/.test(difference) || isAbsolute(difference)) {
    throw new FileError('PATH_OUTSIDE_WORKSPACE', '路径超出资料根目录');
  }
}

export function validateWorkspaceRoot(input: string): string {
  const raw = input.trim();
  // Accept a Windows-style trailing separator when a native POSIX directory was pasted.
  const value = process.platform !== 'win32' && !existsSync(raw) ? raw.replace(/\\+$/, '') : raw;
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

export function validateWorkspaceRelativePath(relativePath: string): string {
  const segments = relativePath.split(/[\\/]+/);
  if (!relativePath || relativePath.includes('\0') || isAbsolute(relativePath) || win32.isAbsolute(relativePath)
    || /^[a-z]:/i.test(relativePath) || segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    throw new FileError('PATH_OUTSIDE_WORKSPACE', '业务文件路径必须是资料根目录内的安全相对路径');
  }
  return relativePath;
}

export function toWorkspacePathKey(relativePath: string): string {
  const rawSegments = relativePath.split(/[\\/]+/);
  if (!relativePath || relativePath.includes('\0') || win32.isAbsolute(relativePath)
    || /^[a-z]:/i.test(relativePath) || rawSegments.some((segment) => segment === '..')) {
    throw new FileError('PATH_OUTSIDE_WORKSPACE', '业务文件路径必须是资料根目录内的安全相对路径');
  }
  const normalized = win32.normalize(relativePath.replace(/\//g, '\\'));
  validateWorkspaceRelativePath(normalized);
  return normalized.toLocaleLowerCase('en-US');
}

function canonicalizeWithExistingAncestor(input: string): string {
  let probe = input; const missing: string[] = [];
  while (!existsSync(probe) && probe !== dirname(probe)) {
    missing.unshift(basename(probe));
    probe = dirname(probe);
  }
  return resolve(realpathSync.native(probe), ...missing);
}

export function resolveWorkspacePath(rootInput: string, relativePath: string,
  options: { requireExistingParent?: boolean } = {}): string {
  void options;
  validateWorkspaceRelativePath(relativePath);
  const root = validateWorkspaceRoot(rootInput);
  const nativeCandidate = resolve(root, ...relativePath.split(/[\\/]+/));
  const literalCandidate = resolve(root, relativePath);
  // Old POSIX fixtures/imports could contain a literal backslash in a filename. Only use it
  // when that exact file exists and the normal separator interpretation does not.
  if (nativeCandidate !== literalCandidate && existsSync(nativeCandidate) && existsSync(literalCandidate)) {
    throw new FileError('PDF_FILE_UNAVAILABLE', '相对路径同时对应两个实际文件，请修正路径歧义后重扫');
  }
  const candidate = !existsSync(nativeCandidate) && existsSync(literalCandidate) ? literalCandidate : nativeCandidate;
  assertInside(root, candidate);
  {
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
  validateWorkspaceRelativePath(result);
  return result;
}
