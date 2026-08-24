// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { startServer } from '../../src/server/start-server';

describe('real application API', () => {
  it('persists dictionary writes across server restarts', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'drawing-planner-server-'));
    const first = await startServer({ port: 0, dataDir });
    const created = await fetch(`${first.url}/api/dictionaries/brand`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: '02', name: 'SAMKYO' }),
    });
    expect(created.status).toBe(201);
    await first.close();

    const second = await startServer({ port: 0, dataDir });
    const listed = await fetch(`${second.url}/api/dictionaries/brand`);
    expect(await listed.json()).toEqual({
      items: [expect.objectContaining({ code: '02', name: 'SAMKYO' })],
    });
    await second.close();
  });
});
