import { constants, type Stats } from 'node:fs';
import { lstat, open } from 'node:fs/promises';
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
export async function assertFileSnapshot(absolutePath: string, snapshot: FileFingerprintSnapshot): Promise<void> {
  matchSnapshot(await lstat(absolutePath), snapshot);
}

function matchSnapshot(stats: Stats, snapshot: FileFingerprintSnapshot): void {
  const identity = snapshot.fileIdentity;
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== snapshot.sizeBytes
    || stats.mtime.toISOString() !== snapshot.modifiedAt
    || (identity && (stats.dev !== identity.device || stats.ino !== identity.inode || stats.ctimeMs !== identity.changedAtMs))) {
    throw new Error('PDF 文件正在变化，请等待写入完成后重试扫描');
  }
}

export interface FingerprintProgress {
  signal?: AbortSignal;
  onBytes?(bytes: number): void;
  onFailure?(error: unknown): void;
}

export async function fingerprintFile(absolutePath: string, snapshot?: FileFingerprintSnapshot,
  { signal, onBytes, onFailure }: FingerprintProgress = {}): Promise<string> {
  signal?.throwIfAborted();
  const before = await lstat(absolutePath);
  if (snapshot) matchSnapshot(before, snapshot);
  if (!before.isFile() || before.isSymbolicLink()) throw new Error('PDF 路径不是普通文件');
  signal?.throwIfAborted();
  const handle = await open(absolutePath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  let failed = false;
  try {
    signal?.throwIfAborted();
    if (!sameFile(before, await handle.stat())) throw new Error('PDF 文件在读取前已变化');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(256 * 1024);
    while (true) {
      signal?.throwIfAborted();
      // Wait for the issued filesystem request before reporting cancellation or closing the handle.
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      signal?.throwIfAborted();
      if (!bytesRead) break;
      hash.update(buffer.subarray(0, bytesRead));
      onBytes?.(bytesRead);
    }
    const after = await lstat(absolutePath);
    signal?.throwIfAborted();
    if (!sameFile(before, await handle.stat()) || !sameFile(before, after)) {
      throw new Error('PDF 文件正在变化，请等待写入完成后重试扫描');
    }
    if (snapshot) matchSnapshot(after, snapshot);
    signal?.throwIfAborted();
    return hash.digest('hex');
  } catch (error) {
    failed = true;
    onFailure?.(error);
    throw error;
  } finally {
    try { await handle.close(); }
    catch (error) { if (!failed) throw error; }
  }
}

export async function resolveFileFingerprint(input: FileFingerprintInput,
  progress?: FingerprintProgress): Promise<{ contentSha256: string; reused: boolean }> {
  progress?.signal?.throwIfAborted();
  const { existing } = input;
  if (existing?.contentSha256 && existing.pathKey === input.pathKey
    && existing.sizeBytes === input.sizeBytes && existing.modifiedAt === input.modifiedAt) {
    return { contentSha256: existing.contentSha256, reused: true };
  }
  return { contentSha256: await fingerprintFile(input.absolutePath, input.snapshot, progress), reused: false };
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number,
  operation: (item: T, index: number) => Promise<R>, onFailure?: (error: unknown) => void): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('并发数必须为正整数');
  const results = new Array<R>(items.length); let nextIndex = 0;
  let failure: { error: unknown } | undefined;
  const worker = async (): Promise<void> => {
    while (!failure && nextIndex < items.length) {
      const index = nextIndex++;
      try { results[index] = await operation(items[index], index); }
      catch (error) {
        if (!failure) {
          failure = { error };
          onFailure?.(error);
        }
      }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
  if (failure) throw failure.error;
  return results;
}
