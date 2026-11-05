import { constants, lstatSync, type Stats } from 'node:fs';
import { open } from 'node:fs/promises';
import { createHash } from 'node:crypto';

export const FINGERPRINT_CONCURRENCY = 8;

export interface ExistingFileFingerprint {
  pathKey: string;
  sizeBytes: number;
  modifiedAt: string;
  contentSha256: string | null;
}

export interface FileFingerprintInput {
  absolutePath: string;
  pathKey: string;
  sizeBytes: number;
  modifiedAt: string;
  existing: ExistingFileFingerprint | null;
  snapshot?: FileFingerprintSnapshot;
}

export interface FileFingerprintSnapshot {
  sizeBytes: number;
  modifiedAt: string;
  fileIdentity?: { device: number; inode: number; changedAtMs: number };
}

function sameFile(left: Stats, right: Stats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

/** Called again immediately before the index transaction; instability is never absence. */
export function assertFileSnapshot(absolutePath: string, snapshot: FileFingerprintSnapshot): void {
  const stats = lstatSync(absolutePath), identity = snapshot.fileIdentity;
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== snapshot.sizeBytes
    || stats.mtime.toISOString() !== snapshot.modifiedAt
    || (identity && (stats.dev !== identity.device || stats.ino !== identity.inode || stats.ctimeMs !== identity.changedAtMs))) {
    throw new Error('PDF 文件正在变化，请等待写入完成后重试扫描');
  }
}

export async function fingerprintFile(absolutePath: string, snapshot?: FileFingerprintSnapshot): Promise<string> {
  if (snapshot) assertFileSnapshot(absolutePath, snapshot);
  const before = lstatSync(absolutePath);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('PDF 路径不是普通文件');
  const handle = await open(absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    if (!sameFile(before, await handle.stat())) throw new Error('PDF 文件在读取前已变化');
    const hash = createHash('sha256');
    for await (const chunk of handle.createReadStream({ autoClose: false })) hash.update(chunk);
    if (!sameFile(before, await handle.stat()) || !sameFile(before, lstatSync(absolutePath))) {
      throw new Error('PDF 文件正在变化，请等待写入完成后重试扫描');
    }
    if (snapshot) assertFileSnapshot(absolutePath, snapshot);
    return hash.digest('hex');
  } finally { await handle.close(); }
}

export async function resolveFileFingerprint(input: FileFingerprintInput): Promise<{ contentSha256: string; reused: boolean }> {
  const { existing } = input;
  if (existing?.contentSha256 && existing.pathKey === input.pathKey
    && existing.sizeBytes === input.sizeBytes && existing.modifiedAt === input.modifiedAt) {
    return { contentSha256: existing.contentSha256, reused: true };
  }
  return { contentSha256: await fingerprintFile(input.absolutePath, input.snapshot), reused: false };
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number,
  operation: (item: T, index: number) => Promise<R>): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('并发数必须为正整数');
  const results = new Array<R>(items.length); let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (nextIndex < items.length) {
      const index = nextIndex; nextIndex += 1;
      results[index] = await operation(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  return results;
}
