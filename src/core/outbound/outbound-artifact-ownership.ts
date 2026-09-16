import { win32 } from 'node:path';

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

export function parseOutboundClaim(text: string): OutboundClaimMetadata | null {
  try {
    const value = JSON.parse(text) as Partial<OutboundClaimMetadata>;
    if (value.version !== 1 || value.lifecycle !== 'active'
      || !(value.taskId === null || (typeof value.taskId === 'string' && value.taskId.length > 0))
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || !safeBaseName(value.temporaryFile) || !safeBaseName(value.finalFile)) return null;
    return value as OutboundClaimMetadata;
  } catch { return null; }
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
