import { describe, expect, it } from 'vitest';

import { parseOutboundClaim, mayCleanOutboundClaim } from '../../src/core/outbound/outbound-artifact-ownership';

describe('outbound temporary artifact ownership', () => {
  const claim = JSON.stringify({ version: 1, taskId: 'task-1', lifecycle: 'active',
    createdAt: '2026-09-10T00:00:00.000Z', temporaryFile: '.tmp-1.tmp', finalFile: 'package.zip' });

  it('parses only complete safe claim metadata', () => {
    expect(parseOutboundClaim(claim)).toMatchObject({ taskId: 'task-1', temporaryFile: '.tmp-1.tmp' });
    expect(parseOutboundClaim('{}')).toBeNull();
    expect(parseOutboundClaim(claim.replace('.tmp-1.tmp', '..\\escape.tmp'))).toBeNull();
    expect(parseOutboundClaim('not-json')).toBeNull();
  });

  it('never cleans a live, young, unknown or malformed claim', () => {
    const parsed = parseOutboundClaim(claim)!;
    const options = { nowMs: Date.parse('2026-09-10T02:00:00.000Z'), minimumAgeMs: 60 * 60 * 1000 };
    expect(mayCleanOutboundClaim(parsed, { ...options, activeTaskIds: new Set(['task-1']) })).toBe(false);
    expect(mayCleanOutboundClaim(parsed, { nowMs: Date.parse('2026-09-10T00:30:00.000Z'),
      minimumAgeMs: options.minimumAgeMs, activeTaskIds: new Set() })).toBe(false);
  });

  it('allows cleanup only for an old artifact whose owning task is no longer active', () => {
    expect(mayCleanOutboundClaim(parseOutboundClaim(claim)!, {
      nowMs: Date.parse('2026-09-10T02:00:00.000Z'), minimumAgeMs: 60 * 60 * 1000, activeTaskIds: new Set(),
    })).toBe(true);
  });
});
