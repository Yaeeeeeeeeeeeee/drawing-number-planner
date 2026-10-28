import { isMaterialDirectory, isMaterialPdfPath } from './directory-policy.js';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';

import { toWorkspaceRelativePath, validateWorkspaceRoot } from './workspace-paths.js';

export interface ScannedPdfFile {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface WorkspaceScanOptions {
  signal?: AbortSignal;
  onProgress?(processed: number, total: number | null, relativePath: string): void;
}

/** Resolves only after complete traversal of the current scope. Unknown linked
 * content aborts the scan so callers cannot persist a partial list as absence. */
export async function scanPdfWorkspace(rootInput: string, options: WorkspaceScanOptions = {}): Promise<ScannedPdfFile[]> {
  const root = validateWorkspaceRoot(rootInput); const files: ScannedPdfFile[] = [];
  const walk = async (directory: string): Promise<void> => {
    options.signal?.throwIfAborted();
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
        sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString() });
      options.onProgress?.(files.length, null, files[files.length - 1].relativePath);
    }
  };
  await walk(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en-US'));
}
