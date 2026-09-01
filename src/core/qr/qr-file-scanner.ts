import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { toWorkspaceRelativePath, validateWorkspaceRoot } from '../files/workspace-paths.js';

export interface ScannedQrFile {
  absolutePath: string;
  relativePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: string;
}

const QR_FILE_NAME = /^.+?-.+?（(?:二维码的)?网址编码）\.(?:png|jpe?g|webp|gif|pdf)$/iu;

function mimeType(fileName: string): string {
  const extension = fileName.slice(fileName.lastIndexOf('.') + 1).toLocaleLowerCase('en-US');
  return ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' } as Record<string, string>)[extension] ?? 'application/octet-stream';
}

export async function scanQrWorkspace(rootInput: string): Promise<ScannedQrFile[]> {
  const root = validateWorkspaceRoot(rootInput); const files: ScannedQrFile[] = [];
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name, 'en-US'));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        const resolved = await realpath(absolutePath); toWorkspaceRelativePath(root, resolved);
        await walk(absolutePath); continue;
      }
      if (!entry.isFile() || !QR_FILE_NAME.test(entry.name)) continue;
      const resolved = await realpath(absolutePath); toWorkspaceRelativePath(root, resolved);
      const stats = await lstat(absolutePath);
      files.push({ absolutePath, relativePath: toWorkspaceRelativePath(root, absolutePath), fileName: basename(absolutePath),
        mimeType: mimeType(entry.name), sizeBytes: stats.size, modifiedAt: stats.mtime.toISOString() });
    }
  };
  await walk(root);
  return files.sort((left, right) => left.relativePath.localeCompare(right.relativePath, 'en-US'));
}
