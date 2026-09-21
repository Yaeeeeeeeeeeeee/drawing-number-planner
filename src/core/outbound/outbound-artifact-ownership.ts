import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, win32 } from 'node:path';

import { isSafeWindowsNameComponent } from './windows-safe-name.js';

export interface OutboundClaimMetadata {
  version: 1;
  taskId: string | null;
  lifecycle: 'active';
  createdAt: string;
  temporaryFile: string;
  finalFile: string;
}

function safeBaseName(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === win32.basename(value)
    && value !== '.' && value !== '..' && !value.includes('\0');
}

function safeWindowsZip(value: unknown): value is string {
  return safeBaseName(value) && value.toLocaleLowerCase('en-US').endsWith('.zip')
    && isSafeWindowsNameComponent(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const TEMPORARY_FILE = /^\.[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.tmp$/iu;

export function expectedOutboundClaimFileName(finalFile: string): string {
  const key = createHash('sha256').update(finalFile.toLocaleLowerCase('en-US')).digest('hex');
  return `.${key}.claim`;
}

export function parseOutboundClaim(text: string, claimFileName: string): OutboundClaimMetadata | null {
  try {
    const value = JSON.parse(text) as Partial<OutboundClaimMetadata>;
    if (value.version !== 1 || value.lifecycle !== 'active'
      || typeof value.taskId !== 'string' || !UUID.test(value.taskId)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || !safeBaseName(value.temporaryFile) || !TEMPORARY_FILE.test(value.temporaryFile)
      || !safeWindowsZip(value.finalFile)
      || claimFileName !== expectedOutboundClaimFileName(value.finalFile)) return null;
    return value as OutboundClaimMetadata;
  } catch { return null; }
}

export function resolveOwnedOutboundArtifacts(outputDirectory: string, claimPath: string,
  claim: OutboundClaimMetadata): { claimPath: string; temporaryPath: string; finalPath: string } | null {
  if (!win32.isAbsolute(outputDirectory) || !win32.isAbsolute(claimPath)) return null;
  const directory = win32.resolve(outputDirectory);
  const resolvedClaim = win32.resolve(claimPath);
  if (win32.dirname(resolvedClaim).toLocaleLowerCase('en-US') !== directory.toLocaleLowerCase('en-US')
    || win32.basename(resolvedClaim) !== expectedOutboundClaimFileName(claim.finalFile)) return null;
  const temporaryPath = win32.resolve(directory, claim.temporaryFile);
  const finalPath = win32.resolve(directory, claim.finalFile);
  if ([temporaryPath, finalPath].some((path) => win32.dirname(path).toLocaleLowerCase('en-US')
      !== directory.toLocaleLowerCase('en-US'))) return null;
  return { claimPath: resolvedClaim, temporaryPath, finalPath };
}

export function mayCleanOutboundClaim(claim: OutboundClaimMetadata, options: {
  activeTaskIds: ReadonlySet<string>;
  nowMs: number;
  minimumAgeMs: number;
}): boolean {
  if (!Number.isFinite(options.nowMs) || !Number.isFinite(options.minimumAgeMs) || options.minimumAgeMs < 0) return false;
  if (claim.taskId === null || options.activeTaskIds.has(claim.taskId)) return false;
  const createdAt = Date.parse(claim.createdAt);
  return Number.isFinite(createdAt) && options.nowMs - createdAt >= options.minimumAgeMs;
}

export function cleanupStaleOutboundArtifacts(outputDirectory: string, options: {
  activeTaskIds: ReadonlySet<string>;
  nowMs: number;
  minimumAgeMs: number;
}): { claimsRemoved: number; temporaryFilesRemoved: number } {
  let entries;
  try { entries = readdirSync(outputDirectory, { withFileTypes: true }); }
  catch { return { claimsRemoved: 0, temporaryFilesRemoved: 0 }; }
  let claimsRemoved = 0; let temporaryFilesRemoved = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.claim')) continue;
    const claimPath = join(outputDirectory, entry.name);
    try {
      if (statSync(claimPath).size > 16 * 1024) continue;
      const claim = parseOutboundClaim(readFileSync(claimPath, 'utf8'), entry.name);
      if (!claim || !mayCleanOutboundClaim(claim, options)) continue;
      const owned = resolveOwnedOutboundArtifacts(outputDirectory, claimPath, claim);
      if (!owned) continue;
      if (existsSync(owned.temporaryPath)) {
        rmSync(owned.temporaryPath, { force: true });
        temporaryFilesRemoved += 1;
      }
      rmSync(owned.claimPath, { force: true });
      claimsRemoved += 1;
    } catch { /* preserve anything that cannot be proven and removed safely */ }
  }
  return { claimsRemoved, temporaryFilesRemoved };
}
