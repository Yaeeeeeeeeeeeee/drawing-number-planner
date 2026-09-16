import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';

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

export async function scanPdfWorkspace(rootInput: string, options: WorkspaceScanOptions = {}): Promise<ScannedPdfFile[]> {
  const root = validateWorkspaceRoot(rootInput); const files: ScannedPdfFile[] = [];
  const walk = async (directory: string): Promise<void> => {
    options.signal?.throwIfAborted();
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en-US'));
    for (const entry of entries) {
      options.signal?.throwIfAborted();
      if (entry.isSymbolicLink()) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        const resolved = await realpath(absolutePath); toWorkspaceRelativePath(root, resolved);
        await walk(absolutePath); continue;
      }
      if (!entry.isFile() || !entry.name.toLocaleLowerCase('en-US').endsWith('.pdf')) continue;
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
