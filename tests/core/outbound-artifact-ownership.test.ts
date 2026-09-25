import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expectedOutboundClaimFileName, parseOutboundClaim, mayCleanOutboundClaim,
  resolveOwnedOutboundArtifacts, cleanupStaleOutboundArtifacts } from '../../src/core/outbound/outbound-artifact-ownership';

describe('outbound temporary artifact ownership', () => {
  it('recovers all abandoned part temporaries while preserving unrelated files and published ZIPs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'multipart-recovery-'));
    try {
      const taskId = '6fc3f8a7-e1d0-4d61-9235-13d98350f091';
      const temporaryFiles = ['.17b40f41-2eed-4912-9db7-cd998a8bd444.tmp', '.27b40f41-2eed-4912-9db7-cd998a8bd444.tmp'];
      for (const [index, temporaryFile] of temporaryFiles.entries()) {
        const finalFile = `package-${index + 1}.zip`;
        writeFileSync(join(directory, temporaryFile), 'incomplete');
        writeFileSync(join(directory, expectedOutboundClaimFileName(finalFile)), JSON.stringify({ version: 1, taskId,
          lifecycle: 'active', createdAt: '2026-09-10T00:00:00.000Z', temporaryFile, finalFile }));
      }
      writeFileSync(join(directory, 'package-1.zip'), 'published, never infer ownership from a name alone');
      writeFileSync(join(directory, 'customer.pdf'), 'original');
      const result = cleanupStaleOutboundArtifacts(directory, { activeTaskIds: new Set(),
        nowMs: Date.parse('2026-09-10T02:00:00Z'), minimumAgeMs: 3_600_000 });
      expect(result).toEqual({ claimsRemoved: 2, temporaryFilesRemoved: 2 });
      expect(readdirSync(directory).sort()).toEqual(['customer.pdf', 'package-1.zip']);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  const taskId = '6fc3f8a7-e1d0-4d61-9235-13d98350f091';
  const temporaryFile = '.17b40f41-2eed-4912-9db7-cd998a8bd444.tmp';
  const finalFile = 'package.zip';
  const claimFile = expectedOutboundClaimFileName(finalFile);
  const claim = JSON.stringify({ version: 1, taskId, lifecycle: 'active',
    createdAt: '2026-09-10T00:00:00.000Z', temporaryFile, finalFile });

  it('parses only complete safe claim metadata', () => {
    expect(parseOutboundClaim(claim, claimFile)).toMatchObject({ taskId, temporaryFile });
    expect(parseOutboundClaim('{}', claimFile)).toBeNull();
    expect(parseOutboundClaim(claim.replace(temporaryFile, '..\\escape.tmp'), claimFile)).toBeNull();
    expect(parseOutboundClaim('not-json', claimFile)).toBeNull();
  });

  it.each([
    ['non UUID owner', claim.replace(taskId, 'task-1'), claimFile],
    ['ordinary temporary file', claim.replace(temporaryFile, 'customer.pdf'), claimFile],
    ['final file is not ZIP', claim.replace(finalFile, 'customer.pdf'), expectedOutboundClaimFileName('customer.pdf')],
    ['reserved Windows final ZIP', claim.replace(finalFile, 'CON.zip'), expectedOutboundClaimFileName('CON.zip')],
    ['reserved Windows stem with extra extension', claim.replace(finalFile, 'CON.txt.zip'), expectedOutboundClaimFileName('CON.txt.zip')],
    ['reserved Windows numbered stem with extra extension', claim.replace(finalFile, 'LPT1.foo.zip'), expectedOutboundClaimFileName('LPT1.foo.zip')],
    ['invalid Windows final ZIP', claim.replace(finalFile, 'bad?.zip'), expectedOutboundClaimFileName('bad?.zip')],
    ['claim hash does not bind final file', claim, '.wrong.claim'],
  ])('rejects %s as cleanup authority', (_label, text, fileName) => {
    expect(parseOutboundClaim(text, fileName)).toBeNull();
  });

  it('binds claim, temporary file and final ZIP to the same output directory', () => {
    const parsed = parseOutboundClaim(claim, claimFile)!;
    expect(resolveOwnedOutboundArtifacts('C:\\exports', `C:\\exports\\${claimFile}`, parsed)).toEqual({
      claimPath: `C:\\exports\\${claimFile}`,
      temporaryPath: `C:\\exports\\${temporaryFile}`,
      finalPath: 'C:\\exports\\package.zip',
    });
    expect(resolveOwnedOutboundArtifacts('C:\\exports', `C:\\other\\${claimFile}`, parsed)).toBeNull();
  });

  it('never cleans a live, young, unknown or malformed claim', () => {
    const parsed = parseOutboundClaim(claim, claimFile)!;
    const options = { nowMs: Date.parse('2026-09-10T02:00:00.000Z'), minimumAgeMs: 60 * 60 * 1000 };
    expect(mayCleanOutboundClaim(parsed, { ...options, activeTaskIds: new Set([taskId]) })).toBe(false);
    expect(mayCleanOutboundClaim(parsed, { nowMs: Date.parse('2026-09-10T00:30:00.000Z'),
      minimumAgeMs: options.minimumAgeMs, activeTaskIds: new Set() })).toBe(false);
  });

  it('allows cleanup only for an old artifact whose owning task is no longer active', () => {
    expect(mayCleanOutboundClaim(parseOutboundClaim(claim, claimFile)!, {
      nowMs: Date.parse('2026-09-10T02:00:00.000Z'), minimumAgeMs: 60 * 60 * 1000, activeTaskIds: new Set(),
    })).toBe(true);
  });
});
