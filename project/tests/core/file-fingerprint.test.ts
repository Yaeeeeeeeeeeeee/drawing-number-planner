import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FINGERPRINT_CONCURRENCY, fingerprintFile, mapWithConcurrency, resolveFileFingerprint } from '../../src/core/files/file-fingerprint';

describe('file fingerprints', () => {
  it('streams a SHA-256 fingerprint from a read-only file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'planner-fingerprint-'));
    const path = join(directory, 'sample.pdf');
    writeFileSync(path, 'content to fingerprint');

    await expect(fingerprintFile(path)).resolves.toBe('27d3bb7f66136c20cf13af3e4de2c09d276b1f236a1473fe645f4b224395a968');
  });

  it('reuses a prior hash only when normalized path, size, and mtime all match', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'planner-fingerprint-'));
    const path = join(directory, 'sample.pdf');
    writeFileSync(path, 'new bytes');
    const existing = { pathKey: 'folder\\sample.pdf', sizeBytes: 9, modifiedAt: '2026-08-31T00:00:00.000Z', contentSha256: 'prior-hash' };

    await expect(resolveFileFingerprint({ absolutePath: path, ...existing, existing })).resolves.toEqual({
      contentSha256: 'prior-hash', reused: true,
    });
    await expect(resolveFileFingerprint({ absolutePath: path, ...existing, modifiedAt: '2026-08-31T00:00:01.000Z', existing }))
      .resolves.toEqual({ contentSha256: '11e2defd59f47c7f2aac84d6a5d6747e98e785afffb72c8bb7b05ec74e1d663c', reused: false });
  });

  it('recomputes when the normalized path key or size differs from the stored fingerprint', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'planner-fingerprint-'));
    const path = join(directory, 'sample.pdf');
    writeFileSync(path, 'new bytes');
    const existing = { pathKey: 'folder\\sample.pdf', sizeBytes: 9, modifiedAt: '2026-08-31T00:00:00.000Z', contentSha256: 'prior-hash' };

    await expect(resolveFileFingerprint({ absolutePath: path, ...existing, pathKey: 'other\\sample.pdf', existing }))
      .resolves.toEqual({ contentSha256: '11e2defd59f47c7f2aac84d6a5d6747e98e785afffb72c8bb7b05ec74e1d663c', reused: false });
    await expect(resolveFileFingerprint({ absolutePath: path, ...existing, sizeBytes: 10, existing }))
      .resolves.toEqual({ contentSha256: '11e2defd59f47c7f2aac84d6a5d6747e98e785afffb72c8bb7b05ec74e1d663c', reused: false });
  });

  it('limits active fingerprint operations to its deterministic concurrency cap', async () => {
    let active = 0; let maximumActive = 0;
    const results = await mapWithConcurrency(Array.from({ length: FINGERPRINT_CONCURRENCY * 2 + 3 }, (_, index) => index),
      FINGERPRINT_CONCURRENCY, async (value) => {
        active += 1; maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 1));
        active -= 1;
        return value * 2;
      });

    expect(maximumActive).toBeLessThanOrEqual(FINGERPRINT_CONCURRENCY);
    expect(results).toEqual(Array.from({ length: FINGERPRINT_CONCURRENCY * 2 + 3 }, (_, index) => index * 2));
  });
});
