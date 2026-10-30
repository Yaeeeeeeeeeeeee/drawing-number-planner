import { isMaterialDirectory, isMaterialPdfPath } from './directory-policy.js';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { toWorkspaceRelativePath, toWorkspacePathKey, validateWorkspaceRelativePath, validateWorkspaceRoot } from './workspace-paths.js';

export interface ScannedPdfFile {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
  fileIdentity?: { device: number; inode: number; changedAtMs: number };
}

export interface DirectoryScanSnapshot {
  device: number; inode: number; modifiedAtMs: number; changedAtMs: number;
}

export interface WorkspaceScanOptions {
  signal?: AbortSignal;
  productDirectories?: string[];
  onDirectoryObserved?(absolutePath: string, snapshot: DirectoryScanSnapshot): void;
  onProgress?(processed: number, total: number | null, relativePath: string): void;
}

/** Exact category/product roots; normalized separators without inventing physical paths. */
export function normalizeProductDirectories(input: string[]): string[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('请选择至少一个完整的产品目录');
  const directories = new Map<string, string>();
  for (const directory of input) {
    if (typeof directory !== 'string') throw new Error('产品目录必须为安全的两段相对路径');
    validateWorkspaceRelativePath(directory);
    const segments = directory.split(/[\\/]/);
    if (segments.length !== 2 || segments.some(segment => !segment || segment === '.' || segment === '..')) {
      throw new Error('产品目录必须为安全的两段相对路径');
    }
    const normalized = segments.join('/');
    directories.set(toWorkspacePathKey(normalized), normalized);
  }
  return [...directories.values()].sort((left, right) => left.localeCompare(right, 'en-US'));
}

export function isPathInProductDirectories(path: string, directories: string[]): boolean {
  const key = toWorkspacePathKey(path);
  return directories.some(directory => key.startsWith(`${toWorkspacePathKey(directory)}\\`));
}

/** Resolves only after complete traversal of the current scope. Unknown linked
 * content aborts the scan so callers cannot persist a partial list as absence. */
export async function scanPdfWorkspace(rootInput: string, options: WorkspaceScanOptions = {}): Promise<ScannedPdfFile[]> {
  const root = validateWorkspaceRoot(rootInput); const files: ScannedPdfFile[] = [];
  const walk = async (directory: string): Promise<void> => {
    options.signal?.throwIfAborted();
    const directoryStats = await lstat(directory);
    if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) throw new Error('资料目录无法完整观察');
    options.onDirectoryObserved?.(directory, { device: directoryStats.dev, inode: directoryStats.ino,
      modifiedAtMs: directoryStats.mtimeMs, changedAtMs: directoryStats.ctimeMs });
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en-US'));
    const depth = relative(root, directory).split(/[\\/]+/).filter(Boolean).length;
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      if (entry.isSymbolicLink()) {
        // At category/product depth a link could hide an entire material tree.
        // Excluded product subdirectories are intentionally outside observation.
        if (depth !== 2 || isMaterialDirectory(entry.name)) {
          throw new Error(`资料目录包含未观察的链接，扫描不完整：${relative(root, join(directory, entry.name))}`);
        }
        continue;
      }
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth === 2 && !isMaterialDirectory(entry.name)) continue;
        const resolved = await realpath(absolutePath); toWorkspaceRelativePath(root, resolved);
        await walk(absolutePath); continue;
      }
      if (!isMaterialPdfPath(relative(root, absolutePath))) continue;
      if (!entry.name.toLocaleLowerCase('en-US').endsWith('.pdf')) continue;
      if (!entry.isFile()) throw new Error(`PDF 路径不是普通文件，扫描不完整：${relative(root, absolutePath)}`);
      const resolved = await realpath(absolutePath); toWorkspaceRelativePath(root, resolved);
      const stats = await lstat(absolutePath);
      files.push({ absolutePath, relativePath: toWorkspaceRelativePath(root, absolutePath), fileName: basename(absolutePath),
        sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString(),
        fileIdentity: { device: stats.dev, inode: stats.ino, changedAtMs: stats.ctimeMs } });
      options.onProgress?.(files.length, null, files[files.length - 1].relativePath);
    }
  };
  if (options.productDirectories !== undefined) {
    for (const directory of normalizeProductDirectories(options.productDirectories)) {
      let absolute = root;
      for (const segment of directory.split('/')) {
        absolute = join(absolute, segment);
        const stats = await lstat(absolute);
        if (stats.isSymbolicLink() || !stats.isDirectory()) throw new Error(`产品目录无法完整观察：${directory}`);
        toWorkspaceRelativePath(root, await realpath(absolute));
        options.onDirectoryObserved?.(absolute, { device: stats.dev, inode: stats.ino,
          modifiedAtMs: stats.mtimeMs, changedAtMs: stats.ctimeMs });
      }
      await walk(absolute);
    }
  } else await walk(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en-US'));
}
