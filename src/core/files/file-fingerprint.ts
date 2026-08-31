import { createReadStream } from 'node:fs';
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
}

export async function fingerprintFile(absolutePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
  return hash.digest('hex');
}

export async function resolveFileFingerprint(input: FileFingerprintInput): Promise<{ contentSha256: string; reused: boolean }> {
  const { existing } = input;
  if (existing?.contentSha256 && existing.pathKey === input.pathKey
    && existing.sizeBytes === input.sizeBytes && existing.modifiedAt === input.modifiedAt) {
    return { contentSha256: existing.contentSha256, reused: true };
  }
  return { contentSha256: await fingerprintFile(input.absolutePath), reused: false };
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
